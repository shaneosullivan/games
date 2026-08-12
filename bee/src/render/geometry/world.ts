import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PALETTE, WORLD } from '../../config';
import { paint, solidToon, vertexToon } from '../materials';
import type { Rng } from '../../core/rng';

/** Ground plane, grass tufts, boundary hedge and background trees. */
export function createMeadow(rng: Rng): THREE.Group {
  const group = new THREE.Group();

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(WORLD.groundSize / 2, 64),
    solidToon(PALETTE.grass),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // Soft colour variation: a few big flat discs of a slightly different green.
  const patchMat = solidToon(PALETTE.grassDark);
  const patchGeo = new THREE.CircleGeometry(1, 20);
  const patches = new THREE.InstancedMesh(patchGeo, patchMat, 26);
  patches.receiveShadow = true;
  const m = new THREE.Matrix4();
  for (let i = 0; i < patches.count; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = Math.sqrt(rng.next()) * WORLD.radius;
    const s = rng.range(3, 9);
    m.compose(
      new THREE.Vector3(Math.cos(a) * r, 0.012, Math.sin(a) * r),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, rng.range(0, 6.28))),
      new THREE.Vector3(s, s * rng.range(0.6, 1.2), 1),
    );
    patches.setMatrixAt(i, m);
  }
  group.add(patches);

  // Grass tufts — three blades merged, then instanced.
  const bladeParts: THREE.BufferGeometry[] = [];
  for (const [x, z, h, tilt] of [
    [0, 0, 0.5, 0.0],
    [0.09, 0.05, 0.36, 0.3],
    [-0.08, 0.06, 0.42, -0.25],
  ] as const) {
    const b = new THREE.ConeGeometry(0.045, h, 4);
    b.translate(0, h / 2, 0);
    b.rotateZ(tilt);
    b.translate(x, 0, z);
    bladeParts.push(paint(b, PALETTE.grassDark));
  }
  const tuft = mergeGeometries(bladeParts, false)!;
  tuft.computeVertexNormals();

  const tufts = new THREE.InstancedMesh(tuft, vertexToon(), 900);
  for (let i = 0; i < tufts.count; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = Math.sqrt(rng.next()) * WORLD.radius;
    const s = rng.range(0.7, 1.5);
    m.compose(
      new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng.range(0, 6.28), 0)),
      new THREE.Vector3(s, s, s),
    );
    tufts.setMatrixAt(i, m);
  }
  group.add(tufts);

  // Boundary hedge: a ring of bushes that reads as "don't go further" — open
  // to the north, where the lane to Caramel Cottage runs.
  const bushGeo = new THREE.IcosahedronGeometry(1, 1);
  const bushes = new THREE.InstancedMesh(bushGeo, solidToon(0x4e8f47), 120);
  bushes.castShadow = true;
  bushes.receiveShadow = true;
  for (let i = 0; i < bushes.count; i++) {
    const a = (i / bushes.count) * Math.PI * 2 + rng.range(-0.02, 0.02);
    if (facingCottage(a)) {
      // Instances can't be skipped, only hidden.
      m.makeScale(0, 0, 0);
      bushes.setMatrixAt(i, m);
      continue;
    }
    const r = WORLD.radius + rng.range(1.5, 4);
    const s = rng.range(1.6, 3.1);
    m.compose(
      new THREE.Vector3(Math.cos(a) * r, s * 0.35, Math.sin(a) * r),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.range(0, 1), rng.range(0, 6.28), 0)),
      new THREE.Vector3(s, s * 0.8, s),
    );
    bushes.setMatrixAt(i, m);
  }
  group.add(bushes);

  group.add(createTrees(rng));
  return group;
}

/**
 * True for ring positions that would stand between the meadow and the cottage.
 *
 * The clearing is off to the north (-Z, i.e. angle -PI/2) and the fence at its
 * mouth is the boundary on that side, so the meadow's own hedge and treeline
 * step aside to leave the lane open — otherwise they cut straight across the
 * flight home.
 */
function facingCottage(a: number): boolean {
  let d = (a + Math.PI / 2) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d) < 0.6;
}

