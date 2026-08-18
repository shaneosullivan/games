import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {ASCENT as A, ASCENT_PALETTE as P} from "../../config";
import type {Rng} from "../../core/rng";
import {paint, vertexToon} from "../materials";

/** A bump on the slope: rocks bounce over these. */
export interface Bump {
  /** Across the slope, and how far up it. */
  x: number;
  z: number;
  radius: number;
}

export interface Mountain {
  group: THREE.Group;
  /** Everything inside this is in slope space: x across, -z up, y off it. */
  slope: THREE.Group;
  readonly bumps: ReadonlyArray<Bump>;
  /** Where the ground is, in slope space, for anything that rolls on it. */
  heightAt(x: number, z: number): number;
  /** Drift the clouds and creep the mould. */
  update(dt: number, climbed: number): void;
  dispose(): void;
}

const tmp = new THREE.Vector3();

/**
 * The mountainside, and the sky over it.
 *
 * Built once, whole: the slope is fifteen hundred units long and every bump on
 * it is known from the start, because rocks have to bounce off things the
 * player can see and a hillside generated as she goes would have to agree with
 * itself about where those were. At this size that is cheaper than it sounds —
 * the ground is one merged mesh and the scenery is another.
 *
 * Everything lives inside `slope`, a group tilted by the mountain's own pitch,
 * so the level and everything on it can think in flat coordinates: x across
 * the hill, -z up it, y off the surface. Nothing outside this file needs to
 * know the mountain is on a slant.
 */
export function createMountain(rng: Rng): Mountain {
  const group = new THREE.Group();
  const slope = new THREE.Group();
  // Tilted so that "up the slope" is up the screen and away from the camera.
  slope.rotation.x = -A.pitch;
  group.add(slope);

  const parts: Array<THREE.BufferGeometry> = [];
  const bumps: Array<Bump> = [];
  const length = A.climb + 260;
  const wide = A.halfWidth * 2 + 40;

  // ---- the ground ---------------------------------------------------------
  //
  // One long slab, with the snow of the summit laid over its far end.
  const ground = new THREE.BoxGeometry(wide, 2, length);
  ground.translate(0, -1, -length / 2 + 120);
  parts.push(paint(ground, P.slope));

  const snowFrom = A.climb - 150;
  const snow = new THREE.BoxGeometry(wide, 2.2, 260);
  snow.translate(0, -0.9, -(snowFrom + 130));
  parts.push(paint(snow, P.snow));

  // ---- bumps --------------------------------------------------------------
  //
  // Mounds the rocks bounce over. Their positions are the level's, not the
  // scenery's: a rock is told to jump by this list, so what it jumps over has
  // to be exactly what is drawn.
  const bumpCount = Math.round((A.climb / 100) * 6);
  for (let i = 0; i < bumpCount; i++) {
    const z = -rng.range(60, A.climb - 40);
    const x = rng.range(-A.halfWidth + 2, A.halfWidth - 2);
    const radius = rng.range(1.6, 3.4);
    bumps.push({x, z, radius});
    const mound = new THREE.SphereGeometry(radius, 10, 6);
    mound.scale(1, 0.5, 1);
    mound.translate(x, 0, z);
    parts.push(paint(mound, i % 3 === 0 ? P.mould : P.slopeDark));
  }

  // ---- scenery ------------------------------------------------------------
  //
  // Off to the sides, where nothing is played: it is there to say how fast she
  // is climbing, which a bare slope cannot.
  for (let i = 0; i < Math.round(A.climb / 9); i++) {
    const side = rng.next() < 0.5 ? -1 : 1;
    const x = side * rng.range(A.halfWidth + 1, A.halfWidth + 19);
    const z = -rng.range(0, A.climb + 80);
    const snowy = -z > snowFrom;
    if (rng.next() < 0.45) {
      const stone = new THREE.DodecahedronGeometry(rng.range(0.8, 2.6), 0);
      stone.scale(1, 0.8, 1);
      stone.translate(x, 0.3, z);
      parts.push(paint(stone, snowy ? P.snowShade : P.rock));
      continue;
    }
    // Mouldy tufts, and up top they wear snow instead.
    const h = rng.range(1.4, 4);
    const tuft = new THREE.ConeGeometry(rng.range(0.5, 1.2), h, 6);
    tuft.translate(x, h / 2, z);
    parts.push(
      paint(tuft, snowy ? P.snow : rng.next() < 0.5 ? P.mould : P.mouldDark),
    );
  }

  // ---- the summit ---------------------------------------------------------
  //
  // A rounded cap with one big boulder on it — the boulder is the next level,
  // so it has to be the thing you see when you arrive.
  const cap = new THREE.SphereGeometry(46, 18, 12);
  cap.scale(1, 0.42, 1);
  cap.translate(0, -6, -(A.climb + 34));
  parts.push(paint(cap, P.snow));
  const boulder = new THREE.DodecahedronGeometry(6.5, 1);
  boulder.scale(1, 0.86, 1);
  boulder.translate(0, 9, -(A.climb + 26));
  parts.push(paint(boulder, P.rock));

  const merged = mergeGeometries(parts, false);
  const ground3d = new THREE.Mesh(
    merged ?? new THREE.BufferGeometry(),
    vertexToon(),
  );
  ground3d.receiveShadow = true;
  slope.add(ground3d);
  for (const part of parts) {
    part.dispose();
  }

  // ---- clouds -------------------------------------------------------------
  //
  // In world space rather than on the slope: they belong to the sky, and a
  // cloud tilted with the mountain reads as a lump of snow in mid-air.
  const cloudGeo = puff();
  const cloudMat = vertexToon();
  const clouds: Array<{mesh: THREE.Mesh; speed: number}> = [];
  for (let i = 0; i < A.clouds; i++) {
    const mesh = new THREE.Mesh(cloudGeo, cloudMat);
    mesh.position.set(
      rng.range(-160, 160),
      rng.range(24, 78),
      rng.range(-A.climb, 40),
    );
    mesh.scale.setScalar(rng.range(2.4, 6));
    group.add(mesh);
    clouds.push({
      mesh,
      speed: rng.range(1.4, 4.2) * (rng.next() < 0.5 ? -1 : 1),
    });
  }

  return {
    group,
    slope,
    bumps,

    heightAt(x, z) {
      // The slab is flat; only the bumps stand out of it.
      let h = 0;
      for (const bump of bumps) {
        const d = Math.hypot(x - bump.x, z - bump.z);
        if (d < bump.radius) {
          h = Math.max(
            h,
            Math.cos((d / bump.radius) * Math.PI * 0.5) * bump.radius * 0.5,
          );
        }
      }
      return h;
    },

    update(dt, climbed) {
      for (const cloud of clouds) {
        cloud.mesh.position.x += cloud.speed * dt;
        if (cloud.mesh.position.x > 190) {
          cloud.mesh.position.x = -190;
        } else if (cloud.mesh.position.x < -190) {
          cloud.mesh.position.x = 190;
        }
        // Recycled up the mountain as she climbs, so the sky never runs out.
        if (cloud.mesh.position.z > -climbed + 60) {
          cloud.mesh.position.z -= 320;
        }
      }
      void tmp;
    },

    dispose() {
      ground3d.geometry.dispose();
      (ground3d.material as THREE.Material).dispose();
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
