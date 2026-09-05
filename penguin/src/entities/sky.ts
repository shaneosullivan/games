import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {SKY} from "../config";
import {Rng} from "../core/rng";
import {PALETTE, paint, vertexToon} from "../render/materials";

/**
 * What is behind everything: a ring of far peaks and a few low clouds.
 *
 * The whole ring travels with the camera, which is what makes four hundred
 * metres of descent feel like a mountain rather than like a corridor with a
 * painted end. Nothing here is ever reached and nothing collides with it, so
 * it is two merged geometries and two draw calls.
 *
 * It follows in height as well as in plan, with an offset, so the peaks stay
 * on the horizon as the penguin drops four hundred and eighty units down the
 * hill. Pinned at a fixed height they would rise into the sky behind you.
 */
export class Sky {
  readonly group = new THREE.Group();

  constructor(rng: Rng) {
    this.group.add(this.buildPeaks(rng));
    this.group.add(this.buildClouds(rng));
  }

  /** `at` is the camera. */
  update(at: THREE.Vector3): void {
    this.group.position.set(at.x, at.y - 90, at.z);
  }

  private buildPeaks(rng: Rng): THREE.Mesh {
    const parts: Array<THREE.BufferGeometry> = [];
    for (let i = 0; i < SKY.peaks; i++) {
      // Evenly round the ring with a wobble, so there is never a gap of open
      // sky big enough to notice and never two peaks in the same place.
      const angle =
        ((i + 0.5) / SKY.peaks) * Math.PI * 2 + rng.range(-0.06, 0.06);
      const r = SKY.ringRadius * rng.range(0.86, 1.18);
      const height = rng.range(SKY.peakHeight[0], SKY.peakHeight[1]);
      const width = rng.range(SKY.peakWidth[0], SKY.peakWidth[1]);

      // Five sides rather than a smooth cone: at this distance and this much
      // fog a peak is a silhouette, and a silhouette with corners in it reads
      // as rock where a round one reads as a tent.
      const rock = new THREE.ConeGeometry(width / 2, height, 5);
      rock.rotateY(rng.range(0, Math.PI));
      rock.translate(Math.sin(angle) * r, height / 2, Math.cos(angle) * r);
      parts.push(paint(rock, PALETTE.rockDark));

      // The snow line: a smaller cone sitting on the top third. Its own solid
      // rather than a painted band, because a band needs a texture and this
      // game has none.
      const cap = new THREE.ConeGeometry(width * 0.22, height * 0.36, 5);
      cap.translate(Math.sin(angle) * r, height * 0.82, Math.cos(angle) * r);
      parts.push(paint(cap, PALETTE.snow));
    }

    const mesh = new THREE.Mesh(mergeGeometries(parts, false), vertexToon());
    mesh.frustumCulled = false;
    return mesh;
  }

  private buildClouds(rng: Rng): THREE.Mesh {
    const parts: Array<THREE.BufferGeometry> = [];
    for (let i = 0; i < SKY.clouds; i++) {
      const angle = rng.range(0, Math.PI * 2);
      const r = SKY.cloudRadius * rng.range(0.5, 1.1);
      const y = rng.range(SKY.cloudHeight[0], SKY.cloudHeight[1]);
      const x = Math.sin(angle) * r;
      const z = Math.cos(angle) * r;
      // Three or four overlapping lumps: one sphere is a balloon, and the
      // overlap is the whole of what makes a cloud.
      const lumps = rng.int(3, 5);
      for (let k = 0; k < lumps; k++) {
        const blob = new THREE.SphereGeometry(rng.range(18, 34), 8, 6);
        blob.scale(1.5, 0.62, 1);
        blob.translate(
          x + rng.range(-38, 38),
          y + rng.range(-6, 6),
          z + rng.range(-22, 22),
        );
        parts.push(paint(blob, 0xffffff));
      }
    }

    const mesh = new THREE.Mesh(mergeGeometries(parts, false), vertexToon());
    mesh.frustumCulled = false;
    return mesh;
  }
}
