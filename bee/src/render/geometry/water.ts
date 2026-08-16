import * as THREE from "three";
import {WATER} from "../../config";
import {toonRamp} from "../materials";

export interface Water {
  mesh: THREE.Mesh;
  /** Move the swell along. One number a frame, and nothing else. */
  update(dt: number): void;
  dispose(): void;
}

/**
 * A sea that ripples, for about the cost of a still one.
 *
 * The waves are summed sines evaluated in the *vertex shader*, so the whole
 * animation costs one uniform write a frame on the CPU and nothing else — no
 * position array to walk, no buffer to re-upload. Vertices are the cheap thing
 * on a GPU; frames are the expensive thing on an iPad, and the obvious
 * implementation of this (writing the positions from JavaScript every frame)
 * spends the expensive one to save the cheap one.
 *
 * Two details are what make it look like water rather than a wobbling sheet:
 *
 *   - the normal is worked out from the same sines, analytically, so the toon
 *     ramp bands across the swell and the light moves with it. Displacing
 *     positions and leaving the normals pointing straight up gives a surface
 *     that heaves and stays flatly lit, which reads as a bug;
 *   - it is a patched `MeshToonMaterial` rather than a shader of its own, so
 *     it takes the scene's lights and fog like everything else. A hand-written
 *     shader here would sit in the fogged distance at full brightness, and the
 *     horizon would end in a hard line.
 */
export function createWater(): Water {
  const geometry = new THREE.PlaneGeometry(
    WATER.size,
    WATER.size,
    WATER.segments,
    WATER.segments,
  );
  // Built lying down, so the shader's "up" is the mesh's own +y and the wave
  // maths needs no basis change.
  geometry.rotateX(-Math.PI / 2);

  const uniforms = {uTime: {value: 0}};
  const material = new THREE.MeshToonMaterial({
    color: WATER.colour,
    gradientMap: toonRamp(),
  });

  material.onBeforeCompile = shader => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
         uniform float uTime;

         // Three crossing swells. Different directions and speeds, and
         // wavelengths that share no common multiple, so the surface never
         // visibly repeats — which is the thing that gives cheap water away.
         const vec4 WAVE_A = vec4(${waveConst(WATER.waves[0])});
         const vec4 WAVE_B = vec4(${waveConst(WATER.waves[1])});
         const vec4 WAVE_C = vec4(${waveConst(WATER.waves[2])});

         // wave = (direction x, direction z, wavelength, amplitude)
         float waveAt(vec4 w, vec2 p, float t, float speed) {
           float k = 6.2831853 / w.z;
           return w.w * sin(dot(normalize(w.xy), p) * k + t * speed);
         }
         float heightAt(vec2 p, float t) {
           return waveAt(WAVE_A, p, t, ${f(WATER.speeds[0])})
                + waveAt(WAVE_B, p, t, ${f(WATER.speeds[1])})
                + waveAt(WAVE_C, p, t, ${f(WATER.speeds[2])});
         }
         // The slope of the same sum, which is the normal, for the price of
         // three cosines rather than another height sample.
         vec3 normalAt(vec2 p, float t) {
           vec2 slope = vec2(0.0);
           vec4 waves[3];
           waves[0] = WAVE_A; waves[1] = WAVE_B; waves[2] = WAVE_C;
           float speeds[3];
           speeds[0] = ${f(WATER.speeds[0])};
           speeds[1] = ${f(WATER.speeds[1])};
           speeds[2] = ${f(WATER.speeds[2])};
           for (int i = 0; i < 3; i++) {
             vec4 w = waves[i];
             vec2 dir = normalize(w.xy);
             float k = 6.2831853 / w.z;
             float c = w.w * k * cos(dot(dir, p) * k + t * speeds[i]);
             slope += dir * c;
           }
           return normalize(vec3(-slope.x, 1.0, -slope.y));
         }`,
      )
      // Normals come first in three's vertex shader, and are worked out from
      // the same place the height is, so the two can never disagree.
      .replace(
        "#include <beginnormal_vertex>",
        `vec2 wavePoint = (modelMatrix * vec4(position, 1.0)).xz;
         vec3 objectNormal = normalAt(wavePoint, uTime);
         #ifdef USE_TANGENT
           vec3 objectTangent = vec3(tangent.xyz);
         #endif`,
      )
      .replace(
        "#include <begin_vertex>",
        `vec3 transformed = vec3(position);
         float waveHeight = heightAt(wavePoint, uTime);
         transformed.y += waveHeight;
         vWave = waveHeight;`,
      )
      .replace("#include <common>", "#include <common>\nvarying float vWave;");

    /*
     * Colour the crests as well as shading them.
     *
     * Shape alone is nearly invisible here: the swell is a third of a unit
     * over a wavelength of thirty, and a slope that gentle barely crosses a
     * band of the toon ramp, so from the low camera this level is played at
     * the sea looked painted. Tinting by height is two lines and no measurable
     * cost, and it is what actually reads as moving water.
     */
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vWave;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
         diffuseColor.rgb = mix(
           vec3(${rgb(WATER.trough)}),
           vec3(${rgb(WATER.crest)}),
           clamp(vWave * ${f(WATER.crestContrast)} + 0.5, 0.0, 1.0)
         );`,
      );
  };
  // Without this three hands the patched program to every other toon material
  // in the scene, and the islands start rippling too.
  material.customProgramCacheKey = () => "island-water";

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = WATER.level;
  // It is under everything and lit from above; nothing it could shadow is
  // below it, and it never needs to receive one either.
  mesh.receiveShadow = false;
  mesh.castShadow = false;
  // Drawn first, so the fogged horizon sits behind the islands rather than
  // fighting them for the same depth.
  mesh.renderOrder = -1;

  return {
    mesh,
    update(dt) {
      uniforms.uTime.value += dt;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

/** A wave as its four numbers, for baking straight into the shader source. */
function waveConst(wave: {
  readonly direction: readonly [number, number];
  readonly length: number;
  readonly height: number;
}): string {
  return [wave.direction[0], wave.direction[1], wave.length, wave.height]
    .map(f)
    .join(", ");
}

/** A colour as GLSL's own 0..1 triple, in the renderer's linear space. */
function rgb(hex: number): string {
  const colour = new THREE.Color(hex).convertSRGBToLinear();
  return [colour.r, colour.g, colour.b].map(c => c.toFixed(4)).join(", ");
}

/** GLSL will not take an integer where it wants a float. */
function f(value: number): string {
  return Number.isInteger(value) ? `${value}.0` : String(value);
}
