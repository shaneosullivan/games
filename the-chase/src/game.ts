import * as THREE from "three";
import {CAMERA, DOGS, HARE, HOME, PROPS, SIM, WOOD} from "./config";
import {GameLoop} from "./core/loop";
import {Joystick} from "./core/input";
import {Rng} from "./core/rng";
import {Woodland} from "./core/audio";
import {Stage} from "./render/stage";
import {RAINBOW} from "./render/materials";
import {Wood} from "./entities/wood";
import {Hare} from "./entities/hare";
import {Dogs} from "./entities/dogs";
import {Glow} from "./entities/glow";
import {Home} from "./entities/home";
import {ParticleBurst} from "../../shared/particles";
import {Hud} from "./ui/hud";
import {Overlay} from "./ui/overlays";
import {SoundButton} from "../../shared/soundButton";

const TAU = Math.PI * 2;

function shortestAngle(from: number, to: number): number {
  return ((((to - from) % TAU) + TAU + Math.PI) % TAU) - Math.PI;
}

/**
 * The Chase.
 *
 * You are a hare and three dogs are after you. Run down the wood, jump the
 * logs, go round the brambles, and get home to the burrow at the far end.
 *
 * The plan sets the controls: the caterpillar game's floating thumbstick, and
 * a tap on the left of the screen to jump. It also sets the one rule that
 * makes the whole thing work — the hare is always running, and it slows down
 * when nobody is touching the glass. The dogs run at a speed between that lope
 * and a full gallop, so holding the stick pulls away and letting go gives it
 * back.
 *
 * The Game owns the scene and everything in it. Fixed timestep at SIM.step
 * with the render interpolating between steps, the same as the other games.
 */
export class Game {
  readonly stage: Stage;
  readonly wood: Wood;
  readonly hare: Hare;
  readonly dogs: Dogs;
  readonly glow: Glow;
  readonly home: Home;
  readonly leaves: ParticleBurst;
  readonly sparks: ParticleBurst;
  readonly woodland: Woodland;
  readonly hud: Hud;
  readonly stick: Joystick;
  readonly loop: GameLoop;

  /** update() does nothing unless this is set, so a card can hold the game
   *  still while the wood is already being drawn behind it. */
  running = false;

  /**
   * Where the run has got to.
   *
   * "homing" is the second or so at the end when the controls are gone and the
   * hare is running itself into the burrow; "safe" is the pause after it,
   * with the rainbow going off, before the card.
   */
  private phase: "running" | "homing" | "safe" | "caught" = "running";
  private safeLeft = 0;
  private burstIn = 0;
  /** Seconds left of watching the dogs make a fuss about it. */
  private caughtLeft = 0;

  private readonly intro: Overlay;
  private readonly won: Overlay;

  /** Seconds since the run began. */
  private time = 0;
  /** How many things have been run into, so the card can mention it. */
  private bumps = 0;
  /** Seconds until the next puff of leaves off the feet. */
  private puffIn = 0;

  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly want = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private readonly wantEye = new THREE.Vector3();
  private readonly smoothLook = new THREE.Vector3();
  private readonly puffAt = new THREE.Vector3();
  /** Where the camera stands to watch the hare go in. See beginHoming. */
  private readonly watchEye = new THREE.Vector3();

  /**
   * The bearing the camera is using, which lags the hare's own — and the
   * bearing the stick is read against, which is the camera's.
   *
   * Kept as two names rather than one because the caterpillar's rig taught the
   * lesson the hard way: while the player is steering, reading the stick
   * against a camera that is still swinging means the swing itself steers you.
   */
  private camYaw = Math.PI;
  private inputYaw = Math.PI;

