import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {CROW} from "../config";
import {paint, vertexToon} from "../render/materials";

/**
 * The crow itself — the bird, not its shadow.
 *
 * It exists for exactly one moment: the one where it takes the caterpillar. A
 * child needs to see what happened to their caterpillar, and a game that stops
 * dead and puts up a card saying it has been caught leaves them to take the
 * card's word for it.
 *
 * So it dives out of the sky, snatches the caterpillar off the floor and
 * carries it away over the trees, and only then does the card come up. The
 * whole business takes CROW.snatchDive plus CROW.snatchAway seconds.
 */
export class Crow {
  readonly group = new THREE.Group();

  private readonly wings: Array<THREE.Group> = [];
  /** Where the beak is, in the bird's own space: what carries the prize. */
  private readonly beak = new THREE.Object3D();

  /** Seconds into the snatch, or null when there is nothing going on. */
  private t: number | null = null;
  private readonly from = new THREE.Vector3();
  private readonly grabAt = new THREE.Vector3();
  private readonly away = new THREE.Vector3();
  /** Bent through this to make the dive a swoop rather than a straight line. */
  private readonly control = new THREE.Vector3();
  private readonly here = new THREE.Vector3();
  private readonly wasHere = new THREE.Vector3();
  private beat = 0;

  constructor() {
    const parts: Array<THREE.BufferGeometry> = [];

    // Body: a long egg, nose forward. Crows are all body and tail from the
    // side, with the head barely a bulge on the front of it.
    const body = new THREE.SphereGeometry(0.52, 12, 9);
    body.scale(1, 0.94, 1.65);
    parts.push(paint(body, CROW.feather));

    const head = new THREE.SphereGeometry(0.35, 10, 8);
    head.translate(0, 0.16, 0.8);
    parts.push(paint(head, CROW.feather));

    // The beak: two cones nose to nose is a beak, one cone is a party hat.
    const upper = new THREE.ConeGeometry(0.13, 0.5, 6);
    upper.rotateX(Math.PI / 2);
    upper.translate(0, 0.18, 1.26);
    parts.push(paint(upper, CROW.beak));
    const lower = new THREE.ConeGeometry(0.11, 0.44, 6);
    lower.rotateX(Math.PI / 2);
    lower.translate(0, 0.07, 1.23);
    parts.push(paint(lower, CROW.beak));

    // Tail: a flat wedge, as long as the body. It is what makes the silhouette
    // read as a corvid rather than as a pigeon.
    const tail = new THREE.CylinderGeometry(0.3, 0.16, 1.1, 4);
    tail.rotateX(Math.PI / 2);
    tail.scale(1, 0.16, 1);
    tail.translate(0, 0.02, -1.3);
    parts.push(paint(tail, CROW.feather));

    for (const side of [-1, 1]) {
      const eye = new THREE.SphereGeometry(0.085, 6, 5);
      eye.translate(side * 0.21, 0.26, 0.99);
      parts.push(paint(eye, CROW.eye));
    }

    const merged = mergeGeometries(parts);
    if (!merged) {
      throw new Error("could not merge the crow");
    }
    const bird = new THREE.Mesh(merged, vertexToon());
    bird.castShadow = true;
    this.group.add(bird);

    // Wings hinge at the shoulder, so a beat is a rotation of the hinge and
    // never touches the bird's own transform.
    for (const side of [-1, 1]) {
      const hinge = new THREE.Group();
      hinge.position.set(side * 0.36, 0.18, 0.1);
      // Both sides, and it matters twice over. A wing is a flat cut-out, so
      // from underneath — which is where the player is for the whole of the
      // snatch — a front-facing one is not there at all. And the left wing is
      // the right one mirrored, which reverses its winding, so it faces the
      // wrong way even from above. Either alone leaves the bird looking as
      // though it has one wing or none.
      const material = vertexToon();
      material.side = THREE.DoubleSide;
      const wing = new THREE.Mesh(wingShape(side), material);
      wing.castShadow = true;
      hinge.add(wing);
      this.group.add(hinge);
      this.wings.push(hinge);
    }

    this.beak.position.set(0, 0.1, 1.44);
    this.group.add(this.beak);

    this.group.scale.setScalar(CROW.birdSize);
    this.group.visible = false;
  }

  /** True from the moment it stoops to the moment it is gone. */
  get busy(): boolean {
    return this.t !== null;
  }

  /** True once it has the caterpillar in its beak. */
  get holding(): boolean {
    return this.t !== null && this.t >= CROW.snatchDive;
  }

  /** True when the whole business is over and the card can come up. */
  get finished(): boolean {
    return this.t !== null && this.t >= CROW.snatchDive + CROW.snatchAway;
  }

  /** Where the beak is in the world: where a caught caterpillar hangs from. */
  carryPoint(out: THREE.Vector3): THREE.Vector3 {
    return this.beak.getWorldPosition(out);
  }

