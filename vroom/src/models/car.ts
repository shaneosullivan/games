import * as THREE from "three";
import {ConvexGeometry} from "three/examples/jsm/geometries/ConvexGeometry.js";
import {CAR} from "../config";
import {Assembly, DETAIL, rounded} from "./assembly";

const TYRE = 0x14141a;
const RIM = 0xb9bec6;
const DARK = 0x1a1c22;
const GLASS = 0x0d1016;
/** Helmets stay pale whatever the car is — it is what reads as a person. */
const HELMET = 0xe8e4d8;

/**
 * The car.
 *
 * The shell is a **convex hull** rather than a box with things stuck on it.
 * Two dozen points are placed where a racing car's surface actually is — low
 * and wide at the sills, pinched at the waist, tapering to a point at the nose
 * and cut off square at the tail — and the hull that wraps them is a real
 * curved body with real highlights running down it. Nothing else available
 * gives that shape for so little: a box is a brick and a lathe is a bottle.
 *
 * Everything that is not the shell is put on afterwards, because a hull cannot
 * be concave: the cockpit is sunk into it, the wings stand off it, and the
 * wheels sit outside it.
 *
 * Pointing +Z, so the group's Y rotation is the heading and nothing has to be
 * offset by a right angle anywhere else in the game.
 */
export function car(colour: number): THREE.Group {
  const a = new Assembly();
  const L = CAR.length;
  const W = CAR.width;

  shell(a, colour, L, W);
  cockpit(a, L, W);
  driver(a, L, W, colour);
  wings(a, colour, L, W);
  for (const along of [0.33, -0.31]) {
    for (const side of [-1, 1]) {
      wheel(a, side * W * 0.56, along * L, along > 0);
    }
  }
  lights(a, L, W);

  const group = a.build();
  group.name = "car";
  return group;
}

/** The body: a hull over the points a racing car's surface passes through. */
function shell(a: Assembly, colour: number, L: number, W: number): void {
  const half = W / 2;
  const points: Array<THREE.Vector3> = [];
  const at = (x: number, y: number, z: number): void => {
    points.push(new THREE.Vector3(x, y, z));
  };

  // Down the length: how wide and how tall the body is at each station. The
  // waist pinch — narrower in the middle than at either axle — is what stops
  // it reading as a wedge.
  const stations: Array<[number, number, number, number]> = [
    // z along the car, half width, floor height, roof height
    [0.5, 0.16, 0.9, 1.5],
    [0.42, 0.4, 0.6, 2.1],
    [0.3, 0.72, 0.5, 2.9],
    [0.12, 0.86, 0.45, 4.2],
    [-0.04, 0.94, 0.45, 5.0],
    [-0.2, 0.88, 0.45, 4.6],
    [-0.36, 0.82, 0.5, 3.4],
    [-0.48, 0.7, 0.7, 2.6],
  ];

  for (const [z, wide, floor, roof] of stations) {
    const x = half * wide;
    const zz = z * L;
    for (const s of [-1, 1]) {
      at(s * x, floor, zz);
      at(s * x * 0.94, roof, zz);
      // A shoulder, so the side is a curve and not a single flat panel.
      at(s * x, (floor + roof) * 0.55, zz);
    }
    at(0, roof, zz);
    at(0, floor * 0.8, zz);
  }

  const hull = new ConvexGeometry(points);
  a.add(hull, "bodywork", colour);
}

/** The hole the driver sits in, and the roll hoop behind their head. */
function cockpit(a: Assembly, L: number, W: number): void {
  const tub = rounded(W * 0.5, 1.6, L * 0.34, 0.5);
  tub.translate(0, 4.3, -L * 0.02);
  a.add(tub, "glass", GLASS);

  // A roll hoop behind the head. Small, and the one thing that says which end
  // of the car is which when it is spinning.
  const hoop = new THREE.TorusGeometry(
    W * 0.2,
    0.28,
    8,
    DETAIL.coarse,
    Math.PI,
  );
  hoop.rotateY(Math.PI / 2);
  hoop.translate(0, 5.1, -L * 0.19);
  a.add(hoop, "chrome", RIM);
}

/**
 * Somebody driving it.
 *
 * Only the top half exists, because only the top half is ever above the sides
 * of the tub — a single-seater seats you lying down, with everything below the
 * shoulders inside the car. So this is a reclined torso, two arms out to the
 * wheel, and a helmet, and that is the whole of what anybody can see.
 *
 * The overalls and the helmet crest take the car's own colour, so each car has
 * its own driver rather than four copies of one. The helmet shell stays pale
 * whatever the car is: at this size it is the one thing that reads as a person
 * rather than as more bodywork, and it has to stand off the car behind it.
 */
