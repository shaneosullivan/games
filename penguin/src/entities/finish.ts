import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {FINISH} from "../config";
import {Rng} from "../core/rng";
import {Hill} from "./hill";
import {PALETTE, paint, vertexToon} from "../render/materials";

const TAU = Math.PI * 2;

/**
 * The bottom of the hill: a banner across the ice and a crowd waiting under
 * it.
 *
 * The run does not stop at the line. The ice runs out thirty units past it and
 * the penguin goes off the edge into the sea, which is what a real one does
 * and is a better ending than a wall — there is nothing to crash into and
 * nothing to be careful about, so the last thing a child does in this game is
 * go as fast as they possibly can.
 */
export class Finish {
  readonly group = new THREE.Group();

  /** The little ones on the ice, so they can be made to jump. */
  private readonly crowd: Array<THREE.Object3D> = [];
  private readonly bounce: Array<number> = [];
  /** Which of them are in the water: those bob where the rest hop. */
  private readonly floating: Array<boolean> = [];
  private time = 0;
  private cheering = false;

  constructor(rng: Rng, hill: Hill) {
    this.group.add(this.buildBanner(hill));
    this.buildCrowd(rng, hill);
    this.group.add(this.buildFloes(rng, hill));
    this.buildSwimmers(rng, hill);
  }

  /** They start jumping when the penguin crosses the line. */
  cheer(): void {
    this.cheering = true;
  }

  update(dt: number): void {
    this.time += dt;
    for (let i = 0; i < this.crowd.length; i++) {
      const p = this.crowd[i];
      // A gentle rock before, a proper hop after. The difference is what says
      // "that was for you" without a word of text.
      const wet = this.floating[i];
      const t =
        this.time * (wet ? 1.1 : this.cheering ? 7 : 1.6) + this.bounce[i];
      const hop = wet
        ? Math.sin(t) * 0.55
        : this.cheering
          ? Math.abs(Math.sin(t)) * 2.6
          : Math.sin(t) * 0.12;
      p.position.y = p.userData.baseY + hop;
      p.rotation.z = Math.sin(t * 0.5) * (this.cheering ? 0.2 : 0.06);
    }
  }

  /**
   * The banner: two poles and a strip of cloth between them.
   *
   * Hung high enough to go under rather than through. It is the one thing on
   * the hill placed by hand instead of by the generator, because it is the one
   * thing that has to be exactly where the finish is.
   */
  private buildBanner(hill: Hill): THREE.Mesh {
    const parts: Array<THREE.BufferGeometry> = [];
    const z = hill.bannerZ;
    const y = hill.shelfAt(z);
    const span = 44;

    for (const side of [-1, 1]) {
      const pole = new THREE.CylinderGeometry(0.9, 1.1, 22, 8);
      pole.translate(side * span, y + 11, z);
      parts.push(paint(pole, PALETTE.flagRed));
      // A foot of snow heaped round the base, so the pole is planted in the
      // ice rather than resting on it.
      const foot = new THREE.SphereGeometry(3, 10, 6, 0, TAU, 0, Math.PI / 2);
      foot.scale(1, 0.5, 1);
      foot.translate(side * span, y, z);
      parts.push(paint(foot, PALETTE.snow));
    }

    const cloth = new THREE.BoxGeometry(span * 2, 6, 0.5);
    cloth.translate(0, y + 19, z);
    parts.push(paint(cloth, PALETTE.flagBlue));

    // Bunting: a row of little triangles under the banner, which is the
    // cheapest possible way to make a finish line look like an occasion.
    for (let i = -9; i <= 9; i++) {
      const flag = new THREE.ConeGeometry(0.9, 2.2, 3);
      flag.rotateX(Math.PI);
      flag.translate(i * 4.4, y + 14.4, z);
      parts.push(paint(flag, i % 2 === 0 ? PALETTE.flagRed : PALETTE.snow));
    }

    const mesh = new THREE.Mesh(mergeGeometries(parts, false), vertexToon());
    mesh.castShadow = true;
    return mesh;
  }

  /** The huddle waiting on the ice, either side of the line. */
  private buildCrowd(rng: Rng, hill: Hill): void {
    const geo = littlePenguin();
    for (let i = 0; i < FINISH.crowd; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const x =
        side * (20 + rng.range(0, FINISH.crowdSpread)) + rng.range(-6, 6);
      const z = hill.bannerZ + rng.range(-18, 22);
      const mesh = new THREE.Mesh(geo, vertexToon());
      mesh.castShadow = true;
      // On the snow where they are standing, not on one height for the lot:
      // the shelf still runs downhill, and a crowd on a single level would be
      // a crowd with its feet in the ice at one end and in the air at the other.
      mesh.position.set(x, hill.heightAt(x, z), z);
      // Turned to face the hill: they are watching for somebody coming down
      // it, and a crowd facing the wrong way is a crowd nobody believes in.
      mesh.rotation.y = Math.PI + rng.range(-0.4, 0.4);
      mesh.userData.baseY = mesh.position.y;
      this.group.add(mesh);
      this.crowd.push(mesh);
      this.bounce.push(rng.range(0, TAU));
    }
  }

