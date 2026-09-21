import type {DataConnection} from "peerjs";
import Peer from "peerjs";
import {NET} from "../config";
import {Control, tidyControl} from "./protocol";

/**
 * The connection between the screens in one race.
 *
 * WebRTC, which is the only way two browsers on the same wi-fi can talk to each
 * other at all — and, once they are talking, about the fastest way anything
 * gets from one device to another: the packets go out of one iPad, through the
 * router in the hall, and into the other. Nothing is relayed through the
 * internet, so the delay is the delay of the house.
 *
 * What WebRTC cannot do is *introduce* them. Two browsers cannot find each
 * other on a network without somebody holding the door, and a page served off
 * a static site has nothing to hold it with — there is no Vroom server and
 * this game does not want one. So the introduction goes through PeerJS's free
 * broker, which is a few hundred bytes of "here is how to reach me" exchanged
 * once, before the race. After that the broker has no part in it: pull the
 * plug on the internet after the lobby and the race carries on.
 *
 * That is worth being plain about, because it is the one thing here that is
 * not self-contained: joining a race needs the internet for a moment even
 * though racing does not. `broker` below is where to point this at a
 * `peerjs-server` of our own if that ever stops being true — nothing else in
 * the game would change.
 *
 * Two channels to every screen, because the two kinds of traffic want opposite
 * things — see `protocol.ts`. The words channel is reliable and ordered; the
 * cars channel is unordered, so a packet that gets stuck behind a lost one is
 * simply overtaken by the next instead of holding up the race.
 */

/** Where the two screens are introduced. Empty is PeerJS's own free broker. */
const broker: {host?: string; port?: number; path?: string; secure?: boolean} =
  {};

/** So a stray code cannot land somebody in a race of a different game. */
const PREFIX = "vroom-";

/** The two channels, by name. */
const WORDS = "say";
const CARS = "fast";

/** One other screen, from this one's point of view. */
class Member {
  words: DataConnection | null = null;
  cars: DataConnection | null = null;
  /** Its grid slot, once the host has given it one. */
  seat = -1;
  /** Best recent round trip, in milliseconds. */
  ping = 0;
  /** Whether both channels are up, which is when it is worth talking to. */
  get open(): boolean {
    return this.words?.open === true && this.cars?.open === true;
  }
}

export interface RoomHandlers {
  /** Somebody said something. `from` is the peer id, which is how a host tells
   *  its guests apart. */
  onControl?: (from: string, msg: Control) => void;
  /** Where the cars are, straight off the unordered channel. */
  onCars?: (from: string, data: unknown) => void;
  /** A screen arrived, or went away — including, for a guest, the host going
   *  away, which is the end of the race. */
  onJoin?: (from: string) => void;
  onLeave?: (from: string) => void;
}

export class Room {
  readonly isHost: boolean;
  /** What the QR code carries, and what a child can read out loud. */
  readonly code: string;
  /** Which grid slot this screen drives. The host is always the first. */
  seat: number;
  handlers: RoomHandlers = {};

  private readonly peer: Peer;
  private readonly members = new Map<string, Member>();
  /**
   * This screen's clock against the host's, in seconds.
   *
   * The whole reason for it is the countdown. "Go in six hundred milliseconds"
   * would drop the flag on each screen at a different moment — a screen that
   * took longer to get the message would start later, which is a real
   * advantage over one lap — so the host says *when*, on its own clock, and
   * every screen works out when that is on theirs.
   */
  private offset = 0;
  /** The best few round trips, kept to take the shortest of. The shortest is
   *  the truth about the network; a long one is a queue somewhere and says
   *  nothing about the offset. */
  private readonly trips: Array<{rtt: number; offset: number}> = [];
  /** The clock comparison runs on its own timer rather than off the game's
   *  frame loop: most of the comparing happens in the lobby, where there is no
   *  frame loop at all. Getting this wrong meant a guest whose clock was still
   *  thirty seconds out when the host dropped the flag — so it sat on "3" while
   *  the other screen raced away. */
  private beat = 0;
  private readonly began = performance.now();

  private constructor(peer: Peer, isHost: boolean, code: string) {
    this.peer = peer;
    this.isHost = isHost;
    this.code = code;
    this.seat = isHost ? 0 : -1;

    if (isHost) {
      peer.on("connection", conn => this.take(conn));
    } else {
      this.beat = window.setInterval(() => this.ask(), NET.pings * 1000);
    }
    // A broker that goes away after the introduction is not a problem, and
    // saying so here stops PeerJS's own "lost the server" error from reading
    // like the race is over.
    peer.on("disconnected", () => {});
    peer.on("error", err => {
      // Anything that is not "that peer is not there" is worth having in the
      // console; a race that will not start is otherwise silent.
      if (this.members.size === 0) {
        console.warn("[vroom] room:", err.type);
      }
    });
  }

