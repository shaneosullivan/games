import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {KATAMARI as K, ASCENT_PALETTE as P} from "../../config";
import type {Rng} from "../../core/rng";
import {paint, vertexToon} from "../materials";

export interface Descent {
  group: THREE.Group;
  /** Slope space: x across, -z *down* the hill, y off the surface. */
  slope: THREE.Group;
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
  const wide = K.halfWidth * 2 + 44;

  // ---- the ground ---------------------------------------------------------
  const ground = new THREE.BoxGeometry(wide, 2, length);
  ground.translate(0, -1, -length / 2 + 140);
  parts.push(paint(ground, P.slope));

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

  const bushes = Math.round((K.run / 100) * 8);
  for (let i = 0; i < bushes; i++) {
    const z = -rng.range(-40, K.run + 200);
    const side = rng.next() < 0.5 ? -1 : 1;
    const out = edgeAt(z, side) + rng.range(0, 9);
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
  const cloudGeo = puff();
  const cloudMat = vertexToon();
  cloudMat.fog = false;
  const clouds: Array<{mesh: THREE.Mesh; speed: number}> = [];
  for (let i = 0; i < K.clouds; i++) {
    const mesh = new THREE.Mesh(cloudGeo, cloudMat);
    const along = rng.range(-K.cloudBand, 40);
    // The hill falls away going -z, so the ground under a cloud drops with it.
    const ground3d = along * Math.tan(K.pitch);
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
      ground3d +
        (overTheRun
          ? rng.range(K.cloudOver, K.cloudHigh)
          : rng.range(K.cloudLow, K.cloudHigh)),
      along,
    );
    mesh.scale.setScalar(rng.range(K.cloudSize[0], K.cloudSize[1]));
    mesh.rotation.y = rng.range(0, Math.PI * 2);
    group.add(mesh);
    clouds.push({
      mesh,
      speed:
        rng.range(K.cloudDrift[0], K.cloudDrift[1]) *
        (rng.next() < 0.5 ? -1 : 1),
    });
  }

  return {
    group,
    slope,

    update(dt, rolled) {
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
          cloud.mesh.position.y -= K.cloudBand * Math.tan(K.pitch);
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
