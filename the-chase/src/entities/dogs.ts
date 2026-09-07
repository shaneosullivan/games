import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {DOGS, HOME} from "../config";
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
  /** Standing rather than running. The legs stop; everything else does not. */
  standing: boolean;
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
        // Small rose ears, folded back against the skull. A wolfhound has
        // nothing like a spaniel's flap — the ear is half the length and lies
        // along the head — so the big soft ones had to go, and what keeps
        // these dogs friendly now is the beard and the eyes instead.
        pivot.position.set(side * 0.62, 2.85, 3.15);
        const flap = new THREE.SphereGeometry(1, 8, 7);
        flap.scale(0.16, 0.42, 0.5);
        flap.translate(0, -0.3, -0.2);
        // A shade darker than the coat, the way a floppy-eared dog nearly
        // always is.
        const ear = new THREE.Mesh(paint(flap, PALETTE.dogDark), vertexToon());
        ear.castShadow = true;
        pivot.add(ear);
        body.add(pivot);
        ears.push(pivot);
      }

      const legs: Array<THREE.Object3D> = [];
      // Long, and set well apart front and back. The legs are the wolfhound:
      // it stands a head above every other dog and does it entirely on these.
      const spots = [
        {x: -0.8, z: 1.9},
        {x: 0.8, z: 1.9},
        {x: -0.9, z: -1.7},
        {x: 0.9, z: -1.7},
      ];
      for (const spot of spots) {
        const pivot = new THREE.Group();
        pivot.position.set(spot.x, 0.1, spot.z);
        const shape = new THREE.SphereGeometry(1, 8, 7);
        // Thin. A wolfhound's leg is bone and tendon and the width of a
        // broom handle; anything thicker turns the dog into furniture.
        shape.scale(0.23, 1.85, 0.3);
        shape.translate(0, -1.7, 0);
        const leg = new THREE.Mesh(paint(shape, PALETTE.dog), vertexToon());
        // A darker foot, so a leg has an end to it.
        const paw = new THREE.SphereGeometry(1, 7, 6);
        paw.scale(0.27, 0.2, 0.44);
        paw.translate(0, -3.4, 0.12);
        const foot = new THREE.Mesh(paint(paw, PALETTE.dogDark), vertexToon());
        pivot.add(foot);
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
        standing: false,
        object,
        ears,
        legs,
      });
    }
  }

  /**
   * Puts them back where they started, for a fresh run.
   *
   * The wood does not need rebuilding — it is seeded and identical every time
   * — so a restart is this, the hare, and a handful of counters.
   */
  reset(wood: Wood, x: number, z: number): void {
    for (let i = 0; i < this.dogs.length; i++) {
      const dog = this.dogs[i];
      const dx = x + dog.side * DOGS.spread;
      const dz = z + DOGS.startGap + i * 6;
      dog.position.set(dx, wood.heightAt(dx, dz), dz);
      dog.prevPosition.copy(dog.position);
      dog.heading = Math.PI;
      dog.prevHeading = Math.PI;
      dog.snagged = 0;
    }
    this.gap = DOGS.startGap;
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
      dog.standing = false;
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

      // Standing, not bouncing. They had you: the chase is over, and three
      // dogs still pounding their legs on the spot read as a bug rather than
      // as dogs. The stride goes on turning, slowly, because the render uses
      // it for the breathing and the ears — but the legs are told to stop.
      dog.stride += dt * 2.2;
      dog.standing = true;
    }
    this.gap = 0;
  }

  /**
   * The hare has gone down the hole and they have not.
   *
   * They run rings round the burrow for a few seconds — nose down, still
   * looking — and then give it up and trot off into the wood. `since` is how
   * long the ending has been running, which decides which of the two they are
   * doing.
   */
  giveUp(dt: number, since: number, at: THREE.Vector3, wood: Wood): void {
    const leaving = since > HOME.circleFor;
    let nearest = Infinity;
    for (let i = 0; i < this.dogs.length; i++) {
      const dog = this.dogs[i];
      dog.prevPosition.copy(dog.position);
      dog.prevHeading = dog.heading;

      let wx: number;
      let wz: number;
      if (leaving) {
        // Away up the wood and out to the side, each on its own line, until
        // they are gone into the fog.
        wx = at.x + (i - 1) * 90;
        wz = at.z + 400;
      } else {
        // Round and round. Each one a third of the way apart, all going the
        // same way, so it reads as circling rather than milling.
        const a = since * 1.5 + (i / this.dogs.length) * TAU;
        wx = at.x + Math.sin(a) * HOME.circleAt;
        wz = at.z + 18 + Math.cos(a) * HOME.circleAt * 0.55;
      }

      const dx = wx - dog.position.x;
      const dz = wz - dog.position.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.001) {
        const speed = leaving ? HOME.leaveSpeed : DOGS.speed * 0.8;
        const step = Math.min(d, speed * dt);
        dog.position.x += (dx / d) * step;
        dog.position.z += (dz / d) * step;
        const target = Math.atan2(dx, dz);
        const diff =
          ((((target - dog.heading) % TAU) + TAU + Math.PI) % TAU) - Math.PI;
        dog.heading += Math.sign(diff) * Math.min(Math.abs(diff), 6 * dt);
      }
      dog.position.y = wood.heightAt(dog.position.x, dog.position.z);
      dog.stride += dt * 10;
      dog.standing = false;
      nearest = Math.min(
        nearest,
        Math.hypot(dog.position.x - at.x, dog.position.z - at.z),
      );
    }
    // Kept up to date so the barking follows them: loud while they are round
    // the hole and fading as they give it up and go.
    this.gap = nearest;
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
      if (dog.standing) {
        // Standing over you, getting its breath back. A small quick rise and
        // fall and nothing else — the legs are still, which is the whole
        // difference between a dog that has arrived and a dog running on the
        // spot.
        body.position.y = 3.5 + Math.sin(dog.stride * 3) * 0.16;
        body.rotation.x = 0;
        for (let i = 0; i < dog.ears.length; i++) {
          const side = i === 0 ? -1 : 1;
          dog.ears[i].rotation.x = Math.sin(dog.stride * 2.2 + i) * 0.22 - 0.1;
          dog.ears[i].rotation.z = side * 0.3;
        }
        for (const leg of dog.legs) {
          leg.rotation.x = 0;
        }
        continue;
      }

      // The same bound the hare has, a little heavier: a dog at a gallop is
      // rising and falling too, and a dog that slid along flat behind you
      // would look like a cutout.
      // Up on the long legs. It was 1.9, which was right for a barrel and
      // leaves a wolfhound sitting on its own elbows.
      body.position.y = 3.5 + Math.abs(Math.sin(dog.stride)) * 0.9;
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
 * One dog: an Irish wolfhound.
 *
 * The tallest dog there is, and shaped nothing like the barrel on legs this
 * used to be — long in the leg, deep and narrow in the chest, tucked up at the
 * waist, with a long head and a beard on it. That silhouette is the whole
 * animal: you can tell a wolfhound from a hundred units away by its legs and
 * its back line alone.
 *
 * Shaggy, which here means lumpy: a dozen irregular blobs along the spine and
 * down the flanks, because a smooth grey shape at this scale reads as a horse.
 *
 * Still not frightening, and that took some doing with a dog this size. No
 * teeth, no snout coming to a point, soft round eyes, a beard, and the tongue
 * out — a wolfhound's own reputation is for being the gentlest thing in the
 * house, and the drawing has to say so before the size does.
 */
