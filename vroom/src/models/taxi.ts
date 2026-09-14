import * as THREE from "three";
import {ConvexGeometry} from "three/examples/jsm/geometries/ConvexGeometry.js";
import {CAR, Sticker, TAXI, WINDOWS} from "../config";
import {Assembly, DETAIL, rounded} from "./assembly";
import {clip, pane, plates, underbody} from "./coachwork";

/**
 * A taxi: an ordinary four-door saloon, with a sign on its roof and a band of
 * chequers along its doors.
 *
 * Everything the racing car is not. That one is a wedge on enormous wheels
 * with a driver lying down in a hole; this is a family car somebody drives for
 * a living — upright glass, a bonnet and a boot, wheels tucked into arches,
 * door handles, mirrors, a number plate. The car underneath was modelled on a
 * real cab, but its markings are made up for this game: a yellow sign with a
 * peaked top and a lamp on it, chequers along the doors, and a badge in the
 * middle of them. From above, the sign is what says taxi before anything else
 * does.
 *
 * It is the same sixteen units by seven as every other car on the grid and its
 * wheels sit on the same axles, so it drives exactly as they do. Only the
 * wheels themselves are smaller, because a saloon does not run on racing
 * slicks and the size of the wheels is most of what makes a car look sporty.
 *
 * Built in two storeys, which is what a saloon is: a body below the window
 * line, with real openings cut for the wheels, and a narrower glasshouse on
 * top of it with the windows set into its faces.
 */
export function taxi(
  colour: number = TAXI.body,
  stickers: ReadonlyArray<Sticker> = [],
): THREE.Group {
  const a = new Assembly();
  const L = CAR.length;
  const W = CAR.width;

  body(a, L, W, colour);
  glasshouse(a, L, colour);
  front(a, L, W);
  back(a, L, W);
  sides(a, L, W, colour);
  for (const along of [TAXI.front, TAXI.rear]) {
    for (const side of [-1, 1]) {
      wheel(a, side * TAXI.track, along * L);
    }
  }

  const group = a.build();
  group.name = "taxi";
  group.add(...livery(L, W), ...sign(L));
  plates(group, stickers, [
    {
      y: PLATE.front,
      z: L / 2 + 0.17,
      facing: 1,
      wide: PLATE.wide,
      tall: PLATE.tall,
    },
    {
      y: PLATE.back,
      z: -L / 2 - 0.07,
      facing: -1,
      wide: PLATE.wide,
      tall: PLATE.tall,
    },
  ]);
  return group;
}

/** The number plates, front and back, and where on the car they are. */
const PLATE = {wide: CAR.width * 0.36, tall: 0.56, front: 1.7, back: 2.2};

/** Where the upper body's surface is, station by station down the car: z as a
 *  fraction of the length, half width as a fraction of the width, and the
 *  height of the top. Its underside is flat, at `TAXI.floor`. */
const BODY: ReadonlyArray<[number, number, number]> = [
  [0.5, 0.82, 3.25],
  [0.47, 0.95, 3.6],
  [0.36, 0.99, 3.82],
  [0.15, 1.0, 4.0],
  [-0.2, 1.0, 4.05],
  [-0.37, 0.98, 4.05],
  [-0.47, 0.94, 3.9],
  [-0.5, 0.84, 3.45],
];

/** Where the glass starts and stops along the car. The windscreen's foot, the
 *  roof's front and back edges, and the rear screen's foot, as fractions of
 *  the length — a long shallow rear screen, the way a fastback saloon has. */
const GLASS = {screen: 0.15, roofFront: -0.02, roofBack: -0.23, rear: -0.38};

/** Door pillars, as fractions of the length: the black one between the doors
 *  and the painted one ahead of the little rear quarter window. */
const PILLARS = {b: -0.06, c: -0.3};

