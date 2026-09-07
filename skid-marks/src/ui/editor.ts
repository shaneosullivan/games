import * as THREE from "three";
import {EDITOR, ENVIRONMENTS, ITEM, TRACK} from "../config";
import type {Environment} from "../config";
import {
  ItemKind,
  ITEM_NAMES,
  newId,
  SPEC_VERSION,
  TrackItem,
  TrackSpec,
} from "../track/spec";
import {showJson} from "./modal";

/** What the finger is doing on the canvas. */
type Tool = ItemKind | "finish" | "erase";

const TOOLS: Array<{tool: Tool; label: string; icon: string; hint: string}> = [
  {
    tool: "finish",
    label: "Start line",
    icon: "🏁",
    hint: "Where the race starts and ends. There is only ever one.",
  },
  {tool: "ramp", label: "Ramp", icon: "🛫", hint: "Hit it fast and fly."},
  {tool: "oil", label: "Oil", icon: "🛢️", hint: "No grip at all. Hold on."},
  {tool: "mud", label: "Mud", icon: "🟤", hint: "Slows you right down."},
  {
    tool: "erase",
    label: "Rub out",
    icon: "🧽",
    hint: "Tap a thing to remove it.",
  },
];

export interface EditorHandlers {
  onSave: (spec: TrackSpec) => void;
  onCancel: () => void;
  onTest: (spec: TrackSpec) => void;
}

/**
 * Build your own race track.
 *
 * The whole thing is one 2D canvas and a row of chips. A child draws a loop
 * with a finger, and then drags things onto it — the start line, ramps, oil,
 * mud — and picks which world it is in.
 *
 * Two decisions carry the file. The first is that the drawn stroke is not the
 * track: it is thinned to a few dozen corners and then smoothed by exactly the
 * same Catmull-Rom curve the game builds the road from, so what is drawn here
 * and what is raced there cannot disagree. The second is that a dropped item
 * is stored against the circuit — how far round, how far off the middle —
 * rather than at the point the finger let go, so it is on the road by
 * construction and stays there.
 */
export class Editor {
  readonly root = document.createElement("div");

  private readonly canvas = document.createElement("canvas");
  private readonly ctx: CanvasRenderingContext2D;
  private readonly nameField = document.createElement("input");
  private readonly says = document.createElement("p");

  private readonly id: string;
  private shape: Array<{x: number; z: number}> = [];
  private items: Array<TrackItem> = [];
  private startAt = 0;
  private environment: Environment = "hills";

  /** The smoothed circuit, and the points every hit test is run against. */
  private curve: THREE.CatmullRomCurve3 | null = null;
  private readonly line: Array<THREE.Vector3> = [];
  private readonly sides: Array<THREE.Vector3> = [];

  /** The stroke being drawn, in world units, and the tool in hand. */
  private stroke: Array<{x: number; z: number}> = [];
  private drawing = false;
  private tool: Tool | null = null;

  private scale = 1;

  constructor(
    private readonly handlers: EditorHandlers,
    existing?: TrackSpec,
  ) {
    this.root.className = "screen editor";
    this.id = existing?.id ?? newId();
    if (existing) {
      this.shape = existing.shape.map(p => ({...p}));
      this.items = existing.items.map(i => ({...i}));
      this.startAt = existing.startAt;
      this.environment = existing.environment;
    }

    const ctx = this.canvas.getContext("2d");
    if (!ctx) {
      throw new Error("no 2d canvas");
    }
    this.ctx = ctx;

    this.build();
    if (existing) {
      this.rebuild();
    }
    window.addEventListener("resize", this.resize);
    // Twice: once now so the world scale is never the meaningless default, and
    // again after a frame, because the canvas has no size until it is in the
    // document and has been laid out.
    this.resize();
    requestAnimationFrame(this.resize);
  }

  dispose(): void {
    window.removeEventListener("resize", this.resize);
  }

  // ---------- the furniture ----------

