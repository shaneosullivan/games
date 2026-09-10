import * as THREE from "three";
import {CarShape, PHYSICS, PLAYER, RIVALS, TRACK} from "../config";
import {myColour, neonised} from "../core/garage";
import {Car, shortestAngle} from "./car";
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
  /** How long each has been trying to go somewhere and failing, and how long
   *  it has left of backing out of it. */
  private readonly stuck: Array<number> = [];
  private readonly reversing: Array<number> = [];
  private readonly offset: Array<number> = [];

  private readonly aim = new THREE.Vector3();
  private readonly want = new THREE.Vector2();
  private readonly here = new THREE.Vector3();
  /** Held rather than made each step: three cars, sixty steps a second. */
  private readonly drive: {kind: "wheel"; steer: number; throttle: number};

  constructor(track: Track) {
    this.drive = {kind: "wheel", steer: 0, throttle: 0};
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
    // Shuffled rather than taken in order, so the field is a different three
    // cars every race. A child who has raced the same blue, green and yellow
    // car forty times is racing a screensaver.
    const used = new Set<number>([myColour(), neonised(myColour())]);
    const pool = [...RIVALS.colours, ...PLAYER.choices].filter(
      c => !used.has(c),
    );
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const nextColour = (): number => pool.pop() ?? RIVALS.colours[0];

    for (let i = 0; i < RIVALS.count; i++) {
      const colour = nextColour();
      this.colours.push(colour);
      // And something painted on it, chosen the same way. The player's own
      // stickers stay the player's: a rival with a crown on its nose would be
      // wearing something a child had made.
      const design =
        PLAYER.designs[Math.floor(Math.random() * PLAYER.designs.length)].id;
      // And now and again one of them is not a car at all. A cow and a chicken
      // drive exactly as a racing car does — same mass, wheels, tyres, engine
      // — so this changes nothing about the race and everything about looking
      // in the mirror.
      const shape: CarShape =
        Math.random() < RIVALS.beastly
          ? Math.random() < 0.5
            ? "cow"
            : "chicken"
          : "racer";
      const car = new Car(colour, design, [], undefined, shape);
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
      this.stuck.push(0);
      this.reversing.push(0);
    }
  }

  /**
   * One step of driving, for each of them.
   *
   * They drive the car rather than being moved along the road. Where they are
   * is read off the car itself; what they do about it is a driver's two jobs,
   * done in the order a driver does them:
   *
   * - **Steer** at a point on the racing line about half a second up the road
   *   (pure pursuit — you look further ahead the faster you are going).
   * - **Pedal** toward the speed the road allows between here and as far as
   *   they can see, which is braking for the corner and accelerating out of
   *   it.
   *
   * This replaced a point that walked the circuit at a set pace with the car
   * chasing it. That worked while a car's heading could simply be set; with a
   * steering rack and a mass it does not, because the point runs away up the
   * road and a car eighty units behind it is aiming at something nearly
   * straight ahead however far sideways it has got. They drove into the
   * scenery on almost every corner.
   */
  update(dt: number, track: Track, patches?: Patches): void {
    for (let i = 0; i < this.cars.length; i++) {
      const car = this.cars[i];
      const where = track.nearest(car.position.x, car.position.z, car.hint);

      // Where they are, and how much lap that added. Accumulated the same way
      // the player's is, and for the same reason: the curve's own parameter
      // wraps at the line, and a car that has done ninety-nine per cent of a
      // lap must not read as one per cent.
      let step = where.t - this.at[i];
      if (step > 0.5) {
        step -= 1;
      } else if (step < -0.5) {
        step += 1;
      }
      this.at[i] = where.t;
      this.travelled[i] += step;

      const speed = car.speed;

      // Steering: the point on the line they will reach in about half a
      // second — never nearer than a couple of car lengths, and never further
      // than a fraction of how tight the corner is. That last clamp is what
      // gets them round a hairpin: pure pursuit aimed further ahead than the
      // corner's own radius cuts straight across it and arrives on the outside
      // kerb, which is exactly what they did on the desert circuit.
      const here = Math.round(where.t * TRACK.segments);
      const radius = track.paceAt(here) ** 2 / RIVALS.bite;
      const look = Math.min(
        Math.max(RIVALS.eyesLeast, speed * RIVALS.eyes),
        radius * RIVALS.corners,
      );
      const lead = wrap(where.t + look / track.length);
      track.pointAt(lead, this.aim);
      track.sideAt(lead, this.here);
      const sample = Math.round(lead * TRACK.segments);
      const room = TRACK.half - RIVALS.margin;
      let across = Math.max(
        -room,
        Math.min(room, track.lineAt(sample) + this.offset[i]),
      );

      // And if they are already wide of that — a corner taken a shade too fast
      // runs the car out to the kerb whatever it was aiming at — the aim is
      // pulled back across the road by however far they have overshot. That is
      // a driver catching it and tucking back in.
      const wide = Math.abs(where.offset) - room;
      if (wide > 0) {
        across -=
          Math.sign(where.offset) * Math.min(wide * RIVALS.catches, room);
      }
      this.aim.addScaledVector(this.here, across);

      this.want.set(this.aim.x - car.position.x, this.aim.z - car.position.z);
      const range = Math.max(1e-3, this.want.length());

      /**
       * Pure pursuit, as the geometry rather than as a gain.
       *
       * The steering angle that puts a car of wheelbase L on a circle through
       * a point at distance d and angle α is atan(2·L·sinα / d). That is the
       * whole law, and using it instead of "turn the wheel in proportion to
       * how wrong you are" is the difference between a driver and a metronome:
       * the proportional version sawed lock to lock, weaved across the whole
       * road and scrubbed a third of its speed off doing it.
       */
      const off = shortestAngle(
        car.heading,
        Math.atan2(this.want.x, this.want.y),
      );
      const wheelbase = (PHYSICS.toFront + PHYSICS.toRear) * PHYSICS.scale;
      // Pure pursuit only answers sensibly while the car is roughly pointing
      // where it is going. Sideways or facing the wrong way it says "ease it
      // round gently", which is how a spun car drove serenely off into the
      // desert at full throttle. Past this much of an angle, it is full lock
      // and no arithmetic — which is what anybody does.
      const wheel =
        Math.abs(off) > RIVALS.sharp
          ? Math.sign(off) * PHYSICS.steerMax
          : Math.atan2(2 * wheelbase * Math.sin(off), range);

      // Traffic: anybody just ahead is both a speed limit and a reason to
      // pull out. Without it a quick car meeting a slow one at a hairpin
      // simply drove into the back of it and both of them stopped.
      let ahead = Infinity;
      for (let j = 0; j < this.cars.length; j++) {
        if (j === i) {
          continue;
        }
        const them = this.cars[j];
        const dx = them.position.x - car.position.x;
        const dz = them.position.z - car.position.z;
        const nose = Math.sin(car.heading);
        const front = Math.cos(car.heading);
        const along = dx * nose + dz * front;
        const beside = dx * front - dz * nose;
        if (
          along > 0 &&
          along < RIVALS.near &&
          Math.abs(beside) < RIVALS.wide
        ) {
          ahead = Math.min(ahead, them.speed);
          // Out to whichever side they are not on, and stay on the road.
          const move = beside > 0 ? -RIVALS.dodge : RIVALS.dodge;
          across = Math.max(-room, Math.min(room, across + move));
        }
      }
      const want = Math.min(this.paceFor(track, where.t, i, speed), ahead);

      // The pedals. Under the limit, everything; over it, off the throttle,
      // and hard on the brakes if it is a corner arriving rather than a
      // rounding error.
      // Feathered rather than flat out. A car already near what the road
      // allows does not need the whole engine, and giving it the whole engine
      // on a corner exit spends the rear tyres' grip on wheelspin — the
      // friction circle then has nothing left to hold the back end in, and
      // they ran wide. So: everything when there is speed to find, easing off
      // as the limit comes up, and the brakes when it has been passed.
      const over = speed - want;
      const push =
        over < 0
          ? Math.min(1, -over / RIVALS.eases)
          : over < RIVALS.slack
            ? 0
            : -Math.min(1, over / RIVALS.hard);

      // Nose in a wall with the throttle open and nothing happening: back out
      // of it, which is what anybody does. Without this a car that got itself
      // wedged stayed wedged for the rest of the race, wheels spinning.
      if (this.reversing[i] > 0) {
        this.reversing[i] -= dt;
        // Straight back, near enough. Backing out on opposite lock swings the
        // car about like a boat and it arrives pointing somewhere new every
        // time; a nudge of steering is all it takes to unwedge, and it leaves
        // the car facing roughly where it was.
        this.drive.steer =
          -RIVALS.backSteer *
          Math.max(-1, Math.min(1, wheel / PHYSICS.steerMax));
        this.drive.throttle = -1;
        car.update(dt, this.drive, track, patches);
        car.keepIn(track, dt);
        continue;
      }
      this.stuck[i] =
        speed < RIVALS.stalled && push > 0 ? this.stuck[i] + dt : 0;
      if (this.stuck[i] > RIVALS.patience) {
        this.stuck[i] = 0;
        this.reversing[i] = RIVALS.backsUp;
      }

      this.drive.steer = Math.max(-1, Math.min(1, wheel / PHYSICS.steerMax));
      this.drive.throttle = push;
      car.update(dt, this.drive, track, patches);
      car.keepIn(track, dt);
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
  private paceFor(track: Track, at: number, i: number, speed = 0): number {
    const step = track.length / TRACK.segments;
    // How far ahead to look is how far it takes to stop: v² over twice the
    // deceleration, which is the schoolbook formula and the honest answer.
    // A fixed distance cannot work — it is either miles too far at walking
    // pace or nowhere near enough at a hundred, and at a hundred what happens
    // is a car arriving at a hairpin still doing ninety.
    const stopping = (speed * speed) / (2 * RIVALS.slows) + RIVALS.sees;
    const ahead = Math.max(1, Math.round(stopping / step));
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
