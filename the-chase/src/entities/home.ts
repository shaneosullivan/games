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
    const y = wood.heightAt(0, z);
    // On the face of the bank, not at its middle: this is the spot the hare
    // runs at and vanishes into, and it has to be the doorway you can see.
    this.mouth.set(0, y + HOME.holeHeight * 0.45, z + 12);

    this.group.add(this.buildBank(wood, z, y));
    this.buildCrowd(rng, wood, z);
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
        one.scale.setScalar(Math.min(1, left / 12));
        // Still bounding: the same hop the run itself uses, so they are
        // running rather than sliding.
        one.position.y =
          (one.userData.baseY as number) +
          Math.abs(Math.sin(this.time * 14 + this.bounce[i])) * 1.6;
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
  private buildBank(wood: Wood, z: number, y: number): THREE.Mesh {
    const parts: Array<THREE.BufferGeometry> = [];
    const half = 150;
    // How far the bank's own front surface reaches toward you. Everything to
    // do with the door is built in front of this line, and that is the whole
    // lesson of three goes at it: a burrow made of a tube pushed *into* a bank
    // is a burrow nobody can see. A dome swallows a tube, and a bigger dome
    // swallows a bigger tube. The door has to stand on the face.
    const face = 12;

    for (let x = -half; x <= half; x += 11) {
      const near = Math.max(0, 1 - Math.abs(x) / 70);
      const h = 15 + near * 12 + Math.sin(x * 0.21) * 2.5;
      const dome = new THREE.SphereGeometry(11, 9, 6, 0, TAU, 0, Math.PI / 2);
      dome.scale(1, h / 11, 1.1);
      dome.translate(
        x,
        wood.heightAt(x, z) - 1,
        z - 3 + Math.sin(x * 0.13) * 2,
      );
      parts.push(paint(dome, x % 22 === 0 ? PALETTE.grass : PALETTE.grassDeep));
    }

    const midY = y + HOME.holeHeight * 0.45;

    // The earth round the door, framing it: a ring standing on the face of the
    // bank, wider than the hole and lighter than it.
    const rim = new THREE.RingGeometry(1, 1.55, 26);
    rim.scale(HOME.holeWidth * 0.5, HOME.holeHeight * 0.5, 1);
    rim.translate(0, midY, z + face);
    parts.push(paint(rim, PALETTE.earth));

    // The hole. A flat dark disc on the face, and a tube going back behind it
    // so it still reads as a hole from off to one side.
    const hole = new THREE.CircleGeometry(1, 26);
    hole.scale(HOME.holeWidth * 0.5, HOME.holeHeight * 0.5, 1);
    hole.translate(0, midY, z + face - 0.1);
    parts.push(paint(hole, 0x140f0a));

    const tube = new THREE.CylinderGeometry(1, 1, 20, 20, 1, true);
    tube.rotateX(Math.PI / 2);
    tube.scale(HOME.holeWidth * 0.5, HOME.holeHeight * 0.5, 1);
    tube.translate(0, midY, z + face - 10.2);
    parts.push(paint(tube, 0x1a1310));

    // Bare worn earth on the ground in front of it, where the coming and going
    // has rubbed the grass off.
    const worn = new THREE.CircleGeometry(HOME.holeWidth * 0.75, 20);
    worn.rotateX(-Math.PI / 2);
    worn.scale(1, 1, 1.4);
    worn.translate(0, y + 0.12, z + face + 10);
    parts.push(paint(worn, PALETTE.earth));

    const mesh = new THREE.Mesh(mergeGeometries(parts, false), vertexToon());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  /** The others, waiting outside. */
  private buildCrowd(rng: Rng, wood: Wood, z: number): void {
    const geo = littleHare();
    for (let i = 0; i < HOME.crowd; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const x =
        side * (HOME.holeWidth * 0.7 + rng.range(0, HOME.crowdSpread)) +
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
