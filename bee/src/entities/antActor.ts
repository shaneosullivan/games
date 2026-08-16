import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {ANT_HUNT as A, ANT_PALETTE as P, type PollenKind} from "../config";
import type {Rng} from "../core/rng";
import {createFlowerGeometry} from "../render/geometry/flower";
import {paint, vertexToon} from "../render/materials";

/** What an ant is carrying, and what the queen is here to take off it. */
export type CargoKind = PollenKind | "honey";

type State = "wandering" | "fleeing" | "entering" | "gone";

const tmp = new THREE.Vector3();

/**
 * A big ant with something on its back.
 *
 * It runs about its own island, turning rather than pivoting, so it has a
 * direction you can lead — the level is a chase, and a thing that changed
 * heading instantly would be impossible to catch with a swinging net.
 *
 * Robbed of its cargo it stops wandering and runs flat out for the ant hill,
 * where it shrinks into the hole and is gone. It doesn't come back: an island
 * has more ants than the quota, so what is lost is a little of the margin
 * rather than a chance to finish.
 */
export class AntActor {
  readonly group = new THREE.Group();
  /** Where the cargo rides, so the level can test the net against it. */
  readonly cargoPosition = new THREE.Vector3();

  private state: State = "wandering";
  private heading: number;
  private wanderLeft = 0;
  private target = new THREE.Vector3();
  private stateTime = 0;
  private walk = 0;

  private readonly body: THREE.Mesh;
  private cargo: THREE.Object3D | null = null;

  constructor(
    readonly kind: CargoKind,
    private readonly island: {centre: THREE.Vector3; hill: THREE.Vector3},
    private readonly rng: Rng,
    at: THREE.Vector3,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
  ) {
    this.body = new THREE.Mesh(geometry, material);
    this.body.castShadow = true;
    this.group.add(this.body);
    this.group.position.copy(at);
    this.heading = rng.range(0, Math.PI * 2);
    this.pickTarget();

    this.cargo = createCargo(kind);
    this.cargo.position.y = A.cargoLift;
    this.group.add(this.cargo);
  }

  get carrying(): boolean {
    return this.cargo !== null;
  }

  get finished(): boolean {
    return this.state === "gone";
  }

  /**
   * Take what it is carrying.
   *
   * Returns the cargo object, detached from the ant and re-parented to the
   * world at the same place it was — the level flies it into the net from
   * there. The ant then runs for home.
   */
  robCargo(into: THREE.Object3D): THREE.Object3D | null {
    if (!this.cargo) {
      return null;
    }
    const cargo = this.cargo;
    this.cargo = null;
    this.group.remove(cargo);
    cargo.position.copy(this.cargoPosition);
    into.add(cargo);
    this.state = "fleeing";
    this.stateTime = 0;
    return cargo;
  }

  update(dt: number): void {
    this.stateTime += dt;
    switch (this.state) {
      case "wandering":
        this.wanderLeft -= dt;
        if (this.wanderLeft <= 0) {
          this.pickTarget();
        }
        this.runTowards(this.target, A.antSpeed, dt);
        break;
      case "fleeing":
        this.runTowards(this.island.hill, A.antFleeSpeed, dt);
        if (
          tmp.copy(this.group.position).sub(this.island.hill).setY(0).length() <
          A.antHomeRadius
        ) {
          this.state = "entering";
          this.stateTime = 0;
        }
        break;
      case "entering": {
        // Down the hole rather than out like a light.
        const t = Math.min(1, this.stateTime / A.antEnterTime);
        this.group.scale.setScalar(Math.max(0.001, 1 - t));
        this.group.position.y = -t * A.hillHeight * 0.5;
        if (t >= 1) {
          this.state = "gone";
          this.group.visible = false;
        }
        break;
      }
      case "gone":
        return;
    }

    // Legs and body bob with the running, at a rate that follows the speed.
    this.walk += dt * (this.state === "fleeing" ? 26 : 18);
    this.body.position.y = Math.abs(Math.sin(this.walk)) * 0.12;
    this.body.rotation.z = Math.sin(this.walk * 0.5) * 0.08;
    this.group.rotation.y = this.heading;
    if (this.cargo) {
      this.cargo.rotation.y = -this.heading;
      this.cargo.position.y = A.cargoLift + Math.sin(this.walk) * 0.06;
      this.cargo.getWorldPosition(this.cargoPosition);
    } else {
      this.group.getWorldPosition(this.cargoPosition);
    }
  }

  /** Somewhere else on this island to be. */
  private pickTarget(): void {
    const angle = this.rng.range(0, Math.PI * 2);
    const radius = A.islandRadius * Math.sqrt(this.rng.range(0.05, 0.82));
    this.target.set(
      this.island.centre.x + Math.cos(angle) * radius,
      0,
      this.island.centre.z + Math.sin(angle) * radius,
    );
    this.wanderLeft = this.rng.range(A.antWander[0], A.antWander[1]);
  }

