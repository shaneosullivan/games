import * as THREE from "three";
import {ConvexGeometry} from "three/examples/jsm/geometries/ConvexGeometry.js";
import {CAR, GARDA, Sticker} from "../config";
import {Assembly, DETAIL, rounded} from "./assembly";
import {
  across,
  AXLES,
  clip,
  glassFor,
  pane,
  plates,
  rod,
  underbody,
} from "./coachwork";

/**
 * A Garda car: an Irish police car.
 *
 * A family SUV — taller than the taxi, on bigger wheels with black plastic
 * round the arches and rails on the roof — in the livery that makes one
 * recognisable from the far end of a street: fluorescent yellow, a band of
 * big blue and yellow squares down each side, GARDA in white on a blue panel
 * under them, and a blue light bar on the roof that flashes.
 *
 * From where the race camera looks, most of that is invisible, so the roof
 * says GARDA too, in letters big enough to read from above, the way a real
 * one carries its markings for the helicopter.
 *
 * The badge on the doors is a plain star, not the force's own crest.
 */
export function garda(stickers: ReadonlyArray<Sticker> = []): THREE.Group {
  const a = new Assembly();
  const L = CAR.length;
  const W = CAR.width;

  body(a, L, W);
  glasshouse(a, L);
  front(a, L, W);
  back(a, L, W);
  sides(a, L, W);
  for (const along of [AXLES.front, AXLES.rear]) {
    for (const side of [-1, 1]) {
      wheel(a, side * GARDA.track, along * L);
    }
  }

  const group = a.build();
  group.name = "garda";
  group.add(...livery(L, W), ...lightBar(L));
  const plate = {wide: W * 0.3, tall: 0.45};
  plates(group, stickers, [
    {y: 1.85, z: L / 2 + 0.15, facing: 1, ...plate},
    {y: 2.7, z: -L / 2 - 0.09, facing: -1, ...plate},
  ]);
  return group;
}

/** Stations down the upper body: z and half width as fractions of the car,
 *  and the height of the top. A high, fairly flat bonnet, and a square back. */
const BODY: ReadonlyArray<[number, number, number]> = [
  [0.5, 0.86, 3.95],
  [0.46, 0.97, 4.3],
  [0.42, 1.0, 4.45],
  [0.17, 1.0, 4.6],
  [-0.42, 1.0, 4.65],
  [-0.47, 0.97, 4.6],
  [-0.5, 0.9, 4.3],
];

/** Windscreen foot, roof front and back, rear screen foot; and the pillars
 *  between the doors. */
const GLASS = {screen: 0.17, roofFront: 0.01, roofBack: -0.39, rear: -0.45};
const PILLARS = {b: -0.07, c: -0.3};

function body(a: Assembly, L: number, W: number): void {
  const points: Array<THREE.Vector3> = [];
  for (const [z, wide, top] of BODY) {
    const x = (W / 2) * wide;
    for (const s of [-1, 1]) {
      points.push(new THREE.Vector3(s * x, GARDA.floor, z * L));
      points.push(new THREE.Vector3(s * x, top - 0.3, z * L));
      points.push(new THREE.Vector3(s * x * 0.97, top, z * L));
    }
    points.push(new THREE.Vector3(0, top + 0.05, z * L));
  }
  a.add(new ConvexGeometry(points), "bodywork", GARDA.yellow);
  underbody(a, GARDA.yellow, GARDA.trim, GARDA);

  // Black plastic round each arch, standing just proud of the paint, which
  // is most of what says SUV rather than estate.
  const r = GARDA.arch;
  for (const z of [AXLES.front * L, AXLES.rear * L]) {
    const cladding = new THREE.Shape();
    cladding.moveTo(r + 0.3, GARDA.wheel);
    cladding.absarc(0, GARDA.wheel, r + 0.3, 0, Math.PI, false);
    cladding.lineTo(-r, GARDA.wheel);
    cladding.absarc(0, GARDA.wheel, r, Math.PI, 0, true);
    cladding.closePath();
    a.add(across(cladding, W + 0.12, z), "matte", GARDA.trim);
  }
  // And along the bottom of the doors.
  const sill = rounded(
    W + 0.1,
    0.35,
    (AXLES.front - AXLES.rear) * L - r * 2,
    0.12,
  );
  sill.translate(
    0,
    GARDA.clearance + 0.2,
    ((AXLES.front + AXLES.rear) / 2) * L,
  );
  a.add(sill, "matte", GARDA.trim);
}

