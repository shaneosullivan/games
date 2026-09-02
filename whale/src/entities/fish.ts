import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {FISH, IDLE, REEF, WHALE} from "../config";
import {Rng} from "../core/rng";
import {paint, toonRamp} from "../render/materials";

const TAU = Math.PI * 2;

interface School {
  /** The middle of the loop this school swims, and how big the loop is. */
  home: THREE.Vector3;
  radius: number;
  /** Where round the loop it is, and how fast it goes round. */
  phase: number;
  rate: number;
  /** Shy schools bolt when the whale gets close. The plan asks for fish that
   *  run away, and they are what make eating a thing you do rather than a
   *  thing that happens to you. */
  shy: boolean;
  centre: THREE.Vector3;
  /** The whale is far enough from this school's centre that a fish which fled
   *  can go back to its place. See FISH.regroup. */
  clear: boolean;
}

interface Swimmer {
  /** Seconds of bolt left, and the way it went. Per fish, not per school: a
   *  shy fish reacts to the mouth being on *it*. */
  dart: number;
  dartDir: THREE.Vector3;
  /** Seconds before it can bolt again. See FISH.dartRest. */
  rest: number;
  /** Spooked: keeping its distance, and not going back to its place in the
   *  school until the whale has left. See FISH.regroup. */
  scattered: boolean;
  /** Which way this one breaks. Fixed, so a fish does not dither. */
  across: number;
  school: number;
  /** Its place in the school, relative to the centre. */
  offset: THREE.Vector3;
  position: THREE.Vector3;
  heading: number;
  eaten: boolean;
}

/**
 * The fish.
 *
 * Schools, not individuals: a school has a centre that swims a slow loop over
 * the reef and every fish in it keeps its own place around that centre. It is
 * far cheaper than flocking and it looks like more, because a school that
 * holds its shape and then breaks reads as a decision.
 *
 * One InstancedMesh for the lot — a couple of hundred separate meshes would be
 * a couple of hundred draw calls, and this game already asks a lot of an iPad.
 */
export class Fish {
  readonly mesh: THREE.InstancedMesh;

  /** How many have been eaten, and how many there were. */
  eaten = 0;
  readonly total: number;

  private readonly schools: Array<School> = [];
  private readonly fish: Array<Swimmer> = [];

  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly scale = new THREE.Vector3();
  private readonly want = new THREE.Vector3();
  private readonly away = new THREE.Vector3();
  private readonly side = new THREE.Vector3();
  /** The stopped whale the fish have come to look at, and which way it is
   *  facing. See nibble(). */
  private readonly curious = new THREE.Vector3();
  private curiousHeading = 0;
  private nibbling = false;
  /** Which fish came over. Indices into `fish`, at most IDLE.nibblers. */
  private nibblers: Array<number> = [];
  private readonly station = new THREE.Vector3();
  private readonly local = new THREE.Vector3();
  private readonly outward = new THREE.Vector3();
  /** The whale as an ellipsoid, for putting fish on it and keeping them out
   *  of it. See IDLE.bodyX. */
  private readonly extents = new THREE.Vector3(
    IDLE.bodyX,
    IDLE.bodyY,
    IDLE.bodyZ,
  );
  /** Where the nibblers are in their pecking, so they are not both at the
   *  same point of it. */
  private peck = 0;

  /** Kept so a fish that has been chased off cannot drift into the sand or
   *  out through the surface. See swimClear(). */
  private readonly floorAt: (x: number, z: number) => number;

