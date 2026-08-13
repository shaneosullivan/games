import * as THREE from "three";
import {FOOD, type PollenKind} from "../config";
import type {CarriedHex, FoodCell} from "../render/geometry/hiveInterior";
import {DanglingLoad} from "./danglingLoad";

const tmp = new THREE.Vector3();
const belly = new THREE.Vector3();

/** What the level needs to know happened this frame. */
export interface TakeResult {
  kind: PollenKind;
  /** Where it came out of the wall, for the puff. */
  at: THREE.Vector3;
}

interface Cell {
  cell: FoodCell;
  /** Seconds until it fills again; 0 means it's full now. */
  refillIn: number;
}

/**
 * The wall of food, and the hexagon the bee carries out of it.
 *
 * The loop this owns is the whole of level 2: a full cell glows and pulses,
 * flying to one takes the hexagon and hangs it under the bee on a rope, and
 * delivering sends it flying into a baby and shrinks it away. An emptied cell
 * goes dark and fills again a few seconds later, so the wall can't be
 * exhausted and the player is never stuck.
 *
 * The Game owns one of these because the interior does; level 2 resets it on
 * entry and ticks it, like everything else the Game holds on a level's behalf.
 */
export class Larder {
  /** What the bee is holding, or null. */
  carrying: PollenKind | null = null;

  private readonly cells: Array<Cell>;
  private readonly load: DanglingLoad;

  /** The hexagon's flight into a baby: null unless one is in the air. */
  private delivery: {from: THREE.Vector3; to: THREE.Vector3; t: number} | null =
    null;

  constructor(
    cells: ReadonlyArray<FoodCell>,
    private readonly hex: CarriedHex,
  ) {
    this.cells = cells.map(cell => ({cell, refillIn: 0}));
    this.load = new DanglingLoad(this.hex.group, {
      ropeLength: FOOD.ropeLength,
      gravity: FOOD.gravity,
      damping: FOOD.damping,
      ropeColor: 0xffe6a8,
      ropeRadius: 0.035,
    });
  }

  /** The rope has to be parented into the scene that draws it. */
  get rope(): THREE.Mesh {
    return this.load.rope;
  }

  /** Every cell full, nothing carried, nothing in the air. */
  reset(): void {
    this.carrying = null;
    this.delivery = null;
    this.load.stow();
    this.hex.setVisible(false);
    this.hex.setScale(1);
    for (const entry of this.cells) {
      entry.refillIn = 0;
      entry.cell.setFull(true);
      entry.cell.ring.visible = true;
    }
  }

  /**
   * Refills, the swing of the carried hexagon, and the flight of a delivered
   * one. Call it every frame, above any phase early-returns — a delivery left
   * unticked hangs in the air forever.
   *
   * @returns "delivered" on the single frame the hexagon reaches the baby, so
   *   the level can spend the pollen and set off the sparks then, rather than
   *   half a second early while it's still in the air.
   */
  update(dt: number, beePosition: THREE.Vector3): "delivered" | null {
    for (const entry of this.cells) {
      if (entry.refillIn <= 0) {
        continue;
      }
      entry.refillIn -= dt;
      if (entry.refillIn <= 0) {
        entry.cell.setFull(true);
        entry.cell.ring.visible = true;
      }
    }

    if (this.delivery) {
      this.delivery.t += dt / FOOD.deliverTime;
      const t = Math.min(1, this.delivery.t);
      this.hex.group.position.lerpVectors(
        this.delivery.from,
        this.delivery.to,
        // Fast away from the bee and settling into the baby, so it reads as
        // handed over rather than thrown.
        t * t * (3 - 2 * t),
      );
      // Shrink only over the last of the flight: shrinking from the off looks
      // like it's being dropped rather than eaten.
      this.hex.setScale(1 - Math.max(0, t - 0.55) / 0.45);
      if (t >= 1) {
        this.delivery = null;
        this.hex.setVisible(false);
        this.hex.setScale(1);
        return "delivered";
      }
      return null;
    }

    this.load.update(dt, belly.copy(beePosition).setY(beePosition.y - 0.35));
    return null;
  }

  /**
   * Take the food out of whichever full cell the bee is close enough to.
   * Returns null when there's nothing in reach, or when she's already loaded —
   * one hexagon at a time keeps the trip a legible there-and-back.
   */
  tryTake(beePosition: THREE.Vector3): TakeResult | null {
    if (this.carrying || this.delivery) {
      return null;
    }

    let best: Cell | null = null;
    let bestDist = FOOD.takeRadius * FOOD.takeRadius;
    for (const entry of this.cells) {
      if (entry.refillIn > 0) {
        continue;
      }
      const d = entry.cell.position.distanceToSquared(beePosition);
      if (d < bestDist) {
        bestDist = d;
        best = entry;
      }
    }
    if (!best) {
      return null;
    }

    best.refillIn = FOOD.refillSeconds;
    best.cell.setFull(false);
    best.cell.ring.visible = false;

    this.carrying = best.cell.kind;
    this.hex.setKind(this.carrying);
    this.hex.setScale(1);
    this.hex.setVisible(true);
    this.load.pickUp(belly.copy(beePosition).setY(beePosition.y - 0.35));

    return {kind: best.cell.kind, at: best.cell.position.clone()};
  }

  /**
   * Where to send a player who needs this colour: the nearest cell of it that
   * currently has food in it. Null while every one of them is refilling.
   */
  nearestFull(kind: PollenKind, from: THREE.Vector3): THREE.Vector3 | null {
    let best: THREE.Vector3 | null = null;
    let bestDist = Infinity;
    for (const entry of this.cells) {
      if (entry.refillIn > 0 || entry.cell.kind !== kind) {
        continue;
      }
      const d = entry.cell.position.distanceToSquared(from);
      if (d < bestDist) {
        bestDist = d;
        best = entry.cell.position;
      }
    }
    return best ? best.clone() : null;
  }

  /** Hand it over: let go of the rope and fly the hexagon into the baby. */
  deliverTo(target: THREE.Vector3): void {
    if (!this.carrying) {
      return;
    }
    this.carrying = null;
    this.delivery = {
      from: tmp.copy(this.load.worldPosition).clone(),
      to: target.clone(),
      t: 0,
    };
    this.load.stow();
  }
}
