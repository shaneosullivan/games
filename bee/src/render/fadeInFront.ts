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
 * Make a material dissolve anything that comes between the camera and the bee.
 *
 * The Windy Woods uses it on the hedges, so the shot can sit where the follow
 * rig wants it and the trunk in front of it simply isn't there; Caramel Cottage
 * uses it on the house, so a camera pushed through a wall — the bee up against
 * it, facing away — sees into the room rather than into gingerbread.
 *
 * The test is the fragment's own view depth against hers, handed in as
 * `fadeUpTo`. Distance from the eye alone can't do it: a wall blocking the view
 * and the wall right beside her are both a few units off, so a range wide enough
 * to clear the first washes the whole thing out and one narrow enough to spare
 * the second leaves her hidden.
 *
 * Anything under the cutoff is discarded rather than drawn faint, because a
 * transparent fragment still writes depth and would hide the bee behind a wall
 * you can see straight through.
 *
 * @param band  the depth over which a fragment fades from solid to gone
 * @param cutoff below this alpha the fragment is dropped entirely
 * @param cacheKey a name unique to this (band, cutoff, spareFloor) combination —
 *   without one three would hand every faded material the same compiled program
 * @param spareFloor leave up-facing surfaces (the floor) solid. On a one-mesh
 *   room the floor runs from under the camera to under the bee, so its near half
 *   is "in front of" her and would dissolve — but it never hides her, so fading
 *   it just punches a hole in the floor. Walls, which stand across the view, are
 *   the only thing that should go. The Windy Woods leaves this off: its hedges
 *   are their own mesh and it has no floor in the fading material.
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
