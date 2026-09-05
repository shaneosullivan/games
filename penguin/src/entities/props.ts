import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {FADE, HILL, PROPS} from "../config";
import {Rng} from "../core/rng";
import {Hill} from "./hill";
import {PALETTE, paint, vertexToon} from "../render/materials";
import {fadeInFront, type NearFade} from "../../../shared/fadeInFront";

const TAU = Math.PI * 2;

/** What a thing on the hill does when you reach it. */
export type Kind = "solid" | "snowman";

export interface Obstacle {
  x: number;
  z: number;
  /** How far out it actually reaches, which is less than it looks. */
  radius: number;
  kind: Kind;
  /** Where to find it in its InstancedMesh, so a snowman can be taken off the
   *  hill once it has been knocked to bits. */
  mesh: THREE.InstancedMesh;
  index: number;
  /** Roughly how big this one is, so the pieces it bursts into match it. */
  scale: number;
  gone: boolean;
}

/**
 * Everything standing on the hill: the trees, the rocks, the snowmen, the
 * shrubs under the snow and the flags that show the way.
 *
 * One InstancedMesh a kind, so the whole four hundred metres of mountain is
 * five draw calls rather than nine hundred. Every one of them has its frustum
 * culling turned off, because an InstancedMesh is culled against the bounds of
 * its *geometry* — one tree, sitting at the origin — and not against where its
 * instances actually are. Leave it on and the entire forest disappears the
 * moment the top of the hill goes off the back of the screen.
 */
export class Props {
  readonly group = new THREE.Group();

  /** Everything you can hit, bucketed by how far down the hill it is, so a
   *  collision check looks at the dozen things nearby instead of all five
   *  hundred. */
  private readonly buckets = new Map<number, Array<Obstacle>>();
  private static readonly BUCKET = 40;

  /**
   * One material for everything on the hill, so a single dissolve covers the
   * lot. See setFadeFocus — this is what stops a tree from hiding the bird.
   */
  private readonly fade: NearFade<THREE.MeshToonMaterial> = fadeInFront(
    vertexToon(),
    {band: FADE.band, cutoff: FADE.cutoff, cacheKey: "penguinPropFade"},
  );
  private readonly fadeAt = new THREE.Vector3();

  constructor(rng: Rng, hill: Hill) {
    this.plant(rng, hill, PROPS.trees, treeGeometry(), 3.1, "solid");
    this.plant(rng, hill, PROPS.rocks, rockGeometry(), 2.2, "solid");
    this.plant(rng, hill, PROPS.snowmen, snowmanGeometry(), 2.6, "snowman");
    this.plant(rng, hill, PROPS.bushes, bushGeometry(), 0, null);
    this.markCourse(hill);
  }

