/**
 * Scoring the drawn map, off the main thread.
 *
 * Working out how much of the route has been covered means compositing two
 * full-size images twice and then counting every pixel of the result — a few
 * hundred thousand of them, twice, per score. Done on the main thread while a
 * finger is moving, that is long enough to drop pointer events and leave gaps
 * in the line the player is drawing.
 *
 * So it happens here. The main thread draws (which is cheap), and every so
 * often hands over a snapshot of what has been drawn; this composites and
 * counts, and posts back two numbers. Nothing here touches the DOM.
 */

interface SetupMessage {
  type: "map";
  map: ImageBitmap;
  /** How far off the route ink may stray before it counts against you. */
  tolerance: number;
}

interface ScoreMessage {
  type: "score";
  drawing: ImageBitmap;
  /** Alpha above which a pixel counts as inked. */
  threshold: number;
}

type Incoming = SetupMessage | ScoreMessage;

let map: ImageBitmap | null = null;
let scratch: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;

/**
 * The route, fattened by the width of the pen — what counts as "near enough".
 *
 * Scored against the route itself, a careful trace still comes out badly
 * wrong: a pen as wide as the line it is following puts ink a pixel either
 * side of it wherever the line narrows, and on this map that alone is a tenth
 * of the route. It isn't a mistake, and it shouldn't read as one. So the
 * wrong-ink pass is measured against this instead, and only ink that misses
 * the route by more than a pen's width is held against the player.
 */
let forgiving: OffscreenCanvas | null = null;

/** Build it by stamping the route in a ring around itself. */
function fatten(source: ImageBitmap, tolerance: number): OffscreenCanvas {
  const canvas = new OffscreenCanvas(source.width, source.height);
  const pen = canvas.getContext("2d");
  if (pen) {
    // Twelve stamps: at this radius the gaps between them are under a pixel,
    // and the route is a stroke rather than a point, so it closes up.
    const steps = 12;
    for (let i = 0; i < steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      pen.drawImage(
        source,
        Math.cos(angle) * tolerance,
        Math.sin(angle) * tolerance,
      );
    }
    pen.drawImage(source, 0, 0);
  }
  return canvas;
}

/** Count what a pass left behind, in the scratch canvas. */
function countInked(threshold: number): number {
  if (!ctx || !scratch) {
    return 0;
  }
  const {data} = ctx.getImageData(0, 0, scratch.width, scratch.height);
  let n = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > threshold) {
      n++;
    }
  }
  return n;
}

self.onmessage = (event: MessageEvent<Incoming>) => {
  const message = event.data;

  if (message.type === "map") {
    map = message.map;
    forgiving = fatten(map, message.tolerance);
    scratch = new OffscreenCanvas(map.width, map.height);
    ctx = scratch.getContext("2d", {willReadFrequently: true});
    if (!ctx) {
      return;
    }
    ctx.drawImage(map, 0, 0);
    // How big the route is, which is what both scores are measured against.
    self.postMessage({type: "route", route: countInked(0)});
    return;
  }

  if (!map || !ctx || !scratch || !forgiving) {
    message.drawing.close();
    return;
  }

  // Right: the route, with everything the player didn't draw over taken out.
  ctx.globalCompositeOperation = "source-over";
  ctx.clearRect(0, 0, scratch.width, scratch.height);
  ctx.drawImage(map, 0, 0);
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(message.drawing, 0, 0);
  const right = countInked(message.threshold);

  // Wrong: the player's drawing, with everything near the route taken out.
  ctx.globalCompositeOperation = "source-over";
  ctx.clearRect(0, 0, scratch.width, scratch.height);
  ctx.drawImage(message.drawing, 0, 0);
  ctx.globalCompositeOperation = "destination-out";
  ctx.drawImage(forgiving, 0, 0);
  const wrong = countInked(message.threshold);

  ctx.globalCompositeOperation = "source-over";
  // The snapshot is ours now, and there will be another along shortly.
  message.drawing.close();
  self.postMessage({type: "score", right, wrong});
};
