import * as THREE from "three";
import {CROW} from "../config";
import {Rng} from "../core/rng";

/** What the crow did this frame, for the game to act on. */
export type CrowEvent = "none" | "began" | "left" | "caught";

/**
 * A crow's shadow, and the one thing in this wood that can go wrong for you.
 *
 * It comes over, circles, and closes in. You have CROW.warnFor seconds to get
 * into the long grass; reach it and the crow gives up and goes, and if you do
 * not it takes you and the game is over. Nothing else here can be lost, which
 * is exactly what makes this land — for two minutes the wood is entirely safe
 * and then, once, it isn't.
 *
 * Drawn flat on the ground rather than cast: a real shadow would want a light
 * with shadow maps for one dark shape. This is a dark patch laid on the floor,
 * unlit and see-through, which reads the same and costs a draw call.
 */
export class CrowShadow {
  readonly group = new THREE.Group();

  private readonly wings: Array<THREE.Object3D> = [];
  /** Seconds until it comes over. */
  private wait: number;
  /**
   * Set the moment it arrives, and never cleared.
   *
   * The crow comes once in a game and then the wood is safe again. It is the
   * one thing here that can go wrong for you, and a threat that keeps coming
   * back is a different game — you would stop wandering off from the meadow,
   * which is most of what there is to do.
   */
  private done = false;
  /** How far through a pass it is, or null between them. */
  private crossing: number | null = null;
  private readonly from = new THREE.Vector3();
  private readonly heading = new THREE.Vector3();
  private beat = 0;
  /**
   * The hunt: seconds left of it, or null when there is none on.
   *
   * Counted down rather than up so what the HUD needs to show — how long you
   * have — is the number itself.
   */
  private hunt: number | null = null;
  /** Where it is round the circle, and how long the dive has left. */
  private circle = 0;
  private dive = 0;

  constructor(private readonly rng: Rng) {
    // Two copies of the bird: a crisp core and a larger, fainter one under it.
    // A shadow cast from any height has a penumbra, and a single hard-edged
    // cutout is the thing that most says "decal" rather than "shadow" — the
    // two together give a soft edge for the price of one more draw call.
    const core = shadowMaterial(CROW.opacity);
    const soft = shadowMaterial(CROW.opacity * CROW.softness);

    const body = bodyShape();
    const bodyBlur = new THREE.Mesh(body, soft);
    bodyBlur.scale.setScalar(CROW.spread);
    this.group.add(bodyBlur, new THREE.Mesh(body, core));

    for (const side of [-1, 1]) {
      // Each wing is a little group of its own — core and penumbra — so the
      // beat is one scale of the pair rather than two things kept in step.
      const wing = new THREE.Group();
      const shape = wingShape(side);
      const blur = new THREE.Mesh(shape, soft);
      blur.scale.setScalar(CROW.spread);
      wing.add(blur, new THREE.Mesh(shape, core));
      this.group.add(wing);
      this.wings.push(wing);
    }

    this.group.visible = false;
    this.group.scale.setScalar(CROW.size);
    // The first one is at a fixed two minutes; see CROW.firstGap.
    this.wait = CROW.firstGap;
  }

  /** True while it is circling and the clock is running. */
  get hunting(): boolean {
    return this.hunt !== null;
  }

  /** Seconds left to reach the grass, for the HUD to show. */
  get secondsLeft(): number {
    return Math.max(0, Math.ceil(this.hunt ?? 0));
  }

  /**
   * Calls off a hunt without a catch — see the note about fits in Game.
   *
   * It does not get another go: it has had its arrival. Otherwise eating a
   * rainbow mushroom at the wrong moment would be a way of putting the crow
   * off until later, which is a strange thing to have to explain.
   */
  callOff(): void {
    if (this.hunt === null) {
      return;
    }
    this.hunt = null;
    this.dive = 0;
    this.group.visible = false;
  }

  /** True while a shadow is actually crossing. */
  get passing(): boolean {
    return this.crossing !== null;
  }