  constructor(host: HTMLElement, ui: HTMLElement) {
    // Seeded, so the wood is the same wood every time. A child who learns
    // where the log is should find it there tomorrow.
    const rng = new Rng(PROPS.seed);

    this.stage = new Stage(host);
    this.wood = new Wood(rng);
    this.hare = new Hare();
    this.hare.place(this.wood, this.wood.pathAt(-20), -20);
    this.dogs = new Dogs(
      rng,
      this.wood,
      this.hare.position.x,
      this.hare.position.z,
    );
    this.glow = new Glow(rng, this.wood);
    this.home = new Home(rng, this.wood);
    // Small motes: kicked-up leaves and earth, not snowballs.
    this.leaves = new ParticleBurst(300, 0.3, false);
    this.sparks = new ParticleBurst(460, 0.16, false);

    this.stage.scene.add(this.wood.group);
    this.stage.scene.add(this.home.group);
    this.stage.scene.add(this.hare.group);
    this.stage.scene.add(this.dogs.group);
    this.stage.scene.add(this.leaves.mesh);
    this.stage.scene.add(this.sparks.mesh);
    this.stage.scene.add(this.glow.shafts);
    this.stage.scene.add(this.glow.flies);

    this.woodland = new Woodland();
    this.hud = new Hud();
    this.hud.mount(ui);
    this.stick = new Joystick(ui);
    this.stick.enabled = false;
    this.stick.onJump = () => this.jump();

    this.intro = new Overlay(
      ui,
      "The Chase",
      "You are a hare, and three dogs have seen you. Drag anywhere on the screen to run: hold on to go flat out, and if you let go you drop to a trot and they will catch you up. Tap the left of the screen to jump — you can clear the logs, the stones and the brambles, but not the big boulders or the trees, so go round those. The gauge down the side fills up as the dogs get closer. Home is the burrow at the far end of the wood. Get inside it and you are safe.",
      "Run!",
      () => this.begin(),
    );
    this.won = new Overlay(ui, "Safe!", "", "Run again", () =>
      window.location.reload(),
    );
    this.won.hide();

    const corner = document.createElement("div");
    corner.className = "corner-buttons";
    const homeLink = document.createElement("a");
    homeLink.className = "icon-button ui-interactive";
    homeLink.href = "../../";
    homeLink.textContent = "🏠";
    homeLink.title = "Chofter Games";
    homeLink.setAttribute("aria-label", "Back to Chofter Games");
    corner.appendChild(homeLink);
    const sound = new SoundButton({
      onToggle: muted => this.woodland.setMuted(muted),
      className: "ui-interactive",
    });
    corner.appendChild(sound.root);
    ui.appendChild(corner);

    // Everything off on the way out. The gallery is one tap away and these
    // games are pages rather than tabs: a page that keeps barking behind the
    // one a child has moved on to is a bug the caterpillar game had once
    // already, and it is worth not having twice.
    window.addEventListener("pagehide", () => this.woodland.stop());

    this.snapCamera();
    this.loop = new GameLoop(this.update, this.render);
    this.loop.start();
  }

  private begin(): void {
    this.intro.hide();
    this.stick.enabled = true;
    this.running = true;
    // Here and not in the constructor: a browser will not start an audio
    // context outside a real gesture, and the button that got us here is one.
    this.woodland.start();
  }

  private jump(): void {
    if (this.phase !== "running") {
      return;
    }
    const was = this.hare.grounded;
    this.hare.askJump();
    if (was) {
      this.woodland.hop(true);
      this.puff(14, 6);
    }
  }