/** The roof and its windows, with the pillars blacked out and rails on top. */
function glasshouse(a: Assembly, L: number): void {
  const base = GARDA.belt;
  const low = (CAR.width / 2) * 0.9;
  const high = (CAR.width / 2) * 0.8;
  const glass = glassFor(GARDA.yellow);
  const foot = (s: number, z: number): THREE.Vector3 =>
    new THREE.Vector3(s * low, base, z * L);
  const top = (s: number, z: number): THREE.Vector3 =>
    new THREE.Vector3(s * high, GARDA.roof, z * L);

  a.add(
    new ConvexGeometry(
      [-1, 1].flatMap(s => [
        foot(s, GLASS.screen),
        foot(s, GLASS.rear),
        top(s, GLASS.roofFront),
        top(s, GLASS.roofBack),
      ]),
    ),
    "bodywork",
    GARDA.yellow,
  );
  const centre = new THREE.Vector3(
    0,
    (base + GARDA.roof) / 2,
    ((GLASS.screen + GLASS.rear) / 2) * L,
  );
  const frame = 0.16;
  pane(
    a,
    [
      foot(-1, GLASS.screen),
      foot(1, GLASS.screen),
      top(1, GLASS.roofFront),
      top(-1, GLASS.roofFront),
    ],
    centre,
    frame,
    "glass",
    glass,
  );
  pane(
    a,
    [
      foot(-1, GLASS.rear),
      top(-1, GLASS.roofBack),
      top(1, GLASS.roofBack),
      foot(1, GLASS.rear),
    ],
    centre,
    frame,
    "glass",
    glass,
  );
  const b = PILLARS.b * L;
  const c = PILLARS.c * L;
  const gap = 0.22;
  for (const s of [-1, 1]) {
    const side = [
      foot(s, GLASS.screen),
      top(s, GLASS.roofFront),
      top(s, GLASS.roofBack),
      foot(s, GLASS.rear),
    ];
    pane(a, clip(side, b + gap, 1), centre, frame, "glass", glass);
    pane(
      a,
      clip(clip(side, b - gap, -1), c + gap, 1),
      centre,
      frame,
      "glass",
      glass,
    );
    pane(a, clip(side, c - gap, -1), centre, frame, "glass", glass);
    // Both pillars black, so the side glass reads as one dark strip.
    for (const at of [b, c]) {
      pane(
        a,
        clip(clip(side, at + gap + frame, -1), at - gap - frame, 1),
        centre,
        0.02,
        "rubber",
        GARDA.trim,
      );
    }

    // Roof rails.
    const x = s * (high - 0.2);
    rod(
      a,
      new THREE.Vector3(x, GARDA.roof + 0.25, GLASS.roofFront * L - 0.4),
      new THREE.Vector3(x, GARDA.roof + 0.25, GLASS.roofBack * L + 0.4),
      0.1,
      "matte",
      GARDA.trim,
    );
    for (const z of [GLASS.roofFront * L - 0.5, GLASS.roofBack * L + 0.5]) {
      const foot = rounded(0.25, 0.3, 0.5, 0.08);
      foot.translate(x, GARDA.roof + 0.12, z);
      a.add(foot, "matte", GARDA.trim);
    }
  }
}

