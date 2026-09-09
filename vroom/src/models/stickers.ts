import * as THREE from "three";
import {CAR, STICKER, Sticker, StickerKind} from "../config";
import {deck, DECK_INSET, dropOnDeck, onFlank} from "./deck";

/**
 * The things a child sticks on their own car.
 *
 * Pictures, in their own colours, and words in whatever kind of writing they
 * like. Two different problems, solved on two different parts of the car:
 *
 * - **Pictures go on the decks**, the nose and the engine cover, because the
 *   camera looks down at forty-five degrees and that is what it sees. They are
 *   built in layers — a face, then its eyes — so a smiley can be yellow with
 *   dark eyes rather than a yellow blob with holes punched through it.
 * - **Words go on the flanks**, one on each side, because that is where words
 *   go on a racing car and because the nose is four units wide and a name is
 *   not. Both sides are drawn, and the far one is turned round so it reads the
 *   right way to whoever is standing on that side.
 *
 * Every sticker is its **own mesh**, which costs a draw call and buys the one
 * thing this needs: a sticker you can point at. Dragging one round the car is
 * a ray cast that has to come back saying *which* sticker, and it cannot say
 * that about a triangle inside one big merged body. Only the player's car has
 * any, so it is a handful of calls on one car out of four.
 */

/** One layer of a picture: shapes, and the colour they are painted. */
interface Layer {
  shapes: Array<THREE.Shape>;
  colour: number;
}

const INK = STICKER.ink;

/** A rectangle, in the unit box every picture is drawn in. */
function box(x: number, y: number, w: number, h: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(x, y);
  s.lineTo(x + w, y);
  s.lineTo(x + w, y + h);
  s.lineTo(x, y + h);
  s.closePath();
  return s;
}

function disc(x: number, y: number, rx: number, ry: number): THREE.Shape {
  const s = new THREE.Shape();
  s.absellipse(x, y, rx, ry, 0, Math.PI * 2, false);
  return s;
}

/** The pictures, each drawn in a box one unit across and one along. */
const PICTURES: Record<Exclude<StickerKind, "text">, () => Array<Layer>> = {
  star: () => {
    const s = new THREE.Shape();
    // Five points, and the inner radius that makes a star rather than a
    // pinwheel: much under a third and the arms turn into needles.
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 0.5 : 0.21;
      const a = Math.PI / 2 + (i * Math.PI) / 5;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) {
        s.moveTo(x, y);
      } else {
        s.lineTo(x, y);
      }
    }
    s.closePath();
    return [{shapes: [s], colour: INK.gold}];
  },

  heart: () => {
    const s = new THREE.Shape();
    // Two lobes and a point, drawn from the point up so the curves come out
    // symmetrical by construction rather than by fiddling with numbers.
    s.moveTo(0, -0.5);
    s.bezierCurveTo(0.42, -0.12, 0.5, 0.24, 0.24, 0.42);
    s.bezierCurveTo(0.11, 0.5, 0.03, 0.42, 0, 0.32);
    s.bezierCurveTo(-0.03, 0.42, -0.11, 0.5, -0.24, 0.42);
    s.bezierCurveTo(-0.5, 0.24, -0.42, -0.12, 0, -0.5);
    return [{shapes: [s], colour: INK.red}];
  },

  flag: () => {
    const cloth = box(-0.4, -0.05, 0.9, 0.5);
    const dark: Array<THREE.Shape> = [box(-0.5, -0.5, 0.1, 1)];
    const across = 0.225;
    const down = 0.125;
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        if ((r + c) % 2 !== 0) {
          continue;
        }
        dark.push(box(-0.4 + c * across, 0.45 - (r + 1) * down, across, down));
      }
    }
    return [
      {shapes: [cloth], colour: INK.white},
      {shapes: dark, colour: INK.dark},
    ];
  },

  skull: () => {
    const head = new THREE.Shape();
    // A big round cranium and a small jaw, which is the whole of what makes a
    // cartoon skull rather than an anatomical one.
    head.moveTo(-0.34, 0.06);
    head.bezierCurveTo(-0.34, 0.5, 0.34, 0.5, 0.34, 0.06);
    head.lineTo(0.34, -0.1);
    head.bezierCurveTo(0.34, -0.24, 0.26, -0.24, 0.22, -0.26);
    head.lineTo(0.22, -0.44);
    head.lineTo(-0.22, -0.44);
    head.lineTo(-0.22, -0.26);
    head.bezierCurveTo(-0.26, -0.24, -0.34, -0.24, -0.34, -0.1);
    head.closePath();

    const nose = new THREE.Shape();
    nose.moveTo(0, -0.16);
    nose.lineTo(0.07, -0.02);
    nose.lineTo(-0.07, -0.02);
    nose.closePath();

    return [
      {shapes: [head], colour: INK.bone},
      {
        shapes: [
          disc(-0.155, 0.11, 0.105, 0.115),
          disc(0.155, 0.11, 0.105, 0.115),
          nose,
          // Two gaps in the jaw, which read as teeth.
          box(-0.097, -0.44, 0.044, 0.14),
          box(0.053, -0.44, 0.044, 0.14),
        ],
        colour: INK.dark,
      },
    ];
  },

  smiley: () => {
    const mouth = new THREE.Shape();
    // A fat arc back along a thinner one, so it is a crescent and not a
    // stripe.
    mouth.absarc(0, 0.02, 0.31, Math.PI * 1.12, Math.PI * 1.88, false);
    mouth.absarc(0, 0.02, 0.22, Math.PI * 1.88, Math.PI * 1.12, true);
    mouth.closePath();
    return [
      {shapes: [disc(0, 0, 0.5, 0.5)], colour: INK.sun},
      {
        shapes: [
          disc(-0.17, 0.15, 0.075, 0.1),
          disc(0.17, 0.15, 0.075, 0.1),
          mouth,
        ],
        colour: INK.dark,
      },
    ];
  },

  bolt: () => {
    const s = new THREE.Shape();
    s.moveTo(0.22, 0.5);
    s.lineTo(-0.28, 0.0);
    s.lineTo(-0.02, 0.0);
    s.lineTo(-0.22, -0.5);
    s.lineTo(0.3, 0.06);
    s.lineTo(0.04, 0.06);
    s.closePath();
    return [{shapes: [s], colour: INK.sun}];
  },

  crown: () => {
    const s = new THREE.Shape();
    // Three points and two dips, on a band. The band matters: without it the
    // points read as a row of trees.
    s.moveTo(-0.44, -0.34);
    s.lineTo(0.44, -0.34);
    s.lineTo(0.44, 0.1);
    s.lineTo(0.5, 0.46);
    s.lineTo(0.24, 0.16);
    s.lineTo(0, 0.5);
    s.lineTo(-0.24, 0.16);
    s.lineTo(-0.5, 0.46);
    s.lineTo(-0.44, 0.1);
    s.closePath();
    return [
      {shapes: [s], colour: INK.gold},
      {shapes: [box(-0.44, -0.28, 0.88, 0.1)], colour: INK.lip},
    ];
  },
};

