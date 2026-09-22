import {
  CarDesign,
  CarShape,
  DRIVER,
  DriverKit,
  NET,
  PLAYER,
  SHAPES,
  Sticker,
} from "../config";
import {tidyName} from "../core/name";
import {tidyStickers} from "../core/stickers";
import {isSpec, TrackSpec} from "../track/spec";

/**
 * What the two screens say to each other.
 *
 * Two kinds of thing, sent down two different channels, because they want
 * opposite treatment from the network:
 *
 * - **Words** (`Control`), as JSON on a reliable channel: who has joined, what
 *   track it is, the flag, the result. Each one matters exactly once and
 *   losing one would strand somebody on a loading card, so these are worth
 *   waiting for.
 * - **Where the cars are** (`packCars`), as a few dozen bytes on an *unordered*
 *   channel. Every one of these is stale the moment the next is sent, so
 *   anything that arrives out of order is thrown away rather than waited for —
 *   which is the whole point of not sending this down the same channel as the
 *   words.
 *
 * Everything coming off the wire came off somebody else's iPad and is checked
 * before it is believed. Not for safety — this is two children in one room —
 * but because a malformed packet that throws would take down the race for the
 * child who did nothing wrong.
 */

/** What a car looks like: everything the garage lets a child choose. */
export interface Look {
  colour: number;
  design: CarDesign;
  shape: CarShape;
  /** What the driver is wearing. Left out for a computer car, whose driver
   *  wears a suit in the colour of the car — which is what they wore before
   *  there was a wardrobe, and still what suits them. */
  kit?: DriverKit;
  stickers: Array<Sticker>;
}

/** One screen in the race, as everybody else sees it. */
export interface Seat {
  /** Which grid slot. */
  seat: number;
  /** What the child at it calls themselves, or empty for whoever has not said
   *  — in which case the grid slot is the name, as it always was. */
  name: string;
  look: Look;
  /** Round trip to this one, in milliseconds, for the lobby to show. */
  ping: number;
}

export type Control =
  /** Guest to host, first thing: the code it scanned and the car it drives. */
  | {kind: "hello"; code: string; look: Look; name: string}
  /** Host to guest: you are in, and this is who else is here. */
  | {kind: "welcome"; seat: number; roster: Array<Seat>}
  /** Host to everybody, whenever that changes. */
  | {kind: "roster"; roster: Array<Seat>}
  /** Host to everybody: this is what we are going to race. A lobby's worth of
   *  news, not a start — see `race` for that. */
  | {kind: "track"; spec: TrackSpec}
  /** Host to everybody: load this and tell me when you have. The computer
   *  cars are dealt by the host so that every screen has the same field. */
  | {kind: "race"; spec: TrackSpec; rivals: Array<Look>}
  /** Guest to host: loaded, waiting on the flag. */
  | {kind: "ready"}
  /** Host to everybody: the flag drops at this time on the host's clock. */
  | {kind: "go"; at: number}
  /** Whoever crossed the line, to the host, with how long it took them. */
  | {kind: "done"; time: number}
  /** Host to everybody, once the race is settled. */
  | {kind: "results"; places: Array<{seat: number; time: number}>}
  /** The clocks, and the only reason the countdown can be trusted to land on
   *  every screen at once. Guests ask; the host answers with its own clock. */
  | {kind: "ping"; t: number}
  | {kind: "pong"; t: number; clock: number}
  /** A guest telling the host what it measured, so the lobby can show it. */
  | {kind: "lag"; ms: number}
  /** No room, or a code that does not match: the guest is turned away with a
   *  reason rather than left waiting. */
  | {kind: "no"; why: string};

/**
 * Where one car is, this instant.
 *
 * Eleven numbers, and every one of them is something the other screen cannot
 * work out for itself. The velocity and the yaw rate are in here because they
 * are what lets a car carry on sensibly through a dropped packet; the height
 * and the lean are because a car in mid-air off a ramp has to look like it.
 */
export interface CarState {
  /** Which car: a seat for a child, or `AI + n` for a computer one. */
  who: number;
  x: number;
  z: number;
  heading: number;
  vx: number;
  vz: number;
  yawRate: number;
  slip: number;
  height: number;
  roll: number;
  pitch: number;
  /** How far past the start line, in laps — what the placings are worked out
   *  from, so it travels rather than being guessed at from a position. */
  progress: number;
}

