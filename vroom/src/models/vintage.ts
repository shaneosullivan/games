import * as THREE from "three";
import {ConvexGeometry} from "three/examples/jsm/geometries/ConvexGeometry.js";
import {CAR, Sticker, VINTAGE} from "../config";
import {Assembly, DETAIL, rounded} from "./assembly";
import {
  across,
  AXLES,
  clip,
  dark,
  glassFor,
  pane,
  plates,
  rod,
} from "./coachwork";

/**
 * An old car: a grand saloon from the nineteen-thirties.
 *
 * A car from then is not one shape but several, and it reads as old because
 * of that. A tall chrome radiator stands at the front with a figure on top of
 * it, a long bonnet runs back from it to the windscreen, two big lamps sit out
 * in front on a bar, and each wheel has a wing of its own curving over it —
 * the front ones sweeping back and down into running boards along the sides.
 * The cabin behind is tall and upright.
 *
 * The wings and the running boards are black and the rest is the chosen
 * colour, which is how these were nearly always painted. On a car that is
 * already black they turn cream instead, or the car would be one shadow. The
 * roof would have been black too, and was, until the car was seen from where
 * the race camera sees it: from above, a black roof is most of the car, and
 * nobody could find their own.
 */
export function vintage(
  colour: number = 0x6b1f2a,
  stickers: ReadonlyArray<Sticker> = [],
): THREE.Group {
  const a = new Assembly();
  const L = CAR.length;
  const trim = dark(colour) ? VINTAGE.cream : VINTAGE.black;

  cabin(a, colour, trim, L);
  bonnet(a, colour, L);
  wings(a, trim, L);
  front(a, trim, L);
  back(a, trim, L);
  for (const along of [AXLES.front, AXLES.rear]) {
    for (const side of [-1, 1]) {
      wheel(a, side * VINTAGE.track, along * L);
    }
  }

  const group = a.build();
  group.name = "vintage";
  const plate = {wide: 1.8, tall: 0.4};
  plates(group, stickers, [
    {y: 1.1, z: L / 2 - 0.15, facing: 1, ...plate},
    {y: 2.0, z: -L / 2 + 0.18, facing: -1, ...plate},
  ]);
  return group;
}

/** Where the cabin's windows start and stop, as fractions of the length —
 *  an upright windscreen and a short rounded back — and its door pillars. */
const GLASS = {screen: 0.07, roofFront: 0.05, roofBack: -0.39, rear: -0.43};
const PILLARS = [-0.085, -0.27];

/** The body behind the bonnet: a tall box between the wheels, its windows,
 *  its doors, and its roof. */
function cabin(a: Assembly, colour: number, trim: number, L: number): void {
  const half = VINTAGE.body;
  const bottom = VINTAGE.board;
  const belt = VINTAGE.belt;
  const glass = glassFor(colour);

  // Stations: z as a fraction of the length, half width, bottom and top. The
  // front is the scuttle, as narrow as the bonnet it meets; the back rounds
  // under into the tail.
  const stations: ReadonlyArray<[number, number, number, number]> = [
    [0.1, 1.4, 2.3, VINTAGE.bonnet],
    [0.05, half, bottom, belt],
    [-0.4, half, bottom, belt],
    [-0.45, half * 0.95, bottom + 0.3, belt - 0.1],
    [-0.475, half * 0.8, bottom + 0.9, belt - 0.5],
  ];
  const points: Array<THREE.Vector3> = [];
  for (const [z, w, low, top] of stations) {
    for (const s of [-1, 1]) {
      points.push(new THREE.Vector3(s * w, low, z * L));
      points.push(new THREE.Vector3(s * w, top - 0.25, z * L));
      points.push(new THREE.Vector3(s * w * 0.95, top, z * L));
    }
  }
  a.add(new ConvexGeometry(points), "bodywork", colour);

  // The glasshouse, nearly upright on every side.
  const low = half * 0.97;
  const high = half * 0.9;
  const foot = (s: number, z: number): THREE.Vector3 =>
    new THREE.Vector3(s * low, belt, z * L);
  const top = (s: number, z: number): THREE.Vector3 =>
    new THREE.Vector3(s * high, VINTAGE.roof, z * L);
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
    colour,
  );
  const centre = new THREE.Vector3(
    0,
    (belt + VINTAGE.roof) / 2,
    ((GLASS.screen + GLASS.rear) / 2) * L,
  );
  const frame = 0.2;
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
    0.5,
    "glass",
    glass,
  );
  const [b, c] = PILLARS.map(p => p * L);
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
    // The little window at the back, set in from the corner.
    pane(a, clip(side, c - gap, -1), centre, 0.35, "glass", glass);

    // Doors: shut lines, handles, and the chrome along the waist.
    const x = s * (half + 0.01);
    for (const z of [GLASS.screen - 0.01, PILLARS[0], PILLARS[1]]) {
      rod(
        a,
        new THREE.Vector3(x, bottom + 0.15, z * L),
        new THREE.Vector3(x, belt - 0.05, z * L),
        0.035,
        "rubber",
        0x3a3c42,
      );
    }
    for (const z of [PILLARS[0] + 0.02, PILLARS[1] + 0.02]) {
      const handle = rounded(0.14, 0.14, 0.55, 0.05);
      handle.translate(s * (half + 0.07), belt - 0.45, z * L);
      a.add(handle, "chrome", VINTAGE.chrome);
    }
    rod(
      a,
      new THREE.Vector3(s * (half + 0.04), belt, GLASS.screen * L),
      new THREE.Vector3(s * (half + 0.04), belt, -0.4 * L),
      0.06,
      "chrome",
      VINTAGE.chrome,
    );
  }

  // The roof: a little bigger than the glass all round, with a black peak
  // out over the windscreen.
  const long = (GLASS.roofFront - GLASS.roofBack) * L + 0.5;
  const roof = rounded(high * 2 + 0.3, 0.4, long, 0.18);
  roof.translate(
    0,
    VINTAGE.roof + 0.12,
    ((GLASS.roofFront + GLASS.roofBack) / 2) * L,
  );
  a.add(roof, "bodywork", colour);
  const visor = rounded(high * 2, 0.12, 0.7, 0.05);
  visor.rotateX(-0.2);
  visor.translate(0, VINTAGE.roof - 0.05, GLASS.roofFront * L + 0.45);
  a.add(visor, "bodywork", trim);
}

