import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {DOGS} from "../config";
import {Rng} from "../core/rng";
import {Wood} from "./wood";
import {PALETTE, paint, vertexToon} from "../render/materials";

const TAU = Math.PI * 2;

interface Dog {
  position: THREE.Vector3;
  prevPosition: THREE.Vector3;
  heading: number;
  prevHeading: number;
  /** Where in this dog's own bound it is, and where in its weave. */
  stride: number;
  phase: number;
  /** Which side of the line it runs, and how long it is still slowed from
   *  crashing through a bramble. */
  side: number;
  snagged: number;
  object: THREE.Group;
  ears: Array<THREE.Object3D>;
  legs: Array<THREE.Object3D>;
}

/**
 * The dogs.
 *
 * Three of them, always behind, and the gap between them and you is the whole
 * of the tension in this game. They run at a speed between the hare's lope and
 * its gallop, which is the entire design: hold the stick and you pull away,
 * let go and they close, and every log you fail to jump hands them a length.
 *
 * They are drawn bouncy and daft rather than snarling. The plan asks for a
 * wood that is friendly and not scary, and a chase is only fun if the thing
 * behind you is funny.
 */
export class Dogs {
  readonly group = new THREE.Group();

  private readonly dogs: Array<Dog> = [];
  /** How near the nearest of them is. The barking and the readout ride on it. */
  gap: number = DOGS.startGap;

  private readonly want = new THREE.Vector3();

  constructor(rng: Rng, wood: Wood, startX: number, startZ: number) {
    const geo = dogGeometry();
    for (let i = 0; i < DOGS.count; i++) {
      const object = new THREE.Group();
      const body = new THREE.Group();
      const mesh = new THREE.Mesh(geo, vertexToon());
      mesh.castShadow = true;
      body.add(mesh);

      const ears: Array<THREE.Object3D> = [];
      for (const side of [-1, 1]) {
        const pivot = new THREE.Group();
        // Set wide on the head and hung from the top of it, so they swing out
        // and away rather than lying flat along the skull.
        pivot.position.set(side * 1.05, 2.05, 2.4);
        // Long, wide and thin: a proper spaniel flap. They were half this and
        // the dogs read as three brown potatoes with legs — the ears are the
        // single thing that says "dog" at fifty units, and the single thing
        // that keeps them daft rather than frightening.
        const flap = new THREE.SphereGeometry(1, 9, 8);
        flap.scale(0.26, 1.5, 0.72);
        flap.translate(0, -1.35, 0);
        // A shade darker than the coat, the way a floppy-eared dog nearly
        // always is.
        const ear = new THREE.Mesh(paint(flap, 0x6a5240), vertexToon());
        ear.castShadow = true;
        pivot.add(ear);
        body.add(pivot);
        ears.push(pivot);
      }

      const legs: Array<THREE.Object3D> = [];
      const spots = [
        {x: -0.85, z: 1.7},
        {x: 0.85, z: 1.7},
        {x: -0.95, z: -1.4},
        {x: 0.95, z: -1.4},
      ];
      for (const spot of spots) {
        const pivot = new THREE.Group();
        pivot.position.set(spot.x, 0.1, spot.z);
        const shape = new THREE.SphereGeometry(1, 8, 7);
        shape.scale(0.34, 1.05, 0.42);
        shape.translate(0, -0.9, 0);
        const leg = new THREE.Mesh(paint(shape, PALETTE.dog), vertexToon());
        leg.castShadow = true;
        pivot.add(leg);
        body.add(pivot);
        legs.push(pivot);
      }

      object.add(body);
      // Scaled at the outer group, whose origin is on the ground: scale the
      // body instead and the legs come off the floor.
      object.scale.setScalar(DOGS.scale);
      object.userData.body = body;
      this.group.add(object);

      const side = i === 0 ? 0 : i === 1 ? -1 : 1;
      const x = startX + side * DOGS.spread;
      const z = startZ + DOGS.startGap + i * 6;
      this.dogs.push({
        position: new THREE.Vector3(x, wood.heightAt(x, z), z),
        prevPosition: new THREE.Vector3(x, wood.heightAt(x, z), z),
        heading: Math.PI,
        prevHeading: Math.PI,
        stride: rng.range(0, TAU),
        phase: rng.range(0, TAU),
        side,
        snagged: 0,
        object,
        ears,
        legs,
      });
    }
  }

