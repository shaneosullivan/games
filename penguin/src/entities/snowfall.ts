import * as THREE from "three";
import {SNOWFALL} from "../config";
import {Rng} from "../core/rng";

/**
 * The snow coming down.
 *
 * A box of flakes that travels with whatever it is following and wraps round:
 * there is no point simulating weather over four hundred metres of mountain
 * when the only part anybody can see is the twenty in front of them. A flake
 * that falls out of the bottom of the box comes back in at the top, and one
 * the penguin has driven past comes back round in front of it.
 *
 * Points rather than instanced geometry. Fourteen hundred flakes is fourteen
 * hundred quads either way, and Points gets them for one attribute buffer and
 * a sprite — no per-instance matrix to write every frame, which at this count
 * is the whole cost of the effect.
 */
export class Snowfall {
  readonly points: THREE.Points;

  private readonly positions: Float32Array;
  /** How fast each flake falls and how wide it wanders. Per flake, or the
   *  whole fall moves as one sheet and reads as a curtain. */
  private readonly speed: Float32Array;
  private readonly swing: Float32Array;
  private readonly phase: Float32Array;
  private time = 0;

  private readonly centre = new THREE.Vector3();

  constructor(rng: Rng) {
    const n = SNOWFALL.count;
    this.positions = new Float32Array(n * 3);
    this.speed = new Float32Array(n);
    this.swing = new Float32Array(n);
    this.phase = new Float32Array(n);

    for (let i = 0; i < n; i++) {
      this.positions[i * 3] = rng.range(-SNOWFALL.radius, SNOWFALL.radius);
      this.positions[i * 3 + 1] = rng.range(0, SNOWFALL.height);
      this.positions[i * 3 + 2] = rng.range(-SNOWFALL.radius, SNOWFALL.radius);
      this.speed[i] = SNOWFALL.fall * rng.range(0.6, 1.4);
      this.swing[i] = SNOWFALL.drift * rng.range(0.3, 1);
      this.phase[i] = rng.range(0, Math.PI * 2);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));

    const mat = new THREE.PointsMaterial({
      size: SNOWFALL.size,
      map: flakeTexture(),
      transparent: true,
      depthWrite: false,
      // Unlit on purpose: a flake a few centimetres across in front of a
      // camera has no shading worth having, and lighting them made the snow
      // go grey on the shaded side of the valley.
      color: 0xffffff,
      // Not fogged. The fog is what the far mountain fades into, and fogging
      // the flakes in front of the lens faded out the nearest ones, which are
      // the only ones the eye actually registers.
      fog: false,
      sizeAttenuation: true,
    });

    this.points = new THREE.Points(geo, mat);
    // The box moves every frame and its bounds are a lie by design; culling it
    // against them would blink the whole snowfall in and out.
    this.points.frustumCulled = false;
  }

  /**
   * `at` is where the weather should be centred — the camera, biased forward
   * so most of the box is in front of the lens rather than behind it.
   */
  update(dt: number, at: THREE.Vector3): void {
    this.time += dt;
    this.centre.copy(at);
    const r = SNOWFALL.radius;
    const h = SNOWFALL.height;

    for (let i = 0; i < SNOWFALL.count; i++) {
      const j = i * 3;
      // Falling, and wandering as it falls. Two sines at different rates, so
      // no flake retraces its own path.
      const t = this.time * SNOWFALL.driftRate + this.phase[i];
      this.positions[j] += Math.sin(t) * this.swing[i] * dt;
      this.positions[j + 1] -= this.speed[i] * dt;
      this.positions[j + 2] += Math.cos(t * 0.7) * this.swing[i] * dt;

      // Wrapping, in the box's own frame. Done as a remainder about the
      // centre rather than as a test against the walls, so a flake that is
      // suddenly a long way outside — which is what a jump cut does — comes
      // back in one step instead of drifting home over several seconds.
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
      // Vertically the box hangs above the centre: snow comes from the sky.
      if (dy < -h * 0.25) {
        dy += h;
      } else if (dy > h * 0.75) {
        dy -= h;
      }
      this.positions[j] = this.centre.x + dx;
      this.positions[j + 1] = this.centre.y + dy;
      this.positions[j + 2] = this.centre.z + dz;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}

/** A soft round dot, drawn once into a canvas. A square flake reads as dust. */
let flake: THREE.Texture | null = null;
function flakeTexture(): THREE.Texture {
  if (flake) {
    return flake;
  }
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("no 2d context for a snowflake");
  }
  const half = size / 2;
  const g = ctx.createRadialGradient(half, half, 0, half, half, half);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.45, "rgba(255,255,255,0.85)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  flake = new THREE.CanvasTexture(canvas);
  flake.colorSpace = THREE.SRGBColorSpace;
  return flake;
}