  /**
   * `near` is the caterpillar and `safe` whether it is somewhere the crow
   * cannot see it. Returns what happened, for the game to act on.
   *
   * Safety is judged at the end of the count and not before: diving the
   * instant you step out of the grass would punish a wobble, and standing in
   * the grass for nine seconds and stepping out on the tenth is a mistake a
   * child should be allowed to make and see.
   */
  update(dt: number, near: THREE.Vector3, safe: boolean): CrowEvent {
    if (this.dive > 0) {
      this.dive -= dt;
      // Down onto the caterpillar. The shadow shrinking is the crow coming
      // down to meet the ground it is drawn on.
      const t = 1 - Math.max(0, this.dive) / CROW.diveFor;
      this.group.position.lerp(near, Math.min(1, t * 0.4));
      this.group.position.y = CROW.height;
      this.group.scale.setScalar(CROW.size * (1 - t * 0.55));
      this.beatWings(dt * 2.5);
      return "none";
    }

    if (this.hunt !== null) {
      this.hunt -= dt;
      this.circle += dt * CROW.circleRate * Math.PI * 2;

      // Closing in over the whole count, so how much time is left is
      // something you can see as well as read.
      const through = 1 - Math.max(0, this.hunt) / CROW.warnFor;
      const r = CROW.circleFrom + (CROW.circleTo - CROW.circleFrom) * through;
      this.group.position.set(
        near.x + Math.cos(this.circle) * r,
        CROW.height,
        near.z + Math.sin(this.circle) * r,
      );
      // Facing the way it is going round, which is a quarter turn on from the
      // direction it lies from the caterpillar.
      this.group.rotation.y = -this.circle + Math.PI / 2;
      this.beatWings(dt);

      if (this.hunt > 0) {
        return "none";
      }
      this.hunt = null;
      if (safe) {
        // Gives up and goes. It leaves the way any of them used to: straight
        // across and out of the wood.
        this.crossing = 0;
        this.heading.subVectors(this.group.position, near).setY(0).normalize();
        this.from.copy(this.group.position);
        this.group.scale.setScalar(CROW.size);
        return "left";
      }
      this.dive = CROW.diveFor;
      return "caught";
    }

    if (this.crossing !== null) {
      this.crossing += dt;
      const t = this.crossing / CROW.crossTime;
      if (t >= 1) {
        this.crossing = null;
        this.group.visible = false;
        return "none";
      }
      this.group.position
        .copy(this.from)
        .addScaledVector(this.heading, t * CROW.travel);
      this.group.position.y = CROW.height;
      this.beatWings(dt);
      return "none";
    }

    if (this.done) {
      return "none";
    }
    this.wait -= dt;
    if (this.wait <= 0) {
      this.begin(near);
      return "began";
    }
    return "none";
  }

  /**
   * The wings beat by folding along the body rather than flapping up and down:
   * seen from directly above, which is what a shadow on the ground is, that is
   * what a wing beat looks like.
   */
  private beatWings(dt: number): void {
    this.beat += dt * CROW.beatHz * Math.PI * 2;
    // Across the span, not along the chord.
    //
    // Seen from directly above — which is what a shadow on the ground is — a
    // beating wing does not get shorter front to back. It rolls about the
    // shoulder, so what you see is the span foreshortening: the tip swings in
    // toward the body at the top and bottom of the stroke and reaches full
    // width as it passes level. Scaling the chord instead read as a bird
    // sweeping its wings forward and back, which is not a thing birds do.
    const roll = Math.sin(this.beat);
    const fold = CROW.foldMin + (1 - CROW.foldMin) * Math.abs(Math.cos(roll));
    for (const wing of this.wings) {
      wing.scale.x = fold;
      // A trace of chord with it: at the extremes of the stroke the wing is
      // tilted, and a tilted wing shows a little less of itself.
      wing.scale.z = 0.92 + 0.08 * fold;
    }
  }

  /** Starts a hunt: it arrives already circling, and the clock starts. */
  private begin(near: THREE.Vector3): void {
    this.done = true;
    this.hunt = CROW.warnFor;
    this.circle = this.rng.next() * Math.PI * 2;
    this.group.scale.setScalar(CROW.size);
    this.group.position.set(
      near.x + Math.cos(this.circle) * CROW.circleFrom,
      CROW.height,
      near.z + Math.sin(this.circle) * CROW.circleFrom,
    );
    this.group.visible = true;
  }
}