  /**
   * Runs them at the hare.
   *
   * Each one steers for a point beside the hare rather than at it, and how far
   * beside depends on how close it is: far back they run in a tight pack, and
   * as they close they fan out. That is not decoration — the camera sits
   * behind the hare, so a dog directly behind it is a dog behind the lens.
   * Fanning wide is what brings them into the shot at the moment it matters.
   *
   * Returns true if one of them has caught you.
   */
  update(dt: number, hare: THREE.Vector3, wood: Wood): boolean {
    let nearest = Infinity;
    let caught = false;

    for (const dog of this.dogs) {
      dog.prevPosition.copy(dog.position);
      dog.prevHeading = dog.heading;
      dog.snagged = Math.max(0, dog.snagged - dt);

      const behind = dog.position.distanceTo(hare);
      nearest = Math.min(nearest, behind);
      if (behind < DOGS.reach) {
        caught = true;
      }

      // Wider the closer they get, and weaving as they come.
      const near = Math.max(0, Math.min(1, 1 - (behind - DOGS.reach) / 60));
      const spread = DOGS.spread + (DOGS.spreadNear - DOGS.spread) * near;
      const weave = Math.sin(dog.phase + dog.stride * DOGS.weave) * 6;
      this.want.set(
        hare.x + dog.side * spread + weave - dog.position.x,
        0,
        hare.z - dog.position.z,
      );
      const d = Math.hypot(this.want.x, this.want.z);
      if (d > 1e-4) {
        const target = Math.atan2(this.want.x, this.want.z);
        const diff =
          ((((target - dog.heading) % TAU) + TAU + Math.PI) % TAU) - Math.PI;
        // Turns hard. A dog has four feet on the ground and does not have to
        // lean into anything.
        dog.heading += Math.sign(diff) * Math.min(Math.abs(diff), 4 * dt);
      }

      // A dog a long way behind runs faster than one on your heels, so a good
      // run never turns into a walk in the park — and a snagged one has just
      // gone through a bramble and is paying for it.
      const boost =
        behind > DOGS.catchUpFrom
          ? DOGS.catchUp
          : 1 + (DOGS.catchUp - 1) * (behind / DOGS.catchUpFrom);
      const speed = DOGS.speed * boost * (dog.snagged > 0 ? DOGS.snag : 1);

      dog.position.x += Math.sin(dog.heading) * speed * dt;
      dog.position.z += Math.cos(dog.heading) * speed * dt;
      dog.position.y = wood.heightAt(dog.position.x, dog.position.z);

      // They crash through the thick stuff rather than going round it, and it
      // costs them — which is what makes cutting through the brambles worth a
      // hare's while.
      if (wood.hit(dog.position.x, dog.position.z, 2, 0)) {
        dog.snagged = 0.5;
      }

      dog.stride += dt * 9;
    }

    this.gap = nearest;
    return caught;
  }

  /**
   * They have caught you, and now they are pleased about it.
   *
   * A ring round the hare, all facing in, bouncing on the spot. Not a pounce
   * and nothing on top of it: the plan asks for a wood that is friendly and
   * not scary, and what a dog does when it catches something it was playing
   * with is stand there wagging.
   */
  surround(dt: number, hare: THREE.Vector3, wood: Wood): void {
    for (let i = 0; i < this.dogs.length; i++) {
      const dog = this.dogs[i];
      dog.prevPosition.copy(dog.position);
      dog.prevHeading = dog.heading;

      // Evenly round the circle, and offset so none of them stands directly
      // between the hare and the camera.
      const a = (i / this.dogs.length) * TAU + 0.6;
      const wobble = Math.sin(dog.stride * 0.5) * 1.2;
      const want = {
        x: hare.x + Math.sin(a) * (DOGS.ring + wobble),
        z: hare.z + Math.cos(a) * (DOGS.ring + wobble),
      };
      const ease = Math.min(1, 4 * dt);
      dog.position.x += (want.x - dog.position.x) * ease;
      dog.position.z += (want.z - dog.position.z) * ease;
      dog.position.y = wood.heightAt(dog.position.x, dog.position.z);

      // Facing in.
      const target = Math.atan2(
        hare.x - dog.position.x,
        hare.z - dog.position.z,
      );
      const diff =
        ((((target - dog.heading) % TAU) + TAU + Math.PI) % TAU) - Math.PI;
      dog.heading += diff * Math.min(1, 6 * dt);

      // Bouncing rather than running: the stride drives the hop and the ears,
      // so keeping it turning keeps them alive without going anywhere.
      dog.stride += dt * 11;
    }
    this.gap = 0;
  }