  /** Opens a race and returns the code to show. Retried on the small chance
   *  that somebody else in the world is already using the same five letters. */
  static async open(): Promise<Room> {
    for (let tries = 0; tries < 5; tries++) {
      const code = newCode();
      try {
        const peer = await wake(new Peer(PREFIX + code, {debug: 0, ...broker}));
        return new Room(peer, true, code);
      } catch (err) {
        if ((err as {type?: string})?.type !== "unavailable-id") {
          throw err;
        }
      }
    }
    throw new Error("could not open a race");
  }

  /**
   * Joins the race with this code.
   *
   * The guest opens both channels itself rather than waiting to be called, so
   * the host's only job is to answer — which means a guest that scanned the
   * code before the host was ready simply fails and can try again.
   */
  static async join(code: string): Promise<Room> {
    const peer = await wake(new Peer({debug: 0, ...broker}));
    const room = new Room(peer, false, code);
    const host = new Member();
    room.members.set(PREFIX + code, host);
    host.seat = 0;
    host.words = peer.connect(PREFIX + code, {
      label: WORDS,
      reliable: true,
      serialization: "json",
    });
    host.cars = peer.connect(PREFIX + code, {
      label: CARS,
      // Unordered, which is what `reliable: false` buys here. Head-of-line
      // blocking is the one thing that would make a bump land late.
      reliable: false,
      serialization: "raw",
    });
    room.listen(PREFIX + code, host.words);
    room.listen(PREFIX + code, host.cars);
    // A code that leads nowhere has to *fail*, not hang: PeerJS reports "there
    // is no such peer" on the peer rather than on the connection, so waiting on
    // the connection alone waits for ever. Which is what it did — a child who
    // scanned an old code sat on "Looking for the other iPad" until somebody
    // took the iPad off them.
    try {
      await Promise.race([
        Promise.all([opened(host.words), opened(host.cars)]),
        gaveUp(peer),
      ]);
    } catch (err) {
      room.close();
      throw err;
    }
    // A quick burst before anything else happens, so the clocks agree within a
    // few packets rather than within a few seconds. Until they do, this screen
    // has no idea what time the host thinks it is.
    for (let i = 0; i < 4; i++) {
      window.setTimeout(() => room.ask(), i * 80);
    }
    return room;
  }

  /** Every screen this one is talking to, host included. */
  get others(): Array<string> {
    return [...this.members.keys()].filter(
      id => this.members.get(id)?.open === true,
    );
  }

  /** How many children are in the race, this screen included. */
  get size(): number {
    return this.others.length + 1;
  }

  /** The round trip to one screen, in milliseconds. */
  pingTo(id: string): number {
    return this.members.get(id)?.ping ?? 0;
  }

  /** What a guest measured, so a host can show it. */
  setPing(id: string, ms: number): void {
    const member = this.members.get(id);
    if (member) {
      member.ping = ms;
    }
  }

  seatOf(id: string): number {
    return this.members.get(id)?.seat ?? -1;
  }

  setSeat(id: string, seat: number): void {
    const member = this.members.get(id);
    if (member) {
      member.seat = seat;
    }
  }

  /**
   * The host's clock, in seconds, as well as this screen can tell.
   *
   * On the host that is simply its own. On a guest it is its own plus whatever
   * the round trips say the difference is, which is what makes "the flag drops
   * at 12.4" mean the same instant in two rooms.
   */
  clock(): number {
    return (performance.now() - this.began) / 1000 + this.offset;
  }

  /** Words, to one screen or to all of them. */
  say(msg: Control, to?: string): void {
    for (const id of to ? [to] : this.members.keys()) {
      const member = this.members.get(id);
      if (member?.words?.open) {
        member.words.send(msg);
      }
    }
  }

  /** Where the cars are. Dropped silently if a channel is not up: a missing
   *  packet is the normal state of affairs here, not an error. */
  send(data: ArrayBuffer, to?: string): void {
    for (const id of to ? [to] : this.members.keys()) {
      const member = this.members.get(id);
      if (member?.cars?.open) {
        member.cars.send(data);
      }
    }
  }

  /**
   * Asks the host what time it is.
   *
   * Only guests ask. The host is the clock, so it has nothing to ask about — it
   * answers, and hears back what each guest measured for the lobby to show.
   */
  private ask(): void {
    if (this.isHost) {
      return;
    }
    this.say({kind: "ping", t: (performance.now() - this.began) / 1000});
  }

