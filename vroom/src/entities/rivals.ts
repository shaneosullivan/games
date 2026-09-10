import * as THREE from "three";
import {PLAYER, RIVALS, TRACK} from "../config";
import {myColour, neonised} from "../core/garage";
import {Car, Drive} from "./car";
import {Patches} from "./patches";
import {signed, Track, wrap} from "./track";

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
  /** What each one is painted, in the order they were built. The minimap draws
   *  a dot per car and it has to be the colour of the car it stands for. */
  readonly colours: Array<number> = [];

  /** How far round the lap each one is, and how fast it goes. */
  private readonly at: Array<number> = [];
  /** And how far each has travelled in total, in laps — which is a different
   *  number, because `at` wraps and the race is decided on distance. */
  private readonly travelled: Array<number> = [];
  /** Where each one started, as a signed distance from the start line. The
   *  grid is behind the line, so these are all a little negative. */
  private readonly began: Array<number> = [];
  /** How brave each one is, as a fraction of what the road allows. */
  private readonly nerve: Array<number> = [];
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
    // Both versions of the player's colour are spoken for, whichever track
    // this is: under the neon they drive the turned-up one, and a rival in the
    // daylight version of it is the same car from the height the camera sits.
    const used = new Set<number>([myColour(), neonised(myColour())]);
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
      const colour = nextColour();
      this.colours.push(colour);
      const car = new Car(colour);
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
      this.began.push(signed(t - track.startAt));
      this.offset.push(off);
      // Each a little braver or more cautious than the next, so they string
      // out over a lap instead of driving round nose to tail.
      this.nerve.push(RIVALS.pace + (i - 1) * RIVALS.nerve);
    }
  }

  update(dt: number, track: Track, patches?: Patches): void {
    for (let i = 0; i < this.cars.length; i++) {
      const car = this.cars[i];
      // Walk their point along the circuit and aim the car at where it will
      // be. Aiming *ahead* rather than at the point itself is what makes them
      // turn in early and hold a line, instead of sawing at the wheel trying
      // to sit on a moving dot.
      //
      // How fast the point walks is the road's business, not a constant: the
      // slowest thing within sight of it, which is a corner coming, times how
      // brave this particular driver is. Braking, in other words — and the
      // acceleration out the far side comes for free, because the moment the
      // corner is behind the point the limit goes back up.
      const speed = this.paceFor(track, this.at[i], i);
      const step = (speed * dt) / track.length;
      this.at[i] = wrap(this.at[i] + step);
      this.travelled[i] += step;
      const lead = wrap(this.at[i] + 0.012);
      track.pointAt(lead, this.aim);
      track.sideAt(lead, this.here);
      // On the racing line, plus their own foot of daylight, so three cars on
      // the same line are three cars and not one — and both of those together
      // held inside the road, because an apex plus an offset is how a car ends
      // up racing along the grass.
      const sample = Math.round(lead * TRACK.segments);
      const room = TRACK.half - RIVALS.margin;
      let across = Math.max(
        -room,
        Math.min(room, track.lineAt(sample) + this.offset[i]),
      );

      // And if they are already wide of that — a corner taken a shade too fast
      // runs the car out to the kerb whatever it was aiming at — the aim is
      // pulled back across the road by however far they have overshot. That is
      // a driver catching it and tucking back in, and without it a fast corner
      // ended with a car in the sand, which is not a driver at all.
      const where = track.nearest(car.position.x, car.position.z, car.hint);
      const wide = Math.abs(where.offset) - room;
      if (wide > 0) {
        across -=
          Math.sign(where.offset) * Math.min(wide * RIVALS.catches, room);
      }
      this.aim.addScaledVector(this.here, across);

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

  /**
   * How fast to be here: the slowest the road gets between here and as far as
   * a driver looks, scaled by this one's nerve.
   *
   * Looking ahead is the whole of braking. A car that read the limit at its
   * own bumper would arrive at every corner flat out and turn in at a speed no
   * amount of grip could hold.
   */
  private paceFor(track: Track, at: number, i: number): number {
    const step = track.length / TRACK.segments;
    const ahead = Math.max(1, Math.round(RIVALS.sees / step));
    const here = Math.round(at * TRACK.segments);
    let slowest = Infinity;
    for (let k = 0; k <= ahead; k++) {
      slowest = Math.min(slowest, track.paceAt(here + k));
    }
    return slowest * this.nerve[i];
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
  /**
   * How far past the start line this one is, in laps.
   *
   * Distance travelled *plus where it started*, and the second half of that is
   * not a detail: the grid is a queue, the four cars are strung out over a
   * fiftieth of a lap, and comparing bare distances credits everybody with
   * having started from the line. The player, who starts at the very back, was
   * shown as leading a race with three cars visibly in front of them.
   */
  progress(i: number): number {
    return this.travelled[i] + this.began[i];
  }
}