/** The big dark grille, swept headlamps, and the bumper. */
function front(a: Assembly, L: number, W: number): void {
  const nose = L / 2;
  const grille = rounded(W * 0.62, 1.4, 0.4, 0.35);
  grille.translate(0, 2.75, nose - 0.08);
  a.add(grille, "rubber", GARDA.trim);
  for (const y of [2.35, 2.75, 3.15]) {
    const bar = rounded(W * 0.56, 0.06, 0.08, 0.02);
    bar.translate(0, y, nose + 0.14);
    a.add(bar, "chrome", 0x8e949c);
  }
  const lip = rounded(W * 0.8, 0.35, 0.3, 0.12);
  lip.translate(0, 1.2, nose - 0.1);
  a.add(lip, "matte", GARDA.trim);
  const plate = rounded(W * 0.3, 0.45, 0.06, 0.03);
  plate.translate(0, 1.85, nose + 0.1);
  a.add(plate, "matte", 0xf4f4ef);

  for (const side of [-1, 1]) {
    const lamp = rounded(W * 0.2, 0.36, 1.3, 0.14);
    lamp.rotateY(side * 0.38);
    lamp.translate(side * W * 0.38, 3.75, nose - 0.55);
    a.add(lamp, "glass", 0xdfe7ee);
    const drl = rounded(W * 0.18, 0.08, 0.9, 0.03);
    drl.rotateY(side * 0.38);
    drl.translate(side * W * 0.38, 4.0, nose - 0.5);
    a.add(drl, "chrome", 0xf6f8fa);
    // Blue flashers low in the bumper.
    const flasher = rounded(0.5, 0.2, 0.15, 0.06);
    flasher.translate(side * W * 0.36, 1.75, nose + 0.02);
    a.add(flasher, "glass", GARDA.blue);
  }
}

/** Tail lamps, plate, and the black lower bumper. */
function back(a: Assembly, L: number, W: number): void {
  const tail = -L / 2;
  for (const side of [-1, 1]) {
    const lamp = rounded(W * 0.26, 0.5, 1.0, 0.14);
    lamp.rotateY(-side * 0.32);
    lamp.translate(side * W * 0.36, 4.1, tail + 0.45);
    a.add(lamp, "glass", 0xb5121f);
  }
  const plate = rounded(W * 0.3, 0.45, 0.06, 0.03);
  plate.translate(0, 2.7, tail - 0.04);
  a.add(plate, "matte", 0xf4f4ef);
  const lower = rounded(W * 0.9, 0.7, 0.3, 0.14);
  lower.translate(0, 1.35, tail + 0.05);
  a.add(lower, "matte", GARDA.trim);
}

/** Door shut lines, handles and mirrors. */
function sides(a: Assembly, L: number, W: number): void {
  const flank = W / 2 + 0.01;
  for (const s of [-1, 1]) {
    const x = s * flank;
    const bottom = GARDA.clearance + 0.45;
    const topOfDoor = GARDA.belt - 0.25;
    for (const z of [0.18 * L, PILLARS.b * L]) {
      rod(
        a,
        new THREE.Vector3(x, bottom, z),
        new THREE.Vector3(x, topOfDoor, z),
        0.035,
        "rubber",
        0x4a4f56,
      );
    }
    // The back door steps round the rear arch.
    const step = GARDA.floor + 0.35;
    const clear = AXLES.rear * L + GARDA.arch + 0.45;
    rod(
      a,
      new THREE.Vector3(x, step, PILLARS.c * L),
      new THREE.Vector3(x, topOfDoor, PILLARS.c * L),
      0.035,
      "rubber",
      0x4a4f56,
    );
    rod(
      a,
      new THREE.Vector3(x, step, PILLARS.c * L),
      new THREE.Vector3(x, step, clear),
      0.035,
      "rubber",
      0x4a4f56,
    );
    rod(
      a,
      new THREE.Vector3(x, bottom, clear),
      new THREE.Vector3(x, step, clear),
      0.035,
      "rubber",
      0x4a4f56,
    );

    for (const z of [0.09, -0.2]) {
      const handle = rounded(0.12, 0.16, 0.75, 0.05);
      handle.translate(s * (flank + 0.05), GARDA.belt - 0.35, z * L);
      a.add(handle, "chrome", 0xc3c9d0);
    }
    const stalk = rounded(0.6, 0.2, 0.3, 0.06);
    stalk.translate(s * (W / 2 - 0.1), GARDA.belt + 0.2, L * 0.13);
    a.add(stalk, "matte", GARDA.trim);
    const mirror = rounded(0.55, 0.65, 0.95, 0.2);
    mirror.translate(s * (W / 2 + 0.28), GARDA.belt + 0.45, L * 0.125);
    a.add(mirror, "bodywork", GARDA.blue);
  }
}

