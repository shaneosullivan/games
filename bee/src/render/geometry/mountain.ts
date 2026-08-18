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
  /**
   * The top of anything standing at the summit — the snow cap and the boulder
   * — at a point in slope space, or -Infinity where neither covers it. The
   * bee flies above this on her final approach so she crests the mountain
   * rather than flying into it. See level9Ascent flightY.
   */
  crestAt(x: number, z: number): number;
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
  /*
   * Tilted so that "up the slope" is genuinely up.
   *
   * The sign matters beyond the picture. With it the other way the mountain
   * *descended* in world space as she climbed it, which nothing on the slope
   * could tell — everything there is relative — but the sky could: clouds are
   * placed in world space, and every one of them ended up hundreds of units
   * over the top of the screen.
   */
  slope.rotation.x = A.pitch;
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

  // ---- the shoulders ------------------------------------------------------
  //
  // The mountain used to end in a straight line with sky beyond it, which read
  // as a green road rather than a mountainside. The playable strip is the same
  // width as ever — that is a gameplay promise — but the ground beyond it now
  // wanders in and out, breaks into scrub and boulders, and in places gives
  // way entirely to a drop.
  //
  // Where the cliffs are is decided first, so the shoulder can be built as one
  // continuous thing that knows when to stop.
  const cliffs: Array<{from: number; to: number; side: number}> = [];
  const cliffCount = Math.round(
    (A.climb / 1000) * A.edge.cliffsPerThousand * 2,
  );
  for (let i = 0; i < cliffCount; i++) {
    const from = rng.range(80, A.climb - 200);
    cliffs.push({
      from,
      to: from + rng.range(A.edge.cliffLength[0], A.edge.cliffLength[1]),
      side: rng.next() < 0.5 ? -1 : 1,
    });
  }
  const overACliff = (z: number, side: number): boolean =>
    cliffs.some(c => c.side === side && -z > c.from && -z < c.to);

  /** How far out the shoulder stands at this point, on this side. */
  const shoulderAt = (z: number, side: number): number =>
    A.halfWidth +
    2 +
    Math.sin((z / A.edge.wavelength) * Math.PI * 2 + side) * A.edge.wander +
    Math.sin((z / (A.edge.wavelength * 0.37)) * Math.PI * 2) *
      (A.edge.wander * 0.4);

  for (const side of [-1, 1]) {
    for (let z = 0; z > -(A.climb + 120); z -= 6) {
      const snowy = -z > snowFrom;
      const out = shoulderAt(z, side);
      if (overACliff(z, side)) {
        // A drop: the ground ends at the strip's edge and falls away.
        const face = new THREE.BoxGeometry(3, A.edge.cliffDepth, 6.4);
        face.translate(side * (A.halfWidth + 1.5), -A.edge.cliffDepth / 2, z);
        parts.push(paint(face, P.rockDark));
        // A lip of pale rock, so the edge itself is visible from above.
        const lip = new THREE.BoxGeometry(4, 1.2, 6.4);
        lip.translate(side * (A.halfWidth + 1), 0.2, z);
        parts.push(paint(lip, snowy ? P.snowShade : P.rock));
        continue;
      }
      // Otherwise the ground carries on out to the wandering shoulder.
      const width = out - A.halfWidth;
      const shelf = new THREE.BoxGeometry(width, 1.6, 6.4);
      shelf.translate(side * (A.halfWidth + width / 2), -0.6, z);
      parts.push(paint(shelf, snowy ? P.snow : P.slopeDark));
    }
  }

  // ---- the flanks ---------------------------------------------------------
  //
  // Beyond the shoulder the mountain drops away. Without this the playable
  // strip ends in a hard line with sky beside it, which reads as a road: the
  // flank is what makes the ground she is flying over the *top* of something.
  for (const side of [-1, 1]) {
    for (let z = 0; z > -(A.climb + 120); z -= 24) {
      const snowy = -z > snowFrom;
      const out = shoulderAt(z, side);
      const drop = new THREE.BoxGeometry(70, 3, 25);
      // Rolled over so it falls away from the shoulder rather than sitting
      // flat, and pushed out far enough that its top edge tucks under the
      // shoulder it hangs from.
      drop.rotateZ(side * 0.55);
      drop.translate(side * (out + 30), -16, z);
      parts.push(paint(drop, snowy ? P.snowShade : P.slopeDark));
    }
  }

  // Bushes, boulders and tufts along the shoulders, thinning into snow.
  const scrub = Math.round((A.climb / 100) * A.edge.bushesPerHundred * 2);
  for (let i = 0; i < scrub; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const z = -rng.range(0, A.climb + 100);
    if (overACliff(z, side)) {
      continue;
    }
    const out = shoulderAt(z, side);
    const x =
      side * rng.range(A.halfWidth + 1.5, Math.max(A.halfWidth + 2, out));
    const snowy = -z > snowFrom;
    const roll = rng.next();
    if (roll < 0.34) {
      const stone = new THREE.DodecahedronGeometry(rng.range(0.9, 2.8), 0);
      stone.scale(1, 0.8, 1);
      stone.translate(x, 0.3, z);
      parts.push(paint(stone, snowy ? P.snowShade : P.rock));
    } else if (roll < 0.72) {
      // A bush: three overlapping blobs, mouldy green or snow-capped.
      for (let b = 0; b < 3; b++) {
        const r = rng.range(0.7, 1.5);
        const blob = new THREE.SphereGeometry(r, 8, 6);
        blob.scale(1.2, 0.85, 1.2);
        blob.translate(x + rng.range(-1, 1), r * 0.6, z + rng.range(-1.4, 1.4));
        parts.push(
          paint(blob, snowy ? P.snow : b === 0 ? P.mouldDark : P.mould),
        );
      }
    } else {
      const h = rng.range(1.6, 4.4);
      const tuft = new THREE.ConeGeometry(rng.range(0.5, 1.1), h, 6);
      tuft.translate(x, h / 2, z);
      parts.push(paint(tuft, snowy ? P.snow : P.mould));
    }
  }

  // ---- the summit ---------------------------------------------------------
  //
  // A rounded cap with one big boulder on it — the boulder is the next level,
  // so it has to be the thing you see when you arrive. Both are ellipsoids
  // (the boulder near enough), so their tops are known in closed form; see
  // domes and crestAt, which the bee climbs over on her way in.
  const domes = {
    cap: {y: -6, z: -(A.climb + 34), r: 46, ry: 46 * 0.42},
    boulder: {y: 9, z: -(A.climb + 26), r: 6.5, ry: 6.5 * 0.86},
  };
  const cap = new THREE.SphereGeometry(domes.cap.r, 18, 12);
  cap.scale(1, domes.cap.ry / domes.cap.r, 1);
  cap.translate(0, domes.cap.y, domes.cap.z);
  parts.push(paint(cap, P.snow));
  const boulder = new THREE.DodecahedronGeometry(domes.boulder.r, 1);
  boulder.scale(1, domes.boulder.ry / domes.boulder.r, 1);
  boulder.translate(0, domes.boulder.y, domes.boulder.z);
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
  /*
   * Clouds are the one thing here that ignores the fog.
   *
   * The sky above the ridge is four hundred units away, which is exactly where
   * this level's fog turns everything into the background — so the clouds were
   * being painted the colour of the sky they were drawn against, and the first
   * draft of this level looked like an empty blue dome. Fog on a white cloud
   * only ever takes it away, and a real one holds its shape at that distance
   * anyway.
   */
  cloudMat.fog = false;
  const clouds: Array<{mesh: THREE.Mesh; speed: number}> = [];
  for (let i = 0; i < A.clouds; i++) {
    const mesh = new THREE.Mesh(cloudGeo, cloudMat);
    /*
     * Placed against the ground under them, not against sea level.
     *
     * The mountain rises as it goes back, so a cloud at a fixed world height
     * would be overhead at the bottom and buried in the hillside at the top.
     * Each one sits a little way above the slope beneath it instead — and some
     * of them *below* that, out beyond the shoulder where there is nothing to
     * bury them in, because cloud passing below you is the thing that says how
     * high you have climbed.
     */
    const along = rng.range(-A.cloudBand, 40);
    /*
     * The ground under a cloud, from the cloud's *world* z.
     *
     * Tangent, not sine. The slope is tilted about x, so a point s up it is
     * at world z = -s·cos(pitch) and world y = s·sin(pitch) — which in terms
     * of z is -z·tan(pitch). Using the sine put every cloud six percent low,
     * which over five hundred units of climb is thirty units, i.e. underneath
     * the hillside they were supposed to be floating over.
     */
    const ground = -along * Math.tan(A.pitch);
    const far = rng.next() < 0.45;
    mesh.position.set(
      far
        ? rng.range(70, 230) * (rng.next() < 0.5 ? -1 : 1)
        : rng.range(-90, 90),
      ground +
        (far
          ? rng.range(-26, A.cloudHigh)
          : rng.range(A.cloudLow, A.cloudHigh)),
      along,
    );
    mesh.scale.setScalar(rng.range(A.cloudSize[0], A.cloudSize[1]));
    // Each one turned a different way, so a sky of forty puffs built from one
    // geometry doesn't read as forty copies of the same puff.
    mesh.rotation.y = rng.range(0, Math.PI * 2);
    group.add(mesh);
    clouds.push({
      mesh,
      // Half the wind goes one way and half the other. Clouds all drifting
      // together read as the camera moving; clouds crossing each other read as
      // weather.
      speed:
        rng.range(A.cloudDrift[0], A.cloudDrift[1]) *
        (rng.next() < 0.5 ? -1 : 1),
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

    crestAt(x, z) {
      // The upper surface of an ellipsoid at (x, z): its centre height plus its
      // vertical radius scaled by how far in from the rim the point is.
      const top = (d: {
        y: number;
        z: number;
        r: number;
        ry: number;
      }): number => {
        const q = (x * x + (z - d.z) * (z - d.z)) / (d.r * d.r);
        return q >= 1 ? -Infinity : d.y + d.ry * Math.sqrt(1 - q);
      };
      return Math.max(top(domes.cap), top(domes.boulder));
    },

    update(dt, climbed) {
      for (const cloud of clouds) {
        cloud.mesh.position.x += cloud.speed * dt;
        if (cloud.mesh.position.x > 190) {
          cloud.mesh.position.x = -190;
        } else if (cloud.mesh.position.x < -190) {
          cloud.mesh.position.x = 190;
        }
        /*
         * Recycled up the mountain as she climbs, so the sky never runs out.
         *
         * The threshold is *behind* the camera, not in front of it. It used to
         * be sixty units up the slope from her, which meant every cloud in the
         * game turned round and went back before it ever got near — the sky had
         * weather on the horizon and nothing at all overhead. The camera stands
         * about `climbed·cos(pitch)` down the world's z, and this is a little
         * further back again, so a cloud gets to pass over her head first.
         */
        if (cloud.mesh.position.z > -climbed * Math.cos(A.pitch) + 80) {
          cloud.mesh.position.z -= A.cloudBand;
          // And it goes *up* with the mountain it is being moved over. Moved
          // back without being raised, a recycled cloud kept the height it was
          // born at and ended up inside the hillside — which is why the sky
          // emptied out after the first few hundred units of the climb.
          cloud.mesh.position.y += A.cloudBand * Math.tan(A.pitch);
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
