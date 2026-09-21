import * as THREE from "three";
import {NET, RIVALS} from "../config";
import {carPaint, myDesign, myColour, myKit, myShape} from "../core/garage";
import {myStickers} from "../core/stickers";
import {Track} from "../entities/track";
import {TrackSpec} from "../track/spec";
import {Ghost} from "./ghost";
import {Room} from "./room";
import {
  AI,
  CarState,
  Control,
  Look,
  packCars,
  Seat,
  unpackCars,
} from "./protocol";

/**
 * Everybody in one race together, and everything they agree about.
 *
 * It outlives the screens: the same Party is there in the lobby, through the
 * race, on the finish card and into the next race. That is why it is here and
 * not in `Game` — a race is torn all the way down and rebuilt between goes
 * (see `main.ts`), and the people you are racing must not be.
 *
 * One screen is the host, and it is the host for the same reason one of two
 * children holds the dice: somebody has to. It is the host's track, the host's
 * computer cars, the host's clock and the host's decision when the flag drops.
 * Everything else — how each car drives, where it ends up — belongs to the
 * screen the child is holding, which is what keeps a stick honest.
 *
 * Packets between two guests go through the host rather than guest to guest.
 * That is one extra hop, which on one house's wi-fi is a millisecond or two,
 * and it is worth it: a full mesh would be six connections for four children
 * and six times as many ways for a race not to start. The host forwards the
 * moment a packet lands rather than on its own next send, so the hop is all it
 * costs.
 */
export interface Places {
  seat: number;
  time: number;
}

export type Stage =
  /** In the lobby: the code is up, people are arriving. */
  | "waiting"
  /** Everybody has been told what to load. */
  | "loading"
  /** Loaded, waiting on the flag. */
  | "set"
  | "racing"
  | "done";

export class Party {
  readonly room: Room;
  readonly isHost: boolean;
  /** This screen's grid slot. The host has the first. */
  seat = 0;
  stage: Stage = "waiting";

  /** Who is here, by grid slot, this screen included. */
  readonly seats = new Map<number, Seat>();
  /** Which peer is in which slot, so a screen going away empties its slot. */
  private readonly whose = new Map<string, number>();

  /** What the race is, once the host has said. */
  spec: TrackSpec | null = null;
  /** The computer cars, dealt once by the host so that every screen has the
   *  same field. */
  rivals: Array<Look> = [];
  /** When the countdown starts, on the host's clock. Null until the host says.
   *  Everything about the start being simultaneous hangs off this one number. */
  startsAt: number | null = null;
  /** Who finished and how long they took, as far as this screen knows. */
  places: Array<Places> = [];

  /** The cars this screen is shown rather than simulating. */
  ghosts: Array<Ghost> = [];

  /** The shell listens to these; see `main.ts`. */
  onRoster?: () => void;
  onRace?: (spec: TrackSpec) => void;
  onResults?: () => void;
  /** The host went away, or the last guest did. The race is over either way. */
  onEnd?: (why: string) => void;

  /** Which guests have said they are loaded, and how long the host has been
   *  waiting for the rest. */
  private readonly set = new Set<string>();
  private waited = 0;
  private sendIn = 0;
  /** Reused every send: at twenty packets a second this would otherwise be
   *  twenty little objects a second for the collector to deal with. */
  private readonly outgoing: Array<CarState> = [];

  private constructor(room: Room) {
    this.room = room;
    this.isHost = room.isHost;
    room.handlers = {
      onControl: (from, msg) => this.heard(from, msg),
      onCars: (from, data) => this.cars(from, data),
      onLeave: from => this.left(from),
    };
    if (this.isHost) {
      this.seats.set(0, {seat: 0, look: myLook(), ping: 0});
    }
  }

  /** Opens a race for others to join. */
  static async open(): Promise<Party> {
    return new Party(await Room.open());
  }