/**
 * The squares, the GARDA panel, the badge, and the roof marking.
 *
 * Pictures on the flanks and roof, like the taxi's chequers: two rows of big
 * squares is a texture, not forty boxes.
 */
function livery(L: number, W: number): Array<THREE.Object3D> {
  const out: Array<THREE.Object3D> = [];
  const decal = (texture: THREE.Texture): THREE.MeshStandardMaterial =>
    new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.4,
      side: THREE.DoubleSide,
      transparent: true,
      alphaTest: 0.5,
    });

  const from = -0.43 * L;
  const to = 0.43 * L;
  const long = to - from;
  const squares = Math.round(long / (GARDA.checks / 2));
  const checks = decal(squaresTexture(squares));

  const panelFrom = AXLES.rear * L + GARDA.arch + 0.4;
  const panelTo = AXLES.front * L - GARDA.arch - 0.4;
  const panelLong = panelTo - panelFrom;
  const panelTall = 1.05;
  const panelY = GARDA.checksAt - GARDA.checks / 2 - panelTall / 2 - 0.05;

  for (const s of [-1, 1]) {
    const x = s * (W / 2 + 0.03);
    const band = new THREE.PlaneGeometry(long, GARDA.checks);
    band.rotateY(s * (Math.PI / 2));
    band.translate(x, GARDA.checksAt, (from + to) / 2);
    out.push(new THREE.Mesh(band, checks));

    // The panel reads left to right from either side, so each side gets its
    // own copy of the word the right way round.
    const plate = new THREE.PlaneGeometry(panelLong, panelTall);
    plate.rotateY(s * (Math.PI / 2));
    plate.translate(x, panelY, (panelFrom + panelTo) / 2);
    out.push(
      new THREE.Mesh(plate, decal(wordTexture("GARDA", panelLong / panelTall))),
    );

    const badge = new THREE.PlaneGeometry(1.0, 1.0);
    badge.rotateY(s * (Math.PI / 2));
    badge.translate(x + s * 0.02, GARDA.checksAt, 0.05 * L);
    out.push(new THREE.Mesh(badge, decal(badgeTexture())));
  }

  // The roof: GARDA along it, big, for anybody looking down.
  const roofLong = (GLASS.roofFront - GLASS.roofBack) * L * 0.62;
  const roofWide = CAR.width * 0.46;
  const roof = new THREE.PlaneGeometry(roofLong, roofWide);
  roof.rotateX(-Math.PI / 2);
  roof.rotateY(Math.PI / 2);
  roof.translate(0, GARDA.roof + 0.03, -0.24 * L);
  out.push(
    new THREE.Mesh(roof, decal(wordTexture("GARDA", roofLong / roofWide))),
  );
  return out;
}

/**
 * The light bar: a black base with a blue lamp at each end, flashing in turn.
 *
 * The lamps are their own meshes with their own materials so they can glow,
 * and the flashing is done as they are drawn rather than by anything ticking
 * them, so it runs the same in the garage, the model room and a race.
 */
