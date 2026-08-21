/**
 * No import of three.
 *
 * This file sits above both games, and each of them has its own copy of three
 * in its own node_modules. Importing it here would resolve to a *third* copy at
 * the repo root and bundle two of them into one game — where nothing is quite
 * the same class as anything else. So the few shapes it needs are described
 * structurally instead, and a real THREE.Vector3 and THREE.Material satisfy
 * them without knowing about this file at all.
 */

/** Anything with x, y and z: THREE.Vector3 satisfies this. */
export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/** The parts of a three shader this rewrites. */
interface ShaderLike {
  uniforms: Record<string, {value: unknown}>;
  vertexShader: string;
  fragmentShader: string;
}

/**
 * The parts of a material this needs. Any THREE.Material satisfies it.
 *
 * `onBeforeCompile` is typed loosely on purpose. Three declares it as a
 * property taking its own huge parameters object, and a property is checked
 * against the function assigned to it in both directions — so naming a smaller
 * shape here makes the assignment illegal however compatible it really is.
 * The callback below narrows it back to ShaderLike immediately.
 */
export interface FadeableMaterial {
  transparent: boolean;
  onBeforeCompile: (shader: any, ...rest: Array<any>) => void;
  customProgramCacheKey: () => string;
}

export interface NearFade<M extends FadeableMaterial = FadeableMaterial> {
  material: M;
  /**
   * Where the eye is and what it is watching, both in world space, and how
   * much room to clear around the watched thing.
   *
   * Only what stands inside the cone from the eye out to a disc of `radius`
   * about the focus dissolves. Call `setSolid` to leave the material alone.
   */
  setFocus(eye: Vec3Like, focus: Vec3Like, radius: number): void;
  /** Nothing is in front of anything: leave the material solid. */
  setSolid(): void;
}

/**
 * Make a material dissolve whatever comes between the camera and the player.
 *
 * Both games are thick with things that stand in the shot — the bee's hedges
 * and the walls of her cottage, the caterpillar's trunks — and a player who
 * cannot see the thing they are steering is simply stuck. Shared rather than
 * copied because it is one piece of shading with several fiddly parts (the
 * cone, the instance matrix, the discard), and two copies of that drift the
 * moment one of them is fixed.
 *
 * Two tests, both needed. A fragment dissolves only if it is nearer the eye
 * than the subject *and* inside the cone from the eye out to a disc about
 * them — that is, actually in the way. Distance alone cannot do it: a wall
 * blocking the view and the wall right beside the player are both a few units
 * off, so a range wide enough to clear the first washes the whole level out.
 * And depth alone dissolves everything nearer than the player wherever it sits
 * on the screen, which empties half the shot to clear one wall.
 *
 * Anything under the cutoff is discarded rather than drawn faint, because a
 * transparent fragment still writes depth and would go on hiding the player
 * behind a wall you can see straight through.
 *
 * @param band  the depth over which a fragment fades from solid to gone
 * @param cutoff below this alpha the fragment is dropped entirely
 * @param cacheKey a name unique to this (band, cutoff, spareFloor) combination —
 *   without one three would hand every faded material the same compiled program
 * @param spareFloor leave up-facing surfaces solid, so a fading mesh that also
 *   contains ground never has a hole punched in it. The bee's cottage needs it:
 *   its model has the yard in the same mesh as the walls.
 */ export function fadeInFront<M extends FadeableMaterial>(
  material: M,
  {
    band,
    cutoff,
    cacheKey,
    spareFloor = false,
  }: {band: number; cutoff: number; cacheKey: string; spareFloor?: boolean},
): NearFade<M> {
  material.transparent = true;
  // World space, so a caller needs nothing but two points it already has —
  // where the camera is and what it is watching.
  const eye = {value: {x: 0, y: 0, z: 0}};
  const focus = {value: {x: 0, y: 0, z: 0}};
  const spread = {value: 3};
  // Solid until told otherwise.
  const live = {value: 0};
  material.onBeforeCompile = (raw: ShaderLike) => {
    const shader = raw;
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
         // Depth alone is not enough: "nearer than the player" is true of
         // half the level, and dissolving a wall at the edge of the shot that
         // hides nothing is both distracting and a lie about where things are.
         // What matters is whether the fragment falls inside the cone from the
         // eye out to a disc of fadeRadius about the player — project it onto
         // the line of sight and allow a radius that grows with how far along
         // that line it lies, so at the player the allowance is the full
         // radius and half way there it is half as much.
         float along = dot(fadeRel, fadeAxis) / (fadeLen * fadeLen);
         float offAxis = length(fadeRel - fadeAxis * along);
         float allowed = fadeRadius * max(along, 0.0);
         // Solid again once clear of the cone, with a soft rim so a wall does
         // not snap back as you move past it.
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
      eye.value.x = at.x;
      eye.value.y = at.y;
      eye.value.z = at.z;
      focus.value.x = watching.x;
      focus.value.y = watching.y;
      focus.value.z = watching.z;
      spread.value = radius;
      live.value = 1;
    },
    setSolid() {
      live.value = 0;
    },
  };
}
