import * as THREE from "three";
import {GLOW} from "../config";
import {settings} from "../core/quality";

/**
 * Something that gives off light: a street lamp, a neon sign, a lit window.
 *
 * `power` is read every time the pool looks, so a sign that flickers dims the
 * light it is casting without owning one.
 */
export interface Emitter {
  x: number;
  y: number;
  z: number;
  colour: number;
  power: number;
  reach: number;
}

/**
 * A handful of real lights, moved to whatever is nearest the car.
 *
 * The neon city has a couple of hundred things giving off light and WebGL
 * wants nothing to do with a couple of hundred lights — every one of them is
 * another loop in every fragment shader in the scene. But a light only matters
 * where it lands, and everything past the nearest few lands off the screen or
 * behind a building.
 *
 * So all of it is drawn as emissive geometry, which the bloom pass turns into
 * a glow for nothing, and this moves eight actual lights to the eight nearest
 * emitters. What lights the road is always the lamp you are under, which is
 * the only one whose light you could pick out anyway.
 */
export class Glow {
  readonly group = new THREE.Group();

  private readonly lights: Array<THREE.PointLight> = [];
  private readonly emitters: Array<Emitter> = [];
  /** Reused: the nearest few, and how far away each is. */
  private readonly best: Array<{at: Emitter; d: number}> = [];
  private due = 0;

  constructor() {
    for (let i = 0; i < GLOW.lights; i++) {
      // Decay two, which is how light really falls off, and the distance is
      // what stops each one being considered by every fragment in the scene.
      const light = new THREE.PointLight(0xffffff, 0, 100, 2);
      light.visible = false;
      this.lights.push(light);
      this.group.add(light);
    }
  }

  add(emitter: Emitter): Emitter {
    this.emitters.push(emitter);
    return emitter;
  }

  get count(): number {
    return this.emitters.length;
  }

  /**
   * Points the pool at whatever is nearest.
   *
   * A partial selection rather than a sort: the list is walked once and each
   * emitter is dropped into the best-of list only if it beats the worst of
   * them. With eight lights that is eight comparisons in the worst case and
   * usually none at all.
   */
  update(dt: number, x: number, z: number): void {
    if (this.emitters.length === 0) {
      return;
    }
    this.due -= dt;
    if (this.due > 0) {
      return;
    }
    this.due = GLOW.every;

    this.best.length = 0;
    for (const at of this.emitters) {
      if (at.power <= 0) {
        continue;
      }
      const d = (at.x - x) ** 2 + (at.z - z) ** 2;
      // Nothing beyond its own reach can matter, whatever else is going on.
      if (d > at.reach * at.reach) {
        continue;
      }
      if (this.best.length < GLOW.lights) {
        this.best.push({at, d});
        this.best.sort((a, b) => a.d - b.d);
      } else if (d < this.best[GLOW.lights - 1].d) {
        this.best[GLOW.lights - 1] = {at, d};
        this.best.sort((a, b) => a.d - b.d);
      }
    }

    // How many are allowed to be on at all. Every point light is another
    // iteration inside every fragment of every lit surface in the scene, so
    // this is one of the biggest things a slower machine can give up.
    const allowed = settings().lights;
    for (let i = 0; i < this.lights.length; i++) {
      const light = this.lights[i];
      const pick = i < allowed ? this.best[i] : undefined;
      if (!pick) {
        light.visible = false;
        continue;
      }
      light.visible = true;
      light.position.set(pick.at.x, pick.at.y, pick.at.z);
      light.color.set(pick.at.colour);
      light.intensity = pick.at.power;
      light.distance = pick.at.reach;
    }
  }
}