  /** Joins one. Throws if there is no race with that code, which is what the
   *  join screen tells the child. */
  static async join(code: string): Promise<Party> {
    const party = new Party(await Room.join(code));
    party.room.say({kind: "hello", code, look: myLook()});
    return party;
  }

  get code(): string {
    return this.room.code;
  }

  /** How many children are in it. */
  get size(): number {
    return this.seats.size;
  }

  /** Round trip to the furthest screen, in milliseconds, for the lobby. */
  get ping(): number {
    let worst = 0;
    for (const id of this.room.others) {
      worst = Math.max(worst, this.room.pingTo(id));
    }
    return this.isHost ? worst : this.room.ping;
  }

  /** The host's clock. Every timestamp in the race is on it. */
  now(): number {
    return this.room.clock();
  }

  /** What to call somebody. No typing: a child's car is the name of it. */
  name(seat: number): string {
    return seat === this.seat ? "You" : `Player ${seat + 1}`;
  }

  /**
   * The host starting a race: everybody loads this track.
   *
   * The computer cars are dealt here rather than by each screen, because two
   * screens dealing their own would put a different set of cars on each — and
   * the host is about to start simulating them, so they have to be its own.
   */
  start(
    spec: TrackSpec,
    deal: (count: number, taken: Array<number>) => Array<Look>,
  ): void {
    if (!this.isHost) {
      return;
    }
    const taken: Array<number> = [];
    for (const seat of this.seats.values()) {
      taken.push(seat.look.colour);
    }
    this.spec = spec;
    this.rivals = deal(Math.max(0, NET.most - this.seats.size), taken);
    this.startsAt = null;
    this.places = [];
    this.set.clear();
    this.waited = 0;
    this.stage = "loading";
    this.room.say({kind: "race", spec, rivals: this.rivals});
    this.onRace?.(spec);
  }

  /** This screen is loaded and on the grid. */
  ready(): void {
    this.stage = "set";
    if (this.isHost) {
      this.mightStart();
    } else {
      this.room.say({kind: "ready"});
    }
  }

  /**
   * This screen has been to the garage: everybody is told about the new car.
   *
   * A guest says hello again, which the host reads as "same child, different
   * car" — one message doing two jobs rather than a second one that would only
   * ever be sent from the lobby.
   */
  refreshLook(): void {
    if (this.isHost) {
      this.seats.set(this.seat, {seat: this.seat, look: myLook(), ping: 0});
      this.room.say({kind: "roster", roster: [...this.seats.values()]});
      this.onRoster?.();
    } else {
      this.room.say({kind: "hello", code: this.code, look: myLook()});
    }
  }

  /** Every car in the field, as looks, by grid slot — so a screen can build
   *  the whole grid before anybody has said anything. */
  field(): Array<{slot: number; look: Look; mine: boolean; ai: boolean}> {
    const all: Array<{slot: number; look: Look; mine: boolean; ai: boolean}> =
      [];
    for (const [slot, seat] of this.seats) {
      all.push({slot, look: seat.look, mine: slot === this.seat, ai: false});
    }
    this.rivals.forEach((look, i) => {
      all.push({slot: this.seats.size + i, look, mine: false, ai: true});
    });
    return all.sort((a, b) => a.slot - b.slot);
  }

  /**
   * Builds the cars this screen does not drive, on the grid.
   *
   * On the host that is the other children only: it drives the computer cars
   * itself. On a guest it is everybody else *and* the computer cars, because
   * those are the host's and arrive over the network like any other car.
   */
  buildGhosts(track: Track): Array<Ghost> {
    const here = new THREE.Vector3();
    const way = new THREE.Vector3();
    this.ghosts = [];
    for (const car of this.field()) {
      if (car.mine || (car.ai && this.isHost)) {
        continue;
      }
      const who = car.ai ? AI + (car.slot - this.seats.size) : car.slot;
      // Painted for the place it is racing in, the same as this screen's own
      // car is: under the neon everybody's colour is turned up, and a car that
      // missed that would be the one dull thing in the city.
      const ghost = new Ghost(who, {
        ...car.look,
        // A computer car keeps the colour the host dealt it: the host is not
        // repainting those for the city either, so repainting them here would
        // be the one car that did not match.
        colour: car.ai
          ? car.look.colour
          : carPaint(car.look.colour, this.spec?.environment ?? "hills"),
      });
      const t = gridSlot(track, car.slot, here);
      track.tangentAt(t, way);
      ghost.place(here.x, here.z, Math.atan2(way.x, way.z), 0);
      this.ghosts.push(ghost);
    }
    return this.ghosts;
  }

