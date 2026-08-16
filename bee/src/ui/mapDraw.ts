import {MAP_DRAW} from "../config";
import mapUrl from "../assets/cave/map.png";
import eraserUrl from "../assets/cave/eraser.png";
// Inlined rather than emitted beside the page: the game ships as one
// self-contained index.html, and a worker in its own file would simply be
// missing from it.
import MapScoreWorker from "./mapScoreWorker?worker&inline";

/**
 * "Draw the map" — the Bear's Lair's last task.
 *
 * The queen has flown the whole cave and has to leave a map of it for the
 * others, so the player draws it: the route shows through faintly underneath
 * and they trace over it with a pen. It replaced her drawing a line in the air
 * by herself, which was a thing you watched rather than a thing you did.
 *
 * Two canvases on screen, one on top of the other: the map, drawn faint on
 * white as something to trace, and the player's own, transparent, sitting
 * exactly over it. Both use the artwork's own pixel grid, so a pixel of the
 * scoring is a pixel of the drawing whatever size the panel ends up on screen.
 *
 * The scoring itself happens in a worker — see ui/mapScoreWorker.ts.
 */
export interface MapDraw {
  root: HTMLElement;
  /** Put it up, blank, with the score reset. */
  show(): void;
  hide(): void;
}

export function createMapDraw(
  host: HTMLElement,
  onSolved: () => void,
): MapDraw {
  const root = document.createElement("div");
  root.className = "mapdraw ui-interactive hidden";

  const card = document.createElement("div");
  card.className = "mapdraw-card";
  root.appendChild(card);

  const title = document.createElement("h2");
  title.textContent = "Draw the map!";
  const hint = document.createElement("p");
  hint.className = "mapdraw-hint";
  hint.textContent =
    "Trace over the faint path so the other bees know the way through the cave.";
  card.append(title, hint);

  // ---- the progress bar ---------------------------------------------------
  //
  // Two bars in one: how much of the route has been covered, and how much ink
  // has gone somewhere it shouldn't. They sit end to end so the whole thing
  // reads as one measure of "how right is this".
  const bar = document.createElement("div");
  bar.className = "mapdraw-bar";
  const good = document.createElement("div");
  good.className = "mapdraw-good";
  const bad = document.createElement("div");
  bad.className = "mapdraw-bad";
  bar.append(good, bad);
  const readout = document.createElement("p");
  readout.className = "mapdraw-readout";
  card.append(bar, readout);

  // ---- the canvases -------------------------------------------------------
  const stack = document.createElement("div");
  stack.className = "mapdraw-stack";
  const guide = document.createElement("canvas");
  guide.className = "mapdraw-guide";
  const sheet = document.createElement("canvas");
  sheet.className = "mapdraw-sheet";
  // A third layer on top, for showing where the tool is about to land. It
  // takes no pointer events — everything still goes to the sheet underneath.
  const cursor = document.createElement("canvas");
  cursor.className = "mapdraw-cursor";
  stack.append(guide, sheet, cursor);
  card.appendChild(stack);

  // ---- the tools ----------------------------------------------------------
  const tools = document.createElement("div");
  tools.className = "mapdraw-tools";
  const penButton = document.createElement("button");
  penButton.type = "button";
  penButton.className = "mapdraw-tool on";
  penButton.textContent = "✏️ Pen";
  const eraserButton = document.createElement("button");
  eraserButton.type = "button";
  eraserButton.className = "mapdraw-tool";
  // A picture of the thing rather than the emoji for it, which renders as a
  // different object on every platform and as a sponge on this one.
  const eraserIcon = document.createElement("img");
  eraserIcon.className = "mapdraw-tool-icon";
  eraserIcon.src = eraserUrl;
  eraserIcon.alt = "";
  eraserButton.append(eraserIcon, document.createTextNode("Eraser"));
  tools.append(penButton, eraserButton);
  card.appendChild(tools);

  // ---- the well done notice ----------------------------------------------
  const done = document.createElement("div");
  done.className = "mapdraw-done hidden";
  const doneText = document.createElement("p");
  doneText.textContent = "That's the way out! The others can follow that.";
  const doneButton = document.createElement("button");
  doneButton.type = "button";
  doneButton.textContent = "Call the babies";
  onTap(doneButton, () => {
    onSolved();
  });
  done.append(doneText, doneButton);
  card.appendChild(done);

  host.appendChild(root);

  // ---- the drawing itself -------------------------------------------------
  let erasing = false;
  let solved = false;
  /** Non-transparent pixels in the route: what a finished map has to cover. */
  let routePixels = 0;
  /** One snapshot in flight at a time; another is only a few frames away. */
  let scoring = false;

  const setTool = (rubber: boolean): void => {
    erasing = rubber;
    penButton.classList.toggle("on", !rubber);
    eraserButton.classList.toggle("on", rubber);
    // The old tool's ring is the wrong size for the new one.
    hideCursor();
  };
  onTap(penButton, () => setTool(false));
  onTap(eraserButton, () => setTool(true));

  /**
   * Scoring runs in a worker; see ui/mapScoreWorker.ts.
   *
   * Compositing and counting a few hundred thousand pixels takes long enough
   * that doing it between pointer events leaves gaps in the line being drawn.
   * The main thread draws and hands over a snapshot; the worker does the
   * arithmetic and posts back two numbers.
   */
  const worker = new MapScoreWorker();
  worker.onmessage = (
    event: MessageEvent<
      | {type: "route"; route: number}
      | {type: "score"; right: number; wrong: number}
    >,
  ) => {
    const message = event.data;
    if (message.type === "route") {
      routePixels = message.route;
      return;
    }
    paintScore(message.right, message.wrong);
  };

  const image = new Image();
  image.onload = () => {
    for (const canvas of [guide, sheet, cursor]) {
      canvas.width = image.width;
      canvas.height = image.height;
    }
    // The guide: white paper with the route laid on it faintly, which is what
    // makes it something to trace rather than something to copy.
    const ctx = guide.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, guide.width, guide.height);
      ctx.globalAlpha = MAP_DRAW.guideOpacity;
      ctx.drawImage(image, 0, 0);
      ctx.globalAlpha = 1;
    }
    // The worker keeps the route and measures against it; it answers with how
    // big it is, which is what turns pixels into percentages.
    void createImageBitmap(image).then(map => {
      worker.postMessage(
        {type: "map", map, tolerance: MAP_DRAW.strayTolerance},
        [map],
      );
    });
  };
  image.src = mapUrl;

  /** Hand the worker a snapshot of what has been drawn so far. */
  function score(): void {
    if (routePixels === 0 || scoring) {
      return;
    }
    scoring = true;
    void createImageBitmap(sheet)
      .then(drawing => {
        worker.postMessage(
          {type: "score", drawing, threshold: MAP_DRAW.inkThreshold},
          [drawing],
        );
      })
      .catch(() => {
        // A snapshot that never arrives just means no update this time.
      })
      .finally(() => {
        scoring = false;
      });
  }

  /** Put a score on the bar, and decide whether that is a finished map. */
  function paintScore(rightPixels: number, wrongPixels: number): void {
    // Both measured against the size of the route, so the two bars are in the
    // same units and can sit end to end.
    const rightShare = (rightPixels / routePixels) * 100;
    const wrongShare = (wrongPixels / routePixels) * 100;
    // The bar holds both, in proportion. A really enthusiastic scribble can
    // put down more stray ink than there is route, and simply clipping the
    // total would give the last of the bar to whichever colour was drawn
    // first — a map traced perfectly and then scribbled all over would show
    // as a bar of solid green.
    const total = rightShare + wrongShare;
    const squeeze = total > 100 ? 100 / total : 1;
    const greenWidth = rightShare * squeeze;
    const redWidth = wrongShare * squeeze;
    good.style.width = `${greenWidth}%`;
    bad.style.width = `${redWidth}%`;
    readout.textContent = `${Math.round(rightShare)}% of the way drawn${
      wrongShare >= 1 ? ` · ${Math.round(wrongShare)}% off the path` : ""
    }`;

    if (
      !solved &&
      rightShare >= MAP_DRAW.needRight &&
      wrongShare <= MAP_DRAW.allowWrong
    ) {
      solved = true;
      done.classList.remove("hidden");
    }
  }

  // ---- where the tool is ---------------------------------------------------
  //
  // A ring showing what the tool would take or leave, drawn on its own layer
  // so it can be wiped without touching the drawing underneath.
  //
  // The rubber gets one whenever it is down, because it is the one tool whose
  // effect you cannot see until it has already happened — the pen leaves ink
  // where it went, the rubber leaves nothing. Both get one on hover, which a
  // mouse always has and some pens do.
  function toolRadius(): number {
    return MAP_DRAW.penRadius * (erasing ? MAP_DRAW.rubber : 1);
  }

  function showCursor(at: {x: number; y: number}): void {
    const ctx = cursor.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.clearRect(0, 0, cursor.width, cursor.height);
    ctx.beginPath();
    ctx.arc(at.x, at.y, toolRadius(), 0, Math.PI * 2);
    ctx.fillStyle = erasing
      ? "rgba(255, 255, 255, 0.55)"
      : "rgba(0, 0, 0, 0.12)";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = erasing ? "#e2513c" : "#3d3226";
    ctx.stroke();
  }

  function hideCursor(): void {
    const ctx = cursor.getContext("2d");
    ctx?.clearRect(0, 0, cursor.width, cursor.height);
  }

  // ---- the pen ------------------------------------------------------------
  const drawing = new Map<number, {x: number; y: number}>();
  /** Scoring is not cheap, so it runs on a rest rather than on every move. */
  let scoreDue = 0;

  const at = (e: PointerEvent): {x: number; y: number} => {
    const rect = sheet.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * sheet.width,
      y: ((e.clientY - rect.top) / rect.height) * sheet.height,
    };
  };

  const dab = (from: {x: number; y: number}, to: {x: number; y: number}) => {
    const ctx = sheet.getContext("2d");
    if (!ctx) {
      return;
    }
    // The rubber takes pixels out rather than painting white over them —
    // white paint would still count as ink against the route underneath.
    ctx.globalCompositeOperation = erasing ? "destination-out" : "source-over";
    ctx.strokeStyle = "#000000";
    ctx.fillStyle = "#000000";
    ctx.lineWidth = MAP_DRAW.penRadius * 2 * (erasing ? MAP_DRAW.rubber : 1);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // A line between the two, so a quick flick doesn't come out as beads.
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(
      to.x,
      to.y,
      MAP_DRAW.penRadius * (erasing ? MAP_DRAW.rubber : 1),
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  };

  sheet.addEventListener("pointerdown", e => {
    e.preventDefault();
    const p = at(e);
    drawing.set(e.pointerId, p);
    dab(p, p);
    if (erasing) {
      showCursor(p);
    } else {
      hideCursor();
    }
    try {
      sheet.setPointerCapture(e.pointerId);
    } catch {
      // Without capture the window-level listeners below still end the stroke.
    }
    scoreDue = performance.now() + MAP_DRAW.scoreEvery;
  });
  sheet.addEventListener("pointermove", e => {
    const last = drawing.get(e.pointerId);
    if (!last) {
      // Hovering: a mouse always is, and some pens report it before they
      // touch. Both tools show the ring, so you can see what you are about to
      // do rather than finding out afterwards.
      if (e.buttons === 0) {
        showCursor(at(e));
      }
      return;
    }
    e.preventDefault();
    const p = at(e);
    dab(last, p);
    drawing.set(e.pointerId, p);
    if (erasing) {
      showCursor(p);
    }
    if (performance.now() >= scoreDue) {
      scoreDue = performance.now() + MAP_DRAW.scoreEvery;
      score();
    }
  });
  for (const type of ["pointerup", "pointercancel"]) {
    window.addEventListener(type, e => {
      const pointer = e as PointerEvent;
      if (drawing.delete(pointer.pointerId)) {
        // A finger that lifts is gone; a mouse or a pen is still hovering
        // there, so the ring stays where it is.
        if (pointer.pointerType === "touch") {
          hideCursor();
        }
        score();
      }
    });
  }
  // Off the paper, no ring.
  for (const type of ["pointerleave", "pointerout"]) {
    sheet.addEventListener(type, () => {
      if (drawing.size === 0) {
        hideCursor();
      }
    });
  }

  return {
    root,
    show() {
      solved = false;
      done.classList.add("hidden");
      setTool(false);
      sheet.getContext("2d")?.clearRect(0, 0, sheet.width, sheet.height);
      hideCursor();
      good.style.width = "0%";
      bad.style.width = "0%";
      readout.textContent = "Nothing drawn yet";
      root.classList.remove("hidden");
    },
    hide() {
      root.classList.add("hidden");
    },
  };
}