  constructor(
    rng: Rng,
    floorAt: (x: number, z: number) => number,
    finishZ: number,
  ) {
    this.floorAt = floorAt;
    this.total = FISH.schools * FISH.perSchool;

    for (let s = 0; s < FISH.schools; s++) {
      // Spread evenly down the reef rather than at random, so there is never a
      // long empty stretch and never a heap of six schools in one place.
      const along = (s + 0.5) / FISH.schools;
      const z = 60 + (finishZ - 120) * along;
      // Biased toward the middle of the lane. Out at the ridges a school is
      // something you would have to go looking for, and a child swimming the
      // reef the obvious way would pass the whole game without a mouthful.
      const x = rng.range(-REEF.halfWidth * 0.5, REEF.halfWidth * 0.5);
      // Somewhere between just under the surface and just off the floor —
      // which over a sandbank is not very far down at all.
      const floor = floorAt(x, z);
      const y = rng.range(-14, Math.min(-24, floor + 16));
      this.schools.push({
        home: new THREE.Vector3(x, y, z),
        radius: rng.range(FISH.loopRadius * 0.5, FISH.loopRadius),
        phase: rng.range(0, TAU),
        rate: (FISH.driftSpeed / FISH.loopRadius) * rng.range(0.7, 1.3),
        shy: rng.next() < FISH.shyShare,
        centre: new THREE.Vector3(x, y, z),
        clear: true,
      });

      for (let i = 0; i < FISH.perSchool; i++) {
        const offset = new THREE.Vector3(
          rng.range(-FISH.spread, FISH.spread),
          rng.range(-FISH.spread * 0.45, FISH.spread * 0.45),
          rng.range(-FISH.spread, FISH.spread),
        );
        this.fish.push({
          school: s,
          offset,
          position: offset.clone().add(this.schools[s].centre),
          heading: rng.range(0, TAU),
          eaten: false,
          dart: 0,
          dartDir: new THREE.Vector3(),
          rest: 0,
          scattered: false,
          across: rng.next() < 0.5 ? -1 : 1,
        });
      }
    }

    this.mesh = new THREE.InstancedMesh(
      fishBody(),
      new THREE.MeshToonMaterial({
        vertexColors: true,
        gradientMap: toonRamp(),
      }),
      this.total,
    );
    const colour = new THREE.Color();
    for (let i = 0; i < this.total; i++) {
      // One colour a school, so a school reads as one thing.
      colour
        .set(FISH.palette[this.fish[i].school % FISH.palette.length])
        .convertSRGBToLinear();
      this.mesh.setColorAt(i, colour);
    }
    this.mesh.frustumCulled = false;
  }

  /**
   * A whale has stopped, and one or two fish may come and have a look at it.
   *
   * `at` is the whale's middle and `heading` the way it is pointing; pass null
   * when it moves off and they go back to their own business.
   *
   * The pair is chosen once, when the whale first stops, and then they are the
   * pair — they leave their school and hold station off its flank until it
   * swims away. Shy fish never volunteer: one would be trying to flee the same
   * whale it had come to look at, and the two urges would fight.
   */
  nibble(at: THREE.Vector3 | null, heading: number): void {
    if (at === null) {
      this.nibbling = false;
      this.nibblers = [];
      return;
    }
    this.curious.copy(at);
    this.curiousHeading = heading;
    if (this.nibbling) {
      return;
    }
    this.nibbling = true;

    // The nearest few un-shy fish, once. Sorted rather than scanned for a
    // minimum, because we want the closest *two* and not the closest one.
    const near: Array<{i: number; d: number}> = [];
    for (let i = 0; i < this.fish.length; i++) {
      const f = this.fish[i];
      if (f.eaten || this.schools[f.school].shy) {
        continue;
      }
      const d = f.position.distanceTo(at);
      if (d < IDLE.nibbleRange) {
        near.push({i, d});
      }
    }
    near.sort((a, b) => a.d - b.d);
    this.nibblers = near.slice(0, IDLE.nibblers).map(n => n.i);
  }

  /**
   * Where a nibbler sits: on the whale's skin.
   *
   * The spot is a direction in the whale's own frame; scaling that direction
   * by the body's half-extents lands it on the ellipsoid, which is the surface
   * the fish should be resting against. Then it is pushed a fish's width back
   * out, and bobbed in and out a little so it looks like nibbling rather than
   * like something stuck on.
   */
  private stationFor(slot: number, out: THREE.Vector3): THREE.Vector3 {
    const spot = IDLE.nibbleSpots[slot % IDLE.nibbleSpots.length];
    this.outward.set(spot.x, spot.y, spot.z).normalize();
    this.local.copy(this.outward).multiply(this.extents);
    // Off the skin by a fish's width, bobbing in and out — out along the same
    // direction, so it comes off the surface rather than sliding along it.
    const bob =
      IDLE.nibbleClear + Math.sin(this.peck + slot * 2.1) * IDLE.nibblePeck;
    this.local.addScaledVector(this.outward, bob);

    // And out of the whale's frame into the world.
    const fx = Math.sin(this.curiousHeading);
    const fz = Math.cos(this.curiousHeading);
    return out.set(
      this.curious.x + this.local.x * -fz + this.local.z * fx,
      this.curious.y + this.local.y,
      this.curious.z + this.local.x * fx + this.local.z * fz,
    );
  }

