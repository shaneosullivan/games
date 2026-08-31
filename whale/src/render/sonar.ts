import * as THREE from "three";
import {SONAR} from "../config";

/**
 * Beluga vision, as a patch applied to every material in the scene.
 *
 * The idea is simple and the placement is the whole trick. Each material's
 * fragment shader gets a few lines added that ask "how far is this fragment
 * from the whale's head, and is a pulse passing through that distance right
 * now?" If one is, the fragment shows in grey; if not, and we are in the dark,
 * it shows as nothing at all. Because the test is on *distance from the
 * whale*, the grey sweeps outward across every surface as the pulse expands —
 * which is the effect, and it comes out of the geometry for free rather than
 * having to be animated.
 *
 * Three things make this work where a post-process would not:
 *
 * - It is inserted **before** the fog, so a revealed surface still fades with
 *   distance. That is not a compromise: a sonar return really does weaken with
 *   range, and it is what stops the far wall of the abyss lighting up as
 *   brightly as the squid in front of your nose.
 * - The darkening happens **here** rather than by turning the lights off. The
 *   shader needs the lit colour to make its grey out of, so it takes the lit
 *   colour, converts it, and then decides how much of it to show. Dimming the
 *   scene first would leave it nothing to reveal.
 * - The uniforms are shared objects, one set for every material in the game,
 *   so a ping is written once a frame and every surface sees it.
 *
 * Everything gets patched, including things that live above the water. It
 * costs them nothing: with `dark` at zero the added lines resolve to the
 * colour that was already there.
 */

/** Where the clicks come from — the whale's melon. */
export const sonarOrigin = {value: new THREE.Vector3()};

/** The radius of each live pulse. A negative radius is a slot with nothing in
 *  it, which the shader skips. */
export const sonarRings = {
  value: new Float32Array(SONAR.rings).fill(-1),
};

/** 0 in daylight, 1 in the dark of the abyss. */
export const sonarDark = {value: 0};

const sonarWidth = {value: SONAR.width};

const VERTEX_HEAD = /* glsl */ `
varying vec3 vSonarWorld;
`;

// Before project_vertex, where `transformed` is the local position and has not
// yet been folded into the model-view matrix. Instanced meshes carry their own
// matrix and the reef is nearly all instanced, so it has to be applied here or
// every coral in the game reports the position of the one prototype they were
// all stamped from.
const VERTEX_BODY = /* glsl */ `
#ifdef USE_INSTANCING
  vSonarWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
#else
  vSonarWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
#endif
`;

const FRAGMENT_HEAD = /* glsl */ `
varying vec3 vSonarWorld;
uniform vec3 uSonarOrigin;
uniform float uSonarRings[${SONAR.rings}];
uniform float uSonarDark;
uniform float uSonarWidth;
uniform float uSonarSelf;
`;

const FRAGMENT_BODY = /* glsl */ `
if (uSonarDark > 0.001) {
  float sonarD = distance(vSonarWorld, uSonarOrigin);
  float sonarHit = 0.0;
  for (int i = 0; i < ${SONAR.rings}; i++) {
    float r = uSonarRings[i];
    if (r >= 0.0) {
      // A soft band centred on the pulse, squared so it has a bright core and
      // a long tail rather than an edge.
      float band = 1.0 - clamp(abs(sonarD - r) / uSonarWidth, 0.0, 1.0);
      sonarHit = max(sonarHit, band * band);
    }
  }
  // The surface's own brightness, turned to grey and pushed cold. A return
  // says how hard a thing is, not what colour it is.
  float sonarLum = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
  vec3 sonarGrey =
    mix(vec3(0.06, 0.09, 0.12), vec3(0.78, 0.88, 1.0), sonarLum) * sonarHit;
  // The whale keeps a dim grey of its own between pulses. A child steering
  // something they cannot see is not navigating in the dark, they are lost —
  // and a real beluga knows perfectly well where its own body is.
  vec3 sonarSelf =
    vec3(0.17, 0.20, 0.25) * (0.4 + 0.6 * sonarLum) * uSonarSelf;
  gl_FragColor.rgb =
    mix(gl_FragColor.rgb, max(sonarGrey, sonarSelf), uSonarDark);
}
`;

/**
 * Patches one material. Safe to call twice — the second call is ignored, which
 * matters because several meshes share a material here.
 */
function patch(material: THREE.Material): void {
  const tagged = material as THREE.Material & {
    sonarPatched?: boolean;
    sonarSelfLit?: boolean;
  };
  if (tagged.sonarPatched) {
    return;
  }
  tagged.sonarPatched = true;
  // Per material, not shared: only the whale is lit this way.
  const self = {value: tagged.sonarSelfLit ? 1 : 0};

  const before = material.onBeforeCompile.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    before(shader, renderer);

    shader.uniforms.uSonarOrigin = sonarOrigin;
    shader.uniforms.uSonarRings = sonarRings;
    shader.uniforms.uSonarDark = sonarDark;
    shader.uniforms.uSonarWidth = sonarWidth;
    shader.uniforms.uSonarSelf = self;

    shader.vertexShader = VERTEX_HEAD + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <project_vertex>",
      VERTEX_BODY + "#include <project_vertex>",
    );

    shader.fragmentShader = FRAGMENT_HEAD + shader.fragmentShader;
    // Before the fog, so a revealed surface still fades with range.
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <fog_fragment>",
      FRAGMENT_BODY + "#include <fog_fragment>",
    );
  };
  // Materials already compiled need telling.
  material.needsUpdate = true;
}

/**
 * Marks everything under an object as lit by its own dim grey in the dark.
 *
 * Call before `sonarise`, which is where the flag is read.
 */
export function selfLit(root: THREE.Object3D): void {
  root.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (!mesh.material) {
      return;
    }
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of list) {
      (material as THREE.Material & {sonarSelfLit?: boolean}).sonarSelfLit =
        true;
    }
  });
}

/** Patches every material under an object. Call once, after the scene is
 *  built — nothing here makes new materials afterwards. */
export function sonarise(root: THREE.Object3D): number {
  let count = 0;
  root.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (!mesh.material) {
      return;
    }
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of list) {
      patch(material);
      count++;
    }
  });
  return count;
}
