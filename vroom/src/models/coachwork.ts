import * as THREE from "three";
import {CAR, Sticker, STICKER} from "../config";
import {Assembly, DETAIL, rounded} from "./assembly";

/**
 * The coachbuilder's tools: what the road cars have in common.
 *
 * The racing car is a hull and the animals are balls and boxes, but a road
 * car is panels — a body with holes cut for its wheels, windows set into a
 * glasshouse with a frame of paint round each one. These are the pieces of
 * that, shared by every car that is built that way rather than copied into
 * each: the window inset in particular has enough arithmetic in it to be
 * wrong in one copy and right in another.
 */

/**
 * A shape drawn in the side view, pushed out across the car.
 *
 * The shape's x is along the car — positive towards the nose — and its y is
 * up. It comes out `wide` across, centred on `x`, with the drawing's origin at
 * `z` along the car. A body panel with a hole cut for a wheel, a wing curving
 * over one: anything whose outline is best drawn from the side.
 */
export function across(
  shape: THREE.Shape,
  wide: number,
  z: number,
  x = 0,
): THREE.BufferGeometry {
  const solid = new THREE.ExtrudeGeometry(shape, {
    depth: wide,
    bevelEnabled: false,
    curveSegments: DETAIL.round,
  });
  // A quarter turn the way that takes the drawing's x to the car's z, nose
  // forward, and the extrusion out across the car.
  solid.rotateY(-Math.PI / 2);
  solid.translate(x + wide / 2, 0, z);
  return solid;
}

/** The part of a polygon on one side of a slice across the car: `keep` is 1
 *  for everything ahead of `z` and -1 for everything behind it. */
export function clip(
  polygon: Array<THREE.Vector3>,
  z: number,
  keep: number,
): Array<THREE.Vector3> {
  const out: Array<THREE.Vector3> = [];
  const inside = (p: THREE.Vector3): boolean => (p.z - z) * keep >= 0;
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i];
    const q = polygon[(i + 1) % polygon.length];
    if (inside(p)) {
      out.push(p);
    }
    if (inside(p) !== inside(q)) {
      out.push(p.clone().lerp(q, (z - p.z) / (q.z - p.z)));
    }
  }
  return out;
}

/**
 * A flat pane over a flat face of a hull: the face's outline brought in by
 * `inset` all round and lifted just proud of it.
 *
 * Inset by distance, edge by edge, rather than shrunk towards the middle —
 * shrinking a long, low side window leaves a frame that is thick at the ends
 * and thin along the top.
 */
