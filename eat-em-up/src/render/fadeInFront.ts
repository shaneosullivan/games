import * as THREE from "three";

export interface NearFade {
  material: THREE.Material;
  /**
   * Where the eye is and what it is watching, both in world space, and how
   * much room to clear around the watched thing.
   *
   * Only what stands inside the cone from the eye out to a disc of `radius`
   * about the focus dissolves. Call `setSolid` to leave the material alone.
   */
  setFocus(eye: THREE.Vector3, focus: THREE.Vector3, radius: number): void;
  /** Nothing is in front of anything: leave the material solid. */
  setSolid(): void;
}

/**
 * Make a material dissolve anything that comes between the camera and the
 * caterpillar.
 *
 * The wood is thick enough that a trunk regularly stands in the shot, and a
 * player who cannot see the thing they are steering is simply stuck. Taken
 * from the bee game's Windy Woods, which does the same to its hedges.
 *
 * The test is the fragment's own view depth against the caterpillar's, handed
 * in as `fadeUpTo`. Distance from the eye alone can't do it: a trunk blocking
 * the view and the trunk right beside the caterpillar are both a few units
 * off, so a range wide enough to clear the first washes the whole wood out,
 * and one narrow enough to spare the second leaves the player hidden.
 *
 * Anything under the cutoff is discarded rather than drawn faint, because a
 * transparent fragment still writes depth and would go on hiding the
 * caterpillar behind a trunk you can see straight through.
 *
 * @param band  the depth over which a fragment fades from solid to gone
 * @param cutoff below this alpha the fragment is dropped entirely
 * @param cacheKey a name unique to this (band, cutoff, spareFloor) combination —
 *   without one three would hand every faded material the same compiled program
 * @param spareFloor leave up-facing surfaces solid, so a fading mesh that also
 *   contains ground never has a hole punched in it. Unused here: the forest
 *   floor is its own mesh and never fades.
 */
export function fadeInFront(
  material: THREE.Material,
  {
    band,
    cutoff,
    cacheKey,
    spareFloor = false,
  }: {band: number; cutoff: number; cacheKey: string; spareFloor?: boolean},
): NearFade {
  material.transparent = true;
  // World space rather than view space, so a caller needs nothing but two
  // points it already has — where the camera is and what it is watching. The
  // old view-space form made every call site fetch the camera's inverse world
  // matrix and refresh it by hand, because the renderer does not update it
  // until it draws and a fade one frame behind the camera flickers.
  const eye = {value: new THREE.Vector3()};
  const focus = {value: new THREE.Vector3()};
  const spread = {value: 3};
  // Solid until told otherwise.
  const live = {value: 0};
  material.onBeforeCompile = shader => {
    shader.uniforms.fadeEye = eye;
    shader.uniforms.fadeFocus = focus;
    shader.uniforms.fadeRadius = spread;
    shader.uniforms.fadeOn = live;
    shader.uniforms.fadeBand = {value: band};
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vWorldPos;\nvarying float vUpFacing;",
      )
      .replace(
        "#include <fog_vertex>",
        `#include <fog_vertex>
         // Through the instance matrix where there is one. An instanced mesh
         // keeps its per-copy transform there and not in modelMatrix, so
         // without this every copy reports the world position of the original
         // — which for a wood of instanced hedges means one position for the
         // lot of them, and a fade that never fires.
         vec4 fadeLocal = vec4(transformed, 1.0);
         #ifdef USE_INSTANCING
           fadeLocal = instanceMatrix * fadeLocal;
         #endif
         vWorldPos = (modelMatrix * fadeLocal).xyz;
         vUpFacing = normalize(mat3(modelMatrix) * normal).y;`,
      );
    // The floor spared: an up-facing fragment holds at full solid.
    const spare = spareFloor
      ? "if (vUpFacing > 0.5) { nearFade = 1.0; }\n         "
      : "";
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vWorldPos;\nvarying float vUpFacing;\nuniform vec3 fadeEye;\nuniform vec3 fadeFocus;\nuniform float fadeRadius;\nuniform float fadeOn;\nuniform float fadeBand;",
      )
      .replace(
        "#include <dithering_fragment>",
        `vec3 fadeAxis = fadeFocus - fadeEye;
         float fadeLen = max(length(fadeAxis), 0.0001);
         vec3 fadeRel = vWorldPos - fadeEye;

         // Nearer the eye than the thing being watched.
         float nearFade = smoothstep(fadeLen - fadeBand, fadeLen, length(fadeRel));

         // And actually in the way.
         //
         // Depth alone is not enough: "nearer than the caterpillar" is true of
         // half the wood, and dissolving a trunk at the edge of the shot that
         // hides nothing is both distracting and a lie about where things are.
         // What matters is whether the fragment falls inside the cone from the
         // eye out to a disc of fadeRadius about the head — project it onto
         // the line of sight and allow a radius that grows with how far along
         // that line it lies, so at the head itself the allowance is the full
         // radius and half way there it is half as much.
         float along = dot(fadeRel, fadeAxis) / (fadeLen * fadeLen);
         float offAxis = length(fadeRel - fadeAxis * along);
         float allowed = fadeRadius * max(along, 0.0);
         // Solid again once clear of the cone, with a soft rim so a trunk does
         // not snap back as you steer past it.
         nearFade = max(nearFade, smoothstep(allowed * 0.72, allowed * 1.08, offAxis));
         nearFade = mix(1.0, nearFade, fadeOn);

         ${spare}if (nearFade < ${cutoff.toFixed(4)}) discard;
         gl_FragColor.a *= nearFade;
         #include <dithering_fragment>`,
      );
  };
  material.customProgramCacheKey = () => cacheKey;
  return {
    material,
    setFocus(at, watching, radius) {
      eye.value.copy(at);
      focus.value.copy(watching);
      spread.value = radius;
      live.value = 1;
    },
    setSolid() {
      live.value = 0;
    },
  };
}
