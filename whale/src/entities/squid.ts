import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {ABYSS, SQUID, WHALE} from "../config";
import {Rng} from "../core/rng";
import {paint, toonRamp} from "../render/materials";

const TAU = Math.PI * 2;

interface Drifter {
  /** Eaten squid are scaled to nothing and left where they were — an
   *  instanced mesh cannot skip an instance. */
  gone: boolean;
  home: THREE.Vector3;
  /** Where it is round its own slow loop, and how big the loop is. */
  phase: number;
  rate: number;
  radius: number;
  rise: number;
  /** How fast its arms are working. */
  pulse: number;
}

/**
 * The squid, who live at the bottom of the abyss.
 *
 * They are down where there is no light at all, which means they are only ever
 * seen as a sonar return — a grey shape that appears for a moment as the pulse
 * washes over it and is gone again. That is the whole reason they exist: a
 * dark place with nothing in it is just a dark place, and the moment a child
 * sees something move down there the dark becomes worth going into.
 *
 * They keep to themselves and nothing down here chases the whale, but they can
 * be caught — which is the reason to go down at all. A squid taken in the dark
 * by echolocation alone is worth more than a shoal of fish taken in daylight,
 * and it should feel like it.
 */
export class Squid {
  readonly mesh: THREE.InstancedMesh;

  private readonly drift: Array<Drifter> = [];
  /** How many have been caught, and how many there were. */
  eaten = 0;
  readonly total = SQUID.count;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly at = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();

  constructor(
    rng: Rng,
    centre: THREE.Vector3,
    floorAt: (x: number, z: number) => number,
  ) {
    this.mesh = new THREE.InstancedMesh(
      squidBody(),
      new THREE.MeshToonMaterial({
        vertexColors: true,
        gradientMap: toonRamp(),
      }),
      SQUID.count,
    );
    this.mesh.frustumCulled = false;

    const colour = new THREE.Color();
    for (let i = 0; i < SQUID.count; i++) {
      // Scattered across the floor of the hole and up its walls a little, but
      // never near the rim: they belong to the dark, and one hanging in the
      // daylight over the lip would give the game away.
      const a = rng.range(0, TAU);
      const out = ABYSS.radius * ABYSS.lip * Math.sqrt(rng.next()) * 0.8;
      const x = centre.x + Math.cos(a) * out;
      const z = centre.z + Math.sin(a) * out;
      const floor = floorAt(x, z);
      this.drift.push({
        gone: false,
        home: new THREE.Vector3(x, floor + rng.range(SQUID.low, SQUID.high), z),
        phase: rng.range(0, TAU),
        rate: rng.range(0.05, 0.16) * (rng.next() < 0.5 ? -1 : 1),
        radius: rng.range(14, 46),
        rise: rng.range(4, 18),
        pulse: rng.range(0.5, 1.1),
      });
      colour.set(rng.pick(SQUID.palette)).convertSRGBToLinear();
      this.mesh.setColorAt(i, colour);
    }
  }

