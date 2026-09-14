import * as THREE from "three";
import {CAR, ENGINE, WINDOWS} from "../config";
import {Assembly, DETAIL, rounded} from "./assembly";
import {rod} from "./coachwork";

/**
 * A tank engine: a little steam locomotive on six wheels, racing with the
 * cars.
 *
 * Built from the front: a black smokebox with a chimney on it and a round
 * door on the front, then the boiler in the chosen colour with a dome and two
 * brass safety valves on top, square water tanks down either side of it, a
 * cab with round windows in its front, and a coal bunker at the back. All of
 * that stands on a running board over three big spoked wheels a
 * side joined by coupling rods, with a buffer beam and two buffers at each
 * end.
 *
 * There is no face on it. The front of a real engine's boiler is a door, and
 * that is what this one has.
 *
 * It is the same sixteen by seven as every car on the grid and drives exactly
 * as they do: the six wheels are what it looks like, not what it runs on.
 */
export function engine(colour: number = 0x2f7fd0): THREE.Group {
  const a = new Assembly();
  const L = CAR.length;

  chassis(a, colour, L);
  boiler(a, colour, L);
  tanks(a, colour, L);
  cab(a, colour, L);
  for (const along of ENGINE.wheels) {
    for (const side of [-1, 1]) {
      wheel(a, colour, side * ENGINE.track, along * L);
    }
  }
  // Coupling rods, joining the wheels on each side, just off their middles.
  for (const side of [-1, 1]) {
    const x = side * (ENGINE.track + 0.35);
    const y = ENGINE.wheel + 0.4;
    const first = ENGINE.wheels[0] * L;
    const last = ENGINE.wheels[ENGINE.wheels.length - 1] * L;
    const bar = rounded(0.16, 0.3, first - last + 0.6, 0.08);
    bar.translate(x, y, (first + last) / 2);
    a.add(bar, "chrome", 0x9aa0a8);
    for (const along of ENGINE.wheels) {
      const pin = new THREE.CylinderGeometry(0.16, 0.16, 0.3, DETAIL.coarse);
      pin.rotateZ(Math.PI / 2);
      pin.translate(x + side * 0.1, y, along * L);
      a.add(pin, "chrome", 0xc8cdd3);
    }
  }

  const group = a.build();
  group.name = "engine";
  return group;
}

/** The running board, the frames under it, and the buffer beams. */
function chassis(a: Assembly, colour: number, L: number): void {
  const top = ENGINE.footplate;
  const W = CAR.width;

  // The running board: black on top, with a painted valance down its edge.
  const deck = rounded(W, 0.18, L - 0.6, 0.06);
  deck.translate(0, top - 0.09, 0);
  a.add(deck, "matte", ENGINE.black);
  for (const side of [-1, 1]) {
    const valance = rounded(0.16, 0.55, L - 0.6, 0.05);
    valance.translate(side * (W / 2 - 0.08), top - 0.4, 0);
    a.add(valance, "bodywork", colour);
  }
  // Frames, between the wheels.
  for (const side of [-1, 1]) {
    const frame = rounded(0.3, top - 1.0, L - 1.2, 0.08);
    frame.translate(side * 2.2, (top + 1.0) / 2, 0);
    a.add(frame, "matte", ENGINE.black);
  }

  for (const end of [-1, 1]) {
    const z = end * (L / 2 - 0.3);
    const beam = rounded(W, 1.1, 0.45, 0.08);
    beam.translate(0, top - 0.6, z);
    a.add(beam, "bodywork", colour);
    for (const side of [-1, 1]) {
      const stock = new THREE.CylinderGeometry(0.24, 0.3, 0.7, DETAIL.coarse);
      stock.rotateX(Math.PI / 2);
      stock.translate(side * 2.4, top - 0.6, z + end * 0.5);
      a.add(stock, "matte", ENGINE.black);
      const head = new THREE.CylinderGeometry(0.5, 0.5, 0.16, DETAIL.round);
      head.rotateX(Math.PI / 2);
      head.translate(side * 2.4, top - 0.6, z + end * 0.88);
      a.add(head, "matte", ENGINE.black);
    }
    const hook = rounded(0.3, 0.5, 0.5, 0.08);
    hook.translate(0, top - 0.75, z + end * 0.45);
    a.add(hook, "matte", ENGINE.black);
  }

  // A lamp on the front of the running board.
  const lamp = rounded(0.6, 0.7, 0.5, 0.1);
  lamp.translate(-1.9, top + 0.35, L / 2 - 0.7);
  a.add(lamp, "matte", 0xeceae4);
  const lens = new THREE.CylinderGeometry(0.2, 0.2, 0.06, DETAIL.coarse);
  lens.rotateX(Math.PI / 2);
  lens.translate(-1.9, top + 0.35, L / 2 - 0.43);
  a.add(lens, "glass", 0xfff6d8);
}