function body(a: Assembly, L: number, W: number, colour: number): void {
  // The upper body: the bonnet, the shoulders and the boot. Its flanks go
  // straight up and only turn in right at the top, so there is a flat door
  // for the chequers to lie on.
  const points: Array<THREE.Vector3> = [];
  for (const [z, wide, top] of BODY) {
    const x = (W / 2) * wide;
    for (const s of [-1, 1]) {
      points.push(new THREE.Vector3(s * x, TAXI.floor, z * L));
      points.push(new THREE.Vector3(s * x, top - 0.3, z * L));
      points.push(new THREE.Vector3(s * x * 0.93, top, z * L));
    }
    points.push(new THREE.Vector3(0, top + 0.05, z * L));
  }
  a.add(new ConvexGeometry(points), "bodywork", colour);

  underbody(a, colour, TAXI.trim, {
    wheel: TAXI.wheel,
    arch: TAXI.arch,
    clearance: TAXI.clearance,
    floor: TAXI.floor,
  });
}

/**
 * The roof and the windows.
 *
 * Painted, with the glass laid on its faces a little inset, so every window
 * has a painted frame round it and the pillars between them are simply the
 * paint that shows. See-through glass was tried first: from the height the
 * camera looks from, the far side of the car showed through it and the
 * pillars stood up on their own like a roll cage.
 */
function glasshouse(a: Assembly, L: number, colour: number): void {
  const base = TAXI.belt;
  const glass = WINDOWS.glass;
  const low = (CAR.width / 2) * 0.88;
  const high = (CAR.width / 2) * 0.7;
  const foot = (s: number, z: number): THREE.Vector3 =>
    new THREE.Vector3(s * low, base, z * L);
  const roof = (s: number, z: number): THREE.Vector3 =>
    new THREE.Vector3(s * high, TAXI.roof, z * L);

  const corners = [-1, 1].flatMap(s => [
    foot(s, GLASS.screen),
    foot(s, GLASS.rear),
    roof(s, GLASS.roofFront),
    roof(s, GLASS.roofBack),
  ]);
  a.add(new ConvexGeometry(corners), "bodywork", colour);

  const centre = new THREE.Vector3(
    0,
    (base + TAXI.roof) / 2,
    ((GLASS.screen + GLASS.rear) / 2) * L,
  );
  const frame = 0.16;

  const windscreen = [
    foot(-1, GLASS.screen),
    foot(1, GLASS.screen),
    roof(1, GLASS.roofFront),
    roof(-1, GLASS.roofFront),
  ];
  pane(a, windscreen, centre, frame, "glass", glass);
  const rearScreen = [
    foot(-1, GLASS.rear),
    roof(-1, GLASS.roofBack),
    roof(1, GLASS.roofBack),
    foot(1, GLASS.rear),
  ];
  pane(a, rearScreen, centre, frame, "glass", glass);

  const b = PILLARS.b * L;
  const c = PILLARS.c * L;
  const gap = 0.2;
  for (const s of [-1, 1]) {
    const side = [
      foot(s, GLASS.screen),
      roof(s, GLASS.roofFront),
      roof(s, GLASS.roofBack),
      foot(s, GLASS.rear),
    ];
    // Front door, back door, and the quarter light behind it.
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
    // The B pillar is black on nearly every saloon, and it is what makes the
    // side glass read as one long window over two doors.
    pane(
      a,
      clip(clip(side, b + gap + frame, -1), b - gap - frame, 1),
      centre,
      0.02,
      "rubber",
      TAXI.trim,
    );
  }
}