  update = (dt: number): void => {
    if (!this.running) {
      return;
    }
    this.time += dt;

    if (this.phase === "safe") {
      this.safeLeft -= dt;
      this.rainbow(dt);
      this.home.update(dt);
      this.leaves.update(dt);
      this.sparks.update(dt);
      if (this.safeLeft <= 0) {
        this.showWon();
      }
      return;
    }

    if (this.phase === "homing") {
      this.goHome(dt);
      this.rainbow(dt);
      this.home.update(dt);
      this.leaves.update(dt);
      this.sparks.update(dt);
      return;
    }

    if (this.phase === "caught") {
      // They have you. They are not doing anything about it except barking.
      this.caughtLeft -= dt;
      this.dogs.surround(dt, this.hare.position, this.wood);
      this.hare.speed = 0;
      this.home.update(dt);
      this.leaves.update(dt);
      // Gap zero, so the wood's own bark timer runs at its fastest and its
      // loudest: they are standing on top of you.
      this.woodland.update(dt, 0, 0);
      if (this.caughtLeft <= 0) {
        this.restart();
      }
      return;
    }

    // What the stick is asking for, read in the camera's frame: push it the
    // way you want to go on screen and that is the way the hare goes. The
    // caterpillar's arrangement, and the only one that needs no explaining.
    // Its length is the throttle as well — see Hare.
    this.forward.set(Math.sin(this.inputYaw), 0, Math.cos(this.inputYaw));
    this.right.set(-Math.cos(this.inputYaw), 0, Math.sin(this.inputYaw));
    this.want
      .copy(this.forward)
      .multiplyScalar(-this.stick.y)
      .addScaledVector(this.right, this.stick.x)
      .multiplyScalar(this.stick.magnitude);

    const landed = this.hare.update(dt, this.want, this.wood);
    if (landed) {
      this.woodland.hop(false);
      this.puff(16, 8);
    }

    this.keepInTheWood();
    this.bump();
    this.kickUpLeaves(dt);

    if (this.dogs.update(dt, this.hare.position, this.wood)) {
      this.caught();
      return;
    }

    this.woodland.update(dt, this.hare.speed, this.dogs.gap);
    this.home.update(dt);
    this.leaves.update(dt);
    this.sparks.update(dt);

    // Home. Not a line to cross — the burrow is a place, and this is close
    // enough to it that the hare can take itself the rest of the way in.
    if (this.hare.position.z < this.wood.homeZ + 34) {
      this.beginHoming();
    }

    this.hud.update(this.hare.along(this.wood), this.dogs.gap);
  };

  /**
   * Keeps the hare in the wood.
   *
   * The trees do nearly all of this on their own — they thicken until there is
   * no way through, which is a boundary nobody has to be told about. This is
   * only the backstop at the very edge of the built ground, where the
   * alternative is running off into nothing.
   */
  private keepInTheWood(): void {
    const edge = WOOD.halfWidth - 12;
    const centre = this.wood.pathAt(this.hare.position.z);
    if (Math.abs(this.hare.position.x - centre) > edge) {
      this.hare.position.x =
        centre + Math.sign(this.hare.position.x - centre) * edge;
    }
    // And the top of the wood. Running back the way you came is allowed — the
    // dogs make it a bad idea on their own — but the ground has to end.
    if (this.hare.position.z > 30) {
      this.hare.position.z = 30;
    }
  }

  /** Logs, stones and brambles. */
  private bump(): void {
    if (this.hare.rest > 0) {
      return;
    }
    // How high off the ground it is, which is what decides whether a log is in
    // the way or underneath.
    const ground = this.wood.heightAt(
      this.hare.position.x,
      this.hare.position.z,
    );
    const hit = this.wood.hit(
      this.hare.position.x,
      this.hare.position.z,
      2,
      this.hare.position.y - ground,
    );
    if (!hit) {
      return;
    }
    this.hare.bump(hit.x, hit.z, hit.radius + 2, this.wood);
    this.bumps++;
    this.woodland.thud();
    this.puff(22, 12);
  }

  /**
   * Leaves and earth off the back feet.
   *
   * Only when it is actually running, and rate-limited rather than emitted
   * every step: at sixty steps a second a burst a step empties a three-hundred
   * mote pool in five.
   */
  private kickUpLeaves(dt: number): void {
    this.puffIn -= dt;
    if (
      !this.hare.grounded ||
      this.hare.speed < HARE.lope * 1.2 ||
      this.puffIn > 0
    ) {
      return;
    }
    this.puffIn = 0.07;
    this.puff(6 + this.hare.speed * 0.12, 3);
  }

