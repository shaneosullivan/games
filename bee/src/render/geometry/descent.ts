import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {KATAMARI as K, ASCENT_PALETTE as P} from "../../config";
import type {Rng} from "../../core/rng";
import {paint, vertexToon} from "../materials";

export interface Descent {
  group: THREE.Group;
  /** Slope space: x across, -z *down* the hill, y off the surface. */
  slope: THREE.Group;
  /**
   * How high the ground stands in slope space this far down the run.
   *
   * Zero all the way down the hill, and then rising, because past the finish
   * the ground stops falling — flat in the world is a climb in a tilted frame.
   * Anything that sits on the ground has to add this.
   */
  groundAt(down: number): number;
  update(dt: number, rolled: number): void;
  dispose(): void;
}

/**
 * The way back down the Mouldy Mountain.
 *
 * The same hillside as level 9 turned the other way up, and much simpler:
 * nothing bounces off anything here, so there are no bumps to agree about and
 * no cliffs to fall off. What it has to do is sell a slope — snow at the top
 * giving way to grass, a ragged edge on both sides so it isn't a road, and a
 * sky with weather in it that passes overhead as you come down.
 *
 * `slope` is tilted the opposite way from the climb, so that -z is downhill.
 * Everything the level does is in that space and none of it knows the hill is
 * on a slant.
 */
