import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {INSIDE} from "../../config";
import bearPictureUrl from "../../assets/bearPicture.jpg";
import bearFamilyUrl from "../../assets/bearFamily.jpg";
import {createGlowBubble, type GlowBubble} from "../glow";
import {paint, solidToon, vertexToon} from "../materials";

export interface CottageInside {
  group: THREE.Group;
  /** The jar mesh, reparented to the bee when picked up. */
  jar: THREE.Group;
  /** Where the jar rests on the counter. */
  jarRest: THREE.Vector3;
  /** Force field around the jar; hidden once it's taken. */
  glow: GlowBubble;
  /** Where the bee arrives, just inside the door. */
  entryPosition: THREE.Vector3;
  update(elapsed: number): void;
}

const WOOD = 0x9c6b3f;
const WOOD_DARK = 0x6f4826;
const WALL = 0xe8c89a;

/**
 * Inside Caramel Cottage: a cosy room with a counter along the back wall and a
 * big jar of honey on it, lit up so you can't miss what you came for.
 */
export function createCottageInside(): CottageInside {
  const group = new THREE.Group();
  const R = INSIDE.roomSize / 2;

  // ---- shell -------------------------------------------------------------
  const parts: Array<THREE.BufferGeometry> = [];
  const push = (geo: THREE.BufferGeometry, color: number) =>
    parts.push(paint(geo, color));

  const floor = new THREE.BoxGeometry(INSIDE.roomSize, 0.4, INSIDE.roomSize);
  floor.translate(0, -0.2, 0);
  push(floor, WOOD);

  // Four walls, built inward-facing by simply being thick boxes outside the room.
  for (const [x, z, w, d] of [
    [0, -R, INSIDE.roomSize, 0.6],
    [0, R, INSIDE.roomSize, 0.6],
    [-R, 0, 0.6, INSIDE.roomSize],
    [R, 0, 0.6, INSIDE.roomSize],
  ] as const) {
    const wall = new THREE.BoxGeometry(w, INSIDE.roomHeight, d);
    wall.translate(x, INSIDE.roomHeight / 2, z);
    push(wall, WALL);
  }

  const ceiling = new THREE.BoxGeometry(INSIDE.roomSize, 0.4, INSIDE.roomSize);
  ceiling.translate(0, INSIDE.roomHeight, 0);
  push(ceiling, WOOD_DARK);

  // Exposed beams, because every cosy cottage has them.
  for (let i = -1; i <= 1; i++) {
    const beam = new THREE.BoxGeometry(INSIDE.roomSize, 0.45, 0.5);
    beam.translate(0, INSIDE.roomHeight - 0.5, i * 5.5);
    push(beam, WOOD_DARK);
  }

  // ---- counter along the back wall ---------------------------------------
  // Stood off the back wall far enough that the bee, bounded to a circle,
  // can actually reach the jar.
  const counterZ = -11.5;
  const top = new THREE.BoxGeometry(12, 0.4, 2.4);
  top.translate(0, INSIDE.counterHeight, counterZ);
  push(top, WOOD);

  const front = new THREE.BoxGeometry(12, INSIDE.counterHeight, 0.4);
  front.translate(0, INSIDE.counterHeight / 2, counterZ + 1.0);
  push(front, WOOD_DARK);

  for (const sx of [-1, 1]) {
    const leg = new THREE.BoxGeometry(0.5, INSIDE.counterHeight, 2.0);
    leg.translate(sx * 5.5, INSIDE.counterHeight / 2, counterZ);
    push(leg, WOOD_DARK);
  }

  const merged = mergeGeometries(parts, false);
  if (!merged) {
    throw new Error("cottage inside: geometry merge failed");
  }
  merged.computeVertexNormals();
  const shell = new THREE.Mesh(merged, vertexToon());
  shell.receiveShadow = true;
  group.add(shell);

  // Back wall, above the counter — the first thing you see on the way in.
  group.add(
    createWallPicture(
      bearPictureUrl,
      5.6,
      new THREE.Vector3(0, INSIDE.pictureHeight, -R + 0.32),
    ),
  );
  // Left-hand wall as you face the honey, so it's in view on the way over.
  group.add(
    createWallPicture(
      bearFamilyUrl,
      5.0,
      new THREE.Vector3(-R + 0.32, INSIDE.pictureHeight, -2),
      Math.PI / 2,
    ),
  );

  // A warm lamp over the counter.
  const lamp = new THREE.PointLight(0xffd9a0, 40, 26, 2);
  lamp.position.set(0, INSIDE.roomHeight - 1.5, counterZ + 1);
  group.add(lamp);

  // ---- the honey jar -----------------------------------------------------
  const jarRest = new THREE.Vector3(
    0,
    INSIDE.counterHeight + 0.2 + INSIDE.jarHeight / 2,
    counterZ,
  );
  const jar = createHoneyJar();
  jar.position.copy(jarRest);
  group.add(jar);

  const glow = createGlowBubble({
    radius: INSIDE.jarHeight * 1.25,
    squashY: 1.05,
    hue: 0.11,
    hueRate: 0.05,
    saturation: 0.75,
    lightness: 0.66,
  });
  glow.mesh.position.copy(jarRest);
  group.add(glow.mesh);

  return {
    group,
    jar,
    jarRest,
    glow,
    entryPosition: new THREE.Vector3(0, 2.6, 7),
    update(elapsed) {
      glow.update(elapsed);
      // Keep the halo on the jar wherever it is — including under the bee.
      jar.getWorldPosition(glow.mesh.position);
    },
  };
}