  private build(): void {
    const bar = document.createElement("header");
    bar.className = "editor-bar";

    const back = chip("◀ Tracks", "ghost");
    back.addEventListener("click", () => this.handlers.onCancel());

    this.nameField.className = "name-field";
    this.nameField.type = "text";
    this.nameField.maxLength = 24;
    this.nameField.value = "My Track";
    this.nameField.setAttribute("aria-label", "Track name");

    const redraw = chip("Draw again", "ghost");
    redraw.addEventListener("click", () => {
      this.shape = [];
      this.items = [];
      this.startAt = 0;
      this.curve = null;
      this.tool = null;
      this.paint();
      this.tell("Draw a loop with your finger.");
      this.markTools();
    });

    bar.append(back, this.nameField, redraw);

    const stage = document.createElement("div");
    stage.className = "editor-stage";
    this.canvas.className = "editor-canvas";
    stage.appendChild(this.canvas);

    this.says.className = "editor-says";
    stage.appendChild(this.says);

    const tools = document.createElement("div");
    tools.className = "tool-row";
    for (const t of TOOLS) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "tool";
      b.dataset.tool = t.tool;
      b.title = t.hint;
      const icon = document.createElement("span");
      icon.className = "tool-icon";
      icon.textContent = t.icon;
      const label = document.createElement("span");
      label.textContent = t.label;
      b.append(icon, label);
      b.addEventListener("click", () => this.pick(t.tool));
      // Drag and drop as well as tap-then-tap. The plan asks for dragging, and
      // a child who tries to drag should not find nothing happens — but tap,
      // tap is far easier on a small screen, so both work and neither is the
      // only way in.
      b.addEventListener("pointerdown", event => this.startDrag(event, t.tool));
      tools.appendChild(b);
    }

