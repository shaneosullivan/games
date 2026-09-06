import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {HOME} from "../config";
import {Rng} from "../core/rng";
import {Wood} from "./wood";
import {PALETTE, paint, vertexToon} from "../render/materials";

const TAU = Math.PI * 2;

/**
 * Home: a bank of earth across the end of the wood, with the burrow in it.
 *
 * The run does not end at a line — it ends when the hare is inside. The mouth
 * of the burrow is the only dark thing in the whole game, and that is on
 * purpose: at sixty units a second, down a wood full of green and brown, a
 * black arch is the one shape you cannot mistake for anything else.
 */
export class Home {
  readonly group = new THREE.Group();

  /** The middle of the burrow mouth, which is what the hare runs at. */
  readonly mouth = new THREE.Vector3();

  private readonly crowd: Array<THREE.Object3D> = [];
  private readonly bounce: Array<number> = [];
  private time = 0;
  private cheering = false;
  /** They have seen the hare coming and are bolting for the hole. See bolt(). */
  private bolting = false;
  private boltTime = 0;

  constructor(rng: Rng, wood: Wood) {
    const z = wood.homeZ;
    // On the path, not at x = 0. The path wanders the whole way down the wood
    // and the burrow was pinned to the middle of the map, so the last stretch
    // of every run bent away from the one thing you were running at.
    const cx = wood.pathAt(z);
    const y = wood.heightAt(cx, z);
    // The middle of the hole, on the ground. This is the spot the hare runs at
    // and drops into.
    this.mouth.set(cx, y, z);

    this.group.add(this.buildBurrow(cx, z, y));
    this.buildCrowd(rng, wood, cx, z);
  }

  /** They start jumping when the hare gets home. */
  cheer(): void {
    this.cheering = true;
  }

  /**
   * And then they bolt.
   *
   * A hare arriving with three dogs behind it does not stop for a party at the
   * door: everybody goes down the hole. They set off a fraction of a second
   * apart so they file in rather than vanishing all at once, which is the
   * difference between a scene and a bug.
   */
  bolt(): void {
    this.bolting = true;
    this.boltTime = 0;
  }

  update(dt: number): void {
    this.time += dt;
    if (this.bolting) {
      this.boltTime += dt;
    }

    for (let i = 0; i < this.crowd.length; i++) {
      const one = this.crowd[i];
      if (!one.visible) {
        continue;
      }

      if (this.bolting && this.boltTime > i * HOME.boltAfter) {
        // Straight at the hole, and gone when it gets there. The shrink is the
        // whole of the trick — one that simply switched off at the doorway
        // would have vanished rather than gone in.
        const dx = this.mouth.x - one.position.x;
        const dz = this.mouth.z - one.position.z;
        const left = Math.hypot(dx, dz);
        if (left < 1.2) {
          one.visible = false;
          continue;
        }
        const step = Math.min(left, HOME.boltSpeed * dt);
        one.position.x += (dx / left) * step;
        one.position.z += (dz / left) * step;
        one.rotation.y = Math.atan2(dx, dz);
        const shrink = Math.min(1, left / 10);
        one.scale.setScalar(shrink);
        // Still bounding: the same hop the run itself uses, so they are
        // running rather than sliding.
        one.position.y =
          (one.userData.baseY as number) +
          Math.abs(Math.sin(this.time * 14 + this.bounce[i])) * 1.6 -
          (1 - shrink) * 4;
        continue;
      }

      // A gentle sway before, and a proper hop after. The difference is what
      // says "that was for you" without a word of text.
      const t = this.time * (this.cheering ? 8 : 1.4) + this.bounce[i];
      one.position.y =
        (one.userData.baseY as number) +
        (this.cheering ? Math.abs(Math.sin(t)) * 3 : Math.sin(t) * 0.15);
      one.rotation.z = Math.sin(t * 0.5) * (this.cheering ? 0.22 : 0.05);
    }
  }

