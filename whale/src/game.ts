import * as THREE from "three";
import {CAMERA, DEPTH, REEF, SIM, SWIM} from "./config";
import {GameLoop} from "./core/loop";
import {Joystick} from "./core/input";
import {DepthStick} from "./core/depthStick";
import {Rng} from "./core/rng";
import {Ocean} from "./core/audio";
import {Stage} from "./render/stage";
import {Reef} from "./entities/reef";
import {Whale} from "./entities/whale";
import {Fish} from "./entities/fish";
import {Plastic} from "./entities/plastic";
import {
  createFireworks,
  FIREWORK_PALETTE,
  ParticleBurst,
} from "../../shared/particles";
import {Hud} from "./ui/hud";
import {Overlay} from "./ui/overlays";
import {SoundButton} from "../../shared/soundButton";

const TAU = Math.PI * 2;

/**
 * Whale.
 *
 * You are a beluga on a coral reef. Swim to the far end of it, eat the fish on
 * the way, and don't eat the plastic. The thumbstick moves you and the slider
 * down the right sets how deep you are, which is the bee game's pair of
 * controls — the plan asks for those by name.
 *
 * The Game owns the scene, the whale, the reef and everything in it. Fixed
 * timestep at SIM.step with the render interpolating between steps, the same
 * as the other games here.
 */
export class Game {
  readonly stage: Stage;
  readonly reef: Reef;
  readonly whale: Whale;
  readonly fish: Fish;
  readonly plastic: Plastic;
  readonly bubbles: ParticleBurst;
  readonly sparks: ParticleBurst;
  readonly ocean: Ocean;
  readonly hud: Hud;
  readonly stick: Joystick;
  readonly depth: DepthStick;
  readonly loop: GameLoop;

  /** update() does nothing unless this is set, so a card can hold the game
   *  still while the reef is already being drawn behind it. */
  running = false;

  private readonly intro: Overlay;
  private readonly done: Overlay;
  private readonly oops: Overlay;

  /** Seconds since the swim began. The reef's waves and dapple run off this
   *  rather than off a clock, so a game behind a card has a still sea. */
  private time = 0;
  /** Over, one way or the other. */
  private finished = false;

  /** How many fish have gone down in a row, and how long is left of the run —
   *  the gulp rises in pitch through a mouthful, and this is the mouthful. */
  private streak = 0;
  private streakLeft = 0;

  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly want = new THREE.Vector3();
  private readonly mouth = new THREE.Vector3();
  private readonly eye = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  /** The heading the *camera* is using, which lags the whale's. See
   *  followCamera. */
  private camHeading = Math.PI;
  private camPitch = 0;

  constructor(host: HTMLElement, ui: HTMLElement) {
    // Seeded, so the reef is the same reef every time. Eating plastic starts
    // the swim again, and a reef that reshuffled itself would turn a second go
    // into a different game rather than another try at this one.
    const rng = new Rng(20260830);

    this.stage = new Stage(host);
    this.reef = new Reef(rng);
    this.whale = new Whale();
    this.fish = new Fish(
      rng,
      (x, z) => this.reef.floorAt(x, z),
      this.reef.finishZ,
    );
    this.plastic = new Plastic(
      rng,
      (x, z) => this.reef.floorAt(x, z),
      this.reef.finishZ,
    );

    // Bubbles rise, so their gravity is negative — the shared burst subtracts
    // it from the upward velocity every step, and a negative one adds.
    this.bubbles = new ParticleBurst(300, 0.11, false);
    this.sparks = createFireworks();

    this.stage.scene.add(this.reef.group);
    this.stage.scene.add(this.whale.group);
    this.stage.scene.add(this.fish.mesh);
    this.stage.scene.add(this.plastic.group);
    this.stage.scene.add(this.bubbles.mesh);
    this.stage.scene.add(this.sparks.mesh);

    this.whale.place(new THREE.Vector3(0, -DEPTH.start, 40), Math.PI);

    this.ocean = new Ocean();
    this.hud = new Hud();
    this.hud.mount(ui);
    this.stick = new Joystick(ui);
    this.stick.enabled = false;
    this.depth = new DepthStick(ui, DEPTH.start);
    this.depth.setVisible(false);

    this.intro = new Overlay(
      ui,
      "Whale",
      "You are a beluga whale on a coral reef. Drag on the left to swim, and slide the bar on the right to go deeper or come up to the sunshine. Eat the fish that swim into your mouth — some of them are shy and will dart away. Don't eat the plastic bottles and bags: swim right round those. The reef ends at a big pink arch, and that is where you are going.",
      "Dive in",
      () => this.begin(),
    );
    this.done = new Overlay(ui, "You made it!", "", "Swim again", () =>
      window.location.reload(),
    );
    this.done.hide();
    this.oops = new Overlay(
      ui,
      "Yuck — that was plastic!",
      "Plastic is not food, and a whale cannot tell until it is too late. Have another go, and swim round the bottles and bags this time.",
      "Try again",
      () => window.location.reload(),
    );
    this.oops.hide();

    const corner = document.createElement("div");
    corner.className = "corner-buttons";
    const home = document.createElement("a");
    home.className = "icon-button ui-interactive";
    home.href = "../../";
    home.textContent = "🏠";
    home.title = "Chofter Games";
    home.setAttribute("aria-label", "Back to Chofter Games");
    corner.appendChild(home);
    const sound = new SoundButton({
      onToggle: muted => this.ocean.setMuted(muted),
      className: "ui-interactive",
    });
    corner.appendChild(sound.root);
    ui.appendChild(corner);

    // Everything off on the way out. The gallery is one tap away and these
    // games are pages rather than tabs: a page that keeps rumbling behind the
    // one a child has moved on to is a bug the caterpillar game had once
    // already, and it is worth not having twice.
    window.addEventListener("pagehide", () => this.ocean.stop());

    this.snapCamera();
    this.loop = new GameLoop(this.update, this.render);
    this.loop.start();
  }

