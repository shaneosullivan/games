import * as THREE from "three";
import {CAR, DriverKit} from "../config";
import {Assembly, DETAIL, rounded} from "./assembly";
import {wheel} from "./car";

/**
 * The two that are not cars: a cow and a chicken, on wheels.
 *
 * They race the same grid as the single-seater and they have to *be* cars to
 * do it — the same sixteen units long and seven wide, on the same four wheels,
 * with the driver's chosen kit on whoever is riding. Everything else about
 * them is an animal.
 *
 * Built from the same primitives as everything else in this game rather than
 * from a model file: a barrel, a head, two horns. The trick to making an
 * animal out of boxes is the head — it carries the whole read at a hundred and
 * fifty units up, which is why the horns, the ears, the beak and the comb get
 * more parts between them than the entire body does.
 */

/** How much of their built height they keep, so the top of a cow sits where
 *  the top of the racing car does. The wheels are added afterwards and are not
 *  squashed: they are the same wheels as everything else on the grid. */
const BEASTS = {squash: 0.68} as const;

const HOOF = 0x2a2320;
const EYE = 0x14141a;
const WHITE = 0xf6f3ea;
const BEAK = 0xf5a623;
const COMB = 0xe0342b;

/** Which of them, if not the racing car. */
export type Beast = "cow" | "chicken";

export function beast(
  kind: Beast,
  colour: number,
  kit?: DriverKit,
): THREE.Group {
  const a = new Assembly();
  const L = CAR.length;
  const W = CAR.width;

  // Nobody rides them. They are not animals with a driver on top, they are
  // cars that happen to be a cow and a chicken — which is both funnier and the
  // thing a child asked for twice: no saddle, and then no rider at all.
  void kit;

  // Built at animal proportions and then squashed to a car's. They have always
  // *driven* the same as the racing car — identical mass, wheels, tyres and
  // engine, since the model is only a model — but they stood half again as
  // tall, and a tall thing swings much further on the same lean, the same
  // pitch off a ramp and the same landing. So they looked like they handled
  // differently, which for a child is the same as handling differently.
  const animal = new Assembly();
  if (kind === "cow") {
    cow(animal, colour, L, W);
  } else {
    chicken(animal, colour, L, W);
  }
  a.absorb(animal, BEASTS.squash);

  for (const along of [0.33, -0.31]) {
    for (const side of [-1, 1]) {
      wheel(a, side * W * 0.56, along * L, along > 0);
    }
  }

  const group = a.build();
  group.name = kind;
  return group;
}