/** Grille, lamps, plate. */
function front(a: Assembly, L: number, W: number): void {
  const nose = L * 0.5;

  // A wide, low mouth with bars across it: a modern saloon's face is mostly
  // grille.
  const grille = rounded(W * 0.5, 1.0, 0.4, 0.3);
  grille.translate(0, 2.45, nose - 0.05);
  a.add(grille, "rubber", TAXI.trim);
  for (const y of [2.2, 2.45, 2.7]) {
    const bar = rounded(W * 0.46, 0.07, 0.08, 0.03);
    bar.translate(0, y, nose + 0.17);
    a.add(bar, "chrome", 0xb8bec6);
  }

  const intake = rounded(W * 0.6, 0.4, 0.3, 0.15);
  intake.translate(0, 1.15, nose - 0.02);
  a.add(intake, "rubber", TAXI.trim);

  const plate = rounded(PLATE.wide, PLATE.tall, 0.08, 0.04);
  plate.translate(0, PLATE.front, nose + 0.12);
  a.add(plate, "matte", 0xf4f4ef);

  for (const side of [-1, 1]) {
    // Headlamps, swept back round the corner of the wing.
    const lamp = rounded(W * 0.2, 0.45, 1.3, 0.18);
    lamp.rotateY(side * 0.35);
    lamp.translate(side * W * 0.36, 3.05, nose - 0.55);
    a.add(lamp, "glass", 0x8fa4b8);

    const drl = rounded(W * 0.15, 0.08, 0.8, 0.03);
    drl.rotateY(side * 0.35);
    drl.translate(side * W * 0.36, 2.83, nose - 0.5);
    a.add(drl, "chrome", 0xf6f8fa);

    const fog = new THREE.CylinderGeometry(0.2, 0.2, 0.12, DETAIL.coarse);
    fog.rotateX(Math.PI / 2);
    fog.translate(side * W * 0.36, 1.25, nose - 0.02);
    a.add(fog, "chrome", 0xc9cfd6);
  }
}

/** Tail lamps, boot lip, plate. */
function back(a: Assembly, L: number, W: number): void {
  const tail = -L * 0.5;
  for (const side of [-1, 1]) {
    // Wrapped round the corner, so they show from the side as well as from
    // behind — which is the angle the camera sees them from.
    const lamp = rounded(W * 0.26, 0.55, 1.1, 0.15);
    lamp.rotateY(-side * 0.3);
    lamp.translate(side * W * 0.34, 3.35, tail + 0.5);
    a.add(lamp, "glass", 0xb5121f);
  }
  const plate = rounded(PLATE.wide, PLATE.tall, 0.08, 0.04);
  plate.translate(0, PLATE.back, tail - 0.02);
  a.add(plate, "matte", 0xf4f4ef);

  const bumper = rounded(W * 0.9, 0.25, 0.2, 0.08);
  bumper.translate(0, 1.2, tail + 0.02);
  a.add(bumper, "rubber", TAXI.trim);
}

/** Door shut lines, handles, mirrors, the chrome under the side windows. */
function sides(a: Assembly, L: number, W: number, colour: number): void {
  const flank = W / 2 + 0.01;
  for (const side of [-1, 1]) {
    // Shut lines. Hairlines, but they are what turns one white side into two
    // doors, and a car with no doors is a toy.
    const bottom = TAXI.clearance + 0.15;
    const topOfDoor = TAXI.belt - 0.3;
    const shut = (z: number, from: number, to: number): void => {
      const line = new THREE.BoxGeometry(0.06, to - from, 0.07);
      line.translate(side * flank, (to + from) / 2, z);
      a.add(line, "rubber", 0x9aa1aa);
    };
    shut(0.16 * L, bottom, topOfDoor);
    shut(PILLARS.b * L, bottom, topOfDoor);
    // The back door's rear edge steps forward round the wheel arch, the way
    // a real one does, rather than running a line down through the arch.
    const step = TAXI.floor + 0.15;
    const clear = TAXI.rear * L + TAXI.arch + 0.15;
    shut(PILLARS.c * L, step, topOfDoor);
    shut(clear, bottom, step);
    const ledge = new THREE.BoxGeometry(0.06, 0.07, clear - PILLARS.c * L);
    ledge.translate(side * flank, step, (clear + PILLARS.c * L) / 2);
    a.add(ledge, "rubber", 0x9aa1aa);

    for (const z of [0.08, -0.19]) {
      const handle = rounded(0.12, 0.16, 0.75, 0.05);
      handle.translate(side * (flank + 0.04), TAXI.belt - 0.6, z * L);
      a.add(handle, "chrome", 0xc3c9d0);
    }

    const chrome = rounded(0.1, 0.1, (GLASS.screen - GLASS.rear) * L - 1, 0.04);
    chrome.translate(
      side * (W / 2) * 0.9,
      TAXI.belt + 0.04,
      ((GLASS.screen + GLASS.rear) / 2) * L,
    );
    a.add(chrome, "chrome", 0xc3c9d0);

    // Mirrors, on a stalk out from the foot of the windscreen.
    const stalk = rounded(0.6, 0.18, 0.3, 0.06);
    stalk.translate(side * (W / 2 - 0.1), TAXI.belt + 0.2, L * 0.12);
    a.add(stalk, "rubber", TAXI.trim);
    const mirror = rounded(0.5, 0.6, 0.9, 0.2);
    mirror.translate(side * (W / 2 + 0.25), TAXI.belt + 0.4, L * 0.115);
    a.add(mirror, "bodywork", colour);
  }
}