  /**
   * They loop slowly, and their arms open and shut as they go.
   *
   * The swimming is in the *scale*: a squid jets by closing its arms and
   * pushing, so the model is squeezed along its length on the push and let out
   * again after. It costs nothing and it is unmistakably a squid.
   */
  update(time: number, mouth: THREE.Vector3): number {
    const bite = WHALE.mouthRadius + SQUID.bite;
    const biteSq = bite * bite;
    let taken = 0;

    for (let i = 0; i < this.drift.length; i++) {
      const d = this.drift[i];
      if (d.gone) {
        this.scale.setScalar(0);
        this.m.compose(d.home, this.q.identity(), this.scale);
        this.mesh.setMatrixAt(i, this.m);
        continue;
      }
      const a = d.phase + time * d.rate;
      this.at.set(
        d.home.x + Math.cos(a) * d.radius,
        d.home.y + Math.sin(a * 1.7) * d.rise,
        d.home.z + Math.sin(a) * d.radius,
      );
      // Facing along its own loop, and tilted nose-up a little the way they
      // hang in the water.
      this.e.set(-0.4, Math.atan2(-Math.sin(a), Math.cos(a)) + Math.PI, 0);
      this.q.setFromEuler(this.e);

      const squeeze = Math.sin(time * d.pulse * TAU + d.phase);
      this.scale.set(
        SQUID.size * (1 - squeeze * 0.12),
        SQUID.size * (1 - squeeze * 0.12),
        SQUID.size * (1 + squeeze * 0.2),
      );
      this.m.compose(this.at, this.q, this.scale);
      this.mesh.setMatrixAt(i, this.m);

      if (this.at.distanceToSquared(mouth) < biteSq) {
        d.gone = true;
        this.eaten++;
        taken++;
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    return taken;
  }
}

/** One squid, pointing +Z, mantle astern and arms forward. */
function squidBody(): THREE.BufferGeometry {
  const rng = new Rng(44001);
  const parts: Array<THREE.BufferGeometry> = [];

  // The mantle: a long cone, blunt at the head end and drawn to a point.
  const mantle = new THREE.ConeGeometry(2.2, 9, 10);
  mantle.rotateX(-Math.PI / 2);
  mantle.translate(0, 0, -4.5);
  parts.push(paint(mantle, 0xffffff));

  // The two fins at the tail, which is the other half of the silhouette.
  for (const side of [-1, 1]) {
    const fin = new THREE.SphereGeometry(2.4, 8, 6);
    fin.scale(0.9, 0.16, 1.1);
    fin.rotateZ(side * 0.5);
    fin.translate(side * 1.5, 0, -7.4);
    parts.push(paint(fin, 0xd2d2d2));
  }

  // The head, and two big eyes. A squid's eyes are enormous and they are the
  // thing that makes it read as a squid and not a dart.
  const head = new THREE.SphereGeometry(2, 10, 8);
  head.scale(1, 0.9, 0.9);
  parts.push(paint(head, 0xffffff));
  for (const side of [-1, 1]) {
    const eye = new THREE.SphereGeometry(0.8, 8, 6);
    eye.translate(side * 1.7, 0.2, 0.4);
    parts.push(paint(eye, 0x1a1f26));
  }

  // Eight arms and two long tentacles, fanning out from the head.
  //
  // Each is a chain of segments laid end to end: every one starts exactly
  // where the last finished and points along its own direction, which bends a
  // little further outward each time. The first version pointed every segment
  // along +Z and only moved their *centres* outward, so an arm came out as a
  // row of parallel tubes drifting apart — a dotted line rather than a limb.
  const UP = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < 10; i++) {
    const long = i >= 8;
    const a = (i / 8) * TAU + rng.range(-0.2, 0.2);
    const spread = long ? 0.3 : 0.75 + rng.range(-0.15, 0.15);
    const segments = long ? 5 : 3;

    // Out from the edge of the head, pointing mostly forward.
    const tip = new THREE.Vector3(Math.cos(a) * 1.3, Math.sin(a) * 1.3, 1.5);
    const dir = new THREE.Vector3(
      Math.cos(a) * spread * 0.35,
      Math.sin(a) * spread * 0.35,
      1,
    ).normalize();

    for (let seg = 0; seg < segments; seg++) {
      const len = long ? 3.6 : 2.6;
      const wide = (long ? 0.26 : 0.34) * (1 - seg / (segments + 1));

      const arm = new THREE.CylinderGeometry(wide * 0.75, wide, len, 5);
      // Built along +Y with its base at the origin, then turned to face the
      // way this segment goes and moved to where the last one ended.
      arm.translate(0, len / 2, 0);
      arm.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir));
      arm.translate(tip.x, tip.y, tip.z);
      parts.push(paint(arm, long ? 0xbdbdbd : 0xe0e0e0));

      // A bead at the joint. It hides the angle between two segments, and on
      // a squid it reads as the swelling of the suckers.
      const joint = new THREE.SphereGeometry(wide * 1.25, 5, 4);
      joint.translate(tip.x, tip.y, tip.z);
      parts.push(paint(joint, long ? 0xb0b0b0 : 0xd4d4d4));

      tip.addScaledVector(dir, len);
      // Bending further out as it goes, and curling forward less.
      dir.x += Math.cos(a) * spread * 0.42;
      dir.y += Math.sin(a) * spread * 0.42;
      dir.normalize();
    }

    // And a tip on the end, so an arm finishes rather than stopping.
    const end = new THREE.SphereGeometry(long ? 0.34 : 0.22, 5, 4);
    end.translate(tip.x, tip.y, tip.z);
    parts.push(paint(end, long ? 0xcfcfcf : 0xe6e6e6));
  }

  return mergeGeometries(parts, false);
}