  /** The other half of `tick`: a host answering, on its own clock. */
  answer(to: string, msg: {t: number}): void {
    this.say({kind: "pong", t: msg.t, clock: this.clock()}, to);
  }

  /**
   * A round trip landed. Half of it is how far behind the host's clock reading
   * is by the time it gets here, which is the whole of the arithmetic.
   */
  heard(msg: {t: number; clock: number}): void {
    const now = (performance.now() - this.began) / 1000;
    const rtt = now - msg.t;
    if (rtt < 0) {
      return;
    }
    this.trips.push({rtt, offset: msg.clock + rtt / 2 - now});
    if (this.trips.length > NET.keepPings) {
      this.trips.shift();
    }
    let best = this.trips[0];
    for (const trip of this.trips) {
      if (trip.rtt < best.rtt) {
        best = trip;
      }
    }
    this.offset = best.offset;
    const ms = Math.round(best.rtt * 1000);
    for (const member of this.members.values()) {
      member.ping = ms;
    }
    this.say({kind: "lag", ms});
  }

  /** The round trip this screen has measured, in milliseconds. */
  get ping(): number {
    return this.members.values().next().value?.ping ?? 0;
  }

  close(): void {
    window.clearInterval(this.beat);
    for (const member of this.members.values()) {
      member.words?.close();
      member.cars?.close();
    }
    this.members.clear();
    this.peer.destroy();
  }

  /** A guest turning up. Its two channels arrive separately and in either
   *  order, so the member is made on whichever comes first. */
  private take(conn: DataConnection): void {
    let member = this.members.get(conn.peer);
    if (!member) {
      member = new Member();
      this.members.set(conn.peer, member);
    }
    if (conn.label === CARS) {
      member.cars = conn;
    } else {
      member.words = conn;
    }
    this.listen(conn.peer, conn);
  }

  private listen(id: string, conn: DataConnection): void {
    conn.on("open", () => {
      // Announced once both channels are up, so nobody is told about a screen
      // it cannot yet send anything to.
      if (this.members.get(id)?.open) {
        this.handlers.onJoin?.(id);
      }
    });
    conn.on("data", data => {
      if (conn.label === CARS) {
        this.handlers.onCars?.(id, data);
        return;
      }
      const msg = tidyControl(data);
      if (!msg) {
        return;
      }
      // The clock questions are the room's own business and never reach the
      // race: it would have to learn how to answer them, and there is nothing
      // about a countdown in them.
      if (msg.kind === "ping") {
        this.answer(id, msg);
        return;
      }
      if (msg.kind === "pong") {
        this.heard(msg);
        return;
      }
      if (msg.kind === "lag") {
        this.setPing(id, msg.ms);
        return;
      }
      this.handlers.onControl?.(id, msg);
    });
    conn.on("close", () => this.drop(id));
    conn.on("error", () => this.drop(id));
  }

  private drop(id: string): void {
    if (!this.members.delete(id)) {
      return;
    }
    this.handlers.onLeave?.(id);
  }
}

/** A code a child can read off a screen: no O against 0, no I against 1. */
function newCode(): string {
  let code = "";
  for (let i = 0; i < NET.code; i++) {
    code += NET.alphabet[Math.floor(Math.random() * NET.alphabet.length)];
  }
  return code;
}

/** Tidies up whatever was typed or scanned into something that could be a
 *  code, so a lower-case URL still joins the right race. */
export function tidyCode(raw: string): string {
  const up = raw.trim().toUpperCase();
  let code = "";
  for (const ch of up) {
    if (NET.alphabet.includes(ch)) {
      code += ch;
    }
  }
  return code.slice(0, NET.code);
}

/** The broker answering: a peer is no use until it has an id. */
function wake(peer: Peer): Promise<Peer> {
  return new Promise((done, fail) => {
    peer.once("open", () => done(peer));
    peer.once("error", err => {
      peer.destroy();
      fail(err);
    });
  });
}

/** Rejects when the broker says there is nobody there, or when nobody has
 *  answered for long enough that there plainly is not. */
function gaveUp(peer: Peer): Promise<never> {
  return new Promise((_done, fail) => {
    peer.on("error", err => fail(err));
    window.setTimeout(
      () => fail(new Error("nobody answered")),
      NET.waitFor * 1000,
    );
  });
}

function opened(conn: DataConnection): Promise<void> {
  return new Promise((done, fail) => {
    if (conn.open) {
      done();
      return;
    }
    conn.once("open", () => done());
    conn.once("error", fail);
    conn.once("close", () => fail(new Error("closed")));
  });
}