/** The smokebox, boiler, chimney, dome and valves. */
function boiler(a: Assembly, colour: number, L: number): void {
  const y = ENGINE.boiler;
  const r = ENGINE.radius;
  const along = (
    radius: number,
    from: number,
    to: number,
    substance: "bodywork" | "matte",
    paint: number,
  ): void => {
    const drum = new THREE.CylinderGeometry(
      radius,
      radius,
      from - to,
      DETAIL.round,
    );
    drum.rotateX(Math.PI / 2);
    drum.translate(0, y, (from + to) / 2);
    a.add(drum, substance, paint);
  };

  // The boiler, back to the cab, with a band round it where it meets the
  // smokebox.
  along(r, 0.33 * L, -0.07 * L, "bodywork", colour);
  along(r + 0.06, 0.33 * L + 0.05, 0.33 * L - 0.2, "matte", ENGINE.black);
  // The smokebox, black, and a little bigger.
  const front = 0.44 * L;
  along(r + 0.12, front, 0.33 * L, "matte", ENGINE.black);
  const saddle = rounded(2.6, y - ENGINE.footplate, 1.6, 0.1);
  saddle.translate(0, (y + ENGINE.footplate) / 2, 0.39 * L);
  a.add(saddle, "matte", ENGINE.black);

  // Its door: a plain round plate with a ring round the edge and a handle
  // across the middle — which is what is on the front of an engine.
  const door = new THREE.CylinderGeometry(
    r * 0.92,
    r * 0.95,
    0.2,
    DETAIL.round,
  );
  door.rotateX(Math.PI / 2);
  door.translate(0, y, front + 0.1);
  a.add(door, "matte", 0x2b2d33);
  const ring = new THREE.TorusGeometry(r * 0.92, 0.08, 6, DETAIL.round);
  ring.translate(0, y, front + 0.2);
  a.add(ring, "matte", ENGINE.black);
  const boss = new THREE.CylinderGeometry(0.2, 0.24, 0.3, DETAIL.coarse);
  boss.rotateX(Math.PI / 2);
  boss.translate(0, y, front + 0.3);
  a.add(boss, "chrome", 0xb8bec6);
  const handle = rounded(1.1, 0.12, 0.12, 0.05);
  handle.translate(0, y, front + 0.45);
  a.add(handle, "chrome", 0xb8bec6);
  // Hinge straps across the door.
  for (const dy of [-0.8, 0.8]) {
    const strap = rounded(r * 1.5, 0.14, 0.05, 0.04);
    strap.translate(0, y + dy, front + 0.22);
    a.add(strap, "matte", ENGINE.black);
  }

  // The chimney, with a lip round its top.
  const chimney = new THREE.CylinderGeometry(0.5, 0.62, 2.1, DETAIL.round);
  chimney.translate(0, y + r + 0.8, 0.385 * L);
  a.add(chimney, "matte", ENGINE.black);
  const lip = new THREE.TorusGeometry(0.55, 0.14, 8, DETAIL.round);
  lip.rotateX(Math.PI / 2);
  lip.translate(0, y + r + 1.85, 0.385 * L);
  a.add(lip, "matte", ENGINE.black);

  // The dome, in the paint.
  const dome = new THREE.CylinderGeometry(0.72, 0.85, 0.7, DETAIL.round);
  dome.translate(0, y + r + 0.2, 0.14 * L);
  a.add(dome, "bodywork", colour);
  const cap = new THREE.SphereGeometry(
    0.72,
    DETAIL.round,
    DETAIL.coarse,
    0,
    Math.PI * 2,
    0,
    Math.PI / 2,
  );
  cap.scale(1, 0.8, 1);
  cap.translate(0, y + r + 0.55, 0.14 * L);
  a.add(cap, "bodywork", colour);

  // Two brass safety valves.
  for (const x of [-0.28, 0.28]) {
    const valve = new THREE.CylinderGeometry(0.15, 0.2, 0.9, DETAIL.coarse);
    valve.translate(x, y + r + 0.35, 0.02 * L);
    a.add(valve, "chrome", ENGINE.brass);
    const top = new THREE.SphereGeometry(0.16, DETAIL.coarse, 8);
    top.translate(x, y + r + 0.82, 0.02 * L);
    a.add(top, "chrome", ENGINE.brass);
  }

  // Handrails along the boiler.
  for (const side of [-1, 1]) {
    rod(
      a,
      new THREE.Vector3(side * (r + 0.15), y + 0.5, 0.43 * L),
      new THREE.Vector3(side * (r + 0.15), y + 0.5, -0.06 * L),
      0.05,
      "chrome",
      0xc8cdd3,
    );
  }
}

