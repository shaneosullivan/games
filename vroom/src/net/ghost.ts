import {NET} from "../config";
import {Car, shortestAngle} from "../entities/car";
import {Track} from "../entities/track";
import {CarState, Look} from "./protocol";

/**
 * Somebody else's car, on this screen.
 *
 * The problem it solves: packets arrive twenty times a second and the game
 * draws sixty or a hundred and twenty times a second, so five frames in six
 * have no news at all. Drawing the newest packet and holding it would give a
 * car that jerks forward and stops, twenty times a second, which at racing
 * speed is unwatchable and impossible to race against.
 *
 * So the car is drawn *slightly in the past* — `NET.smooth` behind the newest
 * packet — and moved between the two packets either side of that moment. It
 * always has somewhere to go, so it always glides. The cost is that the car is
 * one packet-and-a-bit behind where the other child's screen has it, which at
 * sixty milliseconds is about a car length at full speed: close enough that
 * racing wheel to wheel works and a bump lands where it looked like it would.
 *
 * When packets stop — a dropped one, or a phone deciding to think about
 * something else — the car carries on the way it was going for `NET.carries`
 * and then stops rather than being guessed at any further. A car that keeps
 * going straight for a fifth of a second is nearly always right; one that
 * keeps going for two seconds is in the scenery.
 */
export class Ghost {
  readonly car: Car;
  /** How far past the line, in laps, as of the newest packet. The placings
   *  read this, so they are the other screen's own arithmetic rather than
   *  something inferred from a position. */
  progress = 0;
  /** How long since a packet. The lobby and the race both want to know. */
  quiet = 0;

  /** The last few packets, oldest first, each with the sender's clock. */
  private readonly frames: Array<{at: number; state: CarState}> = [];

  constructor(
    /** Which car this is: a seat, or `AI + n`. */
    readonly who: number,
    look: Look,
  ) {
    this.car = new Car(
      look.colour,
      look.design,
      look.stickers,
      look.kit,
      look.shape,
    );
  }

  /** Where it starts, before anybody has said anything about it. */
  place(x: number, z: number, heading: number, hint: number): void {
    this.car.place(x, z, heading, hint, 0);
    this.frames.length = 0;
  }

  /** A packet about this car. Late ones are thrown away: the channel is
   *  unordered on purpose, so they genuinely do arrive out of order. */
  hear(state: CarState, at: number): void {
    const newest = this.frames[this.frames.length - 1];
    if (newest && at < newest.at - 1) {
      // Not a late packet: the clocks have just been compared for the first
      // time and this screen's idea of the host's clock has moved. Everything
      // here is stamped in the old terms and is no use any more.
      this.frames.length = 0;
    } else if (newest && at <= newest.at) {
      return;
    }
    this.frames.push({at, state});
    this.progress = state.progress;
    this.quiet = 0;
    // Two is all the arithmetic needs; a few more cover a packet arriving
    // while an older pair is still being drawn between.
    while (this.frames.length > NET.drops) {
      this.frames.shift();
    }
  }

  /**
   * Moves the car to where it was `NET.smooth` ago.
   *
   * `now` is the host's clock, which is the clock every packet is stamped with
   * — see `Room.clock`. That is the entire reason the room bothers to work out
   * the difference between two screens' clocks: without it, "where was this car
   * sixty milliseconds ago" has no answer either screen would agree on.
   */
  step(dt: number, now: number, track: Track): void {
    this.quiet += dt;
    if (this.frames.length === 0) {
      return;
    }
    const want = now - NET.smooth;
    const newest = this.frames[this.frames.length - 1];

    if (want <= this.frames[0].at) {
      // Before anything known: sit on the oldest packet. Only happens in the
      // first fraction of a second of a race.
      this.put(this.frames[0].state, track);
      return;
    }
    for (let i = this.frames.length - 1; i > 0; i--) {
      const to = this.frames[i];
      const from = this.frames[i - 1];
      if (want >= from.at && want <= to.at) {
        const span = to.at - from.at;
        const k = span > 1e-4 ? (want - from.at) / span : 1;
        this.between(from.state, to.state, k, track);
        return;
      }
    }

    // Past the newest: carry on the way it was going, briefly. The heading
    // turns at whatever rate it was turning at, which matters more than it
    // sounds — a car halfway through a corner that carried straight on would
    // stand out far more than one that keeps turning.
    const over = Math.min(want - newest.at, NET.carries);
    this.put(newest.state, track, over);
  }

  /** Where it is, for the minimap and for working out the placings. */
  private put(state: CarState, track: Track, over = 0): void {
    this.car.follow(
      state.x + state.vx * over,
      state.z + state.vz * over,
      state.heading + state.yawRate * over,
      state.vx,
      state.vz,
      state.height,
      state.roll,
      state.pitch,
      state.slip,
    );
    this.look(track);
  }

  private between(from: CarState, to: CarState, k: number, track: Track): void {
    const mix = (a: number, b: number): number => a + (b - a) * k;
    this.car.follow(
      mix(from.x, to.x),
      mix(from.z, to.z),
      // The short way round, or a car crossing from a heading of 3.1 to one of
      // -3.1 spins the whole way about on the spot.
      from.heading + shortestAngle(from.heading, to.heading) * k,
      mix(from.vx, to.vx),
      mix(from.vz, to.vz),
      mix(from.height, to.height),
      from.roll + shortestAngle(from.roll, to.roll) * k,
      from.pitch + shortestAngle(from.pitch, to.pitch) * k,
      mix(from.slip, to.slip),
    );
    this.look(track);
  }

  /** Keeps the car's place on the circuit up to date, which is what decides
   *  whether it is drawn over a flyover or under one. */
  private look(track: Track): void {
    const found = track.nearest(
      this.car.position.x,
      this.car.position.z,
      this.car.hint,
    );
    this.car.hint = found.index;
  }
}