function lightBar(L: number): Array<THREE.Object3D> {
  const z = GLASS.roofFront * L - 1.0;
  const a = new Assembly();
  const base = rounded(4.0, 0.22, 0.85, 0.1);
  base.translate(0, GARDA.roof + 0.15, z);
  a.add(base, "matte", GARDA.trim);
  const out: Array<THREE.Object3D> = [a.build()];
  for (const s of [-1, 1]) {
    const material = new THREE.MeshStandardMaterial({
      color: GARDA.blue,
      emissive: new THREE.Color(0x2f6bff),
      emissiveIntensity: 0,
      roughness: 0.2,
      transparent: true,
      opacity: 0.9,
    });
    const lamp = new THREE.Mesh(rounded(1.8, 0.5, 0.75, 0.18), material);
    lamp.position.set(s * 0.95, GARDA.roof + 0.5, z);
    lamp.onBeforeRender = () => {
      const t = performance.now() / 1000;
      const on =
        Math.sin((t * GARDA.flash + (s > 0 ? 0.5 : 0)) * Math.PI * 2) > 0;
      material.emissiveIntensity = on ? 2.6 : 0.1;
    };
    out.push(lamp);
  }
  return out;
}

/** One road wheel: a tyre, a five-spoke alloy, a hub. */
function wheel(a: Assembly, x: number, z: number): void {
  const r = GARDA.wheel;
  const out = Math.sign(x);
  const tyre = new THREE.TorusGeometry(
    r * 0.72,
    r * 0.28,
    DETAIL.coarse,
    DETAIL.round,
  );
  tyre.scale(1, 1, 1.3);
  tyre.rotateY(Math.PI / 2);
  tyre.translate(x, r, z);
  a.add(tyre, "rubber", 0x141418);
  const rim = new THREE.CylinderGeometry(
    r * 0.55,
    r * 0.55,
    0.85,
    DETAIL.round,
  );
  rim.rotateZ(Math.PI / 2);
  rim.translate(x, r, z);
  a.add(rim, "chrome", 0x8e949c);
  for (let i = 0; i < 5; i++) {
    const spoke = new THREE.BoxGeometry(0.2, r * 1.0, 0.24);
    spoke.translate(0, r * 0.25, 0);
    spoke.rotateX((i / 5) * Math.PI * 2);
    spoke.translate(x + out * 0.38, r, z);
    a.add(spoke, "chrome", 0xd0d4d9);
  }
  const hub = new THREE.CylinderGeometry(
    r * 0.15,
    r * 0.15,
    0.9,
    DETAIL.coarse,
  );
  hub.rotateZ(Math.PI / 2);
  hub.translate(x + out * 0.05, r, z);
  a.add(hub, "chrome", 0x4a4f56);
}

const hex = (n: number): string => `#${n.toString(16).padStart(6, "0")}`;

/** Two rows of blue and yellow squares, offset, with a blue edge. */
function squaresTexture(columns: number): THREE.CanvasTexture {
  const cell = 32;
  const canvas = document.createElement("canvas");
  canvas.width = columns * cell;
  canvas.height = cell * 2;
  const g = canvas.getContext("2d")!;
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < columns; col++) {
      g.fillStyle = (row + col) % 2 === 0 ? hex(GARDA.blue) : hex(GARDA.yellow);
      g.fillRect(col * cell, row * cell, cell, cell);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  return texture;
}

/** A word in white on a blue panel with rounded ends, cut to `aspect`. */
function wordTexture(word: string, aspect: number): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.height = 128;
  canvas.width = Math.round(128 * aspect);
  const g = canvas.getContext("2d")!;
  g.fillStyle = hex(GARDA.blue);
  g.beginPath();
  g.roundRect(0, 0, canvas.width, canvas.height, 24);
  g.fill();
  g.fillStyle = "#ffffff";
  const size = Math.min(96, (canvas.width * 0.8) / (word.length * 0.72));
  g.font = `900 ${size}px "Arial Black", Impact, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(word, canvas.width / 2, canvas.height / 2 + 4, canvas.width * 0.9);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** A round badge: gold ring, blue middle, white star. */
function badgeTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d")!;
  const c = size / 2;
  g.fillStyle = "#d9a82b";
  g.beginPath();
  g.arc(c, c, c - 2, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = hex(GARDA.blue);
  g.beginPath();
  g.arc(c, c, c * 0.78, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#ffffff";
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const reach = i % 2 === 0 ? c * 0.6 : c * 0.26;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    g.lineTo(c + Math.cos(angle) * reach, c + Math.sin(angle) * reach);
  }
  g.closePath();
  g.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