  /** A handful of leaves thrown up from under the feet. */
  private puff(speed: number, count: number): void {
    this.puffAt
      .copy(this.hare.position)
      .addScaledVector(
        this.forward.set(
          Math.sin(this.hare.heading),
          0,
          Math.cos(this.hare.heading),
        ),
        -2.6,
      );
    this.puffAt.y -= 1;
    this.leaves.burst(this.puffAt, {
      color: [0x6faa52, 0x8a6a48, 0x4f9440, 0xb59a6a],
      count: Math.round(count),
      speed,
      lift: 3,
      gravity: 42,
      ttl: 0.6,
      size: 1,
      spherical: 0.4,
    });
  }

  /**
   * The last stretch: the hare takes itself into the burrow.
   *
   * The plan asks to see it go in, so the controls come off and it runs at the
   * mouth under its own steam. It shrinks as it goes, which is the whole of
   * the trick — a hare that simply switched off at the doorway would have
   * vanished rather than gone home.
   */
  private beginHoming(): void {
    this.phase = "homing";
    this.stick.enabled = false;
    this.stick.release();
    this.hud.setVisible(false);
    this.home.cheer();
    // The wood goes quiet. A run that has ended and is still rushing past your
    // ears is a run that has not ended.
    this.woodland.hush();
    this.woodland.safe();
    this.burstIn = 0;
    // Where the shot stands for the ending, and it stands still.
    //
    // Left to follow, the camera goes into the burrow after the hare — and
    // since the hare gets there, what a whole run ended on was the inside of
    // an earth bank filling the screen. From back up the wood and a little
    // above, you see the bank, the mouth, the others waiting and the rainbow
    // over the top of it, which is the shot the ending is for.
    this.watchEye.set(
      this.home.mouth.x,
      this.home.mouth.y + 18,
      this.home.mouth.z + 58,
    );
  }

  private goHome(dt: number): void {
    const mouth = this.home.mouth;
    this.hare.prevPosition.copy(this.hare.position);
    this.want.set(
      mouth.x - this.hare.position.x,
      0,
      mouth.z - this.hare.position.z,
    );
    const left = this.want.length();
    if (left > 0.5) {
      this.want.multiplyScalar(1 / left);
      const target = Math.atan2(this.want.x, this.want.z);
      const diff = shortestAngle(this.hare.heading, target);
      this.hare.heading += Math.sign(diff) * Math.min(Math.abs(diff), 5 * dt);
      const step = Math.min(left, this.hare.speed * dt);
      this.hare.position.addScaledVector(this.want, step);
      this.hare.position.y =
        this.wood.heightAt(this.hare.position.x, this.hare.position.z) +
        HARE.ride;
    }

    // Into the hole: it gets smaller over the last few units and is gone by
    // the time it reaches the back of the mouth.
    const shrink = Math.max(0, Math.min(1, left / 16));
    this.hare.group.scale.setScalar(shrink);
    this.woodland.update(dt, this.hare.speed, 999);

    if (left <= 0.6) {
      this.phase = "safe";
      this.safeLeft = HOME.linger;
      this.hare.group.visible = false;
    }
  }

  /**
   * The rainbow over the burrow.
   *
   * Thrown round the mouth rather than round the hare, and low enough to be in
   * shot: the camera is watching the doorway by then, and a firework going off
   * above the top of the screen is a firework nobody sees.
   */
  private rainbow(dt: number): void {
    this.burstIn -= dt;
    if (this.burstIn > 0) {
      return;
    }
    this.burstIn = HOME.every;
    const mouth = this.home.mouth;
    this.puffAt.set(
      mouth.x + (Math.random() - 0.5) * HOME.spread * 2,
      mouth.y + 1 + Math.random() * 20,
      mouth.z + 2 + Math.random() * 24,
    );
    this.sparks.burst(this.puffAt, {
      color: RAINBOW,
      count: 34,
      speed: 17,
      lift: 2,
      gravity: 10,
      ttl: 1.5,
      size: 3,
      spherical: 1,
    });
  }