/**
 * The chequers and the badge, on both doors.
 *
 * A band of two rows of squares along the middle of the doors, between the
 * wheels, and a round badge sitting on it on the front door. Chequers because
 * they say "cab" to almost anybody and belong to no one city; low on the doors
 * because that is the flat part of the flank, clear of the arches and the
 * handles.
 */
function livery(L: number, W: number): Array<THREE.Object3D> {
  const out: Array<THREE.Object3D> = [];
  const from = TAXI.rear * L + TAXI.arch + 0.25;
  const to = TAXI.front * L - TAXI.arch - 0.25;
  const long = to - from;
  const squares = Math.round(long / (TAXI.chequers / TAXI.rows));
  const band = new THREE.MeshStandardMaterial({
    map: chequers(squares),
    roughness: 0.4,
    side: THREE.DoubleSide,
  });
  const badge = new THREE.MeshStandardMaterial({
    map: badgeFace(),
    transparent: true,
    alphaTest: 0.5,
    roughness: 0.4,
    side: THREE.DoubleSide,
  });

  for (const side of [-1, 1]) {
    const x = side * (W / 2 + 0.03);
    const strip = new THREE.PlaneGeometry(long, TAXI.chequers);
    strip.rotateY(side * (Math.PI / 2));
    strip.translate(x, TAXI.chequerHeight, (from + to) / 2);
    out.push(new THREE.Mesh(strip, band));

    const round = new THREE.PlaneGeometry(TAXI.badge, TAXI.badge);
    round.rotateY(side * (Math.PI / 2));
    round.translate(
      x + side * 0.02,
      TAXI.chequerHeight,
      (PILLARS.b + 0.2) * L * 0.5,
    );
    out.push(new THREE.Mesh(round, badge));
  }
  return out;
}

/**
 * The roof sign: a yellow panel with a peaked top and a round lamp on the
 * peak, TAXI across both faces and a row of chequers under the word.
 *
 * Its own shape rather than the usual box, so it is recognisably a taxi sign
 * without being anyone's in particular, and so it reads from above: the peak
 * and the lamp stand out against the roof where a flat box would not.
 */
function sign(L: number): Array<THREE.Object3D> {
  const z = GLASS.roofFront * L - 1.0;
  const w = TAXI.signWide;
  const h = TAXI.signTall;
  const bottom = TAXI.roof + 0.2;

  const outline = new THREE.Shape();
  outline.moveTo(-w / 2, 0);
  outline.lineTo(w / 2, 0);
  outline.lineTo(w / 2, h * 0.45);
  outline.quadraticCurveTo(w / 2, h, 0, h);
  outline.quadraticCurveTo(-w / 2, h, -w / 2, h * 0.45);
  outline.closePath();
  const bevel = 0.08;
  const panel = new THREE.ExtrudeGeometry(outline, {
    depth: TAXI.signDeep - bevel * 2,
    bevelEnabled: true,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 2,
    curveSegments: DETAIL.round,
  });
  panel.translate(0, bottom, z - TAXI.signDeep / 2 + bevel);

  const a = new Assembly();
  a.add(panel, "matte", TAXI.yellow);
  const foot = rounded(w * 0.75, 0.25, TAXI.signDeep * 0.8, 0.08);
  foot.translate(0, TAXI.roof + 0.1, z);
  a.add(foot, "rubber", TAXI.black);
  const lamp = new THREE.SphereGeometry(0.26, DETAIL.coarse, DETAIL.coarse);
  lamp.translate(0, bottom + h + 0.14, z);
  a.add(lamp, "glass", 0xff8a1e);

  const words = new THREE.MeshStandardMaterial({
    map: signFace(),
    transparent: true,
    alphaTest: 0.5,
    roughness: 0.5,
  });
  const out: Array<THREE.Object3D> = [a.build()];
  for (const facing of [1, -1]) {
    const face = new THREE.PlaneGeometry(w * 0.86, h * 0.8);
    if (facing < 0) {
      face.rotateY(Math.PI);
    }
    face.translate(
      0,
      bottom + h * 0.42,
      z + facing * (TAXI.signDeep / 2 + 0.02),
    );
    out.push(new THREE.Mesh(face, words));
  }
  return out;
}