  /**
   * The ones already in the water, and the ones standing on the floes.
   *
   * They bob rather than hop — a penguin in the sea has nothing to jump off —
   * and they are in the crowd list all the same, so they join in when the line
   * is crossed. Sunk to their chests, which is the whole trick: a penguin in
   * water is a head and a back and nothing else.
   */
  private buildSwimmers(rng: Rng, hill: Hill): void {
    const geo = littlePenguin();
    for (let i = 0; i < FINISH.swimmers + FINISH.floaters; i++) {
      const swimming = i < FINISH.swimmers;
      const mesh = new THREE.Mesh(geo, vertexToon());
      mesh.castShadow = true;
      const x = rng.range(-150, 150);
      const z = hill.edgeZ - rng.range(40, 260);
      // Swimmers sit low in the water; the ones on the floes stand on top of
      // the slabs, which are a couple of units proud of the sea.
      mesh.position.set(x, hill.seaLevel - (swimming ? 2.6 : -3), z);
      mesh.rotation.y = rng.range(0, TAU);
      mesh.userData.baseY = mesh.position.y;
      this.group.add(mesh);
      this.crowd.push(mesh);
      // Half the usual rate, so the water looks like water rather than like a
      // trampoline. The bob comes out of the same sine as the hop.
      this.bounce.push(rng.range(0, TAU));
      this.floating.push(swimming);
    }
  }

  /** A few slabs of ice floating in the water past the edge, so the sea is
   *  somewhere rather than a blue plane. */
  private buildFloes(rng: Rng, hill: Hill): THREE.Mesh {
    const parts: Array<THREE.BufferGeometry> = [];
    for (let i = 0; i < 16; i++) {
      const slab = new THREE.CylinderGeometry(
        rng.range(8, 24),
        rng.range(6, 20),
        rng.range(2, 5),
        rng.int(5, 8),
      );
      slab.translate(
        rng.range(-260, 260),
        hill.seaLevel + 1,
        hill.edgeZ - rng.range(60, 460),
      );
      parts.push(paint(slab, PALETTE.ice));
    }
    const mesh = new THREE.Mesh(mergeGeometries(parts, false), vertexToon());
    mesh.frustumCulled = false;
    return mesh;
  }
}

/**
 * One of the little ones on the ice: an upright egg with a face.
 *
 * Deliberately not the player's penguin at another scale — that one is built
 * lying down with its feet out behind it, and standing it up would put its
 * toes in the air. This is a simpler bird, and at the distance it is seen the
 * difference nobody can name is the one that makes the crowd read as a family
 * rather than as copies.
 */
function littlePenguin(): THREE.BufferGeometry {
  const parts: Array<THREE.BufferGeometry> = [];

  const body = new THREE.SphereGeometry(1.5, 12, 10);
  body.scale(0.85, 1.25, 0.85);
  body.translate(0, 1.9, 0);
  parts.push(paint(body, PALETTE.back));

  const front = new THREE.SphereGeometry(1.34, 12, 10);
  front.scale(0.78, 1.15, 0.78);
  front.translate(0, 1.75, 0.34);
  parts.push(paint(front, PALETTE.belly));

  const head = new THREE.SphereGeometry(0.98, 12, 10);
  head.translate(0, 3.7, 0.06);
  parts.push(paint(head, PALETTE.back));

  const face = new THREE.SphereGeometry(0.78, 10, 8);
  face.scale(0.8, 0.85, 0.6);
  face.translate(0, 3.5, 0.66);
  parts.push(paint(face, PALETTE.belly));

  const beak = new THREE.ConeGeometry(0.3, 0.8, 7);
  beak.rotateX(Math.PI / 2);
  beak.translate(0, 3.5, 1.24);
  parts.push(paint(beak, PALETTE.beak));

  for (const side of [-1, 1]) {
    const eye = new THREE.SphereGeometry(0.17, 8, 6);
    eye.translate(side * 0.35, 3.86, 0.78);
    parts.push(paint(eye, 0x161d26));

    const wing = new THREE.SphereGeometry(0.85, 8, 6);
    wing.scale(0.22, 0.9, 0.5);
    wing.translate(side * 1.2, 1.9, 0);
    parts.push(paint(wing, PALETTE.back));

    const foot = new THREE.SphereGeometry(0.42, 8, 6);
    foot.scale(1, 0.35, 1.5);
    foot.translate(side * 0.5, 0.16, 0.42);
    parts.push(paint(foot, PALETTE.foot));
  }

  return mergeGeometries(parts, false);
}