/**
 * A button press, taken as loosely as the glass allows.
 *
 * `click` is the strict reading of a tap: the finger has to go down and come
 * up on the same element without wandering, and on an iPad a slightly draggy
 * child's tap on a button beside a drawing surface fails all three. So the
 * press is taken the moment the finger lands, from whichever of the two event
 * families the browser chooses to deliver — and `click` stays wired up for the
 * keyboard, which is the only way some of these get pressed at all.
 *
 * Firing more than once costs nothing here: every one of these is a switch
 * being set to a value, not a thing being toggled, so two presses land the
 * same as one.
 */
function onTap(button: HTMLElement, run: () => void): void {
  const press = (e: Event): void => {
    // A finger already on the glass may still be captured by the drawing
    // canvas — an iPad that loses a `pointerup` (a palm, a notification, a
    // screenshot) leaves it that way, and every later press is delivered to
    // the canvas instead of to what was actually touched. Hand it back.
    const captured = e.target as Element | null;
    if (captured && "releasePointerCapture" in captured) {
      const id = (e as PointerEvent).pointerId;
      try {
        if (typeof id === "number" && captured.hasPointerCapture(id)) {
          captured.releasePointerCapture(id);
        }
      } catch {
        // Nothing held it, which is the normal case.
      }
    }
    e.preventDefault();
    run();
  };
  button.addEventListener("pointerdown", press);
  button.addEventListener("touchstart", press, {passive: false});
  button.addEventListener("click", press);
}
