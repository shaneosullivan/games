/**
 * `chofter.probe()` — why isn't that button working?
 *
 * The maze's turn buttons have now failed three times on an iPad while working
 * on every machine here, and the last two causes were both invisible from a
 * desktop: a pointer that was never delivered, then a button sitting in the
 * strip of `#app` that runs past the visible viewport. Guessing across that gap
 * costs a round trip each time, so this collects the whole question at once.
 *
 * Two halves:
 *
 *  - a recorder, always running, that keeps the last few real presses along
 *    with *what was under the finger* and whether the turn actually changed;
 *  - a snapshot of every control's geometry, styles, ancestors and hit test.
 *
 * The recorder is the half that matters. A press that never arrives, a press
 * that lands on something else, and a press that lands on the button but moves
 * nothing are three different bugs, and they look identical from the far end of
 * a chat. Tap the dead button a few times, then run `chofter.probe()`.
 */

import {fits} from "./fitViewport";

/** Live presses to keep. Enough for a few taps; small enough to read. */
const RECENT_MAX = 14;

interface Recorded {
  t: number;
  type: string;
  x: number | null;
  y: number | null;
  target: string;
  /** Was the finger on a turn button, according to the event's own target? */
  onTurnBtn: boolean;
  /** What is stacked under that point, topmost first. */
  stack: Array<string>;
  /** The turn value as the event arrived, and again a tick later. */
  turnBefore: number | null;
  turnAfter?: number | null;
  /** Set once the event has finished propagating. */
  prevented?: boolean;
}

const recent: Array<Recorded> = [];

/** Selectors worth reporting on, in the order a reader wants them. */
const CONTROLS = [
  ".turnpad",
  ".turn-btn:first-child",
  ".turn-btn:last-child",
  ".throttle",
  ".alt",
  ".hud-top",
];

/**
 * Watch every press the document sees, whatever it lands on.
 *
 * Capture phase, so this runs before the control's own handler and before
 * anything that might stop the event — which is how `turnBefore`/`turnAfter`
 * can tell "the handler never ran" from "the handler ran and did nothing".
 */
export function installProbe(): void {
  for (const type of [
    "pointerdown",
    "pointerup",
    "touchstart",
    "touchend",
    "click",
  ]) {
    document.addEventListener(type, e => record(type, e), true);
  }
}

function record(type: string, e: Event): void {
  const point = pointOf(e);
  const target = e.target as HTMLElement | null;
  const entry: Recorded = {
    t: Math.round(performance.now()),
    type,
    x: point ? Math.round(point.x) : null,
    y: point ? Math.round(point.y) : null,
    target: describe(target),
    onTurnBtn: !!target?.closest?.(".turn-btn"),
    stack: point ? stackAt(point.x, point.y) : [],
    turnBefore: turnNow(),
  };
  recent.push(entry);
  if (recent.length > RECENT_MAX) {
    recent.shift();
  }
  // After propagation: did anything change, and did anyone cancel it?
  setTimeout(() => {
    entry.turnAfter = turnNow();
    entry.prevented = e.defaultPrevented;
  }, 0);
}

/** Where the press was, in client coordinates, whichever kind it is. */
function pointOf(e: Event): {x: number; y: number} | null {
  const touch = (e as TouchEvent).changedTouches?.[0];
  if (touch) {
    return {x: touch.clientX, y: touch.clientY};
  }
  const mouse = e as MouseEvent;
  return typeof mouse.clientX === "number"
    ? {x: mouse.clientX, y: mouse.clientY}
    : null;
}

/** What the game currently thinks the turn is, if a level with one is up. */
function turnNow(): number | null {
  const controls = (
    window as unknown as {
      chofter?: {controls?: {state(): Record<string, unknown>}};
    }
  ).chofter?.controls;
  if (!controls) {
    return null;
  }
  const value = controls.state().turn;
  return typeof value === "number" ? value : null;
}

/** `button.turn-btn`, short enough to read in a wall of JSON. */
function describe(el: Element | null): string {
  if (!el) {
    return "null";
  }
  const cls = typeof el.className === "string" ? el.className.trim() : "";
  const name = el.tagName.toLowerCase();
  return cls ? `${name}.${cls.split(/\s+/).slice(0, 3).join(".")}` : name;
}

/**
 * Everything under a point, topmost first.
 *
 * This is the one question a handler can do nothing about: if the button isn't
 * at the top of its own centre, nothing it listens for will ever fire.
 */