function createTrees(rng: Rng): THREE.Group {
  const g = new THREE.Group();
  const parts: THREE.BufferGeometry[] = [];
  const trunk = new THREE.CylinderGeometry(0.42, 0.62, 4.4, 7);
  trunk.translate(0, 2.2, 0);
  parts.push(paint(trunk, 0x8b6244));
  for (const [y, r] of [
    [4.6, 2.5],
    [6.1, 1.9],
    [7.2, 1.2],
  ] as const) {
    const blob = new THREE.IcosahedronGeometry(r, 1);
    blob.scale(1, 0.82, 1);
    blob.translate(rng.range(-0.3, 0.3), y, rng.range(-0.3, 0.3));
    parts.push(paint(blob, y > 6 ? 0x69b45c : 0x4e8f47));
  }
  const treeGeo = mergeGeometries(parts, false)!;
  treeGeo.computeVertexNormals();

  const trees = new THREE.InstancedMesh(treeGeo, vertexToon(), 22);
  trees.castShadow = true;
  const m = new THREE.Matrix4();
  for (let i = 0; i < trees.count; i++) {
    const a = (i / trees.count) * Math.PI * 2 + rng.range(-0.12, 0.12);
    if (facingCottage(a)) {
      m.makeScale(0, 0, 0);
      trees.setMatrixAt(i, m);
      continue;
    }
    const r = WORLD.radius + rng.range(6, 24);
    const s = rng.range(0.85, 1.5);
    m.compose(
      new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng.range(0, 6.28), 0)),
      new THREE.Vector3(s, s, s),
    );
    trees.setMatrixAt(i, m);
  }
  g.add(trees);
  return g;
}

export interface HiveSite {
  group: THREE.Group;
  position: THREE.Vector3;
  /** 0..1 build progress — drives how much of the hive has materialised. */
  setProgress(p: number): void;
  /** World position of the doorway the bee flies into. */
  readonly entrance: THREE.Vector3;
  /** Switch the rainbow halo on once the hive is finished. */
  setGlow(on: boolean): void;
  /** Animate the halo. `elapsed` is seconds since the game started. */
  updateGlow(elapsed: number): void;
}

/**
 * The spot the queen is founding her hive. In level 1 it starts as a bare
 * branch stub and grows a comb as pollen comes in, so the goal is always
 * visible from the air.
 */
export function createHiveSite(position: THREE.Vector3): HiveSite {
  const group = new THREE.Group();
  group.position.copy(position);

  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.75, 5.5, 8), solidToon(0x8b6244));
  post.position.y = 2.75;
  post.castShadow = true;
  post.receiveShadow = true;
  group.add(post);

  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 2.2, 6), solidToon(0x8b6244));
  arm.rotation.z = Math.PI / 2;
  arm.position.set(0.9, 5.2, 0);
  arm.castShadow = true;
  group.add(arm);

  // The hive itself: stacked squashed spheres that scale in with progress.
  const hive = new THREE.Group();
  hive.position.set(1.8, 4.35, 0);
  group.add(hive);

  const layers: THREE.Mesh[] = [];
  const shades = [0xe0a934, 0xebbc4d, 0xf5cf68, 0xfadd8a];
  for (let i = 0; i < 4; i++) {
    const r = 1.15 - i * 0.2;
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 10), solidToon(shades[i]));
    mesh.scale.y = 0.55;
    mesh.position.y = -i * 0.55;
    mesh.castShadow = true;
    hive.add(mesh);
    layers.push(mesh);
  }

  // The doorway. Widened once the hive is done so it reads as flyable-into.
  const entrance = new THREE.Mesh(new THREE.CircleGeometry(0.34, 14), solidToon(0x3b2810));
  entrance.position.set(0, -0.7, 0.94);
  hive.add(entrance);

  // Landing lip under the door, so the entrance reads as a real opening.
  const lip = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.36, 0.12, 12), solidToon(0xd9a133));
  lip.position.set(0, -0.95, 0.86);
  hive.add(lip);

  const glow = createHiveGlow();
  glow.visible = false;
  hive.add(glow);

  function setProgress(p: number): void {
    const clamped = Math.max(0, Math.min(1, p));
    for (let i = 0; i < layers.length; i++) {
      const start = i / layers.length;
      const local = Math.max(0, Math.min(1, (clamped - start) * layers.length));
      const s = 0.001 + local;
      layers[i].scale.set(s, s * 0.55, s);
      layers[i].visible = local > 0.01;
    }
    entrance.visible = clamped > 0.9;
    lip.visible = clamped > 0.9;
  }

  setProgress(0);

  // hive sits at (1.8, 4.35, 0) inside the site group.
  const entranceWorld = position
    .clone()
    .add(hive.position)
    .add(new THREE.Vector3(0, -0.7, 0.94));

  return {
    group,
    position: position.clone(),
    setProgress,
    entrance: entranceWorld,
    setGlow(on) {
      glow.visible = on;
    },
    updateGlow(elapsed) {
      if (!glow.visible) return;
      updateHiveGlow(glow, elapsed);
    },
  };
}