/** The body and tail, lying flat in the XZ plane. */
/** One flat, unlit, see-through patch of dark. */
function shadowMaterial(opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: 0x101a10,
    transparent: true,
    opacity,
    // A shadow must not hide what is behind it, and several of these
    // overlapping should not darken each other in steps.
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

/**
 * Lays a flat shape on the ground.
 *
 * The shapes below are drawn in plain 2D with x across the bird and y along
 * it, nose forward, which is the only sane way to write an outline by hand.
 * This turns one into a piece of floor: rotating about X by a quarter turn
 * sends +y to +z, so "forward" in the drawing becomes "forward" in the wood.
 */
function laidFlat(shape: THREE.Shape): THREE.BufferGeometry {
  const geo = new THREE.ShapeGeometry(shape, 12);
  geo.rotateX(Math.PI / 2);
  return geo;
}

/**
 * The body: a tapered lozenge with a head and a wedge of tail.
 *
 * A crow from directly above is mostly a long straight line — the give-away is
 * that the tail is a fan about as long as the body and the head barely shows
 * past the shoulders, which is the opposite of the way one draws a bird from
 * the side.
 */
function bodyShape(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  // Bill, then down the right side to the tail.
  s.moveTo(0, 0.62);
  s.quadraticCurveTo(0.06, 0.52, 0.09, 0.42);
  s.quadraticCurveTo(0.16, 0.2, 0.15, -0.02);
  s.quadraticCurveTo(0.14, -0.2, 0.1, -0.3);
  // The tail: a fan, notched very slightly at the end the way a crow's is —
  // it is what tells a crow from a rook at this distance, and the notch is
  // the only detail at this size that survives being a shadow.
  s.lineTo(0.2, -0.34);
  s.quadraticCurveTo(0.26, -0.62, 0.22, -0.82);
  s.lineTo(0.06, -0.72);
  s.lineTo(0, -0.76);
  s.lineTo(-0.06, -0.72);
  s.lineTo(-0.22, -0.82);
  s.quadraticCurveTo(-0.26, -0.62, -0.2, -0.34);
  s.lineTo(-0.1, -0.3);
  // Back up the left side.
  s.quadraticCurveTo(-0.14, -0.2, -0.15, -0.02);
  s.quadraticCurveTo(-0.16, 0.2, -0.09, 0.42);
  s.quadraticCurveTo(-0.06, 0.52, 0, 0.62);
  return laidFlat(s);
}

/**
 * One wing: long, swept, and fingered at the tip.
 *
 * The fingers are the whole point. A crow's primaries splay at the wingtip
 * into four or five separate feathers with daylight between them, and that
 * ragged tip is what the eye uses to tell a crow's shadow from a gull's — a
 * smooth ellipse reads as a paper dart, whatever else is right about it.
 */
function wingShape(side: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  // Leading edge, from the shoulder out to the wrist and on to the tip.
  s.moveTo(0.08, 0.26);
  s.quadraticCurveTo(0.5, 0.3, 0.86, 0.16);
  s.quadraticCurveTo(1.06, 0.09, 1.22, -0.02);

  // Four fingers, each a notch back toward the wing and out again a little
  // shorter than the last.
  const fingers = [
    [1.16, -0.12, 1.3, -0.16],
    [1.06, -0.2, 1.2, -0.27],
    [0.95, -0.26, 1.06, -0.36],
    [0.83, -0.3, 0.92, -0.42],
  ];
  for (const [nx, ny, tx, ty] of fingers) {
    s.lineTo(nx as number, ny as number);
    s.lineTo(tx as number, ty as number);
  }

  // Trailing edge, swept back in to the body.
  s.quadraticCurveTo(0.5, -0.4, 0.16, -0.24);
  s.lineTo(0.08, 0.26);

  const geo = laidFlat(s);
  // Swept back from the shoulder, the way a bird holds them in level flight.
  geo.rotateY(-0.22);
  if (side < 0) {
    geo.scale(-1, 1, 1);
  }
  return geo;
}