/** One road wheel: a proper tyre, an alloy with five spokes, and a hub. */
function wheel(a: Assembly, x: number, z: number): void {
  const r = TAXI.wheel;
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

  const rim = new THREE.CylinderGeometry(r * 0.55, r * 0.55, 0.8, DETAIL.round);
  rim.rotateZ(Math.PI / 2);
  rim.translate(x, r, z);
  a.add(rim, "chrome", 0x8e949c);
  for (let i = 0; i < 5; i++) {
    const spoke = new THREE.BoxGeometry(0.2, r * 1.0, 0.26);
    spoke.translate(0, r * 0.25, 0);
    spoke.rotateX((i / 5) * Math.PI * 2);
    spoke.translate(x + out * 0.35, r, z);
    a.add(spoke, "chrome", 0xc8cdd3);
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

/** Two rows of black and yellow squares with a thin black edge top and
 *  bottom, so the band still has an outline on a yellow car. */
function chequers(squares: number): THREE.CanvasTexture {
  const cell = 16;
  const canvas = document.createElement("canvas");
  canvas.width = squares * cell;
  canvas.height = TAXI.rows * cell + 4;
  const g = canvas.getContext("2d")!;
  g.fillStyle = hex(TAXI.black);
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = hex(TAXI.yellow);
  for (let row = 0; row < TAXI.rows; row++) {
    for (let col = 0; col < squares; col++) {
      if ((row + col) % 2 === 0) {
        g.fillRect(col * cell, 2 + row * cell, cell, cell);
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  // Crisp squares, not squares blurred into a grey stripe.
  texture.magFilter = THREE.NearestFilter;
  return texture;
}

/** The door badge: a yellow disc in a black ring, a white star, and TAXI. */
function badgeFace(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d")!;
  const c = size / 2;
  g.fillStyle = hex(TAXI.black);
  g.beginPath();
  g.arc(c, c, c - 2, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = hex(TAXI.yellow);
  g.beginPath();
  g.arc(c, c, c * 0.84, 0, Math.PI * 2);
  g.fill();

  g.fillStyle = "#ffffff";
  g.strokeStyle = hex(TAXI.black);
  g.lineWidth = 6;
  star(g, c, size * 0.3, size * 0.13);
  g.stroke();
  g.fill();

  g.fillStyle = hex(TAXI.black);
  g.font = `900 ${Math.round(size * 0.25)}px "Arial Black", Impact, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("TAXI", c, size * 0.64, size * 0.66);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A five-pointed star path, centred on (x, y). */
function star(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
): void {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const reach = i % 2 === 0 ? r : r * 0.45;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    g.lineTo(x + Math.cos(angle) * reach, y + Math.sin(angle) * reach);
  }
  g.closePath();
}

/** The roof sign's face: TAXI in black, and a row of chequers under it. */
function signFace(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 128;
  const g = canvas.getContext("2d")!;
  g.fillStyle = hex(TAXI.black);
  g.font = `900 70px "Arial Black", Impact, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("TAXI", 160, 50, 250);
  const cell = 20;
  const squares = 14;
  const left = (canvas.width - squares * cell) / 2;
  for (let i = 0; i < squares; i++) {
    g.fillStyle = i % 2 === 0 ? hex(TAXI.black) : "#ffffff";
    g.fillRect(left + i * cell, 100, cell, cell);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