/** A cow: a barrel on four legs, a head with horns, patches, and a tail. */
function cow(a: Assembly, colour: number, L: number, W: number): void {
  // The barrel, carried high enough that there is room for legs under it. It
  // used to sit straight on the wheels, which is a cow-shaped go-kart; a cow
  // stands on legs and these ones happen to end in wheels.
  const floor = 7.4;
  const body = rounded(W * 1.02, 5.0, L * 0.62, 1.8);
  body.translate(0, floor, -L * 0.04);
  a.add(body, "bodywork", colour);

  // Shoulders and haunches, a little proud of the barrel, so the silhouette
  // has the lumps a standing animal has.
  for (const [z, wide] of [
    [0.22, 0.94],
    [-0.26, 1.0],
  ] as Array<[number, number]>) {
    const lump = rounded(W * wide, 4.4, L * 0.16, 1.6);
    lump.translate(0, floor + 0.1, z * L);
    a.add(lump, "bodywork", colour);
  }

  // Four legs, each ending at the middle of a wheel. Two parts with a knee
  // between them: one straight post per corner reads as a stilt, and the whole
  // point of legs on a cow is that they have a bend in them.
  for (const [along, radius] of [
    [0.33, 2.6],
    [-0.31, 3.0],
  ] as Array<[number, number]>) {
    for (const side of [-1, 1]) {
      const x = side * W * 0.5;
      const z = along * L;
      const top = floor - 1.6;
      const knee = (top + radius) / 2 + 0.4;

      const thigh = new THREE.CylinderGeometry(1.05, 0.8, top - knee, 8);
      thigh.translate(x * 0.92, (top + knee) / 2, z - 0.3);
      a.add(thigh, "bodywork", colour);

      const shin = new THREE.CylinderGeometry(0.72, 0.6, knee - radius, 8);
      shin.translate(x, (knee + radius) / 2, z);
      a.add(shin, "matte", colour);

      // A knee, so the two do not meet in a corner.
      const joint = new THREE.SphereGeometry(0.85, DETAIL.coarse, 6);
      joint.translate(x * 0.96, knee, z - 0.15);
      a.add(joint, "matte", colour);
    }
  }

  // Patches: pale on a dark cow and dark on a pale one, laid on the flanks
  // where they read from above and from the side.
  const patch = spots(colour);
  for (const [x, y, z, r] of [
    [0.42, 8.6, 0.1, 1.5],
    [-0.46, 7.8, -0.16, 1.9],
    [0.3, 7.2, -0.3, 1.3],
    [-0.24, 8.8, -0.32, 1.1],
  ] as Array<[number, number, number, number]>) {
    const blob = new THREE.SphereGeometry(r, DETAIL.coarse, DETAIL.coarse);
    blob.scale(0.5, 0.85, 1.15);
    blob.translate(x * W, y, z * L);
    a.add(blob, "matte", patch);
  }

  // Neck and head, carried forward and up. Level with the barrel the head
  // disappeared into the shoulders from the one angle the game is ever seen
  // from; a cow holds its head above its back and so does this one.
  const neck = rounded(W * 0.58, 4.2, L * 0.14, 1.2);
  neck.rotateX(0.3);
  neck.translate(0, floor + 1.6, L * 0.25);
  a.add(neck, "bodywork", colour);

  const head = rounded(W * 0.56, 3.6, L * 0.2, 1.3);
  head.translate(0, floor + 2.3, L * 0.37);
  a.add(head, "bodywork", colour);

  const muzzle = rounded(W * 0.42, 2.3, L * 0.09, 0.9);
  muzzle.translate(0, floor + 1.5, L * 0.45);
  a.add(muzzle, "matte", WHITE);

  for (const side of [-1, 1]) {
    const nostril = new THREE.SphereGeometry(0.3, 6, 6);
    nostril.translate(side * W * 0.11, floor + 1.6, L * 0.49);
    a.add(nostril, "matte", HOOF);

    // Eyes, well up the head and wide apart, which is where a cow's are and
    // is also what stops it reading as a dog.
    const eye = new THREE.SphereGeometry(0.46, DETAIL.coarse, DETAIL.coarse);
    eye.translate(side * W * 0.23, floor + 3.1, L * 0.43);
    a.add(eye, "glass", EYE);

    // Ears, out sideways and drooping a touch.
    const ear = rounded(W * 0.2, 0.8, L * 0.05, 0.35);
    ear.rotateZ(side * 0.5);
    ear.translate(side * W * 0.36, floor + 3.3, L * 0.35);
    a.add(ear, "matte", colour);

    // Horns: two cones, out and up.
    const horn = new THREE.ConeGeometry(0.42, 2.2, DETAIL.coarse);
    horn.rotateZ(-side * 0.9);
    horn.translate(side * W * 0.26, floor + 4.3, L * 0.34);
    a.add(horn, "chrome", WHITE);
  }

  // A tail down the back, with a tuft on the end of it.
  const tail = new THREE.CylinderGeometry(0.26, 0.16, 5.4, DETAIL.coarse);
  tail.rotateX(-0.3);
  tail.translate(0, floor - 1.0, -L * 0.36);
  a.add(tail, "matte", colour);
  const tuft = new THREE.SphereGeometry(0.62, DETAIL.coarse, DETAIL.coarse);
  tuft.translate(0, floor - 3.6, -L * 0.41);
  a.add(tuft, "matte", HOOF);
}

