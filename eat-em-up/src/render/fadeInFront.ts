import * as THREE from "three";

export interface NearFade {
  material: THREE.Material;
  /**
   * The view depth to fade up to: fragments nearer the camera than this dissolve
   * and are dropped. Pass the bee's own depth (less a margin) to clear whatever
   * stands between the camera and her; pass a large negative number to leave the
   * material solid (nothing is ever in front).
   */
  setDepth(d: number): void;
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
  // Solid until told otherwise: a depth behind the eye means nothing is in front.
  const live = {value: -1e9};
  material.onBeforeCompile = shader => {
    shader.uniforms.fadeUpTo = live;
    shader.uniforms.fadeBand = {value: band};
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying float vEyeDist;\nvarying float vUpFacing;",
      )
      .replace(
        "#include <fog_vertex>",
        `#include <fog_vertex>
         vEyeDist = -mvPosition.z;
         vUpFacing = normalize(mat3(modelMatrix) * normal).y;`,
      );
    // The floor spared: an up-facing fragment holds at full solid.
    const spare = spareFloor
      ? "if (vUpFacing > 0.5) { nearFade = 1.0; }\n         "
      : "";
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying float vEyeDist;\nvarying float vUpFacing;\nuniform float fadeUpTo;\nuniform float fadeBand;",
      )
      .replace(
        "#include <dithering_fragment>",
        `float nearFade = smoothstep(fadeUpTo - fadeBand, fadeUpTo, vEyeDist);
         ${spare}if (nearFade < ${cutoff.toFixed(4)}) discard;
         gl_FragColor.a *= nearFade;
         #include <dithering_fragment>`,
      );
  };
  material.customProgramCacheKey = () => cacheKey;
  return {
    material,
    setDepth(d) {
      live.value = d;
    },
  };
}