export function driver(
  a: Assembly,
  L: number,
  W: number,
  colour: number,
): void {
  const seat = -L * 0.04;
  const floor = 4.0;

  // Reclined, the way you actually sit in one of these.
  const torso = rounded(W * 0.44, 2.1, L * 0.15, 0.55);
  torso.rotateX(-0.38);
  torso.translate(0, floor + 0.7, seat - L * 0.035);
  a.add(torso, "matte", colour);

  const shoulders = rounded(W * 0.52, 1.0, L * 0.09, 0.4);
  shoulders.rotateX(-0.2);
  shoulders.translate(0, floor + 1.5, seat - L * 0.012);
  a.add(shoulders, "matte", colour);

  // Arms forward to the wheel, and gloves on the rim.
  for (const side of [-1, 1]) {
    const arm = new THREE.CapsuleGeometry(0.44, L * 0.13, 4, DETAIL.coarse);
    arm.rotateX(Math.PI / 2);
    arm.rotateY(-side * 0.2);
    arm.translate(side * W * 0.17, floor + 1.25, seat + L * 0.075);
    a.add(arm, "matte", colour);

    const glove = new THREE.SphereGeometry(0.52, DETAIL.coarse, DETAIL.coarse);
    glove.translate(side * W * 0.14, floor + 1.12, seat + L * 0.14);
    a.add(glove, "rubber", 0x1d1f26);
  }

  const wheel = new THREE.TorusGeometry(W * 0.155, 0.17, 8, DETAIL.round);
  wheel.rotateX(0.55);
  wheel.translate(0, floor + 1.08, seat + L * 0.145);
  a.add(wheel, "chrome", 0x24262c);

  // The helmet: a shell, a dark visor across the front of it, and a crest over
  // the top in the car's colour.
  const shell = new THREE.SphereGeometry(1.3, DETAIL.round, DETAIL.round);
  shell.scale(1, 1.06, 1.02);
  shell.translate(0, floor + 2.5, seat - L * 0.005);
  a.add(shell, "bodywork", HELMET);

  const visor = new THREE.SphereGeometry(
    1.33,
    DETAIL.round,
    DETAIL.round,
    // Only the front, and only a band of it: a visor that went all the way
    // round would be a helmet on backwards as well as forwards.
    //
    // Centred on a quarter turn, not on zero. Three builds a sphere with phi
    // measured from −X, so a band centred on zero looks out of the side of the
    // driver's head — which is where this was, and it is why they were not
    // looking where they were going.
    Math.PI * (0.5 - 0.42),
    Math.PI * 0.84,
    Math.PI * 0.34,
    Math.PI * 0.28,
  );
  visor.scale(1, 1.06, 1.02);
  visor.translate(0, floor + 2.5, seat - L * 0.005);
  a.add(visor, "glass", 0x0b0d13);

  const crest = rounded(0.5, 0.34, 2.5, 0.14);
  crest.translate(0, floor + 3.72, seat - L * 0.01);
  a.add(crest, "bodywork", colour);
}

/** Front and rear wings, with their endplates and stays. */
function wings(a: Assembly, colour: number, L: number, W: number): void {
  const front = rounded(W * 1.02, 0.42, L * 0.12, 0.16);
  front.translate(0, 1.15, L * 0.52);
  a.add(front, "bodywork", colour);

  const rear = rounded(W * 1.12, 0.5, L * 0.13, 0.18);
  rear.translate(0, 5.4, -L * 0.5);
  a.add(rear, "bodywork", colour);

  for (const side of [-1, 1]) {
    const plate = rounded(0.4, 1.9, L * 0.15, 0.15);
    plate.translate(side * W * 0.55, 5.2, -L * 0.5);
    a.add(plate, "bodywork", colour);

    const tip = rounded(0.36, 1.2, L * 0.14, 0.14);
    tip.translate(side * W * 0.5, 1.3, L * 0.52);
    a.add(tip, "bodywork", colour);

    const stay = rounded(0.34, 2.2, 0.34, 0.12);
    stay.translate(side * W * 0.3, 4.4, -L * 0.5);
    a.add(stay, "chrome", DARK);
  }
}

/** One wheel: a tyre, a rim and spokes, and a disc behind them. */
function wheel(a: Assembly, x: number, z: number, front: boolean): void {
  const radius = front ? 2.6 : 3.0;
  const width = front ? 1.9 : 2.3;

  // A torus for the tyre rather than a cylinder: the shoulder of a tyre is
  // round, and at this size the difference between round and square is the
  // difference between a wheel and a tin.
  const tyre = new THREE.TorusGeometry(
    radius * 0.78,
    radius * 0.32,
    DETAIL.coarse,
    DETAIL.round,
  );
  tyre.rotateY(Math.PI / 2);
  tyre.translate(x, radius, z);
  a.add(tyre, "rubber", TYRE);

  const rim = new THREE.CylinderGeometry(
    radius * 0.62,
    radius * 0.62,
    width * 0.9,
    DETAIL.round,
  );
  rim.rotateZ(Math.PI / 2);
  rim.translate(x, radius, z);
  a.add(rim, "chrome", RIM);

  // Spokes, which is what makes a rim look machined rather than moulded.
  for (let i = 0; i < 5; i++) {
    const spoke = new THREE.BoxGeometry(width * 0.95, radius * 1.15, 0.34);
    spoke.rotateX((i / 5) * Math.PI);
    spoke.translate(x, radius, z);
    a.add(spoke, "chrome", 0x8b9099);
  }

  const hub = new THREE.CylinderGeometry(
    radius * 0.2,
    radius * 0.2,
    width * 1.02,
    DETAIL.coarse,
  );
  hub.rotateZ(Math.PI / 2);
  hub.translate(x, radius, z);
  a.add(hub, "chrome", 0x5a5f66);
}

/** Headlights and brake lights. They glow, which at night is most of what you
 *  see of the car in front. */
function lights(a: Assembly, L: number, W: number): void {
  for (const side of [-1, 1]) {
    const head = rounded(W * 0.2, 0.5, 0.4, 0.14);
    head.translate(side * W * 0.24, 2.5, L * 0.455);
    a.add(head, "glass", 0xfff4d0);

    const brake = rounded(W * 0.16, 0.44, 0.3, 0.1);
    brake.translate(side * W * 0.26, 3.2, -L * 0.47);
    a.add(brake, "glass", 0xff2a1a);
  }

  // Exhausts.
  for (const side of [-1, 1]) {
    const pipe = new THREE.CylinderGeometry(0.34, 0.34, 0.9, DETAIL.coarse);
    pipe.rotateX(Math.PI / 2);
    pipe.translate(side * W * 0.12, 2.2, -L * 0.5);
    a.add(pipe, "chrome", 0x3a3d44);
  }
}