function stackAt(x: number, y: number): Array<string> {
  const els = document.elementsFromPoint(x, y) ?? [];
  return els.slice(0, 5).map(describe);
}

/** Whether `el` is the topmost thing at a point, or an ancestor of it. */
function hitsAt(el: Element, x: number, y: number): boolean {
  const top = document.elementFromPoint(x, y);
  return !!top && (top === el || el.contains(top) || top.contains(el));
}

/** The styles that can silently make an element untouchable. */
function stylesOf(el: Element): Record<string, string> {
  const s = getComputedStyle(el);
  return {
    display: s.display,
    visibility: s.visibility,
    opacity: s.opacity,
    pointerEvents: s.pointerEvents,
    touchAction: s.touchAction,
    position: s.position,
    zIndex: s.zIndex,
    transform: s.transform === "none" ? "none" : s.transform,
    overflow: s.overflow,
    clipPath: s.clipPath,
  };
}

/**
 * Up the tree, reporting only what an ancestor can do to a descendant's hit
 * testing — `pointer-events: none` on a parent, a clip, a transform that moved
 * the paint but not the layout.
 */
function ancestryOf(el: Element): Array<Record<string, string>> {
  const out: Array<Record<string, string>> = [];
  let node: Element | null = el.parentElement;
  while (node && out.length < 8) {
    const s = getComputedStyle(node);
    const notable =
      s.pointerEvents !== "auto" ||
      s.transform !== "none" ||
      s.clipPath !== "none" ||
      s.overflow !== "visible" ||
      s.opacity !== "1" ||
      s.filter !== "none";
    if (notable) {
      const r = node.getBoundingClientRect();
      out.push({
        el: describe(node),
        pointerEvents: s.pointerEvents,
        transform: s.transform,
        clipPath: s.clipPath,
        overflow: s.overflow,
        opacity: s.opacity,
        filter: s.filter,
        rect: rectOf(r),
      });
    }
    node = node.parentElement;
  }
  return out;
}

function rectOf(r: DOMRect): string {
  return `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(
    r.width,
  )}x${Math.round(r.height)}`;
}

/** One control: is it where it looks, and can a finger reach it? */
function reportControl(selector: string): Record<string, unknown> | null {
  const el = document.querySelector(selector);
  if (!el) {
    return null;
  }
  const r = el.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const vv = window.visualViewport;
  // Corners inset far enough to be inside the border radius.
  const inset = Math.min(12, r.width / 4, r.height / 4);
  const corners: Record<string, boolean> = {
    tl: hitsAt(el, r.left + inset, r.top + inset),
    tr: hitsAt(el, r.right - inset, r.top + inset),
    bl: hitsAt(el, r.left + inset, r.bottom - inset),
    br: hitsAt(el, r.right - inset, r.bottom - inset),
  };

  return {
    el: describe(el),
    rect: rectOf(r),
    // The two questions the -173px clue turned on: is it inside what the user
    // can actually see, and is it the thing on top when you press its middle?
    onScreen: vv
      ? r.left >= -1 &&
        r.top >= -1 &&
        r.right <= vv.width + 1 &&
        r.bottom <= vv.height + 1
      : null,
    hitCentre: hitsAt(el, cx, cy),
    hitCorners: corners,
    stackAtCentre: stackAt(cx, cy),
    // If the page is offset or scrolled, the OS and the DOM disagree about
    // where a touch landed — testing both says which coordinate space is real.
    stackAtCentreShifted:
      vv && (vv.offsetLeft || vv.offsetTop)
        ? stackAt(cx - vv.offsetLeft, cy - vv.offsetTop)
        : null,
    styles: stylesOf(el),
    ancestors: ancestryOf(el),
  };
}

/** The viewport numbers, and how far `#app` runs past what can be seen. */
function viewportReport(): Record<string, unknown> {
  const doc = document.documentElement;
  const vv = window.visualViewport;
  const app = document.getElementById("app")?.getBoundingClientRect();
  const style = getComputedStyle(doc);
  return {
    visualViewport: vv
      ? {
          size: [Math.round(vv.width), Math.round(vv.height)],
          offset: [Math.round(vv.offsetLeft), Math.round(vv.offsetTop)],
          page: [Math.round(vv.pageLeft), Math.round(vv.pageTop)],
          scale: vv.scale,
        }
      : null,
    documentElement: [doc.clientWidth, doc.clientHeight],
    inner: [window.innerWidth, window.innerHeight],
    scroll: [window.scrollX, window.scrollY, doc.scrollTop, doc.scrollLeft],
    app: app ? rectOf(app) : null,
    // What fitViewport published, which is what every edge-anchored control is
    // leaning on. See core/fitViewport.ts.
    uiInset: {
      left: style.getPropertyValue("--ui-left").trim(),
      right: style.getPropertyValue("--ui-right").trim(),
      top: style.getPropertyValue("--ui-top").trim(),
      bottom: style.getPropertyValue("--ui-bottom").trim(),
    },
    safeArea: {
      left: style.getPropertyValue("--safe-l").trim(),
      right: style.getPropertyValue("--safe-r").trim(),
      bottom: style.getPropertyValue("--safe-b").trim(),
    },
  };
}

