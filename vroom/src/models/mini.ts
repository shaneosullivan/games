import * as THREE from "three";
import {ConvexGeometry} from "three/examples/jsm/geometries/ConvexGeometry.js";
import {CAR, MINI} from "../config";
import {Assembly, DETAIL, rounded} from "./assembly";
import {AXLES, clip, glassFor, pale, pane, rod, underbody} from "./coachwork";

/**
 * A Mini: a small two-door box with a wheel at each corner.
 *
 * Almost none of it is in front of the front wheels or behind the back ones,
 * which is the whole look of the thing, and the rest is the details anybody
 * who has seen one would draw: two round headlamps on the ends of the wings,
 * a grille shaped like a moustache, chrome bumpers with little upright
 * overriders, the seams that run down the outside of the body where other
 * cars hide theirs, door hinges on the outside, and a roof in a different
 * colour from the car.
 */
export function mini(colour: number = 0xc8102e): THREE.Group {
  const a = new Assembly();
  const L = CAR.length;
  const W = CAR.width;

  body(a, colour, L, W);
  glasshouse(a, colour, L);
  front(a, colour, L, W);
  back(a, L, W);
  sides(a, colour, L, W);
  for (const along of [AXLES.front, AXLES.rear]) {
    for (const side of [-1, 1]) {
      wheel(a, side * MINI.track, along * L);
    }
  }

  const group = a.build();
  group.name = "mini";
  return group;
}

/** Stations down the upper body: z and half width as fractions, and the
 *  height of the top. A short bonnet dropping to the grille, and a flat back. */
const BODY: ReadonlyArray<[number, number, number]> = [
  [0.5, 0.84, 3.05],
  [0.47, 0.95, 3.55],
  [0.4, 0.99, 3.78],
  [0.22, 1.0, 3.95],
  [-0.3, 1.0, 4.0],
  [-0.46, 0.98, 4.0],
  [-0.5, 0.92, 3.85],
];

/** The glass, as fractions of the length: windscreen foot, roof front and
 *  back, rear screen foot — and the door's back edge. */
const GLASS = {screen: 0.2, roofFront: 0.09, roofBack: -0.36, rear: -0.46};
const DOOR = {front: 0.215, back: -0.17};

function body(a: Assembly, colour: number, L: number, W: number): void {
  const points: Array<THREE.Vector3> = [];
  for (const [z, wide, top] of BODY) {
    const x = (W / 2) * wide;
    // Round-sided rather than slab-sided: a Mini bulges at the waist and
    // turns in towards the windows.
    for (const s of [-1, 1]) {
      points.push(new THREE.Vector3(s * x * 0.97, MINI.floor, z * L));
      points.push(new THREE.Vector3(s * x, top - 0.9, z * L));
      points.push(new THREE.Vector3(s * x * 0.96, top - 0.3, z * L));
      points.push(new THREE.Vector3(s * x * 0.87, top, z * L));
    }
    points.push(new THREE.Vector3(0, top + 0.05, z * L));
  }
  a.add(new ConvexGeometry(points), "bodywork", colour);
  underbody(a, colour, MINI.trim, MINI);
}

/**
 * The roof and the windows: nearly upright all round, as a Mini's are, with
 * the roof panel on top in its own colour.
 */
function glasshouse(a: Assembly, colour: number, L: number): void {
  const base = MINI.belt;
  const glass = glassFor(colour);
  const low = (CAR.width / 2) * 0.86;
  const high = (CAR.width / 2) * 0.76;
  const foot = (s: number, z: number): THREE.Vector3 =>
    new THREE.Vector3(s * low, base, z * L);
  const top = (s: number, z: number): THREE.Vector3 =>
    new THREE.Vector3(s * high, MINI.roof, z * L);

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
    (base + MINI.roof) / 2,
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
    frame,
    "glass",
    glass,
  );
  const pillar = DOOR.back * L;
  for (const s of [-1, 1]) {
    const side = [
      foot(s, GLASS.screen),
      top(s, GLASS.roofFront),
      top(s, GLASS.roofBack),
      foot(s, GLASS.rear),
    ];
    // The door's window and the one behind it, with a painted pillar
    // between.
    pane(a, clip(side, pillar + 0.25, 1), centre, frame, "glass", glass);
    pane(a, clip(side, pillar - 0.25, -1), centre, frame, "glass", glass);
  }

  // The roof, in the other colour, overhanging the glass a little the way the
  // gutter round a Mini's roof does.
  const roofColour = pale(colour) ? MINI.roofDark : MINI.roofLight;
  const long = (GLASS.roofFront - GLASS.roofBack) * L + 0.35;
  const roof = rounded(high * 2 + 0.35, 0.5, long, 0.24);
  roof.translate(
    0,
    MINI.roof + 0.1,
    ((GLASS.roofFront + GLASS.roofBack) / 2) * L,
  );
  a.add(roof, "bodywork", roofColour);
}