/** Computer cars are numbered from here, so one number covers every car in the
 *  race whether there is a child in it or not. */
export const AI = 16;

/** Bytes: a byte for who, then eleven numbers. */
const PER_CAR = 1 + 11 * 4;
const HEAD = 1 + 4;
/** The one packet type there is. A version byte would be a lie — two screens
 *  running different builds of the game have more than this to disagree
 *  about — so this is a sanity check on the bytes and nothing more. */
const CARS = 0xc1;

/**
 * The cars, as bytes.
 *
 * Explicitly little-endian rather than whatever this machine happens to be:
 * the two ends of this are different devices, and the day one of them is not
 * an Apple or an Intel is not the day to discover that.
 */
export function packCars(
  clock: number,
  cars: ReadonlyArray<CarState>,
): ArrayBuffer {
  const buffer = new ArrayBuffer(HEAD + cars.length * PER_CAR);
  const view = new DataView(buffer);
  view.setUint8(0, CARS);
  view.setFloat32(1, clock, true);
  let at = HEAD;
  for (const car of cars) {
    view.setUint8(at, car.who);
    view.setFloat32(at + 1, car.x, true);
    view.setFloat32(at + 5, car.z, true);
    view.setFloat32(at + 9, car.heading, true);
    view.setFloat32(at + 13, car.vx, true);
    view.setFloat32(at + 17, car.vz, true);
    view.setFloat32(at + 21, car.yawRate, true);
    view.setFloat32(at + 25, car.slip, true);
    view.setFloat32(at + 29, car.height, true);
    view.setFloat32(at + 33, car.roll, true);
    view.setFloat32(at + 37, car.pitch, true);
    view.setFloat32(at + 41, car.progress, true);
    at += PER_CAR;
  }
  return buffer;
}

/** And back. Null for anything that is not one of these, which is treated as a
 *  lost packet — there will be another in fifty milliseconds. */
export function unpackCars(
  data: unknown,
): {clock: number; cars: Array<CarState>} | null {
  const buffer =
    data instanceof ArrayBuffer
      ? data
      : ArrayBuffer.isView(data)
        ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
        : null;
  if (!buffer || buffer.byteLength < HEAD) {
    return null;
  }
  const view = new DataView(buffer);
  if (view.getUint8(0) !== CARS) {
    return null;
  }
  const count = Math.floor((buffer.byteLength - HEAD) / PER_CAR);
  const cars: Array<CarState> = [];
  let at = HEAD;
  for (let i = 0; i < count; i++) {
    cars.push({
      who: view.getUint8(at),
      x: view.getFloat32(at + 1, true),
      z: view.getFloat32(at + 5, true),
      heading: view.getFloat32(at + 9, true),
      vx: view.getFloat32(at + 13, true),
      vz: view.getFloat32(at + 17, true),
      yawRate: view.getFloat32(at + 21, true),
      slip: view.getFloat32(at + 25, true),
      height: view.getFloat32(at + 29, true),
      roll: view.getFloat32(at + 33, true),
      pitch: view.getFloat32(at + 37, true),
      progress: view.getFloat32(at + 41, true),
    });
    // On to the next car. Forgetting this read every car in the packet from
    // the same offset, so a screen heard about the car whoever sent it was
    // driving and about nothing else — and the computer cars, which only the
    // host drives, stood on the grid for everybody else all race.
    at += PER_CAR;
  }
  return {clock: view.getFloat32(1, true), cars};
}

/** A car nobody has told us about yet: the red one, plain, with a driver in
 *  the kit everybody starts in. */
export function plainLook(): Look {
  return {
    colour: PLAYER.colour,
    design: "plain",
    shape: "racer",
    kit: {helmet: DRIVER.helmet, suit: DRIVER.suit},
    stickers: [],
  };
}

/**
 * A car somebody else described, held to what this build of the game knows how
 * to draw.
 *
 * Anything unrecognised falls back rather than being refused: a friend on last
 * week's build who is driving a shape this one has never heard of should still
 * turn up, in a car, and race.
 */
