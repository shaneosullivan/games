import * as THREE from "three";
import {GATES} from "../config";
import {glowTexture, paint} from "../render/materials";
import {Rng} from "../core/rng";

interface Gate {
  /** The middle of the hole. */
  readonly at: THREE.Vector3;
  readonly radius: number;
  readonly ring: THREE.Mesh;
  readonly halo: THREE.Sprite;
  passed: boolean;
}

/**
 * The rings down the valley to fly through.
 *
 * Bright, and lit from inside: a ring the colour of the rock it hangs over is
 * a thing a child has to look for, and looking for it is time not spent flying
 * at it. These are meant to be seen from a long way off and aimed at.
 *
 * Scored, not enforced. Missing one costs nothing but the number in the
 * corner: a game that ends when a child clips a ring is a game they play once,
 * and the plan asks for calm.
 */
export class Gates {
  readonly group = new THREE.Group();

  private readonly gates: Array<Gate> = [];
  /** How many have been flown through. */
  passed = 0;
  private clock = 0;

  constructor(
    private readonly rng: Rng,
    private readonly pathAt: (z: number) => number,
    private readonly roomAt: (z: number) => number,
    private readonly lineAt: (z: number) => number,
    until: number,
    private readonly draftAt: (z: number) => {side: number; top: number} | null,
  ) {
    // As many as fit inside the flyable valley, rather than a fixed number:
    // see GATES.until. `until` already accounts for the net standing at the
    // end — an arch hung inside it would be unflyable and would look absurd.
    let z = -GATES.firstAt;
    while (z > -until) {
      this.build(z);
      z -= GATES.spacing + this.rng.range(0, GATES.spacingJitter);
    }
  }

  get total(): number {
    return this.gates.length;
  }

  private build(z: number): void {
    const radius =
      GATES.radius + this.rng.range(-GATES.sizeJitter, GATES.sizeJitter);

    // On the flight line the acorns mark — see Terrain.ribbonAt. A ring is
    // meant to be the next bead on that string rather than an errand of its
    // own: a child following acorns should be flown through arches without
    // ever being told to go and look for one.
    //
    // At the height the squirrel will actually be at by the time it gets here —
    // see Terrain.glidePathAt, which flies the glide rather than working it
    // out. A ring hung where the arithmetic says the squirrel *should* be is a
    // ring nobody can reach, which is exactly what the first version had.
    // Inside the walls, wherever they happen to be here. The valley closes in
    // and opens out, and a ring placed on a fixed wander sat buried in the
    // rock everywhere it narrowed — visible, unreachable, and worth a point
    // nobody could take.
    const room = Math.max(0, this.roomAt(z) - radius - GATES.wallGap);
    const side = this.rng.range(-GATES.sideWander, GATES.sideWander);

    // Where a draft runs, hang the arch up in it: out against that wall and
    // near the top of the lift, so the only way to it is to go and ride the
    // rising air. Elsewhere, some sit low and the rest on the ramp.
    const draft = this.rng.next() < GATES.highChance ? this.draftAt(z) : null;
    let x = this.lineAt(z) + side;
    let y =
      this.pathAt(z) + this.rng.range(-GATES.heightWander, GATES.heightWander);
    if (draft) {
      x = draft.side * (this.roomAt(z) - GATES.highWallGap);
      y = draft.top * GATES.highOfCeiling;
    } else if (this.rng.next() < GATES.lowChance) {
      y -= GATES.lowDrop;
    }

    const at = new THREE.Vector3(
      Math.max(-room, Math.min(room, x)),
      Math.max(radius * GATES.heightScale + 2, y),
      z,
    );

    const ring = new THREE.Mesh(
      ringShape(radius),
      // Unlit and bright. A toon material would shade half of it into the
      // valley and take the glow off it, which is the whole point of them.
      new THREE.MeshBasicMaterial({vertexColors: true, fog: false}),
    );
    ring.position.copy(at);
    this.group.add(ring);

    // The light it gives off. A real light apiece would cost the valley a
    // forward pass for each of eighteen rings; this is the trick the
    // caterpillar game's rainbow mushrooms use — an additive sprite that reads
    // as a glow from any distance and costs one quad.
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture(),
        color: GATES.glow,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    );
    halo.position.copy(at);
    halo.scale.set(
      radius * GATES.haloSize,
      radius * GATES.haloSize * GATES.heightScale,
      1,
    );
    this.group.add(halo);

    this.gates.push({at, radius, ring, halo, passed: false});
  }

  /**
   * Did the squirrel just go through one?
   *
   * Tested against the segment it moved along this step rather than against
   * where it ended up: at sixty units a second it covers a unit a frame, so a
   * ring is a plane you cross between frames and never a place you are ever
   * measured to be standing in.
   */
  check(from: THREE.Vector3, to: THREE.Vector3): number {
    for (let i = 0; i < this.gates.length; i++) {
      const gate = this.gates[i];
      if (gate.passed) {
        continue;
      }
      if (!(from.z > gate.at.z && to.z <= gate.at.z)) {
        continue;
      }
      const span = from.z - to.z;
      const t = span > 1e-6 ? (from.z - gate.at.z) / span : 0;
      const x = from.x + (to.x - from.x) * t - gate.at.x;
      const y = from.y + (to.y - from.y) * t - gate.at.y;
      // An ellipse, not a circle: an arch is taller than it is wide, and the
      // height is where the room has to be. See GATES.heightScale.
      if (Math.hypot(x, y / GATES.heightScale) <= gate.radius) {
        gate.passed = true;
        this.passed++;
        gate.ring.geometry = paint(gate.ring.geometry, GATES.litColour);
        (gate.halo.material as THREE.SpriteMaterial).color.set(GATES.litColour);
        return i;
      }
    }
    return -1;
  }

  /** The rings breathe, so they read as lit rather than painted. */
  update(dt: number): void {
    this.clock += dt;
    for (const gate of this.gates) {
      const pulse =
        1 + Math.sin(this.clock * GATES.pulseRate + gate.at.z) * GATES.pulse;
      const size = gate.radius * GATES.haloSize * pulse;
      gate.halo.scale.set(size, size * GATES.heightScale, 1);
    }
  }
}

/** An arch: a torus stood upright facing back up the valley, and stretched
 *  taller than it is wide. See GATES.heightScale. */
function ringShape(radius: number): THREE.BufferGeometry {
  const ring = new THREE.TorusGeometry(radius, GATES.ribRadius, 8, 26);
  ring.scale(1, GATES.heightScale, 1);
  return paint(ring, GATES.colour);
}