/**
 * A framed picture hung flat against a wall.
 *
 * Built facing +Z and then rotated onto whichever wall it belongs to, so the
 * frame/mount/picture stack only has to be reasoned about once.
 *
 * The picture itself is unlit (MeshBasicMaterial) rather than toon-shaded: the
 * room is deliberately dim, and banding a hand-drawn image across a three-step
 * toon ramp makes a mess of it. It's dimmed slightly so it reads as lit paper
 * rather than a lightbox.
 *
 * @param yaw rotation onto the wall — 0 for the back wall, +PI/2 for the left.
 */
function createWallPicture(
  url: string,
  width: number,
  position: THREE.Vector3,
  yaw = 0,
): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(position);
  g.rotation.y = yaw;

  const height = width * (530 / 620); // the source images share this aspect

  const texture = new THREE.TextureLoader().load(url);
  texture.colorSpace = THREE.SRGBColorSpace;

  // Frame, then a pale mount, then the picture, each a touch proud of the last.
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.7, height + 0.7, 0.22),
    solidToon(0x7b4a22),
  );
  frame.castShadow = true;
  g.add(frame);

  const mount = new THREE.Mesh(
    new THREE.PlaneGeometry(width + 0.3, height + 0.3),
    solidToon(0xfff6e8),
  );
  mount.position.z = 0.12;
  g.add(mount);

  const picture = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({map: texture, color: 0xd8d2c6}),
  );
  picture.position.z = 0.13;
  g.add(picture);

  return g;
}

/** A fat jar of honey with a cork stopper and a paper label. */
function createHoneyJar(): THREE.Group {
  const g = new THREE.Group();
  const h = INSIDE.jarHeight;
  const parts: Array<THREE.BufferGeometry> = [];
  const push = (geo: THREE.BufferGeometry, color: number) =>
    parts.push(paint(geo, color));

  // Honey body — the jar is mostly full, so this is the bulk of it.
  const body = new THREE.CylinderGeometry(h * 0.42, h * 0.36, h * 0.82, 16);
  body.translate(0, -h * 0.06, 0);
  push(body, 0xffb02e);

  // A paler rim of glass above the honey line.
  const neck = new THREE.CylinderGeometry(h * 0.3, h * 0.42, h * 0.22, 16);
  neck.translate(0, h * 0.46, 0);
  push(neck, 0xffe6a8);

  // Cork.
  const cork = new THREE.CylinderGeometry(h * 0.28, h * 0.3, h * 0.16, 14);
  cork.translate(0, h * 0.62, 0);
  push(cork, 0xc9a26a);

  // Label.
  const label = new THREE.CylinderGeometry(
    h * 0.425,
    h * 0.4,
    h * 0.34,
    16,
    1,
    true,
  );
  label.translate(0, -h * 0.08, 0);
  push(label, 0xfff6e8);

  const merged = mergeGeometries(parts, false);
  if (!merged) {
    throw new Error("honey jar: geometry merge failed");
  }
  merged.computeVertexNormals();
  const mesh = new THREE.Mesh(merged, vertexToon());
  mesh.castShadow = true;
  g.add(mesh);

  return g;
}