export function tidyLook(value: unknown): Look {
  const look = plainLook();
  if (typeof value !== "object" || value === null) {
    return look;
  }
  const from = value as Partial<Look>;
  if (PLAYER.choices.includes(from.colour as number)) {
    look.colour = from.colour as number;
  }
  if (PLAYER.designs.some(d => d.id === from.design)) {
    look.design = from.design as CarDesign;
  }
  if (SHAPES.some(s => s.id === from.shape)) {
    look.shape = from.shape as CarShape;
  }
  if (typeof from.kit === "object" && from.kit !== null && look.kit) {
    if (DRIVER.helmets.includes(from.kit.helmet)) {
      look.kit.helmet = from.kit.helmet;
    }
    if (DRIVER.suits.includes(from.kit.suit)) {
      look.kit.suit = from.kit.suit;
    }
  }
  look.stickers = tidyStickers(from.stickers);
  return look;
}

/**
 * Words off the wire, checked before they are acted on.
 *
 * The switch is written out in full — no trusting `kind` and reading whatever
 * fields it implies — because the one thing that must not happen here is a
 * throw inside a network callback taking the race down with it.
 */
export function tidyControl(value: unknown): Control | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const msg = value as {kind?: unknown};
  const number = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  switch (msg.kind) {
    case "hello": {
      const {code, look} = value as {code?: unknown; look?: unknown};
      const named = (value as {name?: unknown}).name;
      return typeof code === "string" && code.length <= NET.code + 4
        ? {
            kind: "hello",
            code,
            look: tidyLook(look),
            name: tidyName(typeof named === "string" ? named : ""),
          }
        : null;
    }
    case "welcome": {
      const {seat, roster} = value as {seat?: unknown; roster?: unknown};
      const which = number(seat);
      return which === null
        ? null
        : {kind: "welcome", seat: which, roster: tidyRoster(roster)};
    }
    case "roster":
      return {
        kind: "roster",
        roster: tidyRoster((value as {roster?: unknown}).roster),
      };
    case "track": {
      const {spec} = value as {spec?: unknown};
      return isSpec(spec) ? {kind: "track", spec} : null;
    }
    case "race": {
      const {spec, rivals} = value as {spec?: unknown; rivals?: unknown};
      if (!isSpec(spec)) {
        return null;
      }
      const dealt = Array.isArray(rivals) ? rivals : [];
      return {
        kind: "race",
        spec,
        rivals: dealt.slice(0, NET.most).map(tidyLook),
      };
    }
    case "ready":
      return {kind: "ready"};
    case "go": {
      const at = number((value as {at?: unknown}).at);
      return at === null ? null : {kind: "go", at};
    }
    case "done": {
      const time = number((value as {time?: unknown}).time);
      return time === null ? null : {kind: "done", time};
    }
    case "results": {
      const places = (value as {places?: unknown}).places;
      if (!Array.isArray(places)) {
        return null;
      }
      const kept: Array<{seat: number; time: number}> = [];
      for (const place of places) {
        const seat = number((place as {seat?: unknown})?.seat);
        const time = number((place as {time?: unknown})?.time);
        if (seat !== null && time !== null) {
          kept.push({seat, time});
        }
      }
      return {kind: "results", places: kept};
    }
    case "ping": {
      const t = number((value as {t?: unknown}).t);
      return t === null ? null : {kind: "ping", t};
    }
    case "pong": {
      const {t, clock} = value as {t?: unknown; clock?: unknown};
      const sent = number(t);
      const theirs = number(clock);
      return sent === null || theirs === null
        ? null
        : {kind: "pong", t: sent, clock: theirs};
    }
    case "lag": {
      const ms = number((value as {ms?: unknown}).ms);
      return ms === null ? null : {kind: "lag", ms: Math.max(0, ms)};
    }
    case "no": {
      const why = (value as {why?: unknown}).why;
      return {kind: "no", why: typeof why === "string" ? why : ""};
    }
    default:
      return null;
  }
}

function tidyRoster(value: unknown): Array<Seat> {
  if (!Array.isArray(value)) {
    return [];
  }
  const roster: Array<Seat> = [];
  for (const entry of value.slice(0, NET.most)) {
    const seat = (entry as {seat?: unknown})?.seat;
    if (typeof seat !== "number" || !Number.isFinite(seat)) {
      continue;
    }
    const ping = (entry as {ping?: unknown})?.ping;
    const named = (entry as {name?: unknown})?.name;
    roster.push({
      seat,
      name: tidyName(typeof named === "string" ? named : ""),
      look: tidyLook((entry as {look?: unknown})?.look),
      ping: typeof ping === "number" && Number.isFinite(ping) ? ping : 0,
    });
  }
  return roster;
}