  /**
   * Scatters one kind down the hill.
   *
   * `reach` is how far it reaches — `kind` null for scenery, which is not in
   * the collision list at all. Places are drawn at random and thrown away
   * rather than solved for: the rules a spot has to pass are "not on the lane,
   * not on the wall, not on the flat at either end", and rejecting is both
   * shorter to write and easier to change than any scheme that generates only
   * legal spots.
   */
  private plant(
    rng: Rng,
    hill: Hill,
    count: number,
    geo: THREE.BufferGeometry,
    reach: number,
    kind: Kind | null,
  ): void {
    const mesh = new THREE.InstancedMesh(geo, this.fade.material, count);
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3();

    let placed = 0;
    let tries = 0;
    while (placed < count && tries < count * 60) {
      tries++;
      const z = rng.range(-PROPS.clearStart, -(HILL.length - PROPS.clearEnd));
      const centre = hill.centreAt(z);
      const x = centre + rng.range(-1, 1) * (HILL.corridor + 40);

      // Off the clear line, or the run is a corridor you cannot lose.
      const lane = hill.laneAt(z);
      const clear = kind ? PROPS.lane : PROPS.lane * 0.6;
      if (Math.abs(x - lane) < clear) {
        continue;
      }
      // And not up the wall: a tree growing out of the side of a half-pipe
      // looks like a mistake, and one you can hit up there is worse.
      if (hill.steepness(x, z) > PROPS.maxSlope) {
        continue;
      }
      // And not out on a frozen lake. Nothing grows on ice, and a rock in the
      // middle of the one place you cannot steer would be simply unfair.
      if (hill.iceAt(x, z) > 0.02) {
        continue;
      }

      pos.set(x, hill.heightAt(x, z) - 0.4, z);
      e.set(0, rng.range(0, TAU), 0);
      q.setFromEuler(e);
      const s = rng.range(0.8, 1.3);
      scale.set(s, rng.range(0.85, 1.2) * s, s);
      m.compose(pos, q, scale);
      mesh.setMatrixAt(placed, m);

      if (kind) {
        this.remember({
          x,
          z,
          radius: reach * s * PROPS.forgive,
          kind,
          mesh,
          index: placed,
          scale: s,
          gone: false,
        });
      }
      placed++;
    }
    // Anything that never found a spot is scaled to nothing — an instanced
    // mesh cannot skip an instance, and a stack of unplaced trees at the
    // origin is the alternative.
    scale.setScalar(0);
    for (let i = placed; i < count; i++) {
      m.compose(pos.set(0, 0, 0), q.identity(), scale);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    this.group.add(mesh);
  }

  /**
   * The flags down either side of the clear line.
   *
   * Not obstacles and not decoration either: they are the only thing that
   * tells a child at fifty units a second which way the course goes before
   * the trees do it for them. Red on the left and blue on the right, the way
   * a real course is marked.
   */
  private markCourse(hill: Hill): void {
    const spacing = 46;
    const first = -PROPS.clearStart;
    const last = -(HILL.length - PROPS.clearEnd);
    const count = Math.floor((first - last) / spacing) * 2;

    const mesh = new THREE.InstancedMesh(
      flagGeometry(),
      this.fade.material,
      count,
    );
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const pos = new THREE.Vector3();
    const one = new THREE.Vector3(1, 1, 1);
    const colour = new THREE.Color();

    let i = 0;
    for (let z = first; z > last && i < count; z -= spacing) {
      const lane = hill.laneAt(z);
      for (const side of [-1, 1]) {
        const x = lane + side * (PROPS.lane + 4);
        pos.set(x, hill.heightAt(x, z) - 0.3, z);
        // Turned to face across the run, so the flag is a flag and not an
        // edge-on sliver at the moment you most need to see it.
        e.set(0, Math.atan2(-side, 0), 0);
        q.setFromEuler(e);
        m.compose(pos, q, one);
        mesh.setMatrixAt(i, m);
        colour
          .set(side < 0 ? PALETTE.flagRed : PALETTE.flagBlue)
          .convertSRGBToLinear();
        mesh.setColorAt(i, colour);
        i++;
      }
    }
    mesh.count = i;
    mesh.instanceMatrix.needsUpdate = true;
    this.group.add(mesh);
  }

  /**
   * Dissolves whatever is between the eye and the penguin.
   *
   * The focus is pulled a little toward the camera so the bird is never caught
   * by its own fade — a distance rather than a fraction, because at twenty
   * units away and again at forty it has to clear the same margin.
   */
  setFadeFocus(eye: THREE.Vector3, watching: THREE.Vector3): void {
    const gap = eye.distanceTo(watching);
    this.fadeAt
      .copy(watching)
      .lerp(eye, gap > 0.01 ? Math.min(0.9, FADE.margin / gap) : 0);
    this.fade.setFocus(eye, this.fadeAt, FADE.radius);
  }

  private remember(o: Obstacle): void {
    const key = Math.floor(o.z / Props.BUCKET);
    const list = this.buckets.get(key);
    if (list) {
      list.push(o);
    } else {
      this.buckets.set(key, [o]);
    }
  }

  /**
   * What is in the way, or null.
   *
   * Circle against circle in plan view, ignoring height: at the speeds in this
   * game the penguin is only ever off the ground over a jump, and a tree it
   * flew over would have been a tree it hit a tenth of a second later anyway.
   * Three buckets are checked rather than one, because a fast step crosses a
   * bucket boundary and a thing sitting exactly on one would otherwise be a
   * ghost.
   */
  hit(x: number, z: number, radius: number): Obstacle | null {
    const key = Math.floor(z / Props.BUCKET);
    for (let k = key - 1; k <= key + 1; k++) {
      const list = this.buckets.get(k);
      if (!list) {
        continue;
      }
      for (const o of list) {
        if (o.gone) {
          continue;
        }
        const reach = o.radius + radius;
        const dx = o.x - x;
        const dz = o.z - z;
        if (dx * dx + dz * dz < reach * reach) {
          return o;
        }
      }
    }
    return null;
  }

  /**
   * Takes a snowman off the hill, for good.
   *
   * An instanced mesh cannot skip an instance, so a scale of zero is how you
   * remove one — and `gone` keeps it out of the collision list, or you would
   * go on knocking over a snowman that is no longer there.
   */
  remove(o: Obstacle): void {
    o.gone = true;
    const m = new THREE.Matrix4();
    m.makeScale(0, 0, 0);
    o.mesh.setMatrixAt(o.index, m);
    o.mesh.instanceMatrix.needsUpdate = true;
  }
}

/**
 * A snowy pine: a trunk, three skirts of branches, and a cap of snow on each.
 *
 * The snow is its own cone sitting a little above the branch below it rather
 * than a lighter shade painted on top: coplanar faces z-fight, and a tree that
 * flickers as you go past it is the kind of bug that is very hard to see and
 * impossible to unsee.
 */
function treeGeometry(): THREE.BufferGeometry {
  const parts: Array<THREE.BufferGeometry> = [];

  const trunk = new THREE.CylinderGeometry(0.42, 0.6, 4.2, 7);
  trunk.translate(0, 2.1, 0);
  parts.push(paint(trunk, PALETTE.bark));

  const tiers = [
    {y: 3.1, r: 3.2, h: 4.2},
    {y: 5.6, r: 2.5, h: 3.6},
    {y: 7.7, r: 1.7, h: 3},
  ];
  for (const tier of tiers) {
    const branch = new THREE.ConeGeometry(tier.r, tier.h, 8);
    branch.translate(0, tier.y + tier.h / 2, 0);
    parts.push(paint(branch, PALETTE.pine));

    const cap = new THREE.ConeGeometry(tier.r * 0.74, tier.h * 0.5, 8);
    cap.translate(0, tier.y + tier.h * 0.76, 0);
    parts.push(paint(cap, PALETTE.snow));
  }

  return mergeGeometries(parts, false);
}

/** A boulder with a hat of snow on it. */
function rockGeometry(): THREE.BufferGeometry {
  const parts: Array<THREE.BufferGeometry> = [];

  // Two lumps rather than one. A single icosahedron reads as a pillow lying on
  // the snow; a big one with a smaller one leaning on it reads as rock, and
  // the join is the only place in it with a shape you can name.
  const stone = new THREE.IcosahedronGeometry(2.1, 0);
  stone.scale(1.05, 1.15, 0.95);
  stone.rotateY(0.6);
  stone.translate(0, 1.25, 0);
  parts.push(paint(stone, PALETTE.rock));

  const lump = new THREE.IcosahedronGeometry(1.2, 0);
  lump.scale(1.1, 0.9, 1);
  lump.rotateY(1.9);
  lump.translate(1.4, 0.65, -0.5);
  parts.push(paint(lump, PALETTE.rockDark));

  const cap = new THREE.SphereGeometry(1.68, 10, 6, 0, TAU, 0, Math.PI / 2);
  cap.scale(1.05, 0.5, 0.95);
  cap.translate(-0.1, 2.05, 0.1);
  parts.push(paint(cap, PALETTE.snow));

  return mergeGeometries(parts, false);
}

/** A snowman: two balls, a carrot, two coal eyes and a red scarf. Wholly
 *  decorative as an obstacle goes — it is here because a snowy hill without
 *  one would be a strange hill. */
function snowmanGeometry(): THREE.BufferGeometry {
  const parts: Array<THREE.BufferGeometry> = [];

  const base = new THREE.SphereGeometry(1.9, 12, 10);
  base.translate(0, 1.7, 0);
  parts.push(paint(base, PALETTE.snow));

  const head = new THREE.SphereGeometry(1.25, 12, 10);
  head.translate(0, 4.1, 0);
  parts.push(paint(head, PALETTE.snow));

  const scarf = new THREE.CylinderGeometry(1.32, 1.32, 0.5, 12);
  scarf.translate(0, 3.05, 0);
  parts.push(paint(scarf, PALETTE.scarf));

  const nose = new THREE.ConeGeometry(0.22, 1, 6);
  nose.rotateX(Math.PI / 2);
  nose.translate(0, 4.15, 1.2);
  parts.push(paint(nose, PALETTE.beak));

  for (const side of [-1, 1]) {
    const eye = new THREE.SphereGeometry(0.17, 8, 6);
    eye.translate(side * 0.42, 4.5, 1.05);
    parts.push(paint(eye, 0x1b2129));
  }

  return mergeGeometries(parts, false);
}

/** A shrub buried in snow: a mound with a couple of twigs out of the top. */
function bushGeometry(): THREE.BufferGeometry {
  const parts: Array<THREE.BufferGeometry> = [];

  const mound = new THREE.SphereGeometry(1.6, 10, 7, 0, TAU, 0, Math.PI / 2);
  mound.scale(1.3, 0.72, 1.1);
  mound.translate(0, 0.4, 0);
  parts.push(paint(mound, PALETTE.snow));

  for (const side of [-1, 1]) {
    const twig = new THREE.CylinderGeometry(0.09, 0.12, 1.5, 5);
    twig.rotateZ(side * 0.4);
    twig.translate(side * 0.5, 1.4, 0.2);
    parts.push(paint(twig, PALETTE.bark));
  }

  return mergeGeometries(parts, false);
}

/**
 * A course flag: a pole with a triangle on it.
 *
 * Painted white so the instance colour decides whether it is a red gate or a
 * blue one — the same trick the caterpillar's food uses. The pole is painted
 * dark and stays dark, because an instance colour multiplying near-black is
 * still near-black.
 */
function flagGeometry(): THREE.BufferGeometry {
  const parts: Array<THREE.BufferGeometry> = [];

  const pole = new THREE.CylinderGeometry(0.14, 0.14, 5, 6);
  pole.translate(0, 2.5, 0);
  parts.push(paint(pole, 0x3d4753));

  // A flat triangle, two-sided by being a very thin box rather than a plane —
  // a plane would vanish from one side, and half the gates are seen from
  // behind on the way past.
  const cloth = new THREE.BoxGeometry(2.6, 1.8, 0.08);
  cloth.translate(1.3, 4, 0);
  parts.push(paint(cloth, 0xffffff));

  return mergeGeometries(parts, false);
}
