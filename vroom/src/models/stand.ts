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
 * One person in the crowd: a body, a head, and that is all.
 *
 * They are two hundred to a stand and about six pixels tall, so anything more
 * than a shape and a colour is geometry nobody will ever resolve. What they do
 * have to do is read as *people* rather than as texture, which comes from
 * being the right proportion and from every one of them being a different
 * colour — both of which this gets for nothing.
 */
export function spectator(): Assembly {
  const a = new Assembly();
  const body = new THREE.CapsuleGeometry(
    STAND.person * 0.42,
    STAND.person * 0.9,
    3,
    8,
  );
  body.translate(0, STAND.person * 0.72, 0);
  // White, because the instance colour is what tints them and it multiplies.
  a.add(body, "matte", 0xffffff);

  const head = new THREE.SphereGeometry(STAND.person * 0.34, 8, 6);
  head.translate(0, STAND.person * 1.5, 0);
  a.add(head, "matte", 0xd9ab8a);
  return a;
}