function dogGeometry(): THREE.BufferGeometry {
  const parts: Array<THREE.BufferGeometry> = [];

  // The body: long, deep and narrow, higher at the shoulder than the hip.
  // The outline, and it is four shapes rather than one tube.
  //
  // A sighthound is deep and narrow at the front, cut away underneath behind
  // the ribs, and carries its width only over the haunch. Getting that wrong
  // is what made these dogs fat: a chest, a waist, a back and a rump all
  // overlapping at much the same depth merge into one sausage, and no amount
  // of narrowing a sausage makes it athletic. What does it is the gap — the
  // underline has to climb steeply from the brisket to the loin, and there has
  // to be daylight under the back half of the dog.
  const chest = new THREE.SphereGeometry(1, 12, 10);
  chest.scale(0.82, 2.05, 1.85);
  chest.translate(0, 0.35, 1.2);
  parts.push(paint(chest, PALETTE.dog));

  // The loin: half the depth of the chest and riding a long way higher.
  const loin = new THREE.SphereGeometry(1, 10, 9);
  loin.scale(0.6, 0.85, 1.6);
  loin.translate(0, 0.95, -0.55);
  parts.push(paint(loin, PALETTE.dog));

  // The haunch, which is the one place a wolfhound is wide — and it is muscle,
  // so it sits high and well back.
  const haunch = new THREE.SphereGeometry(1, 10, 9);
  haunch.scale(0.88, 1.35, 1.25);
  haunch.translate(0, 0.55, -2.05);
  parts.push(paint(haunch, PALETTE.dog));

  // The pale brisket, low at the front where the chest is deepest.
  const bib = new THREE.SphereGeometry(1, 10, 8);
  bib.scale(0.62, 1.1, 1.2);
  bib.translate(0, -0.45, 1.6);
  parts.push(paint(bib, PALETTE.dogLight));

  // A little shag, along the top line only.
  //
  // There were a dozen lumps down both flanks and it read as a sheep: a
  // wolfhound's coat is rough and wiry but it lies close to a body you can
  // still see the shape of, and the shape is the point. Five along the spine
  // break the smooth line without burying it.
  for (let i = 0; i < 3; i++) {
    const t = i / 2;
    const lump = new THREE.IcosahedronGeometry(0.34, 0);
    lump.scale(0.55, 0.5, 1.2);
    lump.translate((i % 2 === 0 ? 1 : -1) * 0.16, 1.5 - t * 0.35, 1 - t * 2.4);
    parts.push(paint(lump, i % 2 === 0 ? PALETTE.dogDark : PALETTE.dog));
  }

  // A long neck, rising.
  const neck = new THREE.CylinderGeometry(0.62, 0.82, 2.2, 9);
  neck.rotateX(-0.55);
  neck.translate(0, 1.35, 2.5);
  parts.push(paint(neck, PALETTE.dog));

  // The head: long and narrow, and nowhere near as round as it was.
  const skull = new THREE.SphereGeometry(0.95, 12, 10);
  skull.scale(0.8, 0.85, 1.05);
  skull.translate(0, 2.5, 3.35);
  parts.push(paint(skull, PALETTE.dog));

  const muzzle = new THREE.SphereGeometry(0.62, 10, 8);
  muzzle.scale(0.72, 0.62, 1.45);
  muzzle.translate(0, 2.25, 4.35);
  parts.push(paint(muzzle, PALETTE.dogLight));

  // The beard. One shape, and it is the difference between a wolfhound and a
  // greyhound.
  const beard = new THREE.SphereGeometry(0.52, 9, 7);
  beard.scale(0.85, 0.7, 1.1);
  beard.translate(0, 1.92, 4.5);
  parts.push(paint(beard, PALETTE.dogLight));

  const brows = new THREE.SphereGeometry(0.42, 8, 6);
  brows.scale(1.5, 0.5, 0.7);
  brows.translate(0, 2.95, 3.75);
  parts.push(paint(brows, PALETTE.dogLight));

  const nose = new THREE.SphereGeometry(0.26, 8, 6);
  nose.translate(0, 2.32, 5.05);
  parts.push(paint(nose, 0x2f2822));

  const tongue = new THREE.SphereGeometry(0.42, 8, 6);
  tongue.scale(0.45, 0.24, 1);
  tongue.translate(0, 1.95, 4.85);
  parts.push(paint(tongue, PALETTE.tongue));

  for (const side of [-1, 1]) {
    const eye = new THREE.SphereGeometry(0.2, 8, 6);
    eye.translate(side * 0.42, 2.72, 3.95);
    parts.push(paint(eye, PALETTE.eye));
    const glint = new THREE.SphereGeometry(0.08, 6, 5);
    glint.translate(side * 0.49, 2.82, 4.06);
    parts.push(paint(glint, 0xffffff));
  }

  // A long tail with a curve in it, carried low.
  for (let i = 0; i < 4; i++) {
    const t = i / 3;
    const seg = new THREE.SphereGeometry(0.42 - t * 0.16, 8, 6);
    seg.translate(0, 0.5 - t * t * 1.1, -2.6 - t * 1.25);
    parts.push(paint(seg, i % 2 === 0 ? PALETTE.dog : PALETTE.dogDark));
  }

  return mergeGeometries(parts, false);
}