/** The pictures a child can pick, in the order they are offered. */
export const PICTURE_KINDS = Object.keys(PICTURES) as Array<
  Exclude<StickerKind, "text">
>;

/**
 * One sticker, as something sitting on the car.
 *
 * The index is stamped on every mesh in it so a ray cast can say which sticker
 * was touched — the whole reason these are not merged into the body.
 */
export function stickerMesh(
  sticker: Sticker,
  index: number,
): THREE.Object3D | null {
  const L = CAR.length;
  const W = CAR.width;
  const built =
    sticker.kind === "text" ? writing(sticker, L, W) : picture(sticker, L, W);
  if (!built) {
    return null;
  }
  built.traverse(o => {
    o.userData.sticker = index;
    o.castShadow = false;
    o.receiveShadow = false;
    // Above the paint it is stuck to. The liveries lie thinner on the body and
    // are drawn first, so a star dropped on the stripes covers them rather
    // than fighting them for the same pixels.
    o.renderOrder = 2;
  });
  return built;
}

/** A picture: its layers, stacked, laid on whichever deck it is over. */
function picture(sticker: Sticker, L: number, W: number): THREE.Group | null {
  const build = PICTURES[sticker.kind as Exclude<StickerKind, "text">];
  if (!build) {
    return null;
  }
  const group = new THREE.Group();
  build().forEach((layer, i) => {
    const flat = new THREE.ShapeGeometry(layer.shapes, STICKER.curve);
    flat.scale(sticker.size, sticker.size, 1);
    // Drawn lying down: what was up the page is along the car, nose forward.
    flat.rotateX(-Math.PI / 2);
    flat.translate(acrossOf(sticker, W), i * STICKER.layer, sticker.v * L);
    const on = dropOnDeck(flat, L, W, STICKER.lift);
    group.add(new THREE.Mesh(on, paint(layer.colour)));
    flat.dispose();
  });
  return group;
}

/**
 * A written sticker, on both flanks.
 *
 * The far side is the same word turned round, so each side reads the right way
 * to whoever is looking at it — which is the only reason there are two meshes
 * here rather than one drawn twice.
 */