/** Headlamps on the wings, the moustache grille, bumper, badge and plate. */
function front(a: Assembly, colour: number, L: number, W: number): void {
  const nose = L / 2;

  // The grille: wide at the top, dipping in the middle of its lower edge and
  // turning up at both ends — the moustache.
  const outline = (grow: number): THREE.Shape => {
    const g = new THREE.Shape();
    const w = 1.55 * grow;
    g.moveTo(-w, 3.0 + 0.08 * grow);
    g.lineTo(w, 3.0 + 0.08 * grow);
    g.quadraticCurveTo(w * 1.18, 2.9, w * 1.02, 2.5);
    g.quadraticCurveTo(w * 0.75, 2.12 - 0.08 * grow, 0, 2.02 - 0.1 * grow);
    g.quadraticCurveTo(-w * 0.75, 2.12 - 0.08 * grow, -w * 1.02, 2.5);
    g.quadraticCurveTo(-w * 1.18, 2.9, -w, 3.0 + 0.08 * grow);
    return g;
  };
  const surround = new THREE.ExtrudeGeometry(outline(1.1), {
    depth: 0.22,
    bevelEnabled: false,
    curveSegments: DETAIL.coarse,
  });
  surround.translate(0, 0, nose - 0.12);
  a.add(surround, "chrome", MINI.chrome);
  const grille = new THREE.ExtrudeGeometry(outline(1), {
    depth: 0.22,
    bevelEnabled: false,
    curveSegments: DETAIL.coarse,
  });
  grille.translate(0, 0, nose - 0.06);
  a.add(grille, "rubber", MINI.trim);
  for (const [y, wide] of [
    [2.8, 1.5],
    [2.55, 1.45],
    [2.3, 1.1],
  ] as Array<[number, number]>) {
    const bar = rounded(wide * 2, 0.07, 0.08, 0.03);
    bar.translate(0, y, nose + 0.2);
    a.add(bar, "chrome", MINI.chrome);
  }

  for (const side of [-1, 1]) {
    const x = side * W * 0.345;
    // Round headlamps in pods on the front of the wings.
    const pod = new THREE.CylinderGeometry(0.72, 0.8, 0.9, DETAIL.round);
    pod.rotateX(Math.PI / 2);
    pod.translate(x, 3.2, nose - 0.3);
    a.add(pod, "bodywork", colour);
    const rim = new THREE.TorusGeometry(0.62, 0.1, 8, DETAIL.round);
    rim.translate(x, 3.2, nose + 0.16);
    a.add(rim, "chrome", MINI.chrome);
    const lens = new THREE.SphereGeometry(0.58, DETAIL.round, DETAIL.coarse);
    lens.scale(1, 1, 0.32);
    lens.translate(x, 3.2, nose + 0.12);
    a.add(lens, "glass", 0xe8eff5);

    const indicator = new THREE.SphereGeometry(0.2, DETAIL.coarse, 8);
    indicator.scale(1, 0.8, 0.6);
    indicator.translate(side * W * 0.37, 2.3, nose + 0.08);
    a.add(indicator, "glass", 0xff9a2e);

    // Overriders: the little upright bars on the bumper.
    const over = rounded(0.3, 1.0, 0.4, 0.12);
    over.translate(side * 1.3, 1.75, nose + 0.35);
    a.add(over, "chrome", MINI.chrome);
  }

  const bumper = rounded(W * 1.02, 0.34, 0.4, 0.16);
  bumper.translate(0, 1.55, nose + 0.16);
  a.add(bumper, "chrome", MINI.chrome);

  const plate = rounded(W * 0.3, 0.42, 0.06, 0.03);
  plate.translate(0, 1.0, nose + 0.12);
  a.add(plate, "matte", 0xf4f4ef);

  // The bonnet's badge, and the pressed ridge down the middle of it.
  const badge = new THREE.SphereGeometry(0.22, DETAIL.coarse, 8);
  badge.scale(1.8, 0.7, 0.6);
  badge.translate(0, 3.25, nose - 0.2);
  a.add(badge, "chrome", MINI.chrome);
}

/** Upright tail lamps at the corners, the boot lid, plate and bumper. */
function back(a: Assembly, L: number, W: number): void {
  const tail = -L / 2;
  for (const side of [-1, 1]) {
    const lamp = rounded(0.5, 1.1, 0.25, 0.1);
    lamp.translate(side * W * 0.42, 3.2, tail - 0.02);
    a.add(lamp, "glass", 0xb5121f);
    const amber = rounded(0.5, 0.3, 0.26, 0.08);
    amber.translate(side * W * 0.42, 3.9, tail - 0.02);
    a.add(amber, "glass", 0xff9a2e);

    const over = rounded(0.3, 1.0, 0.4, 0.12);
    over.translate(side * 1.3, 1.75, tail - 0.35);
    a.add(over, "chrome", MINI.chrome);
  }

  // The boot lid's outline, in the shut line round it.
  const lid = {x: 1.9, low: 1.95, high: 3.7};
  const at = tail - 0.04;
  const edge = [
    new THREE.Vector3(-lid.x, lid.low, at),
    new THREE.Vector3(lid.x, lid.low, at),
    new THREE.Vector3(lid.x, lid.high, at),
    new THREE.Vector3(-lid.x, lid.high, at),
  ];
  for (let i = 0; i < 4; i++) {
    rod(a, edge[i], edge[(i + 1) % 4], 0.035, "rubber", 0x9aa1aa);
  }
  const handle = rounded(0.9, 0.14, 0.14, 0.06);
  handle.translate(0, 2.9, tail - 0.08);
  a.add(handle, "chrome", MINI.chrome);

  const plate = rounded(W * 0.3, 0.42, 0.06, 0.03);
  plate.translate(0, 2.3, tail - 0.08);
  a.add(plate, "matte", 0xf4f4ef);

  const bumper = rounded(W * 1.02, 0.34, 0.4, 0.16);
  bumper.translate(0, 1.55, tail - 0.16);
  a.add(bumper, "chrome", MINI.chrome);

  const exhaust = new THREE.CylinderGeometry(0.16, 0.16, 0.8, DETAIL.coarse);
  exhaust.rotateX(Math.PI / 2);
  exhaust.translate(-W * 0.3, 0.75, tail - 0.1);
  a.add(exhaust, "chrome", 0x8e949c);
}