  /**
   * Back to the top of the wood, with no card in between.
   *
   * Being caught used to end on a panel with a button on it, and a panel is a
   * stop: the child has read what happened, they know what happened, they
   * watched it happen. Three dogs make a fuss for a couple of seconds and then
   * you are running again, which is the only thing anybody wanted.
   *
   * The wood is seeded and identical every run, so there is nothing to
   * rebuild — this is the hare, the dogs and a handful of counters.
   */
  private restart(): void {
    this.hare.place(this.wood, this.wood.pathAt(-20), -20);
    this.dogs.reset(this.wood, this.hare.position.x, this.hare.position.z);
    this.bumps = 0;
    this.time = 0;
    this.puffIn = 0;
    this.burstIn = 0;
    this.phase = "running";
    this.stick.enabled = true;
    this.hud.setVisible(true);
    this.woodland.resume();
    this.snapCamera();
  }

  /**
   * Caught: the dogs close in and the card waits.
   *
   * The card used to come up the instant they touched you, which threw away
   * the only moment in the game where you get to see what has been chasing you
   * — and made being caught feel like a door slamming. Now the shot pulls
   * round, they make a ring and bark, and then the card.
   */
  private caught(): void {
    this.phase = "caught";
    this.caughtLeft = DOGS.linger;
    this.stick.enabled = false;
    this.stick.release();
    this.hud.setVisible(false);
    // The rush stops; the barking does not, since that is the whole of what
    // you are being shown.
    this.woodland.hush();
    this.woodland.caught();
    // Where the shot stands to watch it: off to one side and above, so all
    // three of them and the hare are in frame at once.
    this.watchEye.set(
      this.hare.position.x + 22,
      this.hare.position.y + 15,
      this.hare.position.z + 24,
    );
  }

  private showWon(): void {
    this.running = false;
    this.won.setBody(
      this.bumps === 0
        ? "All the way down the wood without touching a thing. The dogs never got near you."
        : `Home, with ${this.bumps === 1 ? "one bump" : `${this.bumps} bumps`} on the way. Every log you clear is a length on the dogs.`,
    );
    this.won.show();
  }

  render = (alpha: number, dt: number): void => {
    this.hare.render(alpha);
    this.dogs.render(alpha);
    this.followCamera(dt);
    // Anything standing between the shot and the hare goes see-through. In a
    // wood this thick, without it the one thing you are steering spends half
    // the run behind a trunk.
    this.wood.setFadeFocus(
      this.stage.camera.position,
      this.hare.group.position,
    );
    this.glow.update(dt, this.hare.group.position);
    this.stage.followSun(this.hare.group.position);
    this.stage.render();
  };

