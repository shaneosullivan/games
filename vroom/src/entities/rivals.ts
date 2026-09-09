import * as THREE from "three";
import {CAR, PLAYER, RIVALS} from "../config";
import {myColour} from "../core/garage";
import {Car, Drive} from "./car";
import {Patches} from "./patches";
import {Track, wrap} from "./track";

/**
 * The other cars.
 *
 * They drive the circuit rather than race it: each one holds a fraction of a
 * lap and a fixed distance off the centre line, and the car model does the
 * rest — it is handed a direction to aim at, exactly as the player's is handed
 * one by the stick, so a rival leans into a corner and slides out of it with
 * the same physics and looks like it is being driven.
 *
 * They do not cheat and they do not rubber-band. A child who drives well
 * should beat them and a child who spins should not, and both of those want
 * the rivals to simply be going a certain speed.
 */
export class Rivals {
  readonly group = new THREE.Group();
  readonly cars: Array<Car> = [];

  /** How far round the lap each one is, and how fast it goes. */
  private readonly at: Array<number> = [];
  /** And how far each has travelled in total, in laps — which is a different
   *  number, because `at` wraps and the race is decided on distance. */
  private readonly travelled: Array<number> = [];
  private readonly pace: Array<number> = [];
  private readonly offset: Array<number> = [];

  private readonly aim = new THREE.Vector3();
  private readonly want = new THREE.Vector2();
  private readonly here = new THREE.Vector3();
  /** Held rather than made each step: three cars, sixty steps a second. */
  private readonly drive: Drive;

  constructor(track: Track) {
    this.drive = {kind: "aim", aim: this.want};
    // Every car in the race is a different colour, and none of them is the
    // player's. Two the same is a child watching the wrong one all the way
    // round — and that goes for two rivals as much as for a rival and you.
    //
    // Taken in order and skipping whatever is spoken for: the rivals' own
    // three first, then the rest of the garage to fill any gap. Filtering the
    // rivals' list and falling back by index was not enough — take blue and
    // the third rival fell through to a colour the second already had.
    const used = new Set<number>([myColour()]);
    const nextColour = (): number => {
      for (const c of [...RIVALS.colours, ...PLAYER.choices]) {
        if (!used.has(c)) {
          used.add(c);
          return c;
        }
      }
      return RIVALS.colours[0];
    };
    for (let i = 0; i < RIVALS.count; i++) {
      const car = new Car(nextColour());
      // Left, right, left: a grid, not a queue.
      const off = (i % 2 === 0 ? 1 : -1) * RIVALS.offset;
      const t = wrap(track.startAt - 0.006 - i * RIVALS.gridGap);
      track.pointAt(t, this.here);
      track.sideAt(t, this.aim);
      const x = this.here.x + this.aim.x * off;
      const z = this.here.z + this.aim.z * off;
      const d = track.tangentAt(t, this.aim);
      car.place(x, z, Math.atan2(d.x, d.z), 0, t);

      this.cars.push(car);
      this.group.add(car.group);
      this.at.push(t);
      this.travelled.push(0);
      this.offset.push(off);
      // Each a little different, so they string out instead of moving as one.
      this.pace.push(CAR.top * (RIVALS.pace + (i - 1) * RIVALS.spread));
    }
  }

  update(dt: number, track: Track, patches?: Patches): void {
    for (let i = 0; i < this.cars.length; i++) {
      const car = this.cars[i];
      // Walk their point along the circuit at their own pace, and aim the car
      // at where it will be. Aiming *ahead* rather than at the point itself is
      // what makes them turn in early and hold a line, instead of sawing at
      // the wheel trying to sit on a moving dot.
      const step = (this.pace[i] * dt) / track.length;
      this.at[i] = wrap(this.at[i] + step);
      this.travelled[i] += step;
      const lead = wrap(this.at[i] + 0.012);
      track.pointAt(lead, this.aim);
      track.sideAt(lead, this.here);
      this.aim.addScaledVector(this.here, this.offset[i]);

      this.want.set(this.aim.x - car.position.x, this.aim.z - car.position.z);
      const d = this.want.length();
      if (d > 1e-4) {
        // Full throttle unless they are already past where they should be.
        this.want.multiplyScalar(Math.min(1, d / 30) / d);
      }
      car.update(dt, this.drive, track, patches);
      car.keepIn(track);
    }
  }

  render(alpha: number): void {
    for (const car of this.cars) {
      car.render(alpha);
    }
  }

  /** Lifts whichever of them are up on a flyover. */
  setAbove(isAbove: (index: number) => boolean): void {
    for (const car of this.cars) {
      car.setAbove(isAbove(car.hint));
    }
  }

  /** How far each of them has come, in laps, for working out the order. */
  progress(i: number): number {
    return this.travelled[i];
  }
}