  /**
   * Come down on `at` and take whatever is standing there.
   *
   * `bearing` is the line it flies along, which the caller takes from wherever
   * its shadow had got to — so the bird arrives from the direction the child
   * has been watching go round, rather than out of nowhere.
   */
  snatch(at: THREE.Vector3, bearing: number): void {
    this.t = 0;
    const dirX = Math.sin(bearing);
    const dirZ = Math.cos(bearing);
    // Short of the caterpillar by the length of the beak, so it is the beak
    // that arrives on it — see CROW.beakReach.
    this.grabAt.set(
      at.x - dirX * CROW.beakReach,
      at.y + CROW.grabLift,
      at.z - dirZ * CROW.beakReach,
    );
    // In from one side and high up, out the other side and higher still.
    this.from.set(
      at.x - dirX * CROW.stoopFrom,
      at.y + CROW.stoopHeight,
      at.z - dirZ * CROW.stoopFrom,
    );
    this.away.set(
      at.x + dirX * CROW.awayOut,
      at.y + CROW.awayHeight,
      at.z + dirZ * CROW.awayOut,
    );
    // The control point sits out along the run and low, which is what bends
    // the descent into a stoop that levels off at the floor instead of
    // arriving like a dropped stone.
    this.control.set(
      at.x - dirX * CROW.stoopFrom * 0.35,
      at.y + CROW.stoopHeight * 0.25,
      at.z - dirZ * CROW.stoopFrom * 0.35,
    );
    this.group.visible = true;
    this.group.position.copy(this.from);
    this.wasHere.copy(this.from);
  }

  update(dt: number): void {
    if (this.t === null) {
      return;
    }
    this.t += dt;
    this.wasHere.copy(this.group.position);

    if (this.t < CROW.snatchDive) {
      // The stoop, along a curve that flattens out at the bottom.
      const p = this.t / CROW.snatchDive;
      bezier(this.from, this.control, this.grabAt, p, this.here);
      this.group.position.copy(this.here);
      // Wings held back and barely beating: a stooping bird is falling, not
      // flying, and a full flap on the way down reads as a bird going up.
      this.beat += dt * CROW.beatHz * Math.PI;
      this.setWings(-0.5 + 0.18 * Math.sin(this.beat), 0.55);
    } else {
      // Away with it, climbing, wings working hard.
      const p = Math.min(1, (this.t - CROW.snatchDive) / CROW.snatchAway);
      // Eased so it leaves heavily and then gathers speed, the way something
      // carrying more than it wants to does.
      const eased = p * p * (3 - 2 * p);
      this.here.copy(this.grabAt).lerp(this.away, eased);
      // A shallow lift out of the grab before the climb proper, so it does not
      // turn a corner at the floor.
      this.here.y += Math.sin(Math.min(1, p * 2) * Math.PI) * CROW.awayScoop;
      this.group.position.copy(this.here);
      this.beat += dt * CROW.beatHz * Math.PI * 2 * 1.6;
      this.setWings(0.35 * Math.sin(this.beat), 1);
    }

    // Facing the way it is going. Taken from where it actually moved rather
    // than from the path, so the turn out of the stoop is the real one.
    this.here.subVectors(this.group.position, this.wasHere);
    if (this.here.lengthSq() > 1e-6) {
      this.group.rotation.y = Math.atan2(this.here.x, this.here.z);
      this.group.rotation.x = -Math.atan2(
        this.here.y,
        Math.hypot(this.here.x, this.here.z),
      );
    }
  }

  /** Puts the bird away again. */
  reset(): void {
    this.t = null;
    this.group.visible = false;
  }

  /** `lift` is the beat; `spread` how far the wings are held out. */
  private setWings(lift: number, spread: number): void {
    for (let i = 0; i < this.wings.length; i++) {
      const side = i === 0 ? -1 : 1;
      this.wings[i].rotation.z = side * lift;
      this.wings[i].scale.setScalar(spread);
    }
  }
}

/** One wing: swept back, fingered at the tip, hinged at the shoulder. */
function wingShape(side: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, 0.28);
  s.quadraticCurveTo(0.8, 0.36, 1.45, 0.06);
  // The primaries, splayed — the same four fingers the shadow has, because it
  // is the same bird and a child may well see both.
  s.lineTo(1.8, -0.06);
  s.lineTo(1.68, -0.17);
  s.lineTo(1.74, -0.32);
  s.lineTo(1.47, -0.32);
  s.lineTo(1.45, -0.46);
  s.lineTo(1.2, -0.4);
  s.quadraticCurveTo(0.62, -0.52, 0.06, -0.26);
  s.lineTo(0, 0.28);

  const geo = new THREE.ShapeGeometry(s, 10);
  // Flat, and lying out to the side of the bird rather than in front of it.
  geo.rotateX(Math.PI / 2);
  if (side < 0) {
    geo.scale(-1, 1, 1);
  }
  return paint(geo, CROW.feather);
}

/** A point along the quadratic through a, b, c. */
function bezier(
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  t: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  const u = 1 - t;
  return out
    .copy(a)
    .multiplyScalar(u * u)
    .addScaledVector(b, 2 * u * t)
    .addScaledVector(c, t * t);
}