/**
 * The bonnet: long, narrow and hinged down the middle, with rows of louvres
 * down its sides to let the heat of a very large engine out.
 */
function bonnet(a: Assembly, colour: number, L: number): void {
  const from = 0.1 * L;
  const to = 0.38 * L;
  const box = rounded(2.8, VINTAGE.bonnet - 2.2, to - from, 0.35);
  box.translate(0, (VINTAGE.bonnet + 2.2) / 2, (from + to) / 2);
  a.add(box, "bodywork", colour);

  rod(
    a,
    new THREE.Vector3(0, VINTAGE.bonnet + 0.02, from),
    new THREE.Vector3(0, VINTAGE.bonnet + 0.02, to),
    0.06,
    "chrome",
    VINTAGE.chrome,
  );
  for (const s of [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      const z = from + 1.2 + i * 0.42;
      rod(
        a,
        new THREE.Vector3(s * 1.41, 2.9, z),
        new THREE.Vector3(s * 1.41, 3.9, z),
        0.05,
        "rubber",
        0x2a2c32,
      );
    }
  }
}

/**
 * Four wings and two running boards.
 *
 * Each wing is drawn from the side — a band curving over its wheel — and
 * pushed out across the wheel. The front ones carry on past the back of the
 * wheel and sweep down to the running board; the back ones sweep down the
 * same way in front of theirs, so the board runs from one to the other.
 */
