import * as THREE from "three";
import {MAP, RIVALS} from "../config";
import {myColour} from "../core/garage";
import {Track} from "../entities/track";

/**
 * The whole circuit in a corner of the screen, with everybody's position on it.
 *
 * The racing camera can see about a hundred metres, which is a fifth of a lap
 * — so without this a child has no idea whether the corner ahead is the
 * hairpin or the sweeper, nor whether the car they are chasing is a second
 * ahead or most of a lap. Both of those are the whole of what a race is.
 *
 * Drawn on a 2D canvas rather than in the scene. It is a diagram and not a
 * view: it wants to be flat, unlit, always the same way up, and readable at
 * about a centimetre across.
 */
export class MiniMap {
  readonly root = document.createElement("canvas");

  private readonly ctx: CanvasRenderingContext2D;
  /** The circuit, already scaled into the canvas. */
  private readonly path: Array<{x: number; y: number}> = [];
  private readonly start: {x: number; y: number};
  /** World to canvas, kept so the cars can be put on it the same way. */
  private readonly scale: number;
  private readonly originX: number;
  private readonly originZ: number;
  private readonly dpr: number;

  constructor(track: Track) {
    this.root.className = "minimap";
    this.dpr = Math.min(window.devicePixelRatio, 2);
    this.root.width = MAP.size * this.dpr;
    this.root.height = MAP.size * this.dpr;
    const ctx = this.root.getContext("2d");
    if (!ctx) {
      throw new Error("no 2d canvas");
    }
    this.ctx = ctx;

    // Sample the circuit once. It does not move, so the only thing redrawn
    // every frame is four dots on top of a picture that never changes.
    const p = new THREE.Vector3();
    const raw: Array<{x: number; z: number}> = [];
    for (let i = 0; i < MAP.samples; i++) {
      track.pointAt(i / MAP.samples, p);
      raw.push({x: p.x, z: p.z});
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const q of raw) {
      minX = Math.min(minX, q.x);
      maxX = Math.max(maxX, q.x);
      minZ = Math.min(minZ, q.z);
      maxZ = Math.max(maxZ, q.z);
    }
    // One scale for both axes, so a circuit keeps its shape rather than being
    // squashed into a square.
    const pad = MAP.pad;
    const span = Math.max(maxX - minX, maxZ - minZ) || 1;
    this.scale = (MAP.size - pad * 2) / span;
    this.originX = (minX + maxX) / 2;
    this.originZ = (minZ + maxZ) / 2;

    for (const q of raw) {
      this.path.push(this.toCanvas(q.x, q.z));
    }
    track.pointAt(track.startAt, p);
    this.start = this.toCanvas(p.x, p.z);
  }

  /** Where a world point lands on the map, in CSS pixels. */
  private toCanvas(x: number, z: number): {x: number; y: number} {
    return {
      x: MAP.size / 2 + (x - this.originX) * this.scale,
      y: MAP.size / 2 + (z - this.originZ) * this.scale,
    };
  }

  /**
   * Redraws it.
   *
   * `cars` is the player first and then the rivals, which is the order their
   * colours are in. The player is drawn last and bigger: on a map this size
   * the one dot that matters has to win every overlap.
   */
  update(cars: Array<{x: number; z: number}>): void {
    const g = this.ctx;
    const d = this.dpr;
    g.save();
    g.scale(d, d);
    g.clearRect(0, 0, MAP.size, MAP.size);

    g.lineJoin = "round";
    g.lineCap = "round";
    g.beginPath();
    for (const [i, q] of this.path.entries()) {
      if (i === 0) {
        g.moveTo(q.x, q.y);
      } else {
        g.lineTo(q.x, q.y);
      }
    }
    g.closePath();
    // Drawn twice: a wide dark stroke and a narrower pale one over it, which
    // gives the road an edge and keeps it legible over any background.
    g.strokeStyle = "rgba(16, 20, 28, 0.55)";
    g.lineWidth = MAP.road + 3;
    g.stroke();
    g.strokeStyle = "rgba(255, 255, 255, 0.72)";
    g.lineWidth = MAP.road;
    g.stroke();

    // The line, so the map says where the lap begins.
    g.strokeStyle = "#ffffff";
    g.lineWidth = 3;
    g.beginPath();
    g.arc(this.start.x, this.start.y, MAP.road * 0.9, 0, Math.PI * 2);
    g.stroke();

    for (let i = cars.length - 1; i >= 0; i--) {
      const car = cars[i];
      const at = this.toCanvas(car.x, car.z);
      const mine = i === 0;
      g.beginPath();
      g.arc(at.x, at.y, mine ? MAP.you : MAP.dot, 0, Math.PI * 2);
      g.fillStyle = hex(
        mine ? myColour() : RIVALS.colours[(i - 1) % RIVALS.colours.length],
      );
      g.fill();
      // A dark ring, so a dot on the white road is still a dot.
      g.lineWidth = 1.5;
      g.strokeStyle = "rgba(16, 20, 28, 0.8)";
      g.stroke();
    }
    g.restore();
  }

  mount(host: HTMLElement): void {
    host.appendChild(this.root);
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle("hidden", !visible);
  }
}

function hex(colour: number): string {
  return `#${colour.toString(16).padStart(6, "0")}`;
}