  private begin(): void {
    this.intro.hide();
    this.stick.enabled = true;
    this.depth.setVisible(true);
    this.running = true;
    // Here and not in the constructor: a browser will not start an audio
    // context outside a real gesture, and the button that got us here is one.
    this.ocean.start();
  }

  update = (dt: number): void => {
    if (!this.running || this.finished) {
      return;
    }
    this.time += dt;

    // What the sticks are asking for. The thumbstick is read in camera space —
    // push the stick the way you want to go on screen and that is the way the
    // whale goes, which is the bee's arrangement and the only one that needs
    // no explaining.
    this.forward.set(Math.sin(this.camHeading), 0, Math.cos(this.camHeading));
    this.right.set(-Math.cos(this.camHeading), 0, Math.sin(this.camHeading));
    this.want
      .copy(this.forward)
      .multiplyScalar(-this.stick.y)
      .addScaledVector(this.right, this.stick.x)
      .multiplyScalar(SWIM.maxSpeed);

    this.whale.update(
      dt,
      this.want,
      this.climbRate(),
      this.stick.magnitude > 0,
    );
    this.keepInReef(dt);

    this.whale.mouth(this.mouth);
    this.eat(dt);

    if (this.plastic.update(dt, this.mouth)) {
      this.spoil();
      return;
    }

    this.reef.update(this.time, this.whale.position);
    this.bubbles.update(dt);
    this.sparks.update(dt);
    this.ocean.update(dt, this.whale.speed / SWIM.maxSpeed);

    if (this.whale.position.z <= this.reef.finishZ) {
      this.win();
    }
  };

  /**
   * How fast to rise or sink, from the slider — and from the sea floor, which
   * has the last word.
   *
   * Over a sandbank the floor is nearer than the slider's deepest setting, so
   * the whale is held off it at DEPTH.floorClear and the slider's knob and the
   * marker beside it come apart. That gap is the game telling you the water is
   * shallow here, which is the plan's "some bits are deeper than others" made
   * into something you can feel rather than only see.
   */
  private climbRate(): number {
    const p = this.whale.position;
    const floorDepth = -this.reef.floorAt(p.x, p.z);
    const deepest = Math.min(
      DEPTH.maxDepth,
      Math.max(DEPTH.minDepth, floorDepth - DEPTH.floorClear),
    );
    const wantDepth = Math.min(this.depth.desiredDepth, deepest);
    // Eased rather than jumped, and capped: a whale that snapped to the depth
    // you asked for would have no weight to it at all. A rate per *second*,
    // not a share of the gap per frame — see DEPTH.followRate.
    const rate = (-wantDepth - p.y) * DEPTH.followRate;
    return Math.max(-SWIM.climbSpeed, Math.min(SWIM.climbSpeed, rate));
  }

  /**
   * The sides of the lane and the sea floor.
   *
   * A push and then a clamp, the same soft boundary the bee has: a push alone
   * balances the stick wherever the two happen to be equal, which can be a
   * long way out, and a clamp alone feels like a wall.
   */
  private keepInReef(dt: number): void {
    const p = this.whale.position;
    const over = Math.abs(p.x) - REEF.halfWidth;
    if (over > 0) {
      const side = Math.sign(p.x);
      const push = Math.min(1, over / REEF.give) * REEF.push;
      const limit = REEF.halfWidth + REEF.give;
      p.x = side * Math.min(Math.abs(p.x) - push * dt, limit);
      this.whale.velocity.x *= 1 - Math.min(0.9, over / 4) * dt * 4;
    }
    // Nothing behind the start but open water, and nothing in it.
    if (p.z > 90) {
      p.z = 90;
      this.whale.velocity.z = Math.min(0, this.whale.velocity.z);
    }
    // The floor and the surface, hard. climbRate aims to keep clear of both;
    // this is what happens when the floor rises faster than the whale can.
    const floor = this.reef.floorAt(p.x, p.z) + DEPTH.floorClear;
    if (p.y < floor) {
      p.y = floor;
    }
    if (p.y > -DEPTH.minDepth) {
      p.y = -DEPTH.minDepth;
    }
  }