const FORCE_FIELD_VERT = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying float vLocalY;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDir = normalize(cameraPosition - worldPos.xyz);
    vLocalY = position.y;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

/**
 * Fresnel bubble: almost invisible face-on, bright only where the surface
 * turns away from the eye. That's what makes it read as a soft shell of light
 * rather than a coloured ball, and it keeps the hive itself clearly visible
 * through the middle.
 */
const FORCE_FIELD_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uPulse;

  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying float vLocalY;

  void main() {
    float facing = abs(dot(normalize(vNormalW), normalize(vViewDir)));
    float rim = pow(1.0 - facing, 2.4);

    // A slow band travelling up the bubble, so it breathes instead of sitting still.
    float band = 0.5 + 0.5 * sin(vLocalY * 6.0 - uTime * 1.5);

    float alpha = (0.028 + rim * 0.42 + band * 0.03) * uPulse;
    gl_FragColor = vec4(uColor * (0.55 + rim * 0.85), alpha);
  }
`;

/**
 * Friendly force field around the finished hive: a single mostly-transparent
 * fresnel bubble that pulses gently and drifts through pastel hues, plus a
 * soft coloured light so the glow spills onto the hive and branch.
 */
function createHiveGlow(): THREE.Group {
  const g = new THREE.Group();

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0x9fe8ff) },
      uTime: { value: 0 },
      uPulse: { value: 1 },
    },
    vertexShader: FORCE_FIELD_VERT,
    fragmentShader: FORCE_FIELD_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });

  const bubble = new THREE.Mesh(new THREE.IcosahedronGeometry(2.05, 3), mat);
  bubble.scale.y = 0.88;
  bubble.position.y = -0.7;
  bubble.name = 'bubble';
  g.add(bubble);

  const light = new THREE.PointLight(0xffffff, 3.5, 13, 2);
  light.position.y = -0.6;
  g.add(light);

  return g;
}

const glowColor = new THREE.Color();

function updateHiveGlow(glow: THREE.Group, elapsed: number): void {
  // Two offset sines: a slow breath with a faint shimmer riding on it.
  const breath = 0.5 + 0.5 * Math.sin(elapsed * 1.15);
  const shimmer = 0.5 + 0.5 * Math.sin(elapsed * 3.7);
  const pulse = 0.75 + breath * 0.5 + shimmer * 0.08;

  // Pastel: high lightness, moderate saturation. Friendly, not laser-grid.
  glowColor.setHSL((elapsed * 0.07) % 1, 0.62, 0.72);

  for (const child of glow.children) {
    if (child instanceof THREE.PointLight) {
      child.color.copy(glowColor);
      child.intensity = 2.2 + breath * 2.6;
      continue;
    }
    if (!(child instanceof THREE.Mesh)) continue;

    const mat = child.material as THREE.ShaderMaterial;
    mat.uniforms.uColor.value.copy(glowColor);
    mat.uniforms.uTime.value = elapsed;
    mat.uniforms.uPulse.value = pulse;

    // The whole bubble swells and settles with the breath.
    const s = 1 + breath * 0.055;
    child.scale.set(s, 0.88 * s, s);
  }
}