/**
 * The whole picture: viewport, every control, and the presses just recorded.
 *
 * Returned as an object; `chofter.probe()` is what turns it into something
 * pasteable.
 */
export function probeReport(): Record<string, unknown> {
  const controls: Record<string, unknown> = {};
  for (const selector of CONTROLS) {
    const report = reportControl(selector);
    if (report) {
      controls[selector] = report;
    }
  }
  const state = (
    window as unknown as {
      chofter?: {controls?: {state(): Record<string, unknown>}};
    }
  ).chofter?.controls?.state();

  return {
    when: Math.round(performance.now()),
    ua: navigator.userAgent,
    standalone:
      (navigator as unknown as {standalone?: boolean}).standalone ??
      window.matchMedia("(display-mode: standalone)").matches,
    maxTouchPoints: navigator.maxTouchPoints,
    game: state ?? "no controls installed",
    overlayUp: describe(document.querySelector(".overlay:not(.hidden)")),
    viewport: viewportReport(),
    // Every re-fit since load, and what prompted it. If the layout is wrong and
    // the last entry says "poll", something resized the window without telling
    // the page — see core/fitViewport.ts.
    fits,
    controls,
    // Empty means the browser delivered nothing at all — which would be the
    // whole answer on its own.
    recentPresses: recent,
  };
}

/**
 * Put the report on screen, in a box you can copy out of.
 *
 * The console is the wrong place to copy from on a tablet: selecting a long
 * logged line by hand is miserable, and Safari refuses a clipboard write that
 * isn't inside a user gesture — which `probe()` never is, because it is typed
 * rather than tapped. So the text goes in a textarea, already selected, with a
 * Copy button that *is* a gesture and so is allowed.
 *
 * Deliberately plain inline styles: this has to work when the game's own CSS is
 * part of what's suspect, and it must not become a thing to maintain.
 */
export function showReport(text: string): void {
  document.querySelector(".probe-panel")?.remove();

  const panel = document.createElement("div");
  panel.className = "probe-panel";
  panel.style.cssText = [
    "position:fixed;inset:0;z-index:99999",
    "background:rgba(0,0,0,0.72);display:flex;flex-direction:column",
    "gap:10px;padding:16px;font:13px/1.4 system-ui,sans-serif",
  ].join(";");

  const box = document.createElement("textarea");
  box.readOnly = true;
  box.value = text;
  box.style.cssText =
    "flex:1;width:100%;border-radius:10px;border:0;padding:10px;" +
    "font:12px/1.35 ui-monospace,monospace;resize:none";

  const row = document.createElement("div");
  row.style.cssText = "display:flex;gap:10px;justify-content:center";
  row.append(
    button("Copy", async () => {
      box.select();
      box.setSelectionRange(0, text.length);
      try {
        await navigator.clipboard.writeText(text);
        row.firstElementChild!.textContent = "Copied";
      } catch {
        // Selected either way, so ⌘C or the iPad's own Copy still works.
        row.firstElementChild!.textContent = "Selected — press Copy";
      }
    }),
    button("Close", () => panel.remove()),
  );

  panel.append(box, row);
  document.body.appendChild(panel);
  box.select();
}

function button(label: string, onTap: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  b.style.cssText =
    "padding:12px 26px;border-radius:999px;border:0;font:600 15px system-ui;" +
    "background:#ffd75e;color:#4a2f07";
  b.addEventListener("click", onTap);
  return b;
}

/** How to use the above, for a console with no autocomplete. */
export function probeHelp(): void {
  console.log(
    [
      "chofter.probe()   — tap the dead button 3-4 times FIRST, then run this.",
      "                    Puts everything worth knowing in a box to copy.",
      "chofter.controls.tap.left()  — press the real button from here.",
      "chofter.controls.turn(-1)    — bypass the button entirely.",
      "chofter.logControls = true   — log every press as it happens.",
    ].join("\n"),
  );
}
