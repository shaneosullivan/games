import * as THREE from "three";

/**
 * The road fades with how far away it is *to drive*, not how far away it is.
 *
 * Straight-line distance is the wrong measure for a circuit. The far side of
 * a hairpin is a few car lengths away across the grass and half a minute away
 * to drive, and a track drawn with a finger can lay one road on top of
 * another that is a whole lap apart. Measured along the road, those are
 * exactly as far away as they feel, and the thing a child is about to drive
 * on is always the thing that is solid.
 *
 * It also has to be a *fade*. The road used to be taken away a piece at a
 * time, and a piece is a few hundred units of road appearing and disappearing
 * in one frame, which is visible from anywhere on the circuit. This is per
 * vertex and continuous: nothing ever pops, because nothing is ever switched.
 *
 * Done with a dither and a discard rather than with transparency. Every flat
 * thing on this road — tarmac, kerb, lines, skid marks — is stacked by draw
 * order and does not write depth, so making them genuinely transparent would
 * mean sorting them against each other and the sort would be wrong somewhere.
 * A discard leaves all of that alone.
 */
const carAt = {value: 0};
const lapIs = {value: 1};
const solidTo = {value: 1e9};
const goneBy = {value: 1e9};

/** Where the car is along the lap, and the lap's length, both in units. */
export function lapFocus(at: number, length: number): void {
  carAt.value = at;
  lapIs.value = length;
}

/** How far along the road a thing may be before it starts to fade, and
 *  before it has gone altogether. */
export function lapRange(solid: number, gone: number): void {
  solidTo.value = solid;
  goneBy.value = gone;
}

/** How solid something this far along the road from the car is, 0..1. The
 *  same arithmetic as the shader, for measuring what the shader is doing. */
export function lapSolidity(away: number): number {
  const t = Math.max(
    0,
    Math.min(1, (away - solidTo.value) / (goneBy.value - solidTo.value)),
  );
  return 1 - t * t * (3 - 2 * t);
}

/** How far it is to drive between two points on the lap, either way round. */
export function drivingGap(a: number, b: number, length: number): number {
  const d = Math.abs(a - b) % length;
  return Math.min(d, length - d);
}

/**
 * Makes a material fade with driving distance, reading a `lapAt` attribute
 * giving each vertex's distance along the lap.
 *
 * Chains onto whatever the material already does — the walls dissolve when
 * they stand between the camera and the car as well, and that is a different
 * shader on the same material.
 */
export function lapFading<T extends THREE.Material>(
  material: T,
  cacheKey: string,
): T {
  // Once per material, whatever happens.
  //
  // The flat materials are cached and shared — see `material` — so handing
  // the same one to this twice wrapped the wrapper, and every road piece
  // added another copy of this code to the shader. Forty copies of the same
  // declaration is forty redefinition errors, the program does not compile,
  // and the whole road renders as nothing at all. Callers should be giving
  // this a material of its own; this is so that a caller that forgets gets
  // one fade rather than a blank screen.
  const tagged = material as T & {lapFaded?: boolean};
  if (tagged.lapFaded) {
    return material;
  }
  tagged.lapFaded = true;
  const already = material.onBeforeCompile.bind(material);
  const keyed = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    already(shader, renderer);
    shader.uniforms.carAt = carAt;
    shader.uniforms.lapIs = lapIs;
    shader.uniforms.solidTo = solidTo;
    shader.uniforms.goneBy = goneBy;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
         attribute float lapAt;
         varying float vLapAt;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         vLapAt = lapAt;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
         uniform float carAt;
         uniform float lapIs;
         uniform float solidTo;
         uniform float goneBy;
         varying float vLapAt;
         // A lap is a loop, so the long way round is not how far it is.
         float drivingGap(float a, float b, float len) {
           float d = abs(a - b);
           return min(d, len - d);
         }
         // Ordered dither, so a half-faded road is a half-filled screen door
         // rather than a hard edge. Four by four is coarse enough to be
         // cheap and fine enough not to read as a pattern at this distance.
         float bayer(vec2 at) {
           int x = int(mod(at.x, 4.0));
           int y = int(mod(at.y, 4.0));
           int i = x + y * 4;
           float m[16];
           m[0]=0.0;  m[1]=8.0;  m[2]=2.0;  m[3]=10.0;
           m[4]=12.0; m[5]=4.0;  m[6]=14.0; m[7]=6.0;
           m[8]=3.0;  m[9]=11.0; m[10]=1.0; m[11]=9.0;
           m[12]=15.0;m[13]=7.0; m[14]=13.0;m[15]=5.0;
           for (int k = 0; k < 16; k++) {
             if (k == i) { return (m[k] + 0.5) / 16.0; }
           }
           return 0.5;
         }`,
      )
      .replace(
        "#include <clipping_planes_fragment>",
        `#include <clipping_planes_fragment>
         float lapAway = drivingGap(vLapAt, carAt, lapIs);
         float lapSolid = 1.0 - smoothstep(solidTo, goneBy, lapAway);
         if (lapSolid < bayer(gl_FragCoord.xy)) { discard; }`,
      );
  };
  material.customProgramCacheKey = () => `${keyed()}|lapFade|${cacheKey}`;
  return material;
}