  /**
   * One step of the network, from inside the race loop.
   *
   * Two jobs: say where our own cars are, if it is time to, and move
   * everybody else's to where they should be by now. Both are cheap; neither
   * touches the car this child is driving, which is simulated exactly as it is
   * in a race on your own.
   */
  step(
    dt: number,
    track: Track,
    mine: CarState,
    ai: ReadonlyArray<CarState>,
  ): void {
    this.sendIn -= dt;
    if (this.sendIn <= 0) {
      this.sendIn = 1 / NET.rate;
      this.outgoing.length = 0;
      this.outgoing.push(mine);
      for (const car of ai) {
        this.outgoing.push(car);
      }
      this.room.send(packCars(this.now(), this.outgoing));
    }
    const now = this.now();
    for (const ghost of this.ghosts) {
      ghost.step(dt, now, track);
    }
  }

  /** This screen crossed the line. */
  finish(time: number): void {
    this.stage = "done";
    if (this.isHost) {
      this.record(this.seat, time);
      this.tell();
    } else {
      this.room.say({kind: "done", time});
    }
  }

  close(): void {
    this.room.close();
    this.seats.clear();
    this.ghosts = [];
  }

  private left(from: string): void {
    if (!this.isHost) {
      // The host going away is the end of it. There is nobody else to ask.
      this.onEnd?.("The other iPad left the race.");
      return;
    }
    const slot = this.whose.get(from);
    this.whose.delete(from);
    if (slot !== undefined) {
      this.seats.delete(slot);
      this.ghosts = this.ghosts.filter(g => g.who !== slot);
      this.room.say({kind: "roster", roster: [...this.seats.values()]});
      this.onRoster?.();
    }
    this.set.delete(from);
  }

  private heard(from: string, msg: Control): void {
    switch (msg.kind) {
      case "hello": {
        if (!this.isHost) {
          return;
        }
        // The code is checked even though the connection already found us: a
        // peer id is guessable and a code is the thing a child was given.
        if (msg.code.toUpperCase() !== this.code) {
          this.room.say(
            {kind: "no", why: "That code is for another race."},
            from,
          );
          return;
        }
        // A second hello from a screen that is already in means it has been to
        // the garage and come back with a different car.
        const already = this.whose.get(from);
        if (already !== undefined) {
          this.seats.set(already, {
            seat: already,
            look: msg.look,
            ping: this.room.pingTo(from),
          });
          this.room.say({kind: "roster", roster: [...this.seats.values()]});
          this.onRoster?.();
          return;
        }
        const slot = this.freeSlot();
        if (slot === null) {
          this.room.say({kind: "no", why: "That race is full."}, from);
          return;
        }
        this.whose.set(from, slot);
        this.room.setSeat(from, slot);
        this.seats.set(slot, {seat: slot, look: msg.look, ping: 0});
        this.room.say(
          {kind: "welcome", seat: slot, roster: [...this.seats.values()]},
          from,
        );
        this.room.say({kind: "roster", roster: [...this.seats.values()]});
        this.onRoster?.();
        return;
      }
      case "welcome":
        this.seat = msg.seat;
        this.takeRoster(msg.roster);
        return;
      case "roster":
        this.takeRoster(msg.roster);
        return;
      case "race":
        this.spec = msg.spec;
        this.rivals = msg.rivals;
        this.startsAt = null;
        this.places = [];
        this.stage = "loading";
        this.onRace?.(msg.spec);
        return;
      case "ready":
        if (this.isHost) {
          this.set.add(from);
          this.mightStart();
        }
        return;
      case "go":
        this.startsAt = msg.at;
        this.stage = "racing";
        return;
      case "done": {
        if (!this.isHost) {
          return;
        }
        const slot = this.whose.get(from);
        if (slot !== undefined) {
          this.record(slot, msg.time);
          this.tell();
        }
        return;
      }
      case "results":
        this.places = msg.places;
        this.onResults?.();
        return;
      case "no":
        this.onEnd?.(msg.why || "That race would not let us in.");
        return;
      default:
        return;
    }
  }