/** The water tanks, one each side of the boiler, lined out in red. */
function tanks(a: Assembly, colour: number, L: number): void {
  const from = 0.28 * L;
  const to = -0.07 * L;
  const low = ENGINE.footplate;
  const high = ENGINE.footplate + 2.5;
  for (const side of [-1, 1]) {
    const x = side * 2.55;
    const tank = rounded(1.75, high - low, from - to, 0.18);
    tank.translate(x, (high + low) / 2, (from + to) / 2);
    a.add(tank, "bodywork", colour);

    // Red lining, a little in from the edges of the outside face.
    const face = x + side * 0.9;
    const inset = 0.3;
    const corners = [
      new THREE.Vector3(face, low + inset, from - inset),
      new THREE.Vector3(face, high - inset, from - inset),
      new THREE.Vector3(face, high - inset, to + inset),
      new THREE.Vector3(face, low + inset, to + inset),
    ];
    for (let i = 0; i < 4; i++) {
      rod(a, corners[i], corners[(i + 1) % 4], 0.05, "matte", ENGINE.lining);
    }
  }
}

/** The cab, its round front windows and side openings, its roof, and the
 *  coal bunker behind. */
function cab(a: Assembly, colour: number, L: number): void {
  const W = CAR.width;
  const from = -0.07 * L;
  const to = -0.31 * L;
  const low = ENGINE.footplate;
  const high = ENGINE.roof - 0.15;
  const box = rounded(W - 0.3, high - low, from - to, 0.15);
  box.translate(0, (high + low) / 2, (from + to) / 2);
  a.add(box, "bodywork", colour);

  // Round windows in the front, either side of the boiler.
  for (const side of [-1, 1]) {
    const x = side * 1.9;
    const y = high - 1.2;
    const glass = new THREE.CylinderGeometry(0.62, 0.62, 0.08, DETAIL.round);
    glass.rotateX(Math.PI / 2);
    glass.translate(x, y, from + 0.03);
    a.add(glass, "glass", WINDOWS.glass);
    const rim = new THREE.TorusGeometry(0.66, 0.1, 8, DETAIL.round);
    rim.translate(x, y, from + 0.06);
    a.add(rim, "chrome", ENGINE.brass);

    // The window in each side of the cab.
    const opening = rounded(0.08, high - low - 1.6, (from - to) * 0.45, 0.06);
    opening.translate(
      side * ((W - 0.3) / 2 + 0.02),
      low + (high - low) / 2 + 0.35,
      from - (from - to) * 0.45,
    );
    a.add(opening, "glass", WINDOWS.glass);
    // Red lining round the cab side.
    const face = side * ((W - 0.3) / 2 + 0.03);
    const inset = 0.3;
    const edge = [
      new THREE.Vector3(face, low + inset, from - inset),
      new THREE.Vector3(face, high - inset, from - inset),
      new THREE.Vector3(face, high - inset, to + inset),
      new THREE.Vector3(face, low + inset, to + inset),
    ];
    for (let i = 0; i < 4; i++) {
      rod(a, edge[i], edge[(i + 1) % 4], 0.05, "matte", ENGINE.lining);
    }
  }

  // The roof: a shallow arch across the cab, black, overhanging front and
  // back. Drawn as its cross-section and pushed out along the cab.
  const span = W / 2 + 0.15;
  const bend = 9;
  const reach = Math.asin(span / bend);
  const arch = new THREE.Shape();
  arch.absarc(0, -bend, bend, Math.PI / 2 - reach, Math.PI / 2 + reach, false);
  arch.absarc(
    0,
    -bend,
    bend - 0.25,
    Math.PI / 2 + reach,
    Math.PI / 2 - reach,
    true,
  );
  arch.closePath();
  const roof = new THREE.ExtrudeGeometry(arch, {
    depth: from - to + 0.8,
    bevelEnabled: false,
    curveSegments: DETAIL.round,
  });
  roof.translate(0, high + 0.15, to - 0.4);
  a.add(roof, "matte", ENGINE.black);

  // The bunker, lower, and coal heaped in it.
  const back = -0.47 * L;
  const bunker = rounded(W - 0.5, 2.3, to - back, 0.15);
  bunker.translate(0, low + 1.15, (to + back) / 2);
  a.add(bunker, "bodywork", colour);
  for (const [x, z, r] of [
    [-1.2, -0.36, 0.7],
    [0.4, -0.35, 0.8],
    [1.5, -0.4, 0.6],
    [-0.4, -0.42, 0.7],
    [0.9, -0.44, 0.55],
  ] as Array<[number, number, number]>) {
    const lump = new THREE.SphereGeometry(r, DETAIL.coarse, 8);
    lump.scale(1.2, 0.55, 1);
    lump.translate(x, low + 2.3, z * L);
    a.add(lump, "matte", 0x141418);
  }
}

