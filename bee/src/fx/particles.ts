import * as THREE from "three";

export interface BurstOptions {
  /** One colour, or a palette sampled per particle. */
  color: number | ReadonlyArray<number>;
  count?: number;
  /** Outward launch speed. */
  speed?: number;
  /** Extra upward bias on launch. */
  lift?: number;
  gravity?: number;
  /** Seconds each particle lives. */
  ttl?: number;
  /** Particle size multiplier. */
  size?: number;
  /** 0 = flat puff, 1 = full sphere. Fireworks want a sphere. */
  spherical?: number;
}

/**
 * A pool of instanced motes shared by every particle effect. One InstancedMesh
 * per pool, so a whole firework show is a single draw call.
 */
export class ParticleBurst {
  readonly mesh: THREE.InstancedMesh;

  private readonly pos: Array<THREE.Vector3> = [];
  private readonly vel: Array<THREE.Vector3> = [];
  private readonly colors: Array<THREE.Color> = [];
  private readonly life: Array<number> = [];
  private readonly ttl: Array<number> = [];
  private readonly gravity: Array<number> = [];
  private readonly size: Array<number> = [];
  private cursor = 0;

  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();

  constructor(
    private readonly max: number,
    radius = 0.09,
    additive = false,
  ) {
    const geo = new THREE.IcosahedronGeometry(radius, 0);
    // `vertexColors: true` makes the shader read a `color` attribute. Without
    // one it reads black, and per-instance colour never gets a chance to
    // multiply in — the particles render invisibly (fatally so when additive).
    // A flat white attribute makes instanceColor the only thing that matters.
    const white = new Float32Array(geo.attributes.position.count * 3).fill(1);
    geo.setAttribute("color", new THREE.BufferAttribute(white, 3));

    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(max * 3),
      3,
    );
    this.mesh.frustumCulled = false;

    for (let i = 0; i < max; i++) {
      this.pos.push(new THREE.Vector3());
      this.vel.push(new THREE.Vector3());
      this.colors.push(new THREE.Color());
      this.life.push(0);
      this.ttl.push(1);
      this.gravity.push(5.5);
      this.size.push(1);
    }
    this.hideAll();
  }

  private hideAll(): void {
    this.s.setScalar(0.0001);
    for (let i = 0; i < this.max; i++) {
      this.m.compose(this.pos[i], this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  burst(at: THREE.Vector3, opts: BurstOptions): void {
    const {
      color,
      count = 14,
      speed = 1.6,
      lift = 1.8,
      gravity = 5.5,
      ttl = 0.8,
      size = 1,
      spherical = 0,
    } = opts;
    const palette = Array.isArray(color)
      ? (color as ReadonlyArray<number>)
      : [color as number];

    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;

      this.pos[i].copy(at);

      // Mix a flat ring launch with a spherical one, per `spherical`.
      const a = Math.random() * Math.PI * 2;
      const elev = (Math.random() * 2 - 1) * spherical;
      const horiz = Math.sqrt(Math.max(0, 1 - elev * elev));
      const jitter = 0.55 + Math.random() * 0.7;
      this.vel[i].set(
        Math.cos(a) * horiz * speed * jitter,
        elev * speed * jitter + lift * (0.6 + Math.random() * 0.8),
        Math.sin(a) * horiz * speed * jitter,
      );

      this.colors[i].set(palette[(Math.random() * palette.length) | 0]);
      this.gravity[i] = gravity;
      this.size[i] = size * (0.7 + Math.random() * 0.6);
      this.ttl[i] = ttl * (0.75 + Math.random() * 0.5);
      this.life[i] = this.ttl[i];
    }
  }

  update(dt: number): void {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) {
        continue;
      }
      this.life[i] -= dt;
      this.vel[i].y -= this.gravity[i] * dt;
      this.vel[i].multiplyScalar(1 - 1.4 * dt);
      this.pos[i].addScaledVector(this.vel[i], dt);

      const t = Math.max(0, this.life[i] / this.ttl[i]);
      // Squared fade reads as a spark burning out rather than a linear dissolve.
      const scale = t * t * 1.5 * this.size[i] + 0.0001;
      this.m.compose(this.pos[i], this.q, this.s.setScalar(scale));
      this.mesh.setMatrixAt(i, this.m);
      this.mesh.setColorAt(i, this.colors[i]);

      if (this.life[i] <= 0) {
        this.m.compose(this.pos[i], this.q, this.s.setScalar(0.0001));
        this.mesh.setMatrixAt(i, this.m);
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) {
      this.mesh.instanceColor.needsUpdate = true;
    }
  }
}

/** Pollen motes: small, heavy, single-colour. */
export function createPollenPuff(): ParticleBurst {
  return new ParticleBurst(160, 0.09, false);
}

/**
 * Fireworks: bigger and slow-falling. Deliberately NOT additive — this is a
 * bright daytime sky, and additive sparks saturate straight to white against
 * it. Normal blending keeps every spark its own colour.
 */
export function createFireworks(): ParticleBurst {
  return new ParticleBurst(420, 0.11, false);
}

/** Saturated, no pure white — white sparks vanish against the sky. */
export const FIREWORK_PALETTE = [
  0xff3366, 0xffc300, 0x00b8ff, 0x8a4bff, 0x2fd96b, 0xff6b1a, 0xff5ecf,
] as const;