function writing(sticker: Sticker, L: number, W: number): THREE.Group | null {
  const words = (sticker.text ?? "").trim();
  if (words === "") {
    return null;
  }
  const drawn = paintWords(words, sticker.font ?? STICKER.fonts[0].id);
  if (!drawn) {
    return null;
  }

  // As tall as asked for, until that makes it longer than the side allows.
  const room = L * STICKER.sideRoom;
  let height = sticker.size;
  let width = height * drawn.aspect;
  if (width > room) {
    width = room;
    height = width / drawn.aspect;
  }

  const texture = new THREE.CanvasTexture(drawn.canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = STICKER.anisotropy;
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    transparent: true,
    alphaTest: STICKER.alphaTest,
    roughness: STICKER.roughness,
    metalness: 0,
    side: THREE.DoubleSide,
  });

  const group = new THREE.Group();
  for (const side of [1, -1]) {
    const flat = new THREE.PlaneGeometry(width, height, STICKER.strips, 1);
    // Stood on its edge and turned to face out of whichever flank it is on.
    // Turning the far one the other way is what puts the word the right way
    // round for somebody standing on that side of the car.
    flat.rotateY(side > 0 ? Math.PI / 2 : -Math.PI / 2);
    flat.translate(0, heightOf(sticker), sticker.v * L);
    group.add(new THREE.Mesh(onFlank(flat, side, L, W), material));
    flat.dispose();
  }
  return group;
}

/** Where a picture sits across the car, in world units. Held inside the deck,
 *  because half a star hanging over the shoulder is not a sticker. */
function acrossOf(sticker: Sticker, W: number): number {
  const room = deck(sticker.v, W).half * DECK_INSET;
  return Math.max(-room, Math.min(room, sticker.u * room));
}

/** How far up the flank a word sits, inside the panel there is to write on. */
export function heightOf(sticker: Sticker): number {
  return Math.max(
    STICKER.sideLowest,
    Math.min(STICKER.sideHighest, sticker.h ?? STICKER.sideAt),
  );
}

/** How far along the car a word can go, and holding one inside that. Short of
 *  the wings at either end, which are not the car's side. */
export function alongFlank(v: number): number {
  return Math.max(STICKER.sideTo, Math.min(STICKER.sideFrom, v));
}

/** The paint a picture layer is in. Not the car's paint: these have their own
 *  colours and nobody is asked to choose them. */
function paint(colour: number): THREE.Material {
  return new THREE.MeshStandardMaterial({
    color: colour,
    roughness: STICKER.roughness,
    metalness: 0,
  });
}

/**
 * A word drawn on a canvas, with a transparent background.
 *
 * Letters are a texture rather than geometry, and that is a deliberate
 * exception in a game with no textures in it. Anything a child can type has to
 * come out in any of half a dozen kinds of writing, and the only thing on this
 * machine that already knows how to draw a word in a chosen face is the canvas
 * the browser gives away for nothing.
 *
 * Measured first and then drawn into a canvas cut to fit, so a short word is
 * not mostly empty texture and a long one is not squeezed.
 */
function paintWords(
  words: string,
  font: string,
): {canvas: HTMLCanvasElement; aspect: number} | null {
  const family =
    STICKER.fonts.find(f => f.id === font)?.family ?? STICKER.fonts[0].family;
  const canvas = document.createElement("canvas");
  const measure = canvas.getContext("2d");
  if (!measure) {
    return null;
  }
  const size = STICKER.textPixels;
  const face = `700 ${size}px ${family}`;
  measure.font = face;
  const wide = Math.ceil(measure.measureText(words).width) + size * 0.5;
  canvas.width = Math.max(size, Math.min(STICKER.textMost, wide));
  canvas.height = Math.round(size * 1.5);

  const paintOn = canvas.getContext("2d");
  if (!paintOn) {
    return null;
  }
  paintOn.font = face;
  paintOn.textAlign = "center";
  paintOn.textBaseline = "middle";
  paintOn.fillStyle = "#ffffff";
  paintOn.strokeStyle = "#1b1d24";
  paintOn.lineWidth = size * 0.07;
  paintOn.lineJoin = "round";
  // Outlined as well as filled: white letters on a white car would otherwise
  // be a name nobody could read, and the outline costs nothing.
  paintOn.strokeText(words, canvas.width / 2, canvas.height / 2, canvas.width);
  paintOn.fillText(words, canvas.width / 2, canvas.height / 2, canvas.width);
  return {canvas, aspect: canvas.width / canvas.height};
}