  /** Draws them somewhere between the last step and this one. */
  render(alpha: number): void {
    for (const dog of this.dogs) {
      dog.object.position.lerpVectors(dog.prevPosition, dog.position, alpha);
      const diff =
        ((((dog.heading - dog.prevHeading) % TAU) + TAU + Math.PI) % TAU) -
        Math.PI;
      dog.object.rotation.y = dog.prevHeading + diff * alpha;

      const body = dog.object.userData.body as THREE.Object3D;
      // The same bound the hare has, a little heavier: a dog at a gallop is
      // rising and falling too, and a dog that slid along flat behind you
      // would look like a cutout.
      body.position.y = 1.9 + Math.abs(Math.sin(dog.stride)) * 0.9;
      body.rotation.x = -Math.cos(dog.stride) * 0.14;

      // Ears flapping, which is nine tenths of what makes them daft rather
      // than frightening.
      for (let i = 0; i < dog.ears.length; i++) {
        const side = i === 0 ? -1 : 1;
        dog.ears[i].rotation.x = Math.sin(dog.stride * 1.3) * 0.5 - 0.2;
        dog.ears[i].rotation.z = side * 0.35;
      }
      for (let i = 0; i < dog.legs.length; i++) {
        const front = i < 2;
        dog.legs[i].rotation.x =
          Math.sin(dog.stride + (front ? 0 : Math.PI)) * 0.95;
      }
    }
  }
}

/**
 * One dog: a barrel on legs with a big soft head and its tongue out.
 *
 * Round everywhere. There is not a point on it anywhere — no teeth, no snout
 * to speak of, nothing that comes to an edge — because the plan asks for a
 * wood that is friendly and not scary, and the thing chasing you is the only
 * place that could go wrong.
 */
function dogGeometry(): THREE.BufferGeometry {
  const parts: Array<THREE.BufferGeometry> = [];

  const body = new THREE.SphereGeometry(2, 12, 10);
  body.scale(0.82, 0.8, 1.3);
  parts.push(paint(body, PALETTE.dog));

  const chest = new THREE.SphereGeometry(1.5, 10, 8);
  chest.scale(0.9, 0.85, 1);
  chest.translate(0, -0.25, 1.5);
  parts.push(paint(chest, PALETTE.dogLight));

  const head = new THREE.SphereGeometry(1.35, 12, 10);
  head.translate(0, 1.1, 2.5);
  parts.push(paint(head, PALETTE.dog));

  const muzzle = new THREE.SphereGeometry(0.8, 10, 8);
  muzzle.scale(0.9, 0.75, 1.1);
  muzzle.translate(0, 0.55, 3.4);
  parts.push(paint(muzzle, PALETTE.dogLight));

  const nose = new THREE.SphereGeometry(0.3, 8, 6);
  nose.translate(0, 0.78, 4.1);
  parts.push(paint(nose, 0x2f2822));

  // The tongue, hanging out. One shape, and it does more for the mood than
  // everything else on the animal put together.
  const tongue = new THREE.SphereGeometry(0.5, 8, 6);
  tongue.scale(0.5, 0.28, 1.1);
  tongue.translate(0, 0.16, 3.9);
  parts.push(paint(tongue, PALETTE.tongue));

  for (const side of [-1, 1]) {
    const eye = new THREE.SphereGeometry(0.24, 8, 6);
    eye.translate(side * 0.5, 1.5, 3.5);
    parts.push(paint(eye, PALETTE.eye));
    const glint = new THREE.SphereGeometry(0.09, 6, 5);
    glint.translate(side * 0.58, 1.62, 3.64);
    parts.push(paint(glint, 0xffffff));
  }

  const collar = new THREE.CylinderGeometry(1.2, 1.2, 0.45, 12);
  collar.rotateX(0.35);
  collar.translate(0, 0.55, 1.95);
  parts.push(paint(collar, PALETTE.collar));

  const tail = new THREE.SphereGeometry(0.9, 8, 6);
  tail.scale(0.35, 0.35, 1.3);
  tail.rotateX(-0.7);
  tail.translate(0, 0.9, -2.4);
  parts.push(paint(tail, PALETTE.dog));

  return mergeGeometries(parts, false);
}
