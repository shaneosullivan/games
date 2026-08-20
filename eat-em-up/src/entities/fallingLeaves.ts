import * as THREE from "three";
import {FALLING_LEAVES, WORLD} from "../config";
import {Rng} from "../core/rng";
import {Forest} from "./forest";
import leaf1Url from "../assets/leaf1.png";
import leaf2Url from "../assets/leaf2.png";
import leaf3Url from "../assets/leaf3.png";
import leaf1GreenUrl from "../assets/leaf1-green.png";
import leaf2GreenUrl from "../assets/leaf2-green.png";
import leaf3GreenUrl from "../assets/leaf3-green.png";

/**
 * The six drawn leaves. Three are the bee game's, which has the same ones
 * falling through its woods; three are those same pictures with their hue
 * rotated into leaf green, so what comes down is a mix rather than a
 * permanent autumn in a summer forest.
 *
 * They are pictures rather than built shapes because at this size a picture
 * simply looks better than anything a handful of merged primitives can be
 * talked into. All six are square, which is what lets one plane geometry
 * serve them all.
 */
const LEAF_URLS = [
  leaf1Url,
  leaf2Url,
  leaf3Url,
  leaf1GreenUrl,
  leaf2GreenUrl,
  leaf3GreenUrl,
];

/** One leaf on its way down, or lying where it landed. */
interface Leaf {
  /** Dead leaves are the pool's spare capacity, waiting to be spawned. */
  alive: boolean;
  position: THREE.Vector3;
  /** Where it started, so the sway is measured from a fixed line rather than
   *  compounding into a drift across the wood. */
  originX: number;
  originZ: number;
  phase: number;
  /** Which way it tumbles, and how far through that tumble it is. */
  spin: THREE.Vector3;
  angle: number;
  /** Counts down once it has landed. */
  settle: number;
}

interface Variant {
  mesh: THREE.InstancedMesh;
  leaves: Array<Leaf>;
}

/**
 * Leaves drifting down out of the canopy.
 *
 * Nothing in the game depends on them; they are here because a wood with
 * nothing moving in it looks like a model of a wood. One instanced mesh per
 * colour, and a fixed pool of leaves reused for ever — a leaf that lands is
 * not destroyed, it goes back in the pool and waits its turn to fall again.
 */
export class FallingLeaves {
  readonly group = new THREE.Group();

  private readonly variants: Array<Variant> = [];
  /** Trees near enough the middle of the wood to be worth dropping from. */
  private readonly sources: Array<{
    x: number;
    z: number;
    y: number;
    spread: number;
  }> = [];
  private nextDrop = 0;

  private readonly matrix = new THREE.Matrix4();
  private readonly quat = new THREE.Quaternion();
  private readonly scaleVec = new THREE.Vector3();