  /**
   * Where the cars are, from another screen.
   *
   * The host forwards a guest's packet to the other guests untouched, and
   * untouched is the point: every packet is stamped with the host's clock — a
   * guest converts before it sends — so a forwarded one needs no adjusting and
   * arrives as quickly as the wire allows.
   */
  private cars(from: string, data: unknown): void {
    const packet = unpackCars(data);
    if (!packet) {
      return;
    }
    for (const state of packet.cars) {
      if (state.who === this.seat) {
        continue;
      }
      const ghost = this.ghosts.find(g => g.who === state.who);
      ghost?.hear(state, packet.clock);
    }
    if (this.isHost && data instanceof ArrayBuffer) {
      for (const id of this.room.others) {
        if (id !== from) {
          this.room.send(data, id);
        }
      }
    }
  }

  private takeRoster(roster: Array<Seat>): void {
    this.seats.clear();
    for (const seat of roster) {
      this.seats.set(seat.seat, seat);
    }
    this.onRoster?.();
  }

  private freeSlot(): number | null {
    for (let slot = 0; slot < NET.most; slot++) {
      if (!this.seats.has(slot)) {
        return slot;
      }
    }
    return null;
  }

  /**
   * The flag, once everybody is on the grid.
   *
   * Or once the host has waited long enough: a child staring at a loading card
   * because somebody else's iPad is having a think is worse than a car that
   * joins the race a second late.
   */
  private mightStart(): void {
    if (!this.isHost || this.startsAt !== null || this.stage !== "set") {
      return;
    }
    const guests = this.room.others.length;
    if (this.set.size < guests && this.waited < NET.patience) {
      return;
    }
    this.startsAt = this.now() + NET.warm;
    this.stage = "racing";
    this.room.say({kind: "go", at: this.startsAt});
  }

  /** Called from the loading card, so a host that has been waiting a long time
   *  eventually goes anyway. */
  waiting(dt: number): void {
    if (!this.isHost || this.startsAt !== null) {
      return;
    }
    this.waited += dt;
    if (this.waited >= NET.patience) {
      this.mightStart();
    }
  }

  private record(seat: number, time: number): void {
    this.places = this.places.filter(p => p.seat !== seat);
    this.places.push({seat, time});
    this.places.sort((a, b) => a.time - b.time);
    this.onResults?.();
  }

  private tell(): void {
    this.room.say({kind: "results", places: this.places});
  }
}

/**
 * Where a car starts, in a race with other children in it.
 *
 * Two abreast rather than the single file a race against the computer uses,
 * and the children in the front rows. Single file would hand whoever the host
 * happened to be a car length a slot, which between two children in the same
 * room is the kind of unfairness that ends a game.
 */
export function gridSlot(
  track: Track,
  slot: number,
  out: THREE.Vector3,
): number {
  const row = slot >> 1;
  const side = slot % 2 === 0 ? 1 : -1;
  return track.gridAt(row, side * RIVALS.offset, out);
}

/** This screen's own car, as the garage has it. */
export function myLook(): Look {
  return {
    colour: myColour(),
    design: myDesign(),
    shape: myShape(),
    kit: myKit(),
    stickers: myStickers(),
  };
}
