import * as THREE from 'three';

const VERT = /* glsl */ `
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
 * rather than a coloured ball, and it keeps whatever is inside clearly visible
 * through the middle.
 */
const FRAG = /* glsl */ `
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

export interface GlowBubble {
  mesh: THREE.Mesh;
  /** Drive the hue cycle and breathing. */
  update(elapsed: number): void;
}

export interface GlowOptions {
  radius: number;
  /** Vertical squash, 1 for a sphere. */
  squashY?: number;
  /** Hue cycle speed; 0 pins it to `hue`. */
  hueRate?: number;
  hue?: number;
  saturation?: number;
  lightness?: number;
  /** Breaths per second-ish. */
  breathRate?: number;
}

const colour = new THREE.Color();

/**
 * A friendly, mostly-transparent force field. Shared by the finished hive and
 * by the honey jar in the cottage, so they read as the same kind of magic.
 */
export function createGlowBubble(opts: GlowOptions): GlowBubble {
  const {
    radius,
    squashY = 1,
    hueRate = 0.07,
    hue = 0.12,
    saturation = 0.62,
    lightness = 0.72,
    breathRate = 1.15,
  } = opts;

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0xffffff) },
      uTime: { value: 0 },
      uPulse: { value: 1 },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 3), material);
  mesh.scale.y = squashY;

  return {
    mesh,
    update(elapsed) {
      // Two offset sines: a slow breath with a faint shimmer riding on it.
      const breath = 0.5 + 0.5 * Math.sin(elapsed * breathRate);
      const shimmer = 0.5 + 0.5 * Math.sin(elapsed * 3.7);
      colour.setHSL((hue + elapsed * hueRate) % 1, saturation, lightness);

      material.uniforms.uColor.value.copy(colour);
      material.uniforms.uTime.value = elapsed;
      material.uniforms.uPulse.value = 0.75 + breath * 0.5 + shimmer * 0.08;

      const s = 1 + breath * 0.055;
      mesh.scale.set(s, squashY * s, s);
    },
  };
}
