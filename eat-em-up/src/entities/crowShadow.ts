import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {CROW} from "../config";
import {Rng} from "../core/rng";

/**
 * A crow's shadow crossing the forest floor.
 *
 * Just the shadow. There is no crow above it and nothing happens if it passes
 * over you — the plan's notes have it snatching a caterpillar that fails to
 * hide, which is not built. What it is for is the feeling that the wood has
 * something else in it, once in a long while.
 *
 * Drawn flat on the ground rather than cast: a real shadow would want a light
 * with shadow maps for one dark shape a player may never see. This is a dark
 * patch laid on the floor, unlit and see-through, which reads the same and
 * costs a draw call.
 */
export class CrowShadow {
  readonly group = new THREE.Group();

  private readonly wings: Array<THREE.Mesh> = [];
  /** Seconds until the next one comes over. */
  private wait: number;
  /** How far through a pass it is, or null between them. */
  private crossing: number | null = null;
  private readonly from = new THREE.Vector3();
  private readonly heading = new THREE.Vector3();
  private beat = 0;

  constructor(private readonly rng: Rng) {
    const material = new THREE.MeshBasicMaterial({
      color: 0x101a10,
      transparent: true,
      opacity: CROW.opacity,
      // A shadow must not hide what is behind it, and several of these
      // overlapping should not darken each other in steps.
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const body = new THREE.Mesh(bodyShape(), material);
    this.group.add(body);
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(wingShape(side), material);
      this.group.add(wing);
      this.wings.push(wing);
    }

    this.group.visible = false;
    this.group.scale.setScalar(CROW.size);
    this.wait = this.rng.range(CROW.minGap, CROW.maxGap);
  }

  /** True while a shadow is actually crossing. */
  get passing(): boolean {
    return this.crossing !== null;
  }

  /** `near` is the caterpillar: a shadow nobody sees is not worth having. */
  update(dt: number, near: THREE.Vector3): void {
    if (this.crossing === null) {
      this.wait -= dt;
      if (this.wait <= 0) {
        this.begin(near);
      }
      return;
    }

    this.crossing += dt;
    const t = this.crossing / CROW.crossTime;
    if (t >= 1) {
      this.crossing = null;
      this.group.visible = false;
      this.wait = this.rng.range(CROW.minGap, CROW.maxGap);
      return;
    }

    this.group.position
      .copy(this.from)
      .addScaledVector(this.heading, t * CROW.travel);
    this.group.position.y = CROW.height;

    // The wings beat by folding along the body rather than flapping up and
    // down: seen from directly above, which is what a shadow on the ground is,
    // that is what a wing beat looks like.
    this.beat += dt * CROW.beatHz * Math.PI * 2;
    const fold = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(this.beat));
    for (const wing of this.wings) {
      wing.scale.z = fold;
    }
  }

  /** Sends one over, on a line that passes close by the caterpillar. */
  private begin(near: THREE.Vector3): void {
    const bearing = this.rng.next() * Math.PI * 2;
    this.heading.set(Math.sin(bearing), 0, Math.cos(bearing));
    // Offset the line sideways a little, so it passes by rather than exactly
    // overhead every time.
    const side = this.rng.range(-CROW.nearMiss, CROW.nearMiss);
    const closest = new THREE.Vector3(
      near.x - this.heading.z * side,
      0,
      near.z + this.heading.x * side,
    );
    this.from.copy(closest).addScaledVector(this.heading, -CROW.travel / 2);
    this.group.position.copy(this.from);
    this.group.position.y = CROW.height;
    this.group.rotation.y = bearing;
    this.group.visible = true;
    this.crossing = 0;
  }
}

/** The body and tail, lying flat in the XZ plane. */
function bodyShape(): THREE.BufferGeometry {
  const body = new THREE.CircleGeometry(0.32, 14);
  body.scale(0.5, 1, 1);
  body.rotateX(-Math.PI / 2);

  const tail = new THREE.CircleGeometry(0.22, 3);
  tail.scale(0.55, 1, 1);
  tail.rotateX(-Math.PI / 2);
  tail.rotateY(Math.PI);
  tail.translate(0, 0, -0.42);

  const head = new THREE.CircleGeometry(0.12, 10);
  head.rotateX(-Math.PI / 2);
  head.translate(0, 0, 0.34);

  const geo = mergeGeometries([body, tail, head]);
  if (!geo) {
    throw new Error("could not merge crow shadow body");
  }
  return geo;
}

/** One wing, swept back from the body, hinged at nothing — the render folds it
 *  by scaling it along the bird's own axis. */
function wingShape(side: number): THREE.BufferGeometry {
  // An ellipse rather than a triangle. A three-sided circle is cheaper and
  // from above it read as a paper dart: the outline of a wing is what makes a
  // dark patch on the ground a bird rather than a shape.
  const wing = new THREE.CircleGeometry(0.66, 14);
  wing.scale(1, 1, 0.3);
  wing.rotateX(-Math.PI / 2);
  wing.translate(0.62, 0, 0);
  // Swept back from the shoulder, and mirrored for the other side.
  wing.rotateY(-0.5);
  if (side < 0) {
    wing.scale(-1, 1, 1);
  }
  wing.translate(0, 0, 0.02);
  return wing;
}