  /**
   * The shot: behind the hare, low, looking down the wood past it.
   *
   * Two easings and a follow. The eye and the look-at point are both chased
   * rather than snapped, which is what stops a bump in the ground from
   * becoming a bump in the camera; the follow — which way the shot is pointing
   * — is the caterpillar's, dead zone and all. See followYaw.
   */
  private followCamera(dt: number): void {
    const p = this.hare.group.position;

    // Both endings have their own shot: parked, watching. One watches the
    // doorway and the other watches the dogs make a fuss.
    if (this.phase !== "running") {
      const ease = 1 - Math.exp(-CAMERA.easeEye * 0.6 * dt);
      this.stage.camera.position.lerp(this.watchEye, ease);
      const at =
        this.phase === "caught" ? this.hare.group.position : this.home.mouth;
      this.smoothLook.lerp(at, 1 - Math.exp(-3 * dt));
      this.stage.camera.lookAt(this.smoothLook);
      return;
    }

    this.followYaw(dt);
    this.inputYaw = this.camYaw;

    const fast = Math.min(1, this.hare.speed / HARE.topSpeed);
    const closing = Math.max(0, CAMERA.chaseFrom - this.dogs.gap);
    const back =
      CAMERA.distance + fast * CAMERA.speedPull + closing * CAMERA.chasePull;
    // Drops as the hare goes up, so a jump is seen from below and looks like
    // one. Taken off the height rather than added to the hare's, so the shot
    // does not lurch when it lands.
    const air = Math.max(0, p.y - this.wood.heightAt(p.x, p.z) - HARE.ride);
    const drop = Math.min(CAMERA.airDrop, air * 0.35);

    this.wantEye.set(
      p.x - Math.sin(this.camYaw) * back,
      p.y + CAMERA.height - drop,
      p.z - Math.cos(this.camYaw) * back,
    );
    // Never underground.
    const floor = this.wood.heightAt(this.wantEye.x, this.wantEye.z) + 4;
    if (this.wantEye.y < floor) {
      this.wantEye.y = floor;
    }

    const eyeEase = 1 - Math.exp(-CAMERA.easeEye * dt);
    this.stage.camera.position.lerp(this.wantEye, eyeEase);

    // Looking down the wood past the animal, not at it. Most of the screen
    // should be the thing you are about to hit.
    const ahead = this.phase === "running" ? CAMERA.lookAhead : 4;
    this.look.set(
      p.x + Math.sin(this.camYaw) * ahead,
      p.y + 2,
      p.z + Math.cos(this.camYaw) * ahead,
    );
    const lookEase = 1 - Math.exp(-CAMERA.easeLook * dt);
    this.smoothLook.lerp(this.look, lookEase);
    this.stage.camera.lookAt(this.smoothLook);
  }

  /**
   * Drifts the shot round behind the hare. Lifted from the caterpillar's rig,
   * which had already worked out that this is two problems.
   *
   * While the player is steering, the stick is read in the camera's frame, so
   * turning the camera turns the heading by the same amount: the offset
   * between them is a fixed point of the loop and no gain closes it. All the
   * follow can do is widen the arc, so it keeps a dead zone and a hard rate
   * cap and stays out of the way.
   *
   * The moment nobody is pushing, that loop is gone — the heading is fixed in
   * the world — and the camera can come round behind it briskly.
   */
  private followYaw(dt: number): void {
    const diff = shortestAngle(this.camYaw, this.hare.heading);
    const size = Math.abs(diff);
    if (size < 1e-4) {
      return;
    }
    const steering = this.stick.magnitude > 0.01;

    let rate: number;
    if (steering) {
      const off = size - CAMERA.yawDeadzone;
      if (off <= 0) {
        return;
      }
      rate = Math.min(off * CAMERA.yawGain, CAMERA.yawMaxRate);
    } else {
      rate = Math.min(size * CAMERA.yawIdleGain, CAMERA.yawIdleMaxRate);
    }
    this.camYaw += Math.sign(diff) * Math.min(rate * dt, size);
  }

  /** Puts the camera where it belongs straight away, so the first frame is not
   *  a swoop in from the origin. */
  private snapCamera(): void {
    this.camYaw = this.hare.heading;
    this.inputYaw = this.camYaw;
    const p = this.hare.position;
    this.stage.camera.position.set(
      p.x - Math.sin(this.camYaw) * CAMERA.distance,
      p.y + CAMERA.height,
      p.z - Math.cos(this.camYaw) * CAMERA.distance,
    );
    this.smoothLook.set(
      p.x + Math.sin(this.camYaw) * CAMERA.lookAhead,
      p.y + 2,
      p.z + Math.cos(this.camYaw) * CAMERA.lookAhead,
    );
    this.stage.camera.lookAt(this.smoothLook);
    this.hare.render(1);
    this.dogs.render(1);
    this.stage.followSun(p);
    this.glow.update(SIM.step, p);
    this.hud.update(0, DOGS.startGap);
  }
}