export function createDescent(rng: Rng): Descent {
  const group = new THREE.Group();
  const slope = new THREE.Group();
  // Negative, unlike the ascent: travelling -z has to *fall*.
  slope.rotation.x = -K.pitch;
  group.add(slope);

  const parts: Array<THREE.BufferGeometry> = [];
  const length = K.run + 320;
  /*
   * Far wider than the play.
   *
   * The playable strip is a promise to the player, but the *ground* has no
   * reason to stop where it does — and when it did, the level read as a green
   * road with sky either side of it rather than as a hillside. Everything past
   * the play is scenery she will never touch.
   */
  const wide = K.halfWidth * 2 + 520;

  // ---- the ground ---------------------------------------------------------
  const ground = new THREE.BoxGeometry(wide, 2, length);
  ground.translate(0, -1, -length / 2 + 140);
  parts.push(paint(ground, P.slope));

  /*
   * The flat below the hill.
   *
   * Built in slope space like everything else, and tilted *back* by the
   * mountain's own pitch so that it comes out level in the world. It is much
   * wider than the run and carries on well past the finish, because its job is
   * to be seen from the top: a floor a long way below you is the one thing
   * that cannot be read as a hill in front of you.
   */
  const flat = new THREE.BoxGeometry(wide + 600, 2, K.flat);
  flat.translate(0, -1, -K.flat / 2);
  flat.rotateX(K.pitch);
  flat.translate(0, 0, -K.run);
  parts.push(paint(flat, P.slope));

  // A few things standing on it, so it reads as ground rather than as a card
  // laid at the end of the level.
  for (let i = 0; i < 90; i++) {
    const along = rng.range(20, K.flat - 40);
    const across = rng.range(-(K.halfWidth + 260), K.halfWidth + 260);
    const radius = rng.range(1.6, 4.4);
    const bush = new THREE.SphereGeometry(radius, 8, 6);
    bush.scale(1, 0.66, 1);
    bush.translate(across, radius * 0.4, -along);
    bush.rotateX(K.pitch);
    bush.translate(0, 0, -K.run);
    parts.push(paint(bush, i % 4 === 0 ? P.mould : P.slopeDark));
  }

  // Snow over the top of the run, where she sets off from, laid slightly proud
  // of the slab so the two faces can't z-fight along the join.
  const snow = new THREE.BoxGeometry(wide, 2.1, 300);
  snow.translate(0, -0.94, -10);
  parts.push(paint(snow, P.snow));

  // ---- scenery ------------------------------------------------------------
  //
  // Mounds and patches of mould, thinning out where the snow is. Flat things
  // laid on the slab stand a little proud of it for the same reason as the
  // snow does.
  const mounds = Math.round((K.run / 100) * 5);
  for (let i = 0; i < mounds; i++) {
    const z = -rng.range(60, K.run + 120);
    const x = rng.range(-K.halfWidth + 3, K.halfWidth - 3);
    const radius = rng.range(1.4, 3.6);
    const mound = new THREE.SphereGeometry(radius, 10, 6);
    mound.scale(1, 0.42, 1);
    mound.translate(x, 0.02, z);
    const snowy = -z < 260;
    parts.push(
      paint(mound, snowy ? P.snowShade : i % 3 === 0 ? P.mould : P.slopeDark),
    );
  }

  // ---- the edges ----------------------------------------------------------
  //
  // A shoulder of scrub down both sides that wanders in and out. The playable
  // width never changes — that is a promise to the player — but the ground
  // beyond it does, which is what stops the hill reading as a green road.
  const edgeAt = (z: number, side: number): number =>
    K.halfWidth +
    2 +
    Math.sin((z / 110 + side * 2.1) * Math.PI) * 5 +
    Math.sin((z / 47 + side) * Math.PI) * 2;

  const bushes = Math.round((K.run / 100) * 20);
  for (let i = 0; i < bushes; i++) {
    const z = -rng.range(-40, K.run + 200);
    const side = rng.next() < 0.5 ? -1 : 1;
    const out = edgeAt(z, side) + rng.range(0, 240);
    const radius = rng.range(1.2, 3.2);
    const rock = rng.next() < 0.35;
    const blob = rock
      ? new THREE.DodecahedronGeometry(radius, 0)
      : new THREE.SphereGeometry(radius, 8, 6);
    blob.scale(1, rock ? 0.8 : 0.72, 1);
    blob.translate(side * out, radius * 0.3, z);
    parts.push(paint(blob, rock ? P.rock : -z < 240 ? P.snowShade : P.mould));
  }

  const merged = mergeGeometries(parts, false);
  for (const part of parts) {
    part.dispose();
  }
  const shell = new THREE.Mesh(
    merged ?? new THREE.BufferGeometry(),
    vertexToon(),
  );
  shell.receiveShadow = true;
  slope.add(shell);

  // ---- clouds -------------------------------------------------------------
  //
  // In world space, and out of the fog, exactly as on the way up — see
  // mountain.ts, where both of those decisions are argued. Coming *down* the
  // recycling runs the other way: a cloud that falls behind the ball is moved
  // back up the hill and lowered to match the ground it now sits over.
  /*
   * The sky rides with the player.
   *
   * Clouds on the way up are placed against the ground beneath them, which is
   * right for a camera looking up a hill. Coming down it is wrong in the worst
   * way: ground level three hundred units ahead is a hundred and thirty units
   * *below* the ball, so a cloud a little way above that ground is well below
   * the camera and lands on the hillside like a snowdrift.
   *
   * So the clouds go in a group of their own that drops with her as she
   * descends. They keep their heights relative to her rather than to whatever
   * they happen to be over, which is the only arrangement that reads as sky
   * from a camera looking downhill.
   */
  const sky = new THREE.Group();
  group.add(sky);
  const cloudGeo = puff();
  const cloudMat = vertexToon();
  cloudMat.fog = false;
  const clouds: Array<{mesh: THREE.Mesh; speed: number}> = [];
  for (let i = 0; i < K.clouds; i++) {
    const mesh = new THREE.Mesh(cloudGeo, cloudMat);
    const along = rng.range(-K.cloudBand, 40);
    /*
     * Kept out of the way of the shot, which is what going *down* changes.
     *
     * On the climb the camera looks up the hill and the clouds are above and
     * beyond it. Coming down it looks along the slope and slightly into it, so
     * anything hanging over the run is directly in front of the player — the
     * first draft put a cloud twenty units across in the middle of the screen
     * and the hillside disappeared behind it. So: out to the sides, or high
     * enough overhead to read as sky rather than as weather in the way.
     */
    const far = rng.next() < 0.55;
    const across = far
      ? rng.range(90, 250) * (rng.next() < 0.5 ? -1 : 1)
      : rng.range(-120, 120);
    const overTheRun = Math.abs(across) < 70;
    mesh.position.set(
      across,
      overTheRun
        ? rng.range(K.cloudOver, K.cloudHigh)
        : rng.range(K.cloudLow, K.cloudHigh),
      along,
    );
    mesh.scale.setScalar(rng.range(K.cloudSize[0], K.cloudSize[1]));
    mesh.rotation.y = rng.range(0, Math.PI * 2);
    sky.add(mesh);
    clouds.push({
      mesh,
      speed:
        rng.range(K.cloudDrift[0], K.cloudDrift[1]) *
        (rng.next() < 0.5 ? -1 : 1),
    });
  }

  const tan = Math.tan(K.pitch);

  return {
    group,
    slope,

    groundAt(down) {
      return down <= K.run ? 0 : (down - K.run) * tan;
    },

    update(dt, rolled) {
      // The sky keeps station on the player's own height down the hill.
      sky.position.y = -rolled * Math.sin(K.pitch);
      for (const cloud of clouds) {
        cloud.mesh.position.x += cloud.speed * dt;
        if (cloud.mesh.position.x > 210) {
          cloud.mesh.position.x = -210;
        } else if (cloud.mesh.position.x < -210) {
          cloud.mesh.position.x = 210;
        }
        // Behind the ball by more than the camera can see: bring it round to
        // the front of the run again, and drop it to the height of the ground
        // it will be floating over there.
        if (cloud.mesh.position.z > -rolled * Math.cos(K.pitch) + 90) {
          cloud.mesh.position.z -= K.cloudBand;
        }
      }
    },

    dispose() {
      shell.geometry.dispose();
      (shell.material as THREE.Material).dispose();
      cloudGeo.dispose();
      cloudMat.dispose();
    },
  };
}