export function pane(
  a: Assembly,
  polygon: Array<THREE.Vector3>,
  centre: THREE.Vector3,
  inset: number,
  substance: "glass" | "rubber",
  colour: number,
): void {
  if (polygon.length < 3) {
    return;
  }
  const origin = polygon[0];
  const middle = new THREE.Vector3();
  polygon.forEach(p => middle.add(p));
  middle.divideScalar(polygon.length);

  // The face's own flat coordinates, and which way is out.
  const normal = new THREE.Vector3();
  for (let i = 1; i + 1 < polygon.length && normal.lengthSq() < 1e-8; i++) {
    normal.crossVectors(
      polygon[i].clone().sub(origin),
      polygon[i + 1].clone().sub(origin),
    );
  }
  normal.normalize();
  if (normal.dot(middle.clone().sub(centre)) < 0) {
    normal.negate();
  }
  const u = middle.clone().sub(origin).normalize();
  const v = new THREE.Vector3().crossVectors(normal, u);
  const flat = polygon.map(p => {
    const d = p.clone().sub(origin);
    return new THREE.Vector2(d.dot(u), d.dot(v));
  });
  // Which way round the outline goes, so "inward" is the right side of every
  // edge.
  let area = 0;
  for (let i = 0; i < flat.length; i++) {
    const p = flat[i];
    const q = flat[(i + 1) % flat.length];
    area += p.x * q.y - q.x * p.y;
  }
  const turn = Math.sign(area);

  const edges = flat
    .map((p, i) => {
      const q = flat[(i + 1) % flat.length];
      const dir = q.clone().sub(p);
      const length = dir.length();
      if (length < 1e-4) {
        return null;
      }
      dir.divideScalar(length);
      const inward = new THREE.Vector2(-dir.y * turn, dir.x * turn);
      return {from: p.clone().addScaledVector(inward, inset), dir};
    })
    .filter((e): e is {from: THREE.Vector2; dir: THREE.Vector2} => e !== null);

  const lifted: Array<THREE.Vector3> = [];
  for (let i = 0; i < edges.length; i++) {
    const e = edges[(i + edges.length - 1) % edges.length];
    const f = edges[i];
    const cross = e.dir.x * f.dir.y - e.dir.y * f.dir.x;
    if (Math.abs(cross) < 1e-6) {
      continue;
    }
    const w = f.from.clone().sub(e.from);
    const t = (w.x * f.dir.y - w.y * f.dir.x) / cross;
    const at = e.from.clone().addScaledVector(e.dir, t);
    lifted.push(
      origin
        .clone()
        .addScaledVector(u, at.x)
        .addScaledVector(v, at.y)
        .addScaledVector(normal, 0.03),
    );
  }
  if (lifted.length < 3) {
    return;
  }

  const triangles: Array<THREE.Vector3> = [];
  for (let i = 1; i + 1 < lifted.length; i++) {
    const p = lifted[i].clone().sub(lifted[0]);
    const q = lifted[i + 1].clone().sub(lifted[0]);
    const facing = new THREE.Vector3().crossVectors(p, q).dot(normal) > 0;
    triangles.push(
      lifted[0],
      facing ? lifted[i] : lifted[i + 1],
      facing ? lifted[i + 1] : lifted[i],
    );
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(triangles);
  geometry.computeVertexNormals();
  a.add(geometry, substance, colour);
}

/** The axles, as fractions of the length: every car on the grid has these. */
export const AXLES = {front: 0.33, rear: -0.31} as const;

/**
 * A road car's body below the waist, in pieces around its wheels: the sills
 * between them, the bumpers beyond them, and over each wheel a panel with a
 * round arch cut out of it.
 *
 * A hull cannot have a hole in it, and a car whose wheels run through its
 * sides — which the first go at the taxi was — looks like a toy with its
 * wheels pushed on.
 */
export function underbody(
  a: Assembly,
  colour: number,
  trim: number,
  spec: {wheel: number; arch: number; clearance: number; floor: number},
): void {
  const L = CAR.length;
  const W = CAR.width;
  const top = spec.floor + 0.3;
  const low = spec.clearance;
  const r = spec.arch;
  const frontAxle = AXLES.front * L;
  const rearAxle = AXLES.rear * L;

  const sill = rounded(W, top - low, frontAxle - rearAxle - r * 2, 0.3);
  sill.translate(0, (top + low) / 2, (frontAxle + rearAxle) / 2);
  a.add(sill, "bodywork", colour);

  const noseLong = L / 2 - (frontAxle + r);
  const nose = rounded(W * 0.94, top - low + 0.2, noseLong + 0.3, 0.5);
  nose.translate(0, (top + low + 0.2) / 2, frontAxle + r + noseLong / 2 - 0.15);
  a.add(nose, "bodywork", colour);

  const tailLong = -L / 2 - (rearAxle - r);
  const tail = rounded(W * 0.94, top - low + 0.2, -tailLong + 0.3, 0.5);
  tail.translate(0, (top + low + 0.2) / 2, rearAxle - r + tailLong / 2 + 0.15);
  a.add(tail, "bodywork", colour);

  for (const z of [frontAxle, rearAxle]) {
    const cut = new THREE.Shape();
    cut.moveTo(-r, top);
    cut.lineTo(r, top);
    cut.lineTo(r, spec.wheel);
    cut.absarc(0, spec.wheel, r, 0, Math.PI, false);
    cut.closePath();
    a.add(across(cut, W, z), "bodywork", colour);

    // A dark lining inside the arch, set back from the flank. From the
    // outside it is the shadow a wheel sits in; without it the underside of
    // a pale arch lights up and the wheel looks stuck on.
    const inner = r - 0.16;
    const lining = new THREE.Shape();
    lining.moveTo(r, spec.wheel);
    lining.absarc(0, spec.wheel, r, 0, Math.PI, false);
    lining.lineTo(-inner, spec.wheel);
    lining.absarc(0, spec.wheel, inner, Math.PI, 0, true);
    lining.closePath();
    a.add(across(lining, W * 0.9, z), "rubber", trim);
  }
}

/** Whether a colour is dark enough that black trim would disappear on it. */
export function dark(colour: number): boolean {
  const hsl = {h: 0, s: 0, l: 0};
  new THREE.Color(colour).getHSL(hsl, THREE.SRGBColorSpace);
  return hsl.l < 0.25;
}

/** Whether a colour is pale enough that white trim would disappear on it. */
export function pale(colour: number): boolean {
  const hsl = {h: 0, s: 0, l: 0};
  new THREE.Color(colour).getHSL(hsl, THREE.SRGBColorSpace);
  return hsl.l > 0.8;
}

/** A thin rod from one point to another, for seams, rails and pillars. */
export function rod(
  a: Assembly,
  from: THREE.Vector3,
  to: THREE.Vector3,
  thick: number,
  substance: "bodywork" | "chrome" | "rubber" | "matte",
  colour: number,
): void {
  const length = from.distanceTo(to);
  const bar = new THREE.CylinderGeometry(thick, thick, length, 8);
  const up = new THREE.Vector3(0, 1, 0);
  const dir = to.clone().sub(from).normalize();
  bar.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, dir));
  const middle = from.clone().add(to).multiplyScalar(0.5);
  bar.translate(middle.x, middle.y, middle.z);
  a.add(bar, substance, colour);
}

