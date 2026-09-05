import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {FISH, HILL, PROPS} from "../config";
import {Rng} from "../core/rng";
import {Hill} from "./hill";
import {PALETTE, paint, vertexToon} from "../render/materials";

const TAU = Math.PI * 2;

interface Catch {
  position: THREE.Vector3;
  /** Where it is in its own turn and bob, so a row of them is not one fish
   *  drawn six times. */
  phase: number;
  taken: boolean;
}

/**
 * The fish, hanging over the snow for the penguin to scoop up on the way past.
 *
 * They are what turns a corridor into a course. The quick line down the hill
 * is the clear one; the fish sit just off it, so every one of them costs a
 * turn, and a child who wants them all has to give up some speed to get them.
 * That trade is the only decision in the game and it wants to be made a
 * hundred times a run.
 *
 * One InstancedMesh for the lot.
 */
export class Fish {
  readonly mesh: THREE.InstancedMesh;

  eaten = 0;
  readonly total = FISH.count;

  private readonly fish: Array<Catch> = [];
  private time = 0;

  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly scale = new THREE.Vector3();
  private readonly at = new THREE.Vector3();

  constructor(rng: Rng, hill: Hill) {
    // In short trails rather than one at a time. A single fish is a thing you
    // notice as you go past it; four in a line is an invitation to take a
    // particular line through, which is the whole point of them.
    let placed = 0;
    while (placed < FISH.count) {
      const run = Math.min(FISH.count - placed, rng.int(2, 4));
      const z0 = rng.range(-PROPS.clearStart, -(HILL.length - PROPS.clearEnd));
      // Which side of the clear line this trail sits on, and how far off it.
      const side = rng.next() < 0.5 ? -1 : 1;
      const off = rng.range(PROPS.lane * 0.8, FISH.spread);
      for (let i = 0; i < run; i++) {
        const z = z0 - i * 13;
        const x = hill.laneAt(z) + side * off;
        this.fish.push({
          position: new THREE.Vector3(x, hill.heightAt(x, z) + FISH.hover, z),
          phase: rng.range(0, TAU),
          taken: false,
        });
        placed++;
      }
    }

    this.mesh = new THREE.InstancedMesh(fishBody(), vertexToon(), FISH.count);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
  }

  /**
   * Turns them, bobs them, and picks up whatever the beak reaches.
   *
   * Returns how many went down this step, so the game can make a noise about
   * it without the fish having to know the game exists.
   */
  update(dt: number, beak: THREE.Vector3): number {
    this.time += dt;
    let taken = 0;
    const reachSq = FISH.reach * FISH.reach;

    for (const f of this.fish) {
      if (f.taken) {
        continue;
      }
      if (f.position.distanceToSquared(beak) < reachSq) {
        f.taken = true;
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
      if (f.taken) {
        // An instanced mesh cannot skip an instance; a scale of zero is how
        // you take one off the screen.
        this.scale.setScalar(0);
        this.m.compose(f.position, this.q.identity(), this.scale);
      } else {
        const t = this.time + f.phase;
        this.at.set(
          f.position.x,
          f.position.y + Math.sin(t * FISH.bobRate) * FISH.bob,
          f.position.z,
        );
        // Turning slowly on the spot, nose tipped up. A fish standing still in
        // the snow is invisible at fifty units a second; a turning one flashes
        // its flank at you twice a second, which is what catches the eye.
        this.e.set(0.35, t * FISH.spin, 0);
        this.q.setFromEuler(this.e);
        this.scale.setScalar(1);
        this.m.compose(this.at, this.q, this.scale);
      }
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** One herring: a body, a tail and an eye, pointing +Z. */
function fishBody(): THREE.BufferGeometry {
  const s = FISH.size;
  const parts: Array<THREE.BufferGeometry> = [];

  const body = new THREE.SphereGeometry(s * 0.34, 10, 8);
  body.scale(0.62, 1, 1.7);
  parts.push(paint(body, PALETTE.fish));

  const under = new THREE.SphereGeometry(s * 0.3, 10, 8);
  under.scale(0.56, 0.7, 1.5);
  under.translate(0, -s * 0.09, 0);
  parts.push(paint(under, PALETTE.fishBelly));

  const tail = new THREE.ConeGeometry(s * 0.32, s * 0.46, 5);
  tail.rotateX(Math.PI / 2);
  tail.scale(0.3, 1, 1);
  tail.translate(0, 0, -s * 0.66);
  parts.push(paint(tail, PALETTE.fish));

  for (const side of [-1, 1]) {
    const eye = new THREE.SphereGeometry(s * 0.075, 6, 5);
    eye.translate(side * s * 0.15, s * 0.09, s * 0.42);
    parts.push(paint(eye, 0x1b2129));
  }

  return mergeGeometries(parts, false);
}