    const envs = document.createElement("div");
    envs.className = "env-row";
    for (const key of Object.keys(ENVIRONMENTS) as Array<Environment>) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "env";
      b.dataset.env = key;
      b.textContent = ENVIRONMENTS[key].name;
      b.style.background = hex(ENVIRONMENTS[key].ground);
      b.style.color = readable(ENVIRONMENTS[key].ground);
      b.addEventListener("click", () => {
        this.environment = key;
        this.markEnvs();
        this.paint();
      });
      envs.appendChild(b);
    }

    const foot = document.createElement("footer");
    foot.className = "editor-bar";
    const test = chip("Test drive", "ghost");
    test.addEventListener("click", () => {
      const spec = this.finish();
      if (spec) {
        this.handlers.onTest(spec);
      }
    });
    const save = chip("Save", "strong");
    save.addEventListener("click", () => {
      const spec = this.finish();
      if (spec) {
        this.handlers.onSave(spec);
      }
    });
    const send = chip("Export", "ghost");
    send.addEventListener("click", () => {
      const spec = this.finish();
      if (spec) {
        showJson(this.root, "Your track", JSON.stringify(spec, null, 2));
      }
    });
    foot.append(test, send, save);

    this.root.append(bar, stage, tools, envs, foot);

    this.canvas.addEventListener("pointerdown", this.onDown);
    this.canvas.addEventListener("pointermove", this.onMove);
    this.canvas.addEventListener("pointerup", this.onUp);
    this.canvas.addEventListener("pointercancel", this.onUp);

    this.markEnvs();
    this.tell("Draw a loop with your finger.");
  }

  private pick(tool: Tool): void {
    if (!this.curve) {
      this.tell("Draw the track first, then you can put things on it.");
      return;
    }
    this.tool = this.tool === tool ? null : tool;
    this.markTools();
    const found = TOOLS.find(t => t.tool === this.tool);
    this.tell(
      found
        ? `${found.hint} Tap the track.`
        : "Pick something to put on the track.",
    );
  }

  private markTools(): void {
    for (const b of this.root.querySelectorAll<HTMLElement>(".tool")) {
      b.classList.toggle("on", b.dataset.tool === this.tool);
      b.classList.toggle("off", !this.curve);
    }
  }

  private markEnvs(): void {
    for (const b of this.root.querySelectorAll<HTMLElement>(".env")) {
      b.classList.toggle("on", b.dataset.env === this.environment);
    }
  }

  private tell(text: string): void {
    this.says.textContent = text;
  }

  // ---------- drawing the loop ----------

  private onDown = (event: PointerEvent): void => {
    this.canvas.setPointerCapture(event.pointerId);
    const w = this.toWorld(event);
    if (this.tool && this.curve) {
      this.drop(this.tool, w.x, w.z);
      return;
    }
    this.drawing = true;
    this.stroke = [w];
  };

  private onMove = (event: PointerEvent): void => {
    if (!this.drawing) {
      return;
    }
    const w = this.toWorld(event);
    const last = this.stroke[this.stroke.length - 1];
    // Only every so often. A finger produces a point every few milliseconds
    // and they are all within a unit of each other; kept as they come, the
    // "corners" would be noise and the smoothed curve would be a mess of
    // wobbles nobody drew.
    if (Math.hypot(w.x - last.x, w.z - last.z) >= EDITOR.sampleEvery) {
      this.stroke.push(w);
      this.paint();
    }
  };

  private onUp = (): void => {
    if (!this.drawing) {
      return;
    }
    this.drawing = false;
    const drawn = this.stroke;
    this.stroke = [];

    if (drawn.length < EDITOR.minCorners) {
      this.tell("That was a bit short — draw a big loop.");
      this.paint();
      return;
    }
    const span = spanOf(drawn);
    if (span < EDITOR.reach * 2 * EDITOR.minSpan) {
      this.tell("A bit bigger — fill more of the field.");
      this.paint();
      return;
    }

    this.shape = thin(drawn, EDITOR.corners);
    this.items = [];
    this.startAt = 0;
    this.rebuild();
    this.tell("Now drag the start line and anything else onto the track.");
    this.markTools();
  };

  /** The smoothed circuit, and the samples every hit test uses. */
  private rebuild(): void {
    this.curve = new THREE.CatmullRomCurve3(
      this.shape.map(p => new THREE.Vector3(p.x, 0, p.z)),
      true,
      "catmullrom",
      0.5,
    );
    this.line.length = 0;
    this.sides.length = 0;
    const n = 300;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const p = this.curve.getPointAt(t);
      const d = this.curve.getTangentAt(t);
      this.line.push(p);
      this.sides.push(new THREE.Vector3(-d.z, 0, d.x).normalize());
    }
    this.paint();
  }

  // ---------- putting things on it ----------

  /**
   * Where a world point is on the circuit.
   *
   * A full scan of the three hundred samples. There is no hint to search from
   * here — a finger can land anywhere — and three hundred distance checks once
   * per tap is nothing.
   */
  private onCircuit(
    x: number,
    z: number,
  ): {t: number; across: number; distance: number} {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < this.line.length; i++) {
      const p = this.line[i];
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    const p = this.line[best];
    const s = this.sides[best];
    return {
      t: best / this.line.length,
      across: (x - p.x) * s.x + (z - p.z) * s.z,
      distance: Math.sqrt(bestD),
    };
  }

  private drop(tool: Tool, x: number, z: number): void {
    const found = this.onCircuit(x, z);
    if (found.distance > TRACK.half + TRACK.grass) {
      this.tell("That is off the track — drop it on the road.");
      return;
    }

    if (tool === "erase") {
      const near = this.items.findIndex(
        it => this.gap(it, found.t, found.across) < ITEM.radius * 1.4,
      );
      if (near >= 0) {
        this.items.splice(near, 1);
        this.tell("Gone.");
      } else {
        this.tell("Nothing there to rub out.");
      }
      this.paint();
      return;
    }

    if (tool === "finish") {
      // Max one, and it is not an item at all: the start line is where the
      // circuit begins, so it is the track's own startAt.
      this.startAt = found.t;
      this.tell("That is the start and the finish.");
      this.paint();
      return;
    }

    // Keep it on the tarmac even if the finger was on the grass, and keep the
    // whole patch inside the road rather than half-hanging off it.
    const room = TRACK.half - ITEM.radius;
    const across = Math.max(-room, Math.min(room, found.across));

    if (this.items.some(it => this.gap(it, found.t, across) < ITEM.minGap)) {
      this.tell("Too close to the last one.");
      return;
    }

    this.items.push({kind: tool, t: found.t, across});
    this.tell(`${ITEM_NAMES[tool]} down. Put on as many as you like.`);
    this.paint();
  }

  /** How far apart two things on the circuit are, in world units. */
  private gap(item: TrackItem, t: number, across: number): number {
    const a = this.at(item.t, item.across);
    const b = this.at(t, across);
    return Math.hypot(a.x - b.x, a.z - b.z);
  }

  private at(t: number, across: number): {x: number; z: number} {
    const i =
      ((Math.round(t * this.line.length) % this.line.length) +
        this.line.length) %
      this.line.length;
    const p = this.line[i];
    const s = this.sides[i];
    return {x: p.x + s.x * across, z: p.z + s.z * across};
  }

  // ---------- dragging a chip onto the canvas ----------

  private startDrag(event: PointerEvent, tool: Tool): void {
    if (!this.curve) {
      return;
    }
    event.preventDefault();
    this.tool = tool;
    this.markTools();

    const ghost = document.createElement("div");
    ghost.className = "drag-ghost";
    ghost.textContent = TOOLS.find(t => t.tool === tool)?.icon ?? "?";
    document.body.appendChild(ghost);
    moveGhost(ghost, event);

    const move = (e: PointerEvent): void => moveGhost(ghost, e);
    const up = (e: PointerEvent): void => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      ghost.remove();
      const box = this.canvas.getBoundingClientRect();
      // Only counts as a drop if the finger actually left the chip and landed
      // on the canvas; a plain tap falls through to the click handler, which
      // picks the tool up instead.
      if (
        e.clientX >= box.left &&
        e.clientX <= box.right &&
        e.clientY >= box.top &&
        e.clientY <= box.bottom
      ) {
        const w = this.toWorld(e);
        this.drop(tool, w.x, w.z);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // ---------- the picture ----------

  private resize = (): void => {
    const box = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.canvas.width = Math.max(1, Math.round(box.width * dpr));
    this.canvas.height = Math.max(1, Math.round(box.height * dpr));
    // The world box is square and fits the short side, so a track drawn on a
    // phone and one drawn on an iPad come out the same size.
    this.scale =
      Math.min(this.canvas.width, this.canvas.height) / (EDITOR.reach * 2);
    this.paint();
  };

  private toWorld(event: PointerEvent): {x: number; z: number} {
    const box = this.canvas.getBoundingClientRect();
    const dpr = this.canvas.width / Math.max(1, box.width);
    const px = (event.clientX - box.left) * dpr;
    const py = (event.clientY - box.top) * dpr;
    return {
      x: (px - this.canvas.width / 2) / this.scale,
      z: (py - this.canvas.height / 2) / this.scale,
    };
  }

  private toScreen(x: number, z: number): [number, number] {
    return [
      this.canvas.width / 2 + x * this.scale,
      this.canvas.height / 2 + z * this.scale,
    ];
  }

  /**
   * The preview.
   *
   * Drawn with the same numbers the game builds the road from — TRACK.half for
   * the tarmac, the kerb outside it — so this is not an impression of the
   * track, it is the track. A preview that flattered the drawing would be
   * worse than none.
   */
  private paint(): void {
    const g = this.ctx;
    const palette = ENVIRONMENTS[this.environment];
    g.save();
    g.fillStyle = hex(palette.ground);
    g.fillRect(0, 0, this.canvas.width, this.canvas.height);

    if (this.stroke.length > 1) {
      g.strokeStyle = hex(palette.tarmac);
      g.lineWidth = TRACK.half * 2 * this.scale;
      g.lineJoin = "round";
      g.lineCap = "round";
      g.beginPath();
      for (const [i, p] of this.stroke.entries()) {
        const [sx, sy] = this.toScreen(p.x, p.z);
        if (i === 0) {
          g.moveTo(sx, sy);
        } else {
          g.lineTo(sx, sy);
        }
      }
      g.stroke();
    }

    if (this.line.length > 0) {
      const road = (width: number, colour: string): void => {
        g.strokeStyle = colour;
        g.lineWidth = width * this.scale;
        g.lineJoin = "round";
        g.beginPath();
        for (const [i, p] of this.line.entries()) {
          const [sx, sy] = this.toScreen(p.x, p.z);
          if (i === 0) {
            g.moveTo(sx, sy);
          } else {
            g.lineTo(sx, sy);
          }
        }
        g.closePath();
        g.stroke();
      };
      road((TRACK.half + 5) * 2, hex(palette.kerbA));
      road(TRACK.half * 2, hex(palette.tarmac));

      // The start line, and then everything dropped on the road.
      const s = this.at(this.startAt, 0);
      const [lx, ly] = this.toScreen(s.x, s.z);
      g.fillStyle = hex(palette.line);
      g.beginPath();
      g.arc(lx, ly, TRACK.half * 0.55 * this.scale, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#1d2430";
      g.font = `${Math.round(TRACK.half * 0.7 * this.scale)}px system-ui`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("🏁", lx, ly);

      for (const item of this.items) {
        const at = this.at(item.t, item.across);
        const [ix, iy] = this.toScreen(at.x, at.z);
        g.fillStyle = hex(ITEM[item.kind].colour);
        g.beginPath();
        g.arc(ix, iy, ITEM.radius * this.scale, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#ffffff";
        g.font = `${Math.round(ITEM.radius * 1.1 * this.scale)}px system-ui`;
        g.fillText(TOOLS.find(t => t.tool === item.kind)?.icon ?? "", ix, iy);
      }
    }
    g.restore();
  }

  // ---------- out ----------

  /** The drawing as a track, or nothing and a word about why. */
  private finish(): TrackSpec | null {
    if (!this.curve || this.shape.length < EDITOR.minCorners) {
      this.tell("Draw a loop first.");
      return null;
    }
    const name = this.nameField.value.trim() || "My Track";
    return {
      version: SPEC_VERSION,
      id: this.id,
      name,
      environment: this.environment,
      shape: this.shape.map(p => ({
        x: Math.round(p.x),
        z: Math.round(p.z),
      })),
      startAt: this.startAt,
      items: this.items.map(i => ({
        kind: i.kind,
        t: +i.t.toFixed(4),
        across: Math.round(i.across),
      })),
    };
  }
}

/**
 * A few hundred finger positions down to a couple of dozen corners.
 *
 * Evenly along the stroke rather than by any cleverness about curvature: the
 * Catmull-Rom that follows puts the curve back, and evenly spaced control
 * points are what it is happiest with — bunched ones make it loop back on
 * itself, which on a race track is a road that crosses itself.
 */
function thin(
  points: Array<{x: number; z: number}>,
  count: number,
): Array<{x: number; z: number}> {
  const step = points.length / count;
  const out: Array<{x: number; z: number}> = [];
  for (let i = 0; i < count; i++) {
    out.push(points[Math.floor(i * step)]);
  }
  return out;
}

/** The bigger side of the box the stroke fits in. */
function spanOf(points: Array<{x: number; z: number}>): number {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  return Math.max(maxX - minX, maxZ - minZ);
}

function moveGhost(ghost: HTMLElement, event: PointerEvent): void {
  ghost.style.left = `${event.clientX}px`;
  ghost.style.top = `${event.clientY}px`;
}

function chip(text: string, kind: string): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = `chip ${kind}`;
  b.textContent = text;
  return b;
}

function hex(colour: number): string {
  return `#${colour.toString(16).padStart(6, "0")}`;
}

/** Black or white, whichever can be read on that background. */
function readable(colour: number): string {
  const r = (colour >> 16) & 255;
  const g = (colour >> 8) & 255;
  const b = colour & 255;
  return r * 0.299 + g * 0.587 + b * 0.114 > 150 ? "#1d2430" : "#ffffff";
}