/** A chicken: an egg, a tail, two wings, and a head that does all the work. */
function chicken(a: Assembly, colour: number, L: number, W: number): void {
  const body = new THREE.SphereGeometry(1, DETAIL.round, DETAIL.round);
  body.scale(W * 0.52, 3.5, L * 0.31);
  body.translate(0, 5.4, -L * 0.04);
  a.add(body, "bodywork", colour);

  // The chest, forward and up, so the bird leans back the way a hen does.
  const chest = new THREE.SphereGeometry(1, DETAIL.round, DETAIL.round);
  chest.scale(W * 0.42, 2.9, L * 0.16);
  chest.translate(0, 5.8, L * 0.2);
  a.add(chest, "bodywork", colour);

  // Tail feathers: three of them, splayed sideways as well as up. Stacked in
  // line they merge into one fin and the bird turns into a shark.
  for (const [side, tall] of [
    [-1, 4.8],
    [0, 6.4],
    [1, 4.8],
  ] as Array<[number, number]>) {
    // Cones, not slabs. A feather is a thing that tapers, and three tapering
    // things fanned out read as a tail from any angle; three boxes read as a
    // plank from most of them, which is what this was.
    const feather = new THREE.ConeGeometry(1.15, tall, DETAIL.coarse);
    feather.scale(1, 1, 0.45);
    feather.rotateX(-0.65);
    feather.rotateY(side * 0.5);
    feather.translate(side * W * 0.24, 8.9, -L * 0.31);
    a.add(feather, "matte", colour);
  }

  for (const side of [-1, 1]) {
    // Wings, folded along the flanks.
    const wing = new THREE.SphereGeometry(1, DETAIL.coarse, DETAIL.coarse);
    wing.scale(0.5, 1.9, L * 0.2);
    wing.rotateX(0.12);
    wing.translate(side * W * 0.5, 5.4, -L * 0.04);
    a.add(wing, "matte", colour);
  }

  // Neck and head. The head is small and high — a chicken is mostly neck when
  // it is paying attention, and paying attention is the look this wants.
  // The neck carries the head well clear of the body. Down at body height it
  // is a duck; up here, looking about, it is a hen.
  // A shorter neck than it had, and a bigger head on the end of it. Long neck
  // plus small head is a goose; the hen is the other way about.
  const neck = new THREE.CylinderGeometry(1.05, 1.4, 3.4, DETAIL.round);
  neck.rotateX(-0.12);
  neck.translate(0, 8.0, L * 0.2);
  a.add(neck, "bodywork", colour);

  const head = new THREE.SphereGeometry(2.05, DETAIL.round, DETAIL.round);
  head.scale(0.94, 1, 1.05);
  head.translate(0, 10.3, L * 0.24);
  a.add(head, "bodywork", colour);

  const beak = new THREE.ConeGeometry(0.78, 2.1, DETAIL.coarse);
  beak.rotateX(Math.PI / 2);
  beak.translate(0, 10.1, L * 0.36);
  a.add(beak, "matte", BEAK);

  // The comb: three bumps along the top of the head. This, the beak and the
  // wattle are the whole difference between a chicken and a pigeon.
  for (const [x, r] of [
    [-0.85, 0.6],
    [0, 0.76],
    [0.85, 0.6],
  ] as Array<[number, number]>) {
    const bump = new THREE.SphereGeometry(r, DETAIL.coarse, DETAIL.coarse);
    bump.scale(0.7, 1.2, 0.9);
    bump.translate(x, 12.0, L * 0.23);
    a.add(bump, "matte", COMB);
  }
  const wattle = new THREE.SphereGeometry(0.5, DETAIL.coarse, DETAIL.coarse);
  wattle.scale(0.7, 1.2, 0.8);
  wattle.translate(0, 9.0, L * 0.33);
  a.add(wattle, "matte", COMB);

  for (const side of [-1, 1]) {
    const eye = new THREE.SphereGeometry(0.42, DETAIL.coarse, DETAIL.coarse);
    eye.translate(side * 1.45, 10.7, L * 0.3);
    a.add(eye, "glass", EYE);
  }
}

/** The colour of a cow's patches: whichever of pale or dark the cow is not. */
function spots(colour: number): number {
  const hsl = {h: 0, s: 0, l: 0};
  new THREE.Color(colour).getHSL(hsl, THREE.SRGBColorSpace);
  return hsl.l > 0.55 ? HOOF : WHITE;
}