/**
 * The door, its hinges, and the seams.
 *
 * A Mini wears its seams on the outside — a lip down each side of the
 * windscreen, and another round the bottom of the body — and its door hinges
 * too. They are small, and they are most of why it does not look like any
 * other little car.
 */
function sides(a: Assembly, colour: number, L: number, W: number): void {
  const flank = W / 2;
  for (const side of [-1, 1]) {
    const x = side * (flank + 0.05);
    // The seam down the front of the door, from the roof to the sill.
    rod(
      a,
      new THREE.Vector3(x, MINI.clearance + 0.1, DOOR.front * L + 0.15),
      new THREE.Vector3(x, MINI.belt, DOOR.front * L + 0.15),
      0.07,
      "bodywork",
      colour,
    );
    // Along the bottom of the body, arch to arch.
    rod(
      a,
      new THREE.Vector3(x, MINI.clearance + 0.08, AXLES.front * L - MINI.arch),
      new THREE.Vector3(x, MINI.clearance + 0.08, AXLES.rear * L + MINI.arch),
      0.07,
      "bodywork",
      colour,
    );
    // Along the top of the wing, from the lamp to the windscreen.
    rod(
      a,
      new THREE.Vector3(side * (flank - 0.05), 3.6, L * 0.46),
      new THREE.Vector3(side * (flank - 0.05), 3.72, DOOR.front * L + 0.15),
      0.07,
      "bodywork",
      colour,
    );

    // Shut lines.
    for (const z of [DOOR.front, DOOR.back]) {
      rod(
        a,
        new THREE.Vector3(side * (flank + 0.01), MINI.clearance + 0.2, z * L),
        new THREE.Vector3(side * (flank + 0.01), MINI.belt - 0.1, z * L),
        0.035,
        "rubber",
        0x9aa1aa,
      );
    }
    // The hinges, on the outside.
    for (const y of [2.2, 3.4]) {
      const hinge = rounded(0.16, 0.34, 0.3, 0.06);
      hinge.translate(side * (flank + 0.08), y, DOOR.front * L - 0.18);
      a.add(hinge, "chrome", MINI.chrome);
    }
    const handle = rounded(0.12, 0.14, 0.6, 0.05);
    handle.translate(
      side * (flank + 0.06),
      MINI.belt - 0.35,
      DOOR.back * L + 0.6,
    );
    a.add(handle, "chrome", MINI.chrome);

    // A round mirror on a stalk.
    const stalk = rounded(0.5, 0.12, 0.12, 0.05);
    stalk.translate(
      side * (flank + 0.1),
      MINI.belt + 0.1,
      DOOR.front * L - 0.6,
    );
    a.add(stalk, "chrome", MINI.chrome);
    const mirror = new THREE.CylinderGeometry(0.34, 0.34, 0.14, DETAIL.coarse);
    mirror.rotateX(Math.PI / 2);
    mirror.translate(
      side * (flank + 0.38),
      MINI.belt + 0.35,
      DOOR.front * L - 0.6,
    );
    a.add(mirror, "chrome", MINI.chrome);
  }
}

/** A little steel wheel with a chrome cap. */
function wheel(a: Assembly, x: number, z: number): void {
  const r = MINI.wheel;
  const out = Math.sign(x);
  const tyre = new THREE.TorusGeometry(
    r * 0.7,
    r * 0.3,
    DETAIL.coarse,
    DETAIL.round,
  );
  tyre.scale(1, 1, 1.25);
  tyre.rotateY(Math.PI / 2);
  tyre.translate(x, r, z);
  a.add(tyre, "rubber", 0x141418);

  const rim = new THREE.CylinderGeometry(r * 0.52, r * 0.52, 0.7, DETAIL.round);
  rim.rotateZ(Math.PI / 2);
  rim.translate(x, r, z);
  a.add(rim, "matte", 0xb9bec5);
  const cap = new THREE.SphereGeometry(r * 0.3, DETAIL.coarse, 8);
  cap.scale(0.45, 1, 1);
  cap.translate(x + out * 0.35, r, z);
  a.add(cap, "chrome", MINI.chrome);
}
