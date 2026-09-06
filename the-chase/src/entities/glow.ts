import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {GLOW, WOOD} from "../config";
import {Rng} from "../core/rng";
import {Wood} from "./wood";
import {glowTexture, paint, PALETTE} from "../render/materials";

/**
 * The magic in the wood: fireflies, and shafts of light through the leaves.
 *
 * The plan asks for somewhere "friendly and almost magical", and this is what
 * does it. Both are cheap and both are doing the same job — a wood is a few
 * hundred brown trunks, and on its own that is a car park.
 */
export class Glow {
  /** The motes that drift about you. */
  readonly flies: THREE.Points;
  /** The light coming down through the canopy, fixed where it falls. */
  readonly shafts: THREE.Mesh;

  private readonly positions: Float32Array;
  private readonly drift: Float32Array;
  private readonly phase: Float32Array;
  private time = 0;
  private readonly centre = new THREE.Vector3();

  constructor(rng: Rng, wood: Wood) {
    const n = GLOW.flies;
    this.positions = new Float32Array(n * 3);
    this.drift = new Float32Array(n);
    this.phase = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.positions[i * 3] = rng.range(-GLOW.radius, GLOW.radius);
      this.positions[i * 3 + 1] = rng.range(0, GLOW.height);
      this.positions[i * 3 + 2] = rng.range(-GLOW.radius, GLOW.radius);
      this.drift[i] = GLOW.drift * rng.range(0.4, 1);
      this.phase[i] = rng.range(0, Math.PI * 2);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.flies = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: GLOW.size,
        map: glowTexture(),
        color: PALETTE.fly,
        transparent: true,
        depthWrite: false,
        // Added rather than blended, so two behind a leaf are brighter than
        // one — which is what a light is and what a painted dot is not.
        blending: THREE.AdditiveBlending,
        // Not fogged: the fog is what the far wood fades into, and fogging the
        // motes in front of the lens faded out the only ones anybody sees.
        fog: false,
        sizeAttenuation: true,
      }),
    );
    // The box moves every frame and its bounds are a lie by design; culling it
    // against them would blink the whole swarm in and out.
    this.flies.frustumCulled = false;

    this.shafts = this.buildShafts(rng, wood);
  }

  /**
   * `at` is where the swarm should be centred — the hare, so the fireflies are
   * always the ones you are running through.
   */
  update(dt: number, at: THREE.Vector3): void {
    this.time += dt;
    this.centre.copy(at);
    const r = GLOW.radius;
    const h = GLOW.height;

    for (let i = 0; i < GLOW.flies; i++) {
      const j = i * 3;
      // Wandering rather than falling. Two sines at different rates, so no
      // mote retraces its own path.
      const t = this.time * 0.5 + this.phase[i];
      this.positions[j] += Math.sin(t) * this.drift[i] * dt;
      this.positions[j + 1] += Math.sin(t * GLOW.bobRate * 2) * GLOW.bob * dt;
      this.positions[j + 2] += Math.cos(t * 0.8) * this.drift[i] * dt;

      // Wrapping, in the box's own frame. Done as a remainder about the centre
      // rather than as a test against the walls, so a mote that is suddenly a
      // long way outside — which is what the start of a run does — comes back
      // in one step instead of drifting home over several seconds.
      let dx = this.positions[j] - this.centre.x;
      let dy = this.positions[j + 1] - this.centre.y;
      let dz = this.positions[j + 2] - this.centre.z;
      if (dx > r) {
        dx -= 2 * r;
      } else if (dx < -r) {
        dx += 2 * r;
      }
      if (dz > r) {
        dz -= 2 * r;
      } else if (dz < -r) {
        dz += 2 * r;
      }
      if (dy < -h * 0.2) {
        dy += h;
      } else if (dy > h * 0.8) {
        dy -= h;
      }
      this.positions[j] = this.centre.x + dx;
      this.positions[j + 1] = this.centre.y + dy;
      this.positions[j + 2] = this.centre.z + dz;
    }
    this.flies.geometry.attributes.position.needsUpdate = true;
  }

  /**
   * The shafts of light.
   *
   * Fixed where they fall, not following the camera: a beam of sun through a
   * gap in the leaves comes from a hole in the canopy, and one that travelled
   * with you would be a torch. Cones, widening downward, added rather than
   * blended, merged into a single draw call for the whole wood.
   */
  private buildShafts(rng: Rng, wood: Wood): THREE.Mesh {
    const parts: Array<THREE.BufferGeometry> = [];
    // Spread down the whole run rather than round the start, since they do not
    // move.
    const count = Math.round(WOOD.length / GLOW.shaftEvery);
    for (let i = 0; i < count; i++) {
      const z = rng.range(20, -WOOD.length + 20);
      const x = wood.pathAt(z) + rng.range(-1, 1) * GLOW.shaftSpread;
      const height = GLOW.shaftHeight * rng.range(0.8, 1.25);
      const radius = GLOW.shaftRadius * rng.range(0.7, 1.35);
      // Open at the bottom and pointed at the top, and leaning a little, the
      // way light does when the sun is not overhead.
      // Sixteen sides, not seven. A shaft of light has no facets in it, and
      // at seven the flat panels of the cone read as panes of glass leaning
      // against the trees.
      const cone = new THREE.ConeGeometry(radius, height, 16, 1, true);
      cone.rotateX(rng.range(-0.12, 0.12));
      cone.rotateZ(rng.range(-0.18, 0.18));
      cone.translate(x, wood.heightAt(x, z) + height / 2, z);
      parts.push(paint(cone, 0xfff3c9));
    }

    const mesh = new THREE.Mesh(
      mergeGeometries(parts, false),
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: GLOW.shaftOpacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        // Front faces only. Double-sided doubles what every shaft adds along a
        // line of sight, and with additive blending that is the difference
        // between light and a white cone.
        side: THREE.FrontSide,
      }),
    );
    mesh.frustumCulled = false;
    // Drawn after the wood, so a shaft never hides a tree behind it. An
    // additive transparent thing that writes no depth still has to be sorted
    // late or it lights up whatever is in front of it as well as behind.
    mesh.renderOrder = 2;
    return mesh;
  }
}