function wings(a: Assembly, trim: number, L: number): void {
  const r = VINTAGE.wheel;
  const outer = r + 0.5;
  const inner = r + 0.22;
  const wide = 1.5;
  const board = VINTAGE.board;

  // Drawn for the front wheel, with the sweep behind it. The back wing is the
  // same drawing turned end for end.
  const drawing = (flip: number): THREE.Shape => {
    const along: Array<THREE.Vector2> = [];
    const at = (u: number, y: number): void => {
      along.push(new THREE.Vector2(u * flip, y));
    };
    const [start, end] = [0.12, 0.84];
    // Over the wheel, front to back.
    for (let i = 0; i <= 16; i++) {
      const t = (start + (end - start) * (i / 16)) * Math.PI;
      at(Math.cos(t) * outer, r + Math.sin(t) * outer);
    }
    // Down and back to the running board.
    const top = new THREE.Vector2(
      Math.cos(end * Math.PI) * outer,
      r + Math.sin(end * Math.PI) * outer,
    );
    const reach = -r - 2.6;
    for (let i = 1; i <= 10; i++) {
      const t = i / 10;
      const u = top.x + (reach - top.x) * t;
      const y = top.y + (board + 0.2 - top.y) * (1 - (1 - t) * (1 - t));
      at(u, y);
    }
    at(reach, board - 0.05);
    at(reach + 1.1, board - 0.05);
    // And back up under it, to the underside of the arch.
    const under = new THREE.Vector2(
      Math.cos(end * Math.PI) * inner,
      r + Math.sin(end * Math.PI) * inner,
    );
    for (let i = 1; i <= 6; i++) {
      const t = i / 6;
      at(
        reach + 1.1 + (under.x - reach - 1.1) * t,
        board - 0.05 + (under.y - board + 0.05) * t * t,
      );
    }
    for (let i = 16; i >= 0; i--) {
      const t = (start + (end - start) * (i / 16)) * Math.PI;
      at(Math.cos(t) * inner, r + Math.sin(t) * inner);
    }
    return new THREE.Shape(along);
  };

  for (const s of [-1, 1]) {
    const x = s * VINTAGE.track;
    a.add(across(drawing(1), wide, AXLES.front * L, x), "bodywork", trim);
    a.add(across(drawing(-1), wide, AXLES.rear * L, x), "bodywork", trim);

    // The running board, between the two sweeps, and the valance joining it
    // to the body.
    const from = AXLES.front * L - r - 1.6;
    const to = AXLES.rear * L + r + 1.6;
    const plank = rounded(wide, 0.22, from - to, 0.08);
    plank.translate(x, board - 0.1, (from + to) / 2);
    a.add(plank, "bodywork", trim);
    const valance = rounded(
      VINTAGE.track - VINTAGE.body,
      0.5,
      from - to + 2,
      0.1,
    );
    valance.translate(
      s * (VINTAGE.body + (VINTAGE.track - VINTAGE.body) / 2 - 0.3),
      board - 0.25,
      (from + to) / 2,
    );
    a.add(valance, "bodywork", trim);
    // Rubber treads along it.
    for (const k of [-0.4, 0, 0.4]) {
      rod(
        a,
        new THREE.Vector3(x + k, board + 0.03, from - 0.2),
        new THREE.Vector3(x + k, board + 0.03, to + 0.2),
        0.04,
        "rubber",
        0x2a2c32,
      );
    }

    // A side lamp on top of each front wing.
    const lamp = new THREE.CylinderGeometry(0.2, 0.26, 0.5, DETAIL.coarse);
    lamp.translate(x, r + outer + 0.2, AXLES.front * L + 0.4);
    a.add(lamp, "chrome", VINTAGE.chrome);
    const glow = new THREE.SphereGeometry(0.2, DETAIL.coarse, 8);
    glow.translate(x, r + outer + 0.5, AXLES.front * L + 0.4);
    a.add(glow, "glass", 0xfff4d6);
  }
}

/** The radiator and its mascot, the big lamps on their bar, and the bumper. */
function front(a: Assembly, trim: number, L: number): void {
  const z = 0.39 * L;
  // The radiator shell: tall, chrome, with the dark core showing through.
  const shell = rounded(2.7, 3.1, 0.6, 0.2);
  shell.translate(0, 3.1, z);
  a.add(shell, "chrome", VINTAGE.chrome);
  const core = rounded(2.1, 2.5, 0.2, 0.08);
  core.translate(0, 3.05, z + 0.25);
  a.add(core, "rubber", 0x26282d);
  for (let i = -4; i <= 4; i++) {
    const slat = rounded(0.07, 2.4, 0.08, 0.02);
    slat.translate(i * 0.22, 3.05, z + 0.37);
    a.add(slat, "chrome", VINTAGE.chrome);
  }
  const cap = new THREE.CylinderGeometry(0.2, 0.26, 0.3, DETAIL.coarse);
  cap.translate(0, 4.8, z);
  a.add(cap, "chrome", VINTAGE.chrome);
  // The figure on top: a leaning body with wings out behind it.
  const figure = new THREE.ConeGeometry(0.16, 0.7, DETAIL.coarse);
  figure.rotateX(0.5);
  figure.translate(0, 5.25, z + 0.1);
  a.add(figure, "chrome", VINTAGE.chrome);
  for (const s of [-1, 1]) {
    const wingTip = rounded(0.5, 0.06, 0.28, 0.02);
    wingTip.rotateZ(s * 0.5);
    wingTip.translate(s * 0.22, 5.4, z - 0.05);
    a.add(wingTip, "chrome", VINTAGE.chrome);
  }

  // The lamps, big and round, out in front of the radiator on a bar between
  // the wings.
  const lampsAt = 0.43 * L;
  rod(
    a,
    new THREE.Vector3(-VINTAGE.track, 3.1, lampsAt - 0.2),
    new THREE.Vector3(VINTAGE.track, 3.1, lampsAt - 0.2),
    0.09,
    "chrome",
    VINTAGE.chrome,
  );
  for (const s of [-1, 1]) {
    const bowl = new THREE.SphereGeometry(0.8, DETAIL.round, DETAIL.coarse);
    bowl.scale(1, 1, 0.8);
    bowl.translate(s * 1.9, 3.75, lampsAt);
    a.add(bowl, "chrome", VINTAGE.chrome);
    const lens = new THREE.CylinderGeometry(0.68, 0.68, 0.1, DETAIL.round);
    lens.rotateX(Math.PI / 2);
    lens.translate(s * 1.9, 3.75, lampsAt + 0.62);
    a.add(lens, "glass", 0xf2f5f0);
    rod(
      a,
      new THREE.Vector3(s * 1.9, 3.1, lampsAt - 0.2),
      new THREE.Vector3(s * 1.9, 3.3, lampsAt - 0.1),
      0.1,
      "chrome",
      VINTAGE.chrome,
    );
    // Horns, one under each lamp.
    const horn = new THREE.ConeGeometry(0.26, 0.6, DETAIL.coarse, 1, true);
    horn.rotateX(-Math.PI / 2);
    horn.translate(s * 0.95, 2.55, lampsAt + 0.1);
    a.add(horn, "chrome", VINTAGE.chrome);
  }

  // Two bars across the front, on brackets from the chassis.
  for (const y of [1.5, 1.95]) {
    const bar = rounded(CAR.width * 0.98, 0.2, 0.25, 0.09);
    bar.translate(0, y, L / 2 - 0.15);
    a.add(bar, "chrome", VINTAGE.chrome);
  }
  for (const s of [-1, 1]) {
    const bracket = rounded(0.2, 0.25, 1.4, 0.06);
    bracket.translate(s * 1.6, 1.7, L / 2 - 0.9);
    a.add(bracket, "rubber", trim);
  }
  const plate = rounded(1.8, 0.4, 0.06, 0.03);
  plate.translate(0, 1.1, L / 2 - 0.2);
  a.add(plate, "matte", 0xf4f4ef);
}

