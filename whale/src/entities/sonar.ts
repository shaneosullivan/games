import * as THREE from "three";
import {SONAR} from "../config";
import {sonarOrigin, sonarRings} from "../render/sonar";

/**
 * The clicks themselves: the pulses going out, and the rings you can see them
 * by.
 *
 * This owns the numbers the shader reads — where the whale's head is and how
 * far each live pulse has travelled — and it draws a pair of crossed rings for
 * each one so the pulse is visible in the water on its way out, rather than
 * only being inferred from what it lights up.
 *
 * Two rings per pulse, turned with the camera and each set forty-five degrees
 * off it.
 *
 * Neither of the obvious constructions works. A sphere expanding from your own
 * head swallows the camera in a few frames and washes the screen. Two rings
 * crossed at right angles in *world* space seem to fix that and do not: a
 * chase camera sits directly behind the whale, which is exactly the angle at
 * which one of the pair is edge-on — and a torus seen edge-on is a bar
 * straight up the middle of the screen, at every radius. That is not a moment
 * to be hidden, it is the whole time.
 *
 * Turning the pair with the camera fixes the angle for good, and holding them
 * at forty-five degrees either side of square-on keeps them a pair: each is
 * foreshortened to an ellipse, neither can ever be edge-on, and between them
 * they read as a wavefront with some depth to it rather than as a flat disc
 * painted on the screen.
 */
export class Sonar {
  readonly group = new THREE.Group();

  /** Radius of each live pulse, or -1 for an empty slot. */
  private readonly radius: Array<number> = [];
  private readonly from: Array<THREE.Vector3> = [];
  private readonly rings: Array<THREE.Group> = [];
  private readonly material: THREE.MeshBasicMaterial;
  private next = 0;

  constructor() {
    this.material = new THREE.MeshBasicMaterial({
      color: 0xbfeaff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      // Off: a pulse is not a thing in the water, it is the water. Letting the
      // fog eat it would have it vanish exactly when it got interesting.
      fog: false,
    });

    for (let i = 0; i < SONAR.rings; i++) {
      const pulse = new THREE.Group();
      // Built at radius 1 and scaled, so one geometry serves every size. The
      // two are turned a quarter-turn apart about the camera's own up axis and
      // sit at forty-five degrees to the view, which is the angle at which a
      // ring is unmistakably a ring and never a line.
      for (const turn of [Math.PI / 4, -Math.PI / 4]) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(1, 0.019, 4, 54),
          this.material.clone(),
        );
        ring.rotation.y = turn;
        pulse.add(ring);
      }
      pulse.visible = false;
      this.rings.push(pulse);
      this.group.add(pulse);

      this.radius.push(-1);
      this.from.push(new THREE.Vector3());
    }
  }

  /** A click, from the whale's melon. */
  click(at: THREE.Vector3): void {
    // Round-robin, so a new click always gets a slot: the oldest pulse is the
    // one furthest out and the one nobody will miss.
    const slot = this.next;
    this.next = (this.next + 1) % SONAR.rings;
    this.radius[slot] = 0;
    this.from[slot].copy(at);
    sonarOrigin.value.copy(at);
  }

  /**
   * Grow the live pulses and hand them to the shader.
   *
   * All pulses share one origin — the head as it was when the *latest* click
   * went out. That is a simplification and it shows only if you turn hard
   * while three pulses are in the air, when the older two shift with you. It
   * buys one uniform instead of three and a loop over positions in every
   * fragment of every surface in the game, which is not a trade worth
   * refusing for a whale that moves at thirty units a second.
   */
  update(dt: number, dark: number, camera: THREE.Camera): void {
    const out = sonarRings.value;

    for (let i = 0; i < SONAR.rings; i++) {
      if (this.radius[i] < 0) {
        out[i] = -1;
        this.rings[i].visible = false;
        continue;
      }
      this.radius[i] += SONAR.speed * dt;
      if (this.radius[i] > SONAR.reach) {
        this.radius[i] = -1;
        out[i] = -1;
        this.rings[i].visible = false;
        continue;
      }
      out[i] = this.radius[i];

      const pulse = this.rings[i];
      const near = 1 - this.radius[i] / SONAR.ringReach;
      pulse.visible = SONAR.showRings && dark > 0.05 && near > 0;
      if (!pulse.visible) {
        continue;
      }
      pulse.position.copy(this.from[i]);
      pulse.scale.setScalar(this.radius[i]);
      // The pair turns with the camera; their own forty-five degrees is baked
      // into each child, so neither ever comes edge-on however the whale moves.
      pulse.quaternion.copy(camera.quaternion);
      // Fading as it goes, and faster at the end, so it thins out rather than
      // switching off.
      const fade = Math.pow(Math.max(0, near), SONAR.ringFade) * dark;
      for (const ring of pulse.children) {
        const mat = (ring as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mat.opacity = fade * 0.95;
      }
    }
  }
}
