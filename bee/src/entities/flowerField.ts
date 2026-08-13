import * as THREE from "three";
import {POLLEN_KINDS, WORLD, type PollenKind} from "../config";
import type {Rng} from "../core/rng";
import {createFlowerGeometry} from "../render/geometry/flower";
import {vertexToon} from "../render/materials";

interface Flower {
  kind: PollenKind;
  index: number;
  position: THREE.Vector3;
  headY: number;
  scale: number;
  yaw: number;
  /** Seconds until it blooms again; 0 means ready. */
  cooldown: number;
  /** 0..1 visual bloom, eased toward `cooldown === 0 ? 1 : 0`. */
  bloom: number;
}

export interface HarvestEvent {
  kind: PollenKind;
  position: THREE.Vector3;
}

const m = new THREE.Matrix4();
const q = new THREE.Quaternion();
const v = new THREE.Vector3();
const s = new THREE.Vector3();

/**
 * All flowers in the meadow. Each kind is two InstancedMeshes (stem, head), so
 * the whole field is six draw calls no matter how many flowers there are.
 */
export class FlowerField {
  readonly group = new THREE.Group();
  private readonly flowers: Array<Flower> = [];
  private readonly heads = new Map<PollenKind, THREE.InstancedMesh>();

  /** Progress toward harvesting whatever the bee is currently hovering over. */
  private hoverTarget: Flower | null = null;
  private hoverTime = 0;

  constructor(rng: Rng) {
    for (const kind of POLLEN_KINDS) {
      const geo = createFlowerGeometry(kind);
      const count = WORLD.flowerCount[kind];

      const stems = new THREE.InstancedMesh(geo.stem, vertexToon(), count);
      const headMesh = new THREE.InstancedMesh(geo.head, vertexToon(), count);
      headMesh.castShadow = true;
      stems.castShadow = true;
      this.group.add(stems, headMesh);
      this.heads.set(kind, headMesh);

      for (let i = 0; i < count; i++) {
        // Rejection-sample so flowers don't crowd the hive site at the origin.
        let x = 0;
        let z = 0;
        for (let tries = 0; tries < 24; tries++) {
          const a = rng.range(0, Math.PI * 2);
          const r = 6 + Math.sqrt(rng.next()) * (WORLD.radius - 8);
          x = Math.cos(a) * r;
          z = Math.sin(a) * r;
          if (
            this.flowers.every(
              f => f.position.distanceToSquared(v.set(x, 0, z)) > 9,
            )
          ) {
            break;
          }
        }
        // Deliberately oversized: at cruising altitude a life-size flower is
        // a few pixels, and the whole loop is "spot a flower, fly to it".
        const scale = rng.range(1.5, 2.1);
        const flower: Flower = {
          kind,
          index: i,
          position: new THREE.Vector3(x, 0, z),
          headY: geo.headHeight * scale,
          scale,
          yaw: rng.range(0, Math.PI * 2),
          cooldown: 0,
          bloom: 1,
        };
        this.flowers.push(flower);

        q.setFromEuler(new THREE.Euler(0, flower.yaw, 0));
        m.compose(flower.position, q, s.setScalar(scale));
        stems.setMatrixAt(i, m);
      }
      stems.instanceMatrix.needsUpdate = true;
      this.writeHead(kind);
    }
  }

  private writeHead(kind: PollenKind): void {
    const mesh = this.heads.get(kind)!;
    for (const f of this.flowers) {
      if (f.kind !== kind) {
        continue;
      }
      q.setFromEuler(new THREE.Euler(0, f.yaw, 0));
      // A ready flower gently pulses so it reads as harvestable from the air.
      const pulse =
        f.bloom >= 0.999
          ? 1 + Math.sin(performance.now() * 0.003 + f.index) * 0.04
          : 1;
      const size = f.scale * f.bloom * pulse;
      v.set(f.position.x, f.headY * (0.4 + 0.6 * f.bloom), f.position.z);
      m.compose(v, q, s.setScalar(Math.max(0.0001, size)));
      mesh.setMatrixAt(f.index, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Advance regrowth and harvesting. Returns a harvest event on the frame the
   * bee finishes gathering, otherwise null.
   */
  update(dt: number, beePosition: THREE.Vector3): HarvestEvent | null {
    for (const f of this.flowers) {
      if (f.cooldown > 0) {
        f.cooldown = Math.max(0, f.cooldown - dt);
      }
      const target = f.cooldown > 0 ? 0 : 1;
      f.bloom +=
        (target - f.bloom) * Math.min(1, dt * (target === 1 ? 2.4 : 9));
    }

    const nearest = this.nearestReady(beePosition);
    if (nearest !== this.hoverTarget) {
      this.hoverTarget = nearest;
      this.hoverTime = 0;
    }

    let event: HarvestEvent | null = null;
    if (this.hoverTarget) {
      this.hoverTime += dt;
      if (this.hoverTime >= WORLD.harvestSeconds) {
        const f = this.hoverTarget;
        f.cooldown = WORLD.regrowSeconds;
        f.bloom = 0.999;
        event = {
          kind: f.kind,
          position: new THREE.Vector3(f.position.x, f.headY, f.position.z),
        };
        this.hoverTarget = null;
        this.hoverTime = 0;
      }
    }

    for (const kind of POLLEN_KINDS) {
      this.writeHead(kind);
    }
    return event;
  }

  /** 0..1 progress on the flower currently being gathered, for the HUD ring. */
  get harvestProgress(): number {
    if (!this.hoverTarget) {
      return 0;
    }
    return Math.min(1, this.hoverTime / WORLD.harvestSeconds);
  }

  get hoveredKind(): PollenKind | null {
    return this.hoverTarget?.kind ?? null;
  }

  private nearestReady(bee: THREE.Vector3): Flower | null {
    let best: Flower | null = null;
    let bestDist = WORLD.harvestRadius * WORLD.harvestRadius;
    for (const f of this.flowers) {
      if (f.cooldown > 0 || f.bloom < 0.99) {
        continue;
      }
      if (Math.abs(bee.y - f.headY) > WORLD.harvestHeight) {
        continue;
      }
      const dx = bee.x - f.position.x;
      const dz = bee.z - f.position.z;
      const d = dx * dx + dz * dz;
      if (d < bestDist) {
        bestDist = d;
        best = f;
      }
    }
    return best;
  }

  /** Nearest ready flower of a kind, for the objective arrow. */
  nearestOfKind(kind: PollenKind, from: THREE.Vector3): THREE.Vector3 | null {
    let best: Flower | null = null;
    let bestDist = Infinity;
    for (const f of this.flowers) {
      if (f.kind !== kind || f.cooldown > 0) {
        continue;
      }
      const d = f.position.distanceToSquared(from);
      if (d < bestDist) {
        bestDist = d;
        best = f;
      }
    }
    return best
      ? new THREE.Vector3(best.position.x, best.headY, best.position.z)
      : null;
  }
}