/** A trunk on a rack at the back, a small bumper, and the tail lamps. */
function back(a: Assembly, trim: number, L: number): void {
  const tail = -L / 2;
  const trunk = rounded(3.6, 1.6, 1.0, 0.18);
  trunk.translate(0, 3.1, tail + 0.75);
  a.add(trunk, "matte", trim);
  for (const s of [-1, 1]) {
    const strap = rounded(0.16, 1.66, 1.06, 0.05);
    strap.translate(s * 1.0, 3.1, tail + 0.75);
    a.add(strap, "chrome", VINTAGE.chrome);
    const lamp = new THREE.SphereGeometry(0.22, DETAIL.coarse, 8);
    lamp.translate(
      s * VINTAGE.track,
      VINTAGE.wheel + 1.3,
      AXLES.rear * L - VINTAGE.wheel - 0.8,
    );
    a.add(lamp, "glass", 0xb5121f);
  }
  const bumper = rounded(CAR.width * 0.8, 0.2, 0.25, 0.09);
  bumper.translate(0, 1.7, tail + 0.12);
  a.add(bumper, "chrome", VINTAGE.chrome);
  const plate = rounded(1.8, 0.4, 0.06, 0.03);
  plate.translate(0, 2.0, tail + 0.23);
  a.add(plate, "matte", 0xf4f4ef);
}

/** A big wheel: a tall thin tyre, a painted disc, and chrome rings. */
function wheel(a: Assembly, x: number, z: number): void {
  const r = VINTAGE.wheel;
  const out = Math.sign(x);
  const tyre = new THREE.TorusGeometry(
    r * 0.76,
    r * 0.24,
    DETAIL.coarse,
    DETAIL.round,
  );
  tyre.scale(1, 1, 1.2);
  tyre.rotateY(Math.PI / 2);
  tyre.translate(x, r, z);
  a.add(tyre, "rubber", 0x141418);

  // A white wall, as the grand ones had.
  const wall = new THREE.TorusGeometry(r * 0.66, r * 0.07, 6, DETAIL.round);
  wall.rotateY(Math.PI / 2);
  wall.translate(x + out * 0.4, r, z);
  a.add(wall, "matte", 0xf1eee6);

  const disc = new THREE.CylinderGeometry(r * 0.6, r * 0.6, 0.55, DETAIL.round);
  disc.rotateZ(Math.PI / 2);
  disc.translate(x, r, z);
  a.add(disc, "matte", VINTAGE.cream);
  const ring = new THREE.TorusGeometry(r * 0.38, 0.07, 6, DETAIL.round);
  ring.rotateY(Math.PI / 2);
  ring.translate(x + out * 0.3, r, z);
  a.add(ring, "chrome", VINTAGE.chrome);
  const hub = new THREE.CylinderGeometry(r * 0.17, r * 0.2, 0.5, DETAIL.coarse);
  hub.rotateZ(Math.PI / 2);
  hub.translate(x + out * 0.35, r, z);
  a.add(hub, "chrome", VINTAGE.chrome);
}