  /**
   * The bank, and the hole in it.
   *
   * A wall of earth built from overlapping lumps rather than a box, so it
   * reads as a bank grown over with grass instead of a fence. The hole is a
   * dark tube set into it and a dark disc behind that, which between them make
   * a mouth with no bottom to it — there is nothing in there to see, and that
   * is exactly what a burrow looks like from outside.
   */
  /**
   * The burrow: a hole in the ground, with a heap of earth behind it.
   *
   * It was a bank of grass right across the end of the wood with a doorway cut
   * in the face of it — a great deal of scenery for one hole, and it walled the
   * wood off behind. This is what a burrow is: a dark hole in the ground with
   * the spoil piled behind it and the wood carrying on past.
   *
   * Three parts, and the order they stack in is the whole of the trick. The
   * worn earth lies on the grass; the hole lies on the earth; and a throat
   * drops out of sight beneath it, so at a low angle you are looking into
   * something rather than at a black sticker.
   */
  private buildBurrow(cx: number, z: number, y: number): THREE.Mesh {
    const parts: Array<THREE.BufferGeometry> = [];

    // Bare earth, worn by the coming and going, a little longer than it is
    // wide because everybody arrives from the same direction.
    const worn = new THREE.CircleGeometry(HOME.apron, 24);
    worn.rotateX(-Math.PI / 2);
    worn.scale(1, 1, 1.35);
    worn.translate(cx, y + 0.1, z + 4);
    parts.push(paint(worn, PALETTE.earth));

    // A raised lip of earth round the hole, so it is dug rather than drawn.
    // A pale ring of thrown-out earth right at the edge, so the black has a
    // bright edge against it and reads as a hole rather than as a shadow.
    //
    // Flat, and that is the point. It was a torus standing proud of the
    // ground, and a raised ring seen from up the wood sits *over* the hole it
    // is supposed to be framing — from a hundred units out the burrow was a
    // pale disc with no hole in it at all. Three flat discs stacked a few
    // centimetres apart cannot hide one another.
    const rim = new THREE.RingGeometry(
      HOME.holeWidth * 0.5,
      HOME.holeWidth * 0.78,
      26,
    );
    rim.rotateX(-Math.PI / 2);
    rim.scale(1, 1, 0.9);
    rim.translate(cx, y + 0.2, z);
    parts.push(paint(rim, PALETTE.furLight));

    // The hole itself, and the throat under it.
    const hole = new THREE.CircleGeometry(HOME.holeWidth * 0.5, 24);
    hole.rotateX(-Math.PI / 2);
    hole.scale(1, 1, 0.9);
    hole.translate(cx, y + 0.3, z);
    parts.push(paint(hole, 0x120d09));

    const throat = new THREE.CylinderGeometry(
      HOME.holeWidth * 0.5,
      HOME.holeWidth * 0.28,
      HOME.holeDepth,
      22,
      1,
      true,
    );
    throat.scale(1, 1, 0.85);
    throat.translate(cx, y + 0.3 - HOME.holeDepth / 2, z);
    parts.push(paint(throat, 0x1c1510));

    const floor = new THREE.CircleGeometry(HOME.holeWidth * 0.3, 16);
    floor.rotateX(-Math.PI / 2);
    floor.translate(cx, y + 0.3 - HOME.holeDepth, z);
    parts.push(paint(floor, 0x0d0906));

    // The heap behind it: the earth that came out, with grass growing over the
    // back of it.
    const heap = new THREE.SphereGeometry(
      HOME.moundWide,
      12,
      8,
      0,
      TAU,
      0,
      Math.PI / 2,
    );
    heap.scale(1.35, HOME.moundHigh / HOME.moundWide, 1);
    heap.translate(cx, y - 0.4, z - HOME.moundBack);
    parts.push(paint(heap, PALETTE.earth));

    const turf = new THREE.SphereGeometry(
      HOME.moundWide * 0.78,
      10,
      7,
      0,
      TAU,
      0,
      Math.PI / 2,
    );
    turf.scale(1.35, (HOME.moundHigh * 0.75) / HOME.moundWide, 1);
    turf.translate(cx, y - 0.2, z - HOME.moundBack - 3);
    parts.push(paint(turf, PALETTE.grassDeep));

    const mesh = new THREE.Mesh(mergeGeometries(parts, false), vertexToon());
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    return mesh;
  }

  /** The others, waiting outside. */
  private buildCrowd(rng: Rng, wood: Wood, cx: number, z: number): void {
    const geo = littleHare();
    for (let i = 0; i < HOME.crowd; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const x =
        cx +
        side * (HOME.holeWidth * 0.9 + rng.range(0, HOME.crowdSpread)) +
        rng.range(-4, 4);
      const zz = z + rng.range(10, 34);
      const mesh = new THREE.Mesh(geo, vertexToon());
      mesh.castShadow = true;
      mesh.position.set(x, wood.heightAt(x, zz), zz);
      // Facing up the wood: they are watching for somebody coming, and a
      // crowd facing the wrong way is a crowd nobody believes in.
      mesh.rotation.y = rng.range(-0.5, 0.5);
      mesh.userData.baseY = mesh.position.y;
      this.group.add(mesh);
      this.crowd.push(mesh);
      this.bounce.push(rng.range(0, TAU));
    }
  }
}

/**
 * One of the hares waiting at the burrow: an upright ball with two long ears.
 *
 * Deliberately not the player's hare at another scale — that one is built long
 * and low, mid-stride, and standing it up would put its feet in the air. At
 * the distance this is seen, the difference nobody can name is the one that
 * makes the crowd read as a family rather than as copies.
 */
function littleHare(): THREE.BufferGeometry {
  const parts: Array<THREE.BufferGeometry> = [];

  const body = new THREE.SphereGeometry(1.5, 12, 10);
  body.scale(0.85, 1.15, 0.9);
  body.translate(0, 1.7, 0);
  parts.push(paint(body, PALETTE.fur));

  const front = new THREE.SphereGeometry(1.25, 10, 8);
  front.scale(0.75, 1, 0.7);
  front.translate(0, 1.5, 0.4);
  parts.push(paint(front, PALETTE.furLight));

  const head = new THREE.SphereGeometry(0.95, 10, 8);
  head.translate(0, 3.4, 0.15);
  parts.push(paint(head, PALETTE.fur));

  const nose = new THREE.SphereGeometry(0.18, 6, 5);
  nose.translate(0, 3.25, 1.05);
  parts.push(paint(nose, PALETTE.nose));

  for (const side of [-1, 1]) {
    const eye = new THREE.SphereGeometry(0.2, 8, 6);
    eye.translate(side * 0.68, 3.55, 0.55);
    parts.push(paint(eye, PALETTE.eye));

    const ear = new THREE.SphereGeometry(1, 8, 7);
    ear.scale(0.16, 0.95, 0.28);
    ear.rotateZ(side * 0.16);
    ear.translate(side * 0.3, 4.7, 0.05);
    parts.push(paint(ear, PALETTE.fur));

    const foot = new THREE.SphereGeometry(0.5, 8, 6);
    foot.scale(0.8, 0.4, 1.3);
    foot.translate(side * 0.55, 0.2, 0.4);
    parts.push(paint(foot, PALETTE.furLight));
  }

  const tail = new THREE.SphereGeometry(0.42, 7, 6);
  tail.translate(0, 1.5, -1.1);
  parts.push(paint(tail, PALETTE.furLight));

  return mergeGeometries(parts, false);
}
