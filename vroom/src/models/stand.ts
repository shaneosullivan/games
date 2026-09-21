import * as THREE from "three";
import {Palette, STAND} from "../config";
import {Assembly, DETAIL, rounded} from "./assembly";

/**
 * A grandstand: a raked bank of seating with a roof over it.
 *
 * Built facing +Z, so it is turned to face the road the same way everything
 * else in the game is. The tiers step up and back, which is what makes it read
 * as seating rather than as a shed — and it is also what puts the back rows
 * high enough to be seen over the front ones, which is the whole point of the
 * people in them.
 */
export function stand(palette: Palette): Assembly {
  const a = new Assembly();
  const rows = STAND.rows;
  const w = STAND.width;

  // The rake. Each tier is a step up and a step back.
  for (let i = 0; i < rows; i++) {
    const y = i * STAND.rise;
    const z = -i * STAND.tread;
    // Each tier is a solid block down to the ground rather than a slab on
    // legs — it is a bank of concrete, and from the front you should see a
    // stack of steps and no daylight between them.
    const thick = STAND.rise * 1.9;
    const deck = rounded(w, thick, STAND.tread * 1.08, 0.35);
    deck.translate(0, y + STAND.rise - thick / 2, z);
    a.add(deck, "concrete", i % 2 ? 0x9aa0a8 : 0x8b9199);
  }

  // Sides, to close it in.
  for (const side of [-1, 1]) {
    const wall = rounded(1.6, rows * STAND.rise, rows * STAND.tread, 0.4);
    wall.translate(
      (side * w) / 2,
      (rows * STAND.rise) / 2,
      (-(rows - 1) * STAND.tread) / 2,
    );
    a.add(wall, "concrete", 0x6f747c);
  }

  // The roof, on posts at the back.
  const top = rows * STAND.rise + STAND.headroom;
  const roof = rounded(w + 3, 1.4, rows * STAND.tread + 6, 0.5);
  roof.translate(0, top, (-(rows - 1) * STAND.tread) / 2 - 1);
  a.add(roof, "matte", palette.kerbA);

  const fascia = rounded(w + 3, 2.4, 1.2, 0.4);
  fascia.translate(0, top - 1.4, (rows * STAND.tread) / 2 + 1.6);
  a.add(fascia, "matte", palette.kerbB);

  for (const side of [-1, 1]) {
    for (const z of [1, -1]) {
      const post = new THREE.CylinderGeometry(0.7, 0.7, top, DETAIL.coarse);
      post.translate(
        (side * (w - 2)) / 2,
        top / 2,
        z * ((rows * STAND.tread) / 2 - 1),
      );
      a.add(post, "chrome", 0x585d66);
    }
  }
  return a;
}

/**
 * One person in the crowd, in pieces: body, head, and a choice of hair.
 *
 * They are three hundred to a stand and about six pixels tall, so anything
 * more than a shape and a colour is geometry nobody will ever resolve. What
 * they do have to do is read as *people* rather than as texture, which comes
 * from being the right proportion, from every one of them being a different
 * colour, and from their heads not all being the same.
 *
 * Pieces rather than one shape because an instanced mesh takes one colour per
 * copy, and a person is not one colour: the shirt, the face and the hair are
 * three. So the crowd is several instanced meshes standing in the same seats,
 * each tinted its own way — and the hair a person is not wearing is scaled to
 * nothing, which is how a copy is left out of an instanced mesh. Every piece
 * is white, since the instance colour multiplies.
 */
export function spectatorBody(): Assembly {
  const a = new Assembly();
  const body = new THREE.CapsuleGeometry(
    STAND.person * 0.42,
    STAND.person * 0.9,
    3,
    8,
  );
  body.translate(0, STAND.person * 0.72, 0);
  a.add(body, "matte", 0xffffff);
  return a;
}

export function spectatorHead(): Assembly {
  const a = new Assembly();
  const head = new THREE.SphereGeometry(HEAD, 8, 6);
  head.translate(0, TOP, 0);
  a.add(head, "matte", 0xffffff);
  return a;
}

/** A cap of hair over the back and top of the head: one shape, since at six
 *  pixels tall a hairstyle is a silhouette and nothing more. */
export function spectatorHair(): Assembly {
  const a = new Assembly();
  const cap = new THREE.SphereGeometry(HEAD * 1.08, 8, 6);
  cap.scale(1, 1.02, 1);
  cap.translate(0, TOP + HEAD * 0.12, -HEAD * 0.1);
  a.add(cap, "matte", 0xffffff);
  return a;
}

/** A ponytail down the back of the head. */
export function spectatorTail(): Assembly {
  const a = new Assembly();
  const tail = new THREE.CapsuleGeometry(HEAD * 0.34, HEAD * 0.9, 2, 6);
  tail.rotateX(0.45);
  tail.translate(0, TOP - HEAD * 0.5, -HEAD * 1.1);
  a.add(tail, "matte", 0xffffff);
  return a;
}

/** Hair to the shoulders, round the back and sides of the head. */
export function spectatorLong(): Assembly {
  const a = new Assembly();
  const fall = new THREE.CapsuleGeometry(HEAD * 0.92, HEAD * 0.7, 2, 8);
  fall.scale(1, 1, 0.75);
  fall.translate(0, TOP - HEAD * 0.55, -HEAD * 0.22);
  a.add(fall, "matte", 0xffffff);
  return a;
}

/** A bun on top. */
export function spectatorBun(): Assembly {
  const a = new Assembly();
  const bun = new THREE.SphereGeometry(HEAD * 0.45, 6, 5);
  bun.translate(0, TOP + HEAD * 1.05, -HEAD * 0.2);
  a.add(bun, "matte", 0xffffff);
  return a;
}

/** A hat: a crown and a brim, for whoever is wearing one. */
export function spectatorHat(): Assembly {
  const a = new Assembly();
  const crown = new THREE.CylinderGeometry(
    HEAD * 0.78,
    HEAD * 0.86,
    HEAD * 0.7,
    8,
  );
  crown.translate(0, TOP + HEAD * 0.95, 0);
  a.add(crown, "matte", 0xffffff);
  const brim = new THREE.CylinderGeometry(
    HEAD * 1.35,
    HEAD * 1.35,
    HEAD * 0.12,
    8,
  );
  brim.translate(0, TOP + HEAD * 0.62, 0);
  a.add(brim, "matte", 0xffffff);
  return a;
}

/**
 * A little flag on a stick, held up beside the head.
 *
 * Pole and cloth in the one colour, because an instance takes one colour and
 * at this size a flag is a bright rectangle above the crowd — which is all it
 * needs to be.
 */
export function spectatorFlag(): Assembly {
  const a = new Assembly();
  const pole = new THREE.CylinderGeometry(
    HEAD * 0.08,
    HEAD * 0.08,
    HEAD * 2.6,
    4,
  );
  pole.rotateZ(-0.25);
  pole.translate(HEAD * 1.1, TOP + HEAD * 0.8, 0);
  a.add(pole, "matte", 0xffffff);
  const cloth = new THREE.BoxGeometry(HEAD * 1.5, HEAD * 0.95, HEAD * 0.08);
  cloth.rotateZ(-0.25);
  cloth.translate(HEAD * 2, TOP + HEAD * 1.75, 0);
  a.add(cloth, "matte", 0xffffff);
  return a;
}

/** How big a head is, and how high it sits. */
const HEAD = STAND.person * 0.34;
const TOP = STAND.person * 1.5;
