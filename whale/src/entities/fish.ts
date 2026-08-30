import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {FISH, REEF, WHALE} from "../config";
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
  /** Shy schools scatter when the whale gets close. The plan asks for fish
   *  that run away, and they are what make eating a thing you do rather than
   *  a thing that happens to you. */
  shy: boolean;
  /** Seconds of fright left. */
  alarm: number;
  centre: THREE.Vector3;
}

interface Swimmer {
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

  constructor(
    rng: Rng,
    floorAt: (x: number, z: number) => number,
    finishZ: number,
  ) {
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
        alarm: 0,
        centre: new THREE.Vector3(x, y, z),
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
      if (school.shy) {
        school.alarm = Math.max(0, school.alarm - dt);
        if (school.centre.distanceTo(mouth) < FISH.fleeRange) {
          school.alarm = FISH.calmTime;
        }
      }
    }

    const bite = WHALE.mouthRadius + FISH.size * 0.5;
    const biteSq = bite * bite;
    let taken = 0;

    for (const f of this.fish) {
      if (f.eaten) {
        continue;
      }
      const school = this.schools[f.school];

      this.want.copy(school.centre).add(f.offset).sub(f.position);
      if (school.alarm > 0) {
        // Frightened: away from the mouth, hard, and only loosely still in the
        // school. A scattered school that kept perfect formation would look
        // like the whole shoal had been dragged sideways.
        this.away.copy(f.position).sub(mouth);
        const d = this.away.length();
        if (d > 0.001) {
          this.away.multiplyScalar(1 / d);
          this.want.addScaledVector(this.away, FISH.fleeSpeed);
        }
      }

      const move = Math.min(1, FISH.gather * dt);
      f.position.addScaledVector(this.want, move);

      if (this.want.lengthSq() > 0.02) {
        f.heading = Math.atan2(this.want.x, this.want.z);
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