/** A lumpy cloud: four overlapping blobs, flattened. */
function puff(): THREE.BufferGeometry {
  const parts: Array<THREE.BufferGeometry> = [];
  for (const [x, y, z, r] of [
    [0, 0, 0, 1],
    [0.9, -0.15, 0.2, 0.72],
    [-0.85, -0.1, -0.15, 0.66],
    [0.1, 0.35, -0.3, 0.6],
  ] as const) {
    const blob = new THREE.SphereGeometry(r, 8, 6);
    blob.scale(1, 0.62, 1);
    blob.translate(x, y, z);
    parts.push(paint(blob, P.cloud));
  }
  const merged = mergeGeometries(parts, false);
  for (const part of parts) {
    part.dispose();
  }
  return merged ?? new THREE.BufferGeometry();
}

/** One piece of the cage, and how it is flying once it stops being a cage. */
export interface CagePiece {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  spin: THREE.Vector3;
}

export interface Cage {
  group: THREE.Group;
  pieces: Array<CagePiece>;
  dispose(): void;
}

/**
 * The cage at the bottom of the mountain, with the babies inside it.
 *
 * Built as twenty-odd separate pieces rather than as one merged mesh, which is
 * the opposite of how everything else in this game is built and for one
 * reason: it has to come apart. Each bar, each ring and each rib is its own
 * mesh with its own place in the group, so the level can hand every one of
 * them a velocity and a spin and let them go.
 *
 * Twenty draw calls, once, at the very end of the last level — which is the
 * one place in the game that can afford them.
 */
export function createCage(radius: number): Cage {
  const group = new THREE.Group();
  const pieces: Array<CagePiece> = [];
  const material = vertexToon();
  const height = radius * 1.5;

  const add = (geo: THREE.BufferGeometry, colour: number): void => {
    const mesh = new THREE.Mesh(paint(geo, colour), material);
    mesh.castShadow = true;
    group.add(mesh);
    pieces.push({
      mesh,
      velocity: new THREE.Vector3(),
      spin: new THREE.Vector3(),
    });
  };

  /*
   * A rim round the foot of it rather than a floor.
   *
   * A solid disc this wide is a sixty-unit black dome once it is thrown into
   * the air by the smash — it dominated the shot, and a cage standing on grass
   * has no reason to have a floor in the first place.
   */
  const rim = new THREE.TorusGeometry(radius, radius * 0.05, 6, 26);
  rim.rotateX(Math.PI / 2);
  rim.translate(0, radius * 0.05, 0);
  add(rim, CAGE_BASE);

  // Bars. Each one is a piece of its own — this is the part that has to fly.
  const bars = 14;
  for (let i = 0; i < bars; i++) {
    const a = (i / bars) * Math.PI * 2;
    const bar = new THREE.CylinderGeometry(
      radius * 0.035,
      radius * 0.035,
      height,
      6,
    );
    bar.translate(Math.cos(a) * radius, height / 2, Math.sin(a) * radius);
    add(bar, CAGE_BAR);
  }

  // Two hoops holding them, and a domed roof of ribs meeting at a finial.
  for (const y of [height * 0.35, height * 0.82]) {
    const hoop = new THREE.TorusGeometry(radius, radius * 0.04, 6, 24);
    hoop.rotateX(Math.PI / 2);
    hoop.translate(0, y, 0);
    add(hoop, CAGE_BAR);
  }
  const ribs = 6;
  for (let i = 0; i < ribs; i++) {
    const a = (i / ribs) * Math.PI * 2;
    const rib = new THREE.CylinderGeometry(
      radius * 0.035,
      radius * 0.035,
      radius * 0.95,
      6,
    );
    // Leaning in from the top of the bars towards the middle.
    rib.rotateZ(Math.PI * 0.28);
    rib.rotateY(-a);
    rib.translate(
      Math.cos(a) * radius * 0.62,
      height + radius * 0.3,
      Math.sin(a) * radius * 0.62,
    );
    add(rib, CAGE_BAR);
  }
  const finial = new THREE.SphereGeometry(radius * 0.12, 10, 8);
  finial.translate(0, height + radius * 0.62, 0);
  add(finial, CAGE_BASE);

  return {
    group,
    pieces,
    dispose() {
      for (const piece of pieces) {
        piece.mesh.geometry.dispose();
      }
      material.dispose();
    },
  };
}

const CAGE_BAR = 0x8b93a0;
const CAGE_BASE = 0xa2895f;