  /**
   * A mouthful.
   *
   * Only what touches the mouth counts — the sphere is out in front of the
   * melon, not around the whole animal. The plan is specific about that, and
   * it is what makes lining a school up worth doing.
   */
  private eat(dt: number): void {
    this.streakLeft = Math.max(0, this.streakLeft - dt);
    if (this.streakLeft === 0) {
      this.streak = 0;
    }

    const taken = this.fish.update(dt, this.mouth);
    if (taken === 0) {
      return;
    }

    this.whale.gulp();
    for (let i = 0; i < taken; i++) {
      this.ocean.gulp(this.streak);
      this.streak++;
    }
    this.streakLeft = 1.2;
    this.bubbles.burst(this.mouth, {
      color: [0xdffcff, 0xbdf0ff, 0xffffff],
      count: 6 + taken * 3,
      speed: 7,
      lift: 4,
      // Negative, so they rise. Bubbles are the one thing in this game that
      // falls upward.
      gravity: -9,
      ttl: 1.5,
      size: 8,
      spherical: 1,
    });
  }

  /** Ate a bag. Gentle about it — the card does the talking. */
  private spoil(): void {
    this.finished = true;
    this.stick.enabled = false;
    this.depth.setVisible(false);
    this.hud.setVisible(false);
    this.ocean.oops();
    this.bubbles.burst(this.mouth, {
      color: [0xdffcff, 0xffffff],
      count: 26,
      speed: 10,
      lift: 5,
      gravity: -9,
      ttl: 1.8,
      size: 9,
      spherical: 1,
    });
    this.oops.show();
  }

  /** Through the arch. */
  private win(): void {
    this.finished = true;
    this.stick.enabled = false;
    this.depth.setVisible(false);
    this.hud.setVisible(false);
    this.sparks.burst(this.whale.position, {
      color: FIREWORK_PALETTE,
      count: 110,
      speed: 16,
      lift: 6,
      gravity: -3,
      ttl: 2,
      size: 9,
      spherical: 1,
    });
    // How many, not how many out of how many. There are a couple of hundred
    // fish on this reef and nobody is going to eat them all — a score printed
    // as a fraction of that would turn a good swim into a bad mark.
    const all = this.fish.eaten === this.fish.total;
    const n = this.fish.eaten;
    this.done.setTitle(all ? "Every last fish!" : "You made it!");
    this.done.setBody(
      all
        ? "You swam the whole reef and there is not one fish left on it."
        : `You swam the whole reef, ate ${n} fish and never once ate the plastic.`,
    );
    this.done.show();
  }

  render = (alpha: number): void => {
    this.whale.render(alpha);
    this.followCamera(SIM.step);
    this.stage.setDepth(-this.whale.position.y);
    this.depth.setActualDepth(-this.whale.position.y);
    this.hud.update(
      this.reef.progressAt(this.whale.position.z),
      this.fish.eaten,
    );
    this.stage.render();
  };

  /**
   * Behind and a little above, looking where the whale is going.
   *
   * The looseness is in the *heading*, not in the position: at these speeds a
   * camera closing a fixed share of the gap every frame sits permanently
   * behind the thing it is following. The heading lags, and the eye is then
   * placed exactly off it. That one is written up in the squirrel game's
   * notes, where it cost an afternoon.
   */
  private followCamera(dt: number): void {
    let delta = this.whale.heading - this.camHeading;
    while (delta > Math.PI) {
      delta -= TAU;
    }
    while (delta < -Math.PI) {
      delta += TAU;
    }
    this.camHeading += delta * (1 - Math.exp(-CAMERA.headingLag * dt));

    const climb = this.whale.velocity.y / SWIM.climbSpeed;
    this.camPitch +=
      (climb - this.camPitch) * (1 - Math.exp(-CAMERA.pitchLag * dt));

    const p = this.whale.group.position;
    const fx = Math.sin(this.camHeading);
    const fz = Math.cos(this.camHeading);
    this.eye.set(
      p.x - fx * CAMERA.distance,
      p.y + CAMERA.height - this.camPitch * CAMERA.distance * 0.35,
      p.z - fz * CAMERA.distance,
    );

    // Never through the sand and never out through the surface. Both would
    // show the player something that is not the game: a screen full of grit,
    // or the sky.
    const floor = this.reef.floorAt(this.eye.x, this.eye.z) + CAMERA.floorClear;
    if (this.eye.y < floor) {
      this.eye.y = floor;
    }
    if (this.eye.y > -CAMERA.surfaceClear) {
      this.eye.y = -CAMERA.surfaceClear;
    }
    this.stage.camera.position.copy(this.eye);

    this.look.set(
      p.x + fx * CAMERA.lookAhead,
      p.y + this.camPitch * CAMERA.lookAhead * 0.5,
      p.z + fz * CAMERA.lookAhead,
    );
    this.stage.camera.lookAt(this.look);
  }

  /** Straight to where the camera belongs, for the first frame. */
  private snapCamera(): void {
    this.camHeading = this.whale.heading;
    this.followCamera(1);
  }
}