  /** Turn towards a point and run at it; never turn on the spot. */
  private runTowards(at: THREE.Vector3, speed: number, dt: number): void {
    tmp.copy(at).sub(this.group.position).setY(0);
    if (tmp.lengthSq() > 1e-4) {
      const want = Math.atan2(tmp.x, tmp.z);
      let delta = want - this.heading;
      while (delta > Math.PI) {
        delta -= Math.PI * 2;
      }
      while (delta < -Math.PI) {
        delta += Math.PI * 2;
      }
      const turn = Math.max(-A.antTurn * dt, Math.min(A.antTurn * dt, delta));
      this.heading += turn;
    }
    this.group.position.x += Math.sin(this.heading) * speed * dt;
    this.group.position.z += Math.cos(this.heading) * speed * dt;

    // It stays on its island even while running for the hill.
    tmp.copy(this.group.position).sub(this.island.centre).setY(0);
    const out = tmp.length();
    const limit = A.islandRadius - 1.2;
    if (out > limit) {
      this.group.position.x = this.island.centre.x + (tmp.x / out) * limit;
      this.group.position.z = this.island.centre.z + (tmp.z / out) * limit;
      // Bounced off the edge: turn back inwards rather than grinding along it.
      if (this.state === "wandering") {
        this.pickTarget();
      }
    }
  }
}

/**
 * The ant itself: three lumps, six legs and a pair of antennae.
 *
 * Built once and shared by every ant on the level — they differ only in what
 * they carry — and drawn facing +z, which is the direction `heading` points.
 */
export function createAntGeometry(): THREE.BufferGeometry {
  const parts: Array<THREE.BufferGeometry> = [];
  const scale = A.antLength / 2.4;
  const push = (geo: THREE.BufferGeometry, colour: number): void => {
    geo.scale(scale, scale, scale);
    parts.push(paint(geo, colour));
  };

  // Abdomen, thorax, head — back to front along +z.
  const abdomen = new THREE.SphereGeometry(0.52, 12, 10);
  abdomen.scale(0.85, 0.8, 1.15);
  abdomen.translate(0, 0.52, -0.78);
  push(abdomen, P.ant);
  const thorax = new THREE.SphereGeometry(0.34, 10, 8);
  thorax.scale(0.9, 0.85, 1.1);
  thorax.translate(0, 0.5, 0.05);
  push(thorax, P.antDark);
  const head = new THREE.SphereGeometry(0.36, 10, 8);
  head.scale(0.95, 0.9, 0.85);
  head.translate(0, 0.52, 0.72);
  push(head, P.ant);

  // Eyes, big enough to read from the air.
  for (const side of [-1, 1]) {
    const eye = new THREE.SphereGeometry(0.11, 8, 6);
    eye.translate(side * 0.19, 0.62, 0.94);
    push(eye, P.antDark);
  }
  // Antennae, bent forward.
  for (const side of [-1, 1]) {
    const stalk = new THREE.CylinderGeometry(0.035, 0.045, 0.62, 5);
    stalk.rotateX(-0.5);
    stalk.rotateZ(side * 0.35);
    stalk.translate(side * 0.16, 0.86, 0.92);
    push(stalk, P.antDark);
  }
  // Six legs, splayed. Straight boxes rather than joints: at the size this is
  // seen, the angle of them is all that reads.
  for (const side of [-1, 1]) {
    for (const [n, z] of [0.42, 0.05, -0.34].entries()) {
      const leg = new THREE.CylinderGeometry(0.055, 0.04, 0.85, 5);
      leg.rotateZ(side * (0.9 + n * 0.08));
      leg.rotateX(-0.25 + n * 0.25);
      leg.translate(side * 0.42, 0.28, z);
      push(leg, P.antDark);
    }
  }
  // A shine along the back, which is what makes it look like a shell.
  const shine = new THREE.SphereGeometry(0.3, 8, 6);
  shine.scale(0.5, 0.28, 0.9);
  shine.translate(0, 0.86, -0.72);
  push(shine, P.antShine);

  const merged = mergeGeometries(parts, false);
  for (const part of parts) {
    part.dispose();
  }
  return merged ?? new THREE.BufferGeometry();
}

/**
 * What an ant carries: one of the three flowers, or a jar of honey.
 *
 * The flower heads are the game's own, so a white flower here is the white
 * flower from the meadow — the child has been picking these since level 1.
 */
function createCargo(kind: CargoKind): THREE.Object3D {
  const material = vertexToon();
  if (kind === "honey") {
    const parts: Array<THREE.BufferGeometry> = [];
    const body = new THREE.CylinderGeometry(0.36, 0.3, 0.62, 12);
    parts.push(paint(body, 0xffb02e));
    const neck = new THREE.CylinderGeometry(0.24, 0.34, 0.16, 12);
    neck.translate(0, 0.36, 0);
    parts.push(paint(neck, 0xffd98a));
    const lid = new THREE.CylinderGeometry(0.27, 0.27, 0.12, 12);
    lid.translate(0, 0.48, 0);
    parts.push(paint(lid, 0xc2703a));
    const merged = mergeGeometries(parts, false);
    for (const part of parts) {
      part.dispose();
    }
    const jar = new THREE.Mesh(merged ?? new THREE.BufferGeometry(), material);
    jar.castShadow = true;
    return jar;
  }

  const flower = createFlowerGeometry(kind);
  const head = new THREE.Mesh(flower.head.clone(), material);
  head.castShadow = true;
  // The head alone, scaled up: a whole stem on an ant's back would read as a
  // twig, and it is the colour that says which flower this is.
  head.scale.setScalar(1.6);
  return head;
}