  constructor(
    private readonly rng: Rng,
    forest: Forest,
  ) {
    for (const spot of forest.treeSpots) {
      if (spot.climbTop === undefined) {
        continue;
      }
      // Only trees inside the playable disc: a leaf falling out beyond the
      // boundary ring is one nobody will ever see.
      if (Math.hypot(spot.x, spot.z) > WORLD.radius - 2) {
        continue;
      }
      this.sources.push({
        x: spot.x,
        z: spot.z,
        y: spot.climbTop,
        spread: spot.radius,
      });
    }

    // One plane and one loader for all three, each with its own picture.
    const plane = new THREE.PlaneGeometry(
      FALLING_LEAVES.size,
      FALLING_LEAVES.size,
    );
    const loader = new THREE.TextureLoader();
    const per = Math.ceil(FALLING_LEAVES.pool / LEAF_URLS.length);
    for (const url of LEAF_URLS) {
      const map = loader.load(url);
      // Without this the PNGs come back washed out — they are authored in sRGB
      // and the renderer works in linear.
      map.colorSpace = THREE.SRGBColorSpace;
      const mesh = new THREE.InstancedMesh(
        plane,
        new THREE.MeshBasicMaterial({
          map,
          alphaTest: FALLING_LEAVES.alphaTest,
          // A tumbling leaf shows both of its faces.
          side: THREE.DoubleSide,
          fog: true,
        }),
        per,
      );
      // They are scattered across the whole wood and are never a big enough
      // part of the frame for culling to be worth the risk of popping.
      mesh.frustumCulled = false;
      const leaves: Array<Leaf> = [];
      for (let i = 0; i < per; i++) {
        leaves.push({
          alive: false,
          position: new THREE.Vector3(),
          originX: 0,
          originZ: 0,
          phase: 0,
          spin: new THREE.Vector3(0, 1, 0),
          angle: 0,
          settle: 0,
        });
      }
      this.variants.push({mesh, leaves});
      this.group.add(mesh);
      // Everything starts scaled away; an untouched instance would otherwise
      // draw at full size at the origin.
      for (let i = 0; i < per; i++) {
        this.hide(mesh, i);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }

    this.nextDrop = this.rng.range(0, FALLING_LEAVES.intervalMax);
  }

  /** `near` is the caterpillar: leaves fall from the trees around it. */
  /**
   * `near` is the caterpillar and `forward` is the way the camera is looking.
   * Leaves fall from the trees around the player, and by preference from the
   * ones in front of them.
   */
  update(dt: number, near: THREE.Vector3, forward: THREE.Vector3): void {
    this.nextDrop -= dt;
    if (this.nextDrop <= 0) {
      this.drop(near, forward);
      this.nextDrop = this.rng.range(
        FALLING_LEAVES.intervalMin,
        FALLING_LEAVES.intervalMax,
      );
    }

    for (const variant of this.variants) {
      let touched = false;
      variant.leaves.forEach((leaf, i) => {
        if (!leaf.alive) {
          return;
        }
        touched = true;

        if (leaf.settle > 0) {
          // Landed: lying on the floor, shrinking away.
          leaf.settle -= dt;
          if (leaf.settle <= 0) {
            leaf.alive = false;
            this.hide(variant.mesh, i);
            return;
          }
          this.write(
            variant.mesh,
            i,
            leaf,
            leaf.settle / FALLING_LEAVES.settle,
          );
          return;
        }

        leaf.position.y -= FALLING_LEAVES.fallSpeed * dt;
        leaf.phase += FALLING_LEAVES.swayRate * dt;
        leaf.angle += FALLING_LEAVES.spinRate * dt;
        // Swayed about the line it fell from, rather than nudged each step —
        // nudging accumulates, and the leaves all end up drifting one way.
        leaf.position.x =
          leaf.originX + Math.sin(leaf.phase) * FALLING_LEAVES.swayAmount;
        leaf.position.z =
          leaf.originZ + Math.cos(leaf.phase * 0.7) * FALLING_LEAVES.swayAmount;

        if (leaf.position.y <= 0.04) {
          leaf.position.y = 0.04;
          leaf.settle = FALLING_LEAVES.settle;
          // Flat on the floor once it is down.
          leaf.spin.set(1, 0, 0);
          leaf.angle = Math.PI / 2;
        }
        this.write(variant.mesh, i, leaf, 1);
      });
      if (touched) {
        variant.mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }

  /** Lets one leaf go from a tree near the caterpillar. */
  private drop(near: THREE.Vector3, forward: THREE.Vector3): void {
    if (this.sources.length === 0) {
      return;
    }
    const variant = this.rng.pick(this.variants);
    const leaf = variant.leaves.find(l => !l.alive);
    if (!leaf) {
      // Every leaf in this colour is already falling; the next tick will do.
      return;
    }
    // Near, and in front of the camera rather than behind it.
    //
    // Near on its own was not enough: with leaves let go from any tree within
    // range, a count of the ones actually inside the camera's frustum averaged
    // half a leaf. Most of the wood, at any moment, is behind you.
    const close = this.sources.filter(s2 => {
      const dx = s2.x - near.x;
      const dz = s2.z - near.z;
      const d = Math.hypot(dx, dz);
      if (d > FALLING_LEAVES.nearPlayer) {
        return false;
      }
      // Anything roughly ahead counts, and so does anything right beside the
      // player — a leaf coming down alongside is still in shot.
      return d < 6 || (dx * forward.x + dz * forward.z) / d > -0.1;
    });
    const from = this.rng.pick(close.length > 0 ? close : this.sources);
    leaf.alive = true;
    leaf.settle = 0;
    leaf.originX = from.x + this.rng.range(-from.spread, from.spread);
    leaf.originZ = from.z + this.rng.range(-from.spread, from.spread);
    leaf.phase = this.rng.next() * Math.PI * 2;
    leaf.angle = this.rng.next() * Math.PI * 2;
    leaf.spin
      .set(this.rng.range(-1, 1), this.rng.range(-1, 1), this.rng.range(-1, 1))
      .normalize();
    leaf.position.set(
      leaf.originX,
      from.y +
        this.rng.range(FALLING_LEAVES.dropFromMin, FALLING_LEAVES.dropFromMax),
      leaf.originZ,
    );
  }

  private write(
    mesh: THREE.InstancedMesh,
    index: number,
    leaf: Leaf,
    scale: number,
  ): void {
    this.quat.setFromAxisAngle(leaf.spin, leaf.angle);
    this.scaleVec.set(scale, scale, scale);
    this.matrix.compose(leaf.position, this.quat, this.scaleVec);
    mesh.setMatrixAt(index, this.matrix);
  }

  private hide(mesh: THREE.InstancedMesh, index: number): void {
    this.matrix.compose(
      this.scaleVec.set(0, 0, 0),
      this.quat.identity(),
      this.scaleVec.set(0, 0, 0),
    );
    mesh.setMatrixAt(index, this.matrix);
  }
}