  /**
   * Shoves a fish out of the whale.
   *
   * The whale as an ellipsoid in its own coordinates: scale a point by the
   * reciprocal of the half-extents and anything inside the unit sphere is
   * inside the whale. Push it back out along the same direction and it comes
   * to rest on the surface rather than jumping to a corner.
   *
   * Applied to every fish and not only the two visitors, because a school
   * looping past a stopped whale went straight through it just as happily.
   */
  private keepOut(at: THREE.Vector3): void {
    const dx = at.x - this.curious.x;
    const dy = at.y - this.curious.y;
    const dz = at.z - this.curious.z;
    const fx = Math.sin(this.curiousHeading);
    const fz = Math.cos(this.curiousHeading);
    // Into the whale's frame: forward is +Z, its right is -Z x up.
    const alongZ = dx * fx + dz * fz;
    const alongX = dx * -fz + dz * fx;

    this.local.set(alongX / IDLE.bodyX, dy / IDLE.bodyY, alongZ / IDLE.bodyZ);
    const inside = this.local.length();
    if (inside >= 1 || inside < 1e-4) {
      return;
    }
    this.local.multiplyScalar(1 / inside);
    const outX = this.local.x * IDLE.bodyX;
    const outY = this.local.y * IDLE.bodyY;
    const outZ = this.local.z * IDLE.bodyZ;
    // And back out of the whale's frame.
    at.set(
      this.curious.x + outX * -fz + outZ * fx,
      this.curious.y + outY,
      this.curious.z + outX * fx + outZ * fz,
    );
  }

  /**
   * Keeps a fleeing fish in the water.
   *
   * Fleeing is the only thing that moves a fish off its school's line, and a
   * bolt aimed downward used to take it into the sand, where the chase ended
   * in a fish you could see through the floor.
   */
  private swimClear(at: THREE.Vector3): void {
    const floor = this.floorAt(at.x, at.z) + FISH.size;
    at.y = Math.min(-FISH.size, Math.max(floor, at.y));
  }