/** A big spoked driving wheel in the engine's colour, with a black tyre. */
function wheel(a: Assembly, colour: number, x: number, z: number): void {
  const r = ENGINE.wheel;
  const out = Math.sign(x);
  const tyre = new THREE.TorusGeometry(r * 0.9, r * 0.1, 8, DETAIL.round);
  tyre.scale(1, 1, 2.2);
  tyre.rotateY(Math.PI / 2);
  tyre.translate(x, r, z);
  a.add(tyre, "matte", ENGINE.black);
  const rim = new THREE.TorusGeometry(r * 0.78, r * 0.06, 6, DETAIL.round);
  rim.scale(1, 1, 2);
  rim.rotateY(Math.PI / 2);
  rim.translate(x, r, z);
  a.add(rim, "bodywork", colour);
  for (let i = 0; i < 12; i++) {
    const spoke = new THREE.BoxGeometry(0.14, r * 0.78, 0.16);
    spoke.translate(0, r * 0.39, 0);
    spoke.rotateX((i / 12) * Math.PI * 2);
    spoke.translate(x + out * 0.02, r, z);
    a.add(spoke, "bodywork", colour);
  }
  // A crescent of weight opposite the crank, and the hub.
  const weight = new THREE.CylinderGeometry(
    r * 0.7,
    r * 0.7,
    0.24,
    DETAIL.round,
    1,
    false,
    0.9,
    1.4,
  );
  weight.rotateZ(Math.PI / 2);
  weight.translate(x + out * 0.02, r, z);
  a.add(weight, "bodywork", colour);
  const hub = new THREE.CylinderGeometry(r * 0.2, r * 0.2, 0.4, DETAIL.coarse);
  hub.rotateZ(Math.PI / 2);
  hub.translate(x + out * 0.05, r, z);
  a.add(hub, "matte", ENGINE.black);
}