/** A number plate, for writing on: its middle, which way it faces, and its
 *  size. `z` is where the writing goes, just proud of the plate's face. */
export interface Plate {
  y: number;
  z: number;
  facing: 1 | -1;
  wide: number;
  tall: number;
}

/**
 * Whatever has been written on the car, on its number plates.
 *
 * On the road cars the writing goes where a car's name actually goes: its
 * plates. All of it, on one line, made as small as it has to be to fit — a
 * short name fills the plate and a long one gets smaller letters rather than
 * running off the edge.
 *
 * Rebuilt on its own, without the rest of the car, because it changes with
 * every letter typed. The model remembers where its plates are, so rebuilding
 * needs only the car and the words.
 */
export function plates(
  group: THREE.Group,
  stickers: ReadonlyArray<Sticker>,
  where?: ReadonlyArray<Plate>,
): void {
  if (where) {
    group.userData.plates = where;
  }
  const spots = (group.userData.plates ?? []) as ReadonlyArray<Plate>;
  for (const old of [...group.children]) {
    if (old.userData.plate) {
      group.remove(old);
      const mesh = old as THREE.Mesh;
      mesh.geometry.dispose();
      const material = mesh.material as THREE.MeshStandardMaterial;
      material.map?.dispose();
      material.dispose();
    }
  }
  const written = stickers.find(s => s.kind === "text");
  const words = (written?.text ?? "").trim().replace(/\s+/g, " ");
  if (words === "") {
    return;
  }
  for (const spot of spots) {
    const face = new THREE.PlaneGeometry(spot.wide * 0.94, spot.tall * 0.9);
    if (spot.facing < 0) {
      face.rotateY(Math.PI);
    }
    face.translate(0, spot.y, spot.z);
    const mesh = new THREE.Mesh(
      face,
      new THREE.MeshStandardMaterial({
        map: plateWords(
          words,
          written?.font ?? STICKER.fonts[0].id,
          spot.wide / spot.tall,
        ),
        transparent: true,
        alphaTest: 0.3,
        roughness: 0.6,
      }),
    );
    mesh.userData.plate = true;
    group.add(mesh);
  }
}

/** The words, in black, as big as will fit on a plate on one line. */
function plateWords(
  words: string,
  font: string,
  aspect: number,
): THREE.CanvasTexture {
  const family =
    STICKER.fonts.find(f => f.id === font)?.family ?? STICKER.fonts[0].family;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = Math.round(512 / aspect);
  const g = canvas.getContext("2d")!;
  const tallest = canvas.height * 0.86;
  g.font = `700 ${tallest}px ${family}`;
  const across = g.measureText(words).width;
  const size = Math.min(tallest, (tallest * canvas.width * 0.92) / across);
  g.font = `700 ${size}px ${family}`;
  g.fillStyle = "#15161a";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(words, canvas.width / 2, canvas.height / 2 + size * 0.04);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = STICKER.anisotropy;
  return texture;
}