  /**
   * Swim the schools, and eat whatever ends up in the whale's mouth.
   *
   * Returns how many went down this step, so the game can make a noise about
   * it without the fish having to know the game exists.
   */
  update(dt: number, mouth: THREE.Vector3): number {
    for (const school of this.schools) {
      school.phase += school.rate * dt;
      school.centre.set(
        school.home.x + Math.cos(school.phase) * school.radius,
        school.home.y + Math.sin(school.phase * 0.7) * 5,
        school.home.z + Math.sin(school.phase) * school.radius,
      );
      // Measured to the school's centre, not to each fish: a fish rejoins when
      // the place it would swim back to is safe. Measured to the fish itself,
      // one that had fled sixty units decided the coast was clear and swam
      // straight back through a mouth that had never moved.
      school.clear = school.centre.distanceTo(mouth) > FISH.regroup;
    }

    this.peck += IDLE.nibblePeckRate * dt;

    const bite = WHALE.mouthRadius + FISH.size * 0.5;
    const biteSq = bite * bite;
    let taken = 0;

    for (let index = 0; index < this.fish.length; index++) {
      const f = this.fish[index];
      if (f.eaten) {
        continue;
      }

      // The one or two that came over hold station off the whale instead of
      // swimming with their school.
      const slot = this.nibbling ? this.nibblers.indexOf(index) : -1;
      if (slot >= 0) {
        this.stationFor(slot, this.station);
        this.want.copy(this.station).sub(f.position);
        f.position.addScaledVector(
          this.want,
          Math.min(1, IDLE.nibbleSpeed * dt),
        );
        if (this.want.lengthSq() > 0.02) {
          f.heading = Math.atan2(this.want.x, this.want.z);
        }
        this.keepOut(f.position);
        continue;
      }

      const school = this.schools[f.school];

      // Bolting. A shy fish waits until the mouth is nearly on it, and then
      // breaks — mostly away, partly across, which is what leaves the whale
      // something to cut off. See FISH.dartAcross.
      f.rest = Math.max(0, f.rest - dt);
      const toMouth = f.position.distanceTo(mouth);
      if (f.dart > 0) {
        f.dart -= dt;
        if (f.dart <= 0) {
          f.rest = FISH.dartRest;
        }
      } else if (school.shy && f.rest === 0 && toMouth < FISH.startle) {
        f.scattered = true;
        this.away.copy(f.position).sub(mouth);
        const d = this.away.length();
        if (d > 0.001) {
          this.away.multiplyScalar(1 / d);
          // Across the escape, in the horizontal plane: a fish breaks to one
          // side, it does not reverse straight down its own line of flight.
          this.side.set(-this.away.z, 0, this.away.x).multiplyScalar(f.across);
          f.dartDir
            .copy(this.away)
            .addScaledVector(this.side, FISH.dartAcross)
            .normalize();
          f.dart = FISH.dartTime;
        }
      }

      // Scattered fish only come back together once the whale has gone. Until
      // then a school never re-forms in front of a mouth that is still there.
      if (f.scattered && f.dart <= 0 && school.clear) {
        f.scattered = false;
      }

      if (f.dart > 0) {
        f.position.addScaledVector(f.dartDir, FISH.dartSpeed * dt);
        f.heading = Math.atan2(f.dartDir.x, f.dartDir.z);
        this.swimClear(f.position);
      } else if (f.scattered) {
        // Only until it is clear of the whale. Left cruising it would put a
        // spooked school over the horizon by the time you gave up on it — and
        // then have to sprint the whole way back.
        if (toMouth < FISH.regroup) {
          f.position.addScaledVector(f.dartDir, FISH.scatterSpeed * dt);
          f.heading = Math.atan2(f.dartDir.x, f.dartDir.z);
          this.swimClear(f.position);
        }
      } else {
        this.want.copy(school.centre).add(f.offset).sub(f.position);
        const home = this.want.length();
        f.position.addScaledVector(
          this.want,
          Math.min(
            1,
            FISH.gather * dt,
            (FISH.homeSpeed * dt) / Math.max(home, 1e-4),
          ),
        );
        if (this.want.lengthSq() > 0.02) {
          f.heading = Math.atan2(this.want.x, this.want.z);
        }
      }

      if (this.nibbling) {
        this.keepOut(f.position);
      }

      if (f.position.distanceToSquared(mouth) < biteSq) {
        f.eaten = true;
        this.eaten++;
        taken++;
      }
    }

    this.draw();
    return taken;
  }

  private draw(): void {
    for (let i = 0; i < this.fish.length; i++) {
      const f = this.fish[i];
      if (f.eaten) {
        // An instanced mesh cannot skip an instance; a scale of zero is how
        // you take one off the screen.
        this.scale.setScalar(0);
        this.m.compose(f.position, this.q.identity(), this.scale);
      } else {
        this.e.set(0, f.heading, 0);
        this.q.setFromEuler(this.e);
        this.scale.setScalar(1);
        this.m.compose(f.position, this.q, this.scale);
      }
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/**
 * One fish: a body, a tail and an eye, pointing +Z.
 *
 * Painted in greys so the instance colour decides the hue — the same trick the
 * coral uses. The eye is painted dark and stays dark, because an instance
 * colour multiplying near-black is still near-black.
 */
function fishBody(): THREE.BufferGeometry {
  const s = FISH.size;
  const parts: Array<THREE.BufferGeometry> = [];

  const body = new THREE.SphereGeometry(s * 0.32, 10, 8);
  body.scale(0.7, 1, 1.7);
  parts.push(paint(body, 0xffffff));

  const tail = new THREE.ConeGeometry(s * 0.3, s * 0.42, 5);
  tail.rotateX(Math.PI / 2);
  tail.scale(0.35, 1, 1);
  tail.translate(0, 0, -s * 0.62);
  parts.push(paint(tail, 0xcfcfcf));

  const dorsal = new THREE.ConeGeometry(s * 0.16, s * 0.3, 4);
  dorsal.scale(0.3, 1, 1);
  dorsal.translate(0, s * 0.3, 0);
  parts.push(paint(dorsal, 0xdedede));

  for (const side of [-1, 1]) {
    const eye = new THREE.SphereGeometry(s * 0.07, 6, 5);
    eye.translate(side * s * 0.17, s * 0.08, s * 0.4);
    parts.push(paint(eye, 0x1d2a33));
  }

  return mergeGeometries(parts, false);
}
