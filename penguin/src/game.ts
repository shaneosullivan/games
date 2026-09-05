import * as THREE from "three";
import {CAMERA, FINISH, HILL, PROPS, SIM, SLIDE} from "./config";
import {GameLoop} from "./core/loop";
import {Joystick} from "./core/input";
import {Rng} from "./core/rng";
import {Bumps, Wind} from "./core/audio";
import {Stage} from "./render/stage";
import {PALETTE} from "./render/materials";
import {Hill} from "./entities/hill";
import {Penguin} from "./entities/penguin";
import {Obstacle, Props} from "./entities/props";
import {Fish} from "./entities/fish";
import {Snowfall} from "./entities/snowfall";
import {Sky} from "./entities/sky";
import {Finish} from "./entities/finish";
import {
  createFireworks,
  FIREWORK_PALETTE,
  ParticleBurst,
} from "../../shared/particles";
import {Hud} from "./ui/hud";
import {Overlay} from "./ui/overlays";
import {SoundButton} from "../../shared/soundButton";

const TAU = Math.PI * 2;

function shortestAngle(from: number, to: number): number {
  return ((((to - from) % TAU) + TAU + Math.PI) % TAU) - Math.PI;
}

/**
 * Penguin.
 *
 * You are a penguin on your belly at the top of a mountain. Slide down it,
 * pick up the fish on the way, go round the trees, and shoot off the ice at
 * the bottom into the sea. The plan asks for the caterpillar's controls by
 * name, so that is what this is: one floating thumbstick, planted wherever the
 * finger lands, read against the camera.
 *
 * The Game owns the scene, the hill and everything on it. Fixed timestep at
 * SIM.step with the render interpolating between steps, the same as the other
 * games here.
 */
export class Game {
  readonly stage: Stage;
  readonly hill: Hill;
  readonly penguin: Penguin;
  readonly props: Props;
  readonly fish: Fish;
  readonly snowfall: Snowfall;
  readonly sky: Sky;
  readonly finish: Finish;
  readonly spray: ParticleBurst;
  readonly sparks: ParticleBurst;
  readonly wind: Wind;
  readonly bumpSounds: Bumps;
  readonly hud: Hud;
  readonly stick: Joystick;
  readonly loop: GameLoop;

  /** update() does nothing unless this is set, so a card can hold the game
   *  still while the mountain is already being drawn behind it. */
  running = false;

  /**
   * Where the run has got to.
   *
   * "flying" is the second and a half off the end of the ice, when the
   * controls are gone and only gravity is still working; "splashed" is the
   * pause after it, before the card.
   */
  private phase: "sliding" | "flying" | "splashed" = "sliding";
  private splashLeft = 0;

  private readonly intro: Overlay;
  private readonly done: Overlay;

  /** Seconds since the run began, and how many fish in a row have gone down —
   *  the chirp rises through a run of them, and this is the run. */
  private time = 0;
  private streak = 0;
  private streakLeft = 0;
  /** Seconds until the next puff of snow off the belly. */
  private sprayIn = 0;
  /** How many trees have been hit and how many snowmen have gone flying,
   *  purely so the finish card can mention them. */
  private bumps = 0;
  private snowmen = 0;
  /** Whether the line has been crossed, and how long until the next firework.
   *  See cheerFireworks. */
  private crossed = false;
  private burstIn = 0;

  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly want = new THREE.Vector3();
  private readonly beak = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private readonly wantEye = new THREE.Vector3();
  private readonly smoothLook = new THREE.Vector3();
  private readonly weather = new THREE.Vector3();
  private readonly puffAt = new THREE.Vector3();

  /**
   * The bearing the camera is using, which lags the penguin's own — and the
   * bearing the stick is read against, which is the camera's.
   *
   * Kept as two names rather than one because the caterpillar's rig taught the
   * lesson the hard way: while the player is steering, reading the stick
   * against a camera that is still swinging means the swing itself steers you.
   */
  private camYaw = Math.PI;
  private inputYaw = Math.PI;

  constructor(host: HTMLElement, ui: HTMLElement) {
    // Seeded, so the course is the same course every time. A child who learns
    // the line through the trees should find that line there tomorrow.
    const rng = new Rng(PROPS.seed);

    this.stage = new Stage(host);
    this.hill = new Hill();
    this.penguin = new Penguin();
    this.props = new Props(rng, this.hill);
    this.fish = new Fish(rng, this.hill);
    this.snowfall = new Snowfall(rng);
    this.sky = new Sky(rng);
    this.finish = new Finish(rng, this.hill);
    // A smaller mote than the other games use. At half a unit the snow off the
    // belly came up in lumps the size of the penguin's head.
    this.spray = new ParticleBurst(340, 0.28, false);
    this.sparks = createFireworks();

    this.stage.scene.add(this.sky.group);
    this.stage.scene.add(this.hill.group);
    this.stage.scene.add(this.props.group);
    this.stage.scene.add(this.fish.mesh);
    this.stage.scene.add(this.finish.group);
    this.stage.scene.add(this.penguin.group);
    this.stage.scene.add(this.spray.mesh);
    this.stage.scene.add(this.sparks.mesh);
    this.stage.scene.add(this.snowfall.points);

    this.penguin.place(this.hill, this.hill.laneAt(-20), -20);

    this.wind = new Wind();
    this.bumpSounds = new Bumps();
    this.hud = new Hud();
    this.hud.mount(ui);
    this.stick = new Joystick(ui);
    this.stick.enabled = false;

    this.intro = new Overlay(
      ui,
      "Penguin",
      "You are a penguin at the top of a snowy mountain, and the quickest way down is on your tummy. Drag anywhere on the screen to steer: push the way you want to go. Point straight down the hill to go fast, and turn across it to slow down — that is how anybody stops on snow. Watch out for the frozen lakes: once you are on one you cannot steer at all, so point yourself the right way before you get there. Scoop up the fish as you pass them, go round the trees, and follow the red and blue flags all the way to the bottom, where the ice runs out and you can jump straight into the sea.",
      "Off we go",
      () => this.begin(),
    );
    this.done = new Overlay(ui, "Splash!", "", "Go again", () =>
      window.location.reload(),
    );
    this.done.hide();

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
      onToggle: muted => {
        this.wind.setMuted(muted);
        this.bumpSounds.setMuted(muted);
      },
      className: "ui-interactive",
    });
    corner.appendChild(sound.root);
    ui.appendChild(corner);

    // Everything off on the way out. The gallery is one tap away and these
    // games are pages rather than tabs: a page that keeps blowing a gale
    // behind the one a child has moved on to is a bug the caterpillar game
    // had once already, and it is worth not having twice.
    window.addEventListener("pagehide", () => {
      this.wind.stop();
      this.bumpSounds.stop();
    });

    this.snapCamera();
    this.loop = new GameLoop(this.update, this.render);
    this.loop.start();
  }

  private begin(): void {
    this.intro.hide();
    this.stick.enabled = true;
    this.running = true;
    // A shove off the top, so the first second is a slide and not a wait for
    // gravity to get round to it.
    this.penguin.speed = SLIDE.push;
    // Here and not in the constructor: a browser will not start an audio
    // context outside a real gesture, and the button that got us here is one.
    this.wind.start();
  }

  update = (dt: number): void => {
    if (!this.running) {
      return;
    }
    this.time += dt;

    if (this.phase === "splashed") {
      this.splashLeft -= dt;
      this.cheerFireworks(dt);
      // Bobbing, so it is floating rather than standing on the sea.
      this.penguin.prevPosition.copy(this.penguin.position);
      this.penguin.position.y =
        this.hill.seaLevel +
        FINISH.float +
        Math.sin(this.time * 2.2) * FINISH.bob;
      this.penguin.render(1);
      this.finish.update(dt);
      this.spray.update(dt);
      this.sparks.update(dt);
      if (this.splashLeft <= 0) {
        this.showDone();
      }
      return;
    }

    if (this.phase === "flying") {
      this.fly(dt);
      this.cheerFireworks(dt);
      this.finish.update(dt);
      this.spray.update(dt);
      this.sparks.update(dt);
      return;
    }

    // What the stick is asking for, read in the camera's frame: push it the
    // way you want to go on screen and that is the way the penguin goes. The
    // caterpillar's arrangement, and the only one that needs no explaining.
    this.forward.set(Math.sin(this.inputYaw), 0, Math.cos(this.inputYaw));
    this.right.set(-Math.cos(this.inputYaw), 0, Math.sin(this.inputYaw));
    this.want
      .copy(this.forward)
      .multiplyScalar(-this.stick.y)
      .addScaledVector(this.right, this.stick.x)
      .multiplyScalar(this.stick.magnitude);

    const landed = this.penguin.update(dt, this.want, this.hill);
    if (landed && this.penguin.speed > 8) {
      this.wind.land();
      this.puff(18, 9);
    }

    this.keepOnTheMountain();
    this.bump();
    this.collect(dt);
    this.throwSnow(dt);

    this.fish.update(dt, this.beak);
    this.finish.update(dt);
    this.spray.update(dt);
    this.sparks.update(dt);
    this.wind.update(dt, this.penguin.speed);

    // Off the end of the ice. Not a wall and not a stop: the run simply keeps
    // going until there is no more mountain under it.
    if (this.penguin.position.z < this.hill.bannerZ) {
      this.cross();
    }
    if (this.penguin.position.z < this.hill.edgeZ) {
      this.leap();
    }

    this.hud.update(this.penguin.along(this.hill), this.fish.eaten);
  };

  /**
   * Keeps the penguin on the map.
   *
   * The banks do nearly all of this on their own — ride up one and gravity
   * brings you back down, which is a boundary nobody has to be told about.
   * This is only the backstop at the very edge of the built ground, where the
   * alternative is sliding off into space.
   */
  private keepOnTheMountain(): void {
    const edge = HILL.halfWidth - 14;
    if (Math.abs(this.penguin.position.x) > edge) {
      this.penguin.position.x = Math.sign(this.penguin.position.x) * edge;
      this.penguin.speed *= 0.9;
    }
    // And the top. Going back up the hill is allowed and gravity punishes it
    // on its own, but the mesh has to end somewhere.
    if (this.penguin.position.z > 20) {
      this.penguin.position.z = 20;
      this.penguin.speed = 0;
    }
  }

  /**
   * Trees, rocks and snowmen.
   *
   * A tree stops you. A snowman does not: you go straight through it and it
   * comes apart, which is the one thing on this hill that rewards aiming at
   * something instead of away from it. It costs a little speed, so bursting
   * every snowman on the mountain is a choice and not a free lunch.
   */
  private bump(): void {
    if (this.penguin.shake > 0 || !this.penguin.grounded) {
      return;
    }
    const hit = this.props.hit(
      this.penguin.position.x,
      this.penguin.position.z,
      2.2,
    );
    if (!hit) {
      return;
    }
    if (hit.kind === "snowman") {
      this.burstSnowman(hit);
      return;
    }
    this.penguin.bump(hit.x, hit.z, hit.radius + 2.2, this.hill);
    this.bumps++;
    this.bumpSounds.play();
    this.puff(26, 11);
  }

  /**
   * A snowman going everywhere.
   *
   * Three bursts, because a snowman is three things: the snow it is made of,
   * the carrot, and the scarf. Thrown up and out with enough lift that the
   * pieces arc rather than skid, and big enough that they read as lumps of a
   * snowman rather than as more weather.
   */
  private burstSnowman(o: Obstacle): void {
    this.props.remove(o);
    this.snowmen++;
    this.wind.poof();
    this.penguin.speed *= 0.88;

    this.puffAt.set(o.x, this.hill.heightAt(o.x, o.z) + 2.6 * o.scale, o.z);
    this.spray.burst(this.puffAt, {
      color: [0xffffff, 0xf1f8ff, 0xd8e9f6],
      count: 46,
      speed: 26,
      lift: 12,
      gravity: 42,
      ttl: 1.4,
      size: 2.6 * o.scale,
      spherical: 0.85,
    });
    this.spray.burst(this.puffAt, {
      color: [PALETTE.beak],
      count: 4,
      speed: 20,
      lift: 14,
      gravity: 40,
      ttl: 1.4,
      size: 1.5,
      spherical: 1,
    });
    this.spray.burst(this.puffAt, {
      color: [PALETTE.scarf, 0x1b2129],
      count: 10,
      speed: 17,
      lift: 10,
      gravity: 38,
      ttl: 1.5,
      size: 1.6,
      spherical: 1,
    });
  }

  /** Fish. */
  private collect(dt: number): void {
    this.penguin.beak(this.beak);
    this.streakLeft = Math.max(0, this.streakLeft - dt);
    if (this.streakLeft === 0) {
      this.streak = 0;
    }
    const taken = this.fish.update(dt, this.beak);
    for (let i = 0; i < taken; i++) {
      this.wind.chirp(this.streak);
      this.streak++;
      this.streakLeft = 1.6;
    }
    if (taken > 0) {
      this.puffAt.copy(this.beak);
      this.spray.burst(this.puffAt, {
        color: [0xffffff, 0xcfe6f5, 0xa9c4d6],
        count: 10,
        speed: 9,
        lift: 3,
        gravity: 26,
        ttl: 0.5,
        size: 0.7,
        spherical: 1,
      });
    }
  }

  /**
   * The rooster tail off the side of the belly.
   *
   * Only when it is actually scraping: a penguin pointing straight down the
   * fall line is not throwing any snow, and one that did would look like it
   * was on fire. Rate-limited rather than emitted every step, because at sixty
   * steps a second a burst a step empties a three-hundred mote pool in five.
   */
  private throwSnow(dt: number): void {
    this.sprayIn -= dt;
    if (
      !this.penguin.grounded ||
      this.penguin.shake > 0 ||
      this.penguin.carve < 0.25 ||
      this.penguin.speed < 12 ||
      // Nothing to throw up off a frozen lake.
      this.penguin.ice > 0.5 ||
      this.sprayIn > 0
    ) {
      return;
    }
    this.sprayIn = 0.055;
    this.puff(10 + this.penguin.speed * 0.25, 4 + this.penguin.carve * 4);
  }

  /** A handful of snow thrown up from under the belly. */
  private puff(speed: number, count: number): void {
    this.puffAt
      .copy(this.penguin.position)
      .addScaledVector(
        this.forward.set(
          Math.sin(this.penguin.heading),
          0,
          Math.cos(this.penguin.heading),
        ),
        -2.4,
      );
    this.puffAt.y -= 0.6;
    this.spray.burst(this.puffAt, {
      color: [0xffffff, 0xeaf4fb, 0xd3e4f2],
      count: Math.round(count),
      speed,
      lift: 2.5,
      gravity: 34,
      ttl: 0.65,
      size: 0.9,
      spherical: 0.4,
    });
  }

  /**
   * Over the line: the crowd starts jumping and the sky starts going off.
   *
   * Only once, however many steps the penguin spends past the banner.
   */
  private cross(): void {
    this.finish.cheer();
    if (this.crossed) {
      return;
    }
    this.crossed = true;
    this.burstIn = 0;
  }

  /**
   * The fireworks over the finish, the bee game's ones.
   *
   * Launched round the banner rather than round the penguin: they are for
   * arriving, and a firework going off in your face on the way past is a
   * different feeling altogether.
   */
  private cheerFireworks(dt: number): void {
    if (!this.crossed) {
      return;
    }
    this.burstIn -= dt;
    if (this.burstIn > 0) {
      return;
    }
    this.burstIn = FINISH.every;
    // Round the penguin, low over the water.
    //
    // Twice moved. Over the banner they all went off behind the camera, since
    // the bird is past the line before the first one lights. Out over the sea
    // at forty-odd units up they went off above the top of the screen, because
    // the shot tilts down to watch the splash. Where the bird is and barely
    // higher is the only place that is reliably in frame in both phases.
    const p = this.penguin.position;
    this.puffAt.set(
      p.x + (Math.random() - 0.5) * FINISH.spread * 2,
      this.hill.seaLevel + 4 + Math.random() * 24,
      p.z - 30 + Math.random() * 60,
    );
    this.sparks.burst(this.puffAt, {
      color: FIREWORK_PALETTE,
      count: 30,
      // Bigger and faster than the bee game's, which are the same motes: a bee
      // is one unit long and a penguin is six, so a burst sized for the one is
      // confetti round the other.
      speed: 24,
      lift: 1.5,
      gravity: 8,
      ttl: 1.6,
      size: 4,
      spherical: 1,
    });
  }

  /** Off the edge of the ice, with the controls taken away. */
  private leap(): void {
    this.phase = "flying";
    this.stick.enabled = false;
    this.stick.release();
    this.penguin.speed *= FINISH.launch;
    this.penguin.grounded = false;
    this.hud.setVisible(false);
  }

  /**
   * The arc into the sea.
   *
   * Its own little integrator rather than the penguin's: out here there is no
   * hill to ask about the ground, no steering and no friction, and running the
   * ordinary step with all three of those switched off would be more code than
   * the four lines it replaces.
   */
  private fly(dt: number): void {
    this.penguin.prevPosition.copy(this.penguin.position);
    this.penguin.position.x +=
      Math.sin(this.penguin.heading) * this.penguin.speed * dt;
    this.penguin.position.z +=
      Math.cos(this.penguin.heading) * this.penguin.speed * dt;
    this.penguin.vy -= FINISH.gravity * dt;
    this.penguin.position.y += this.penguin.vy * dt;
    this.wind.update(dt, this.penguin.speed);

    if (this.penguin.position.y <= this.hill.seaLevel) {
      this.splash();
    }
  }

  private splash(): void {
    this.phase = "splashed";
    this.splashLeft = FINISH.linger;
    // Left at the sea's own level the bird went in and stayed in — a penguin
    // sunk to the eyes in a blue plane, which is not what anybody wants to see
    // at the end of a run down a mountain. It comes back up instead, chest out
    // of the water like the ones already swimming there.
    this.penguin.position.y = this.hill.seaLevel + FINISH.float;
    this.penguin.prevPosition.copy(this.penguin.position);
    this.penguin.vy = 0;
    this.wind.splash();
    // Two bursts: a fast flat one that is the sheet of water going sideways,
    // and a slower tall one that is the column coming back down. One burst
    // does either but never both, and a splash without the column is a puff.
    this.puffAt.copy(this.penguin.position);
    this.spray.burst(this.puffAt, {
      color: [0xffffff, 0xd8eefa, 0x9fd3ea],
      count: 60,
      speed: 34,
      lift: 2,
      gravity: 48,
      ttl: 1.1,
      size: 0.85,
      spherical: 0.25,
    });
    this.spray.burst(this.puffAt, {
      color: [0xffffff, 0xeaf6ff],
      count: 40,
      speed: 12,
      lift: 26,
      gravity: 44,
      ttl: 1.5,
      size: 0.8,
      spherical: 0.5,
    });
  }

  private showDone(): void {
    this.running = false;
    const fish = this.fish.eaten;
    const most = fish === this.fish.total;
    // Three things it might say, in the order they are worth saying. Every
    // fish is the big one; a clean run is the next; and otherwise it is the
    // count and how many are still up there, which is the invitation.
    const snowmen =
      this.snowmen > 0
        ? ` You went straight through ${this.snowmen} ${
            this.snowmen === 1 ? "snowman" : "snowmen"
          }.`
        : "";
    this.done.setBody(
      most
        ? `Every single fish on the mountain — all ${fish} of them.${snowmen}`
        : `You brought ${fish} ${fish === 1 ? "fish" : "fish"} down the hill${
            this.bumps === 0 ? ", and you never once hit a tree" : ""
          }. There are ${this.fish.total} on the mountain altogether, if you fancy another go.${snowmen}`,
    );
    this.done.show();
  }

  render = (alpha: number, dt: number): void => {
    this.penguin.render(alpha);
    this.followCamera(dt, alpha);
    // Anything standing between the shot and the bird goes see-through. On a
    // mountain this thick with trees, without it the one thing you are
    // steering spends half the run behind a trunk.
    this.props.setFadeFocus(
      this.stage.camera.position,
      this.penguin.group.position,
    );

    // The weather sits a little ahead of the lens rather than around it: half
    // a box of snow behind the camera is half a box nobody sees.
    this.weather
      .copy(this.stage.camera.position)
      .addScaledVector(
        this.look
          .subVectors(this.smoothLook, this.stage.camera.position)
          .normalize(),
        40,
      );
    this.snowfall.update(dt, this.weather);
    this.sky.update(this.stage.camera.position);
    this.stage.followSun(this.penguin.group.position);
    this.stage.render();
  };

  /**
   * The shot: behind the penguin, low, looking down the hill past it.
   *
   * Two easings and a follow. The eye and the look-at point are both chased
   * rather than snapped, which is what stops a bump in the snow from becoming
   * a bump in the camera; the follow — which way the shot is pointing — is the
   * caterpillar's, dead zone and all. See followYaw.
   */
  private followCamera(dt: number, alpha: number): void {
    const p = this.penguin.group.position;
    this.followYaw(dt);
    this.inputYaw = this.camYaw;

    const fast = Math.min(1, this.penguin.speed / (SLIDE.gravity / SLIDE.drag));
    const back = CAMERA.distance + fast * CAMERA.speedPull;

    this.wantEye.set(
      p.x - Math.sin(this.camYaw) * back,
      p.y + CAMERA.height,
      p.z - Math.cos(this.camYaw) * back,
    );
    // Never underground. On a steep bank the shot sits below the snow and the
    // whole screen goes white — this lifts it out, which is cheaper than any
    // scheme that tries to swing round the hill instead.
    //
    // Off the end of the ice there is no hill to be under, and asking the
    // height function anyway is asking what the mountain would have been out
    // here: it answers with the shelf carried on into open water, and the shot
    // was shoved up into the back of the cliff for the whole splash.
    const floor =
      this.phase === "sliding"
        ? this.hill.heightAt(this.wantEye.x, this.wantEye.z) + 5
        : this.hill.seaLevel + 10;
    if (this.wantEye.y < floor) {
      this.wantEye.y = floor;
    }

    const eyeEase = 1 - Math.exp(-CAMERA.easeEye * dt);
    this.stage.camera.position.lerp(this.wantEye, eyeEase);

    // Looking down the hill past the bird, not at it. Most of the screen
    // should be the thing you are about to hit — until the ice runs out, when
    // there is nothing ahead worth looking at and the bird is the whole show.
    const ahead = this.phase === "sliding" ? CAMERA.lookAhead : 0;
    this.look.set(
      p.x + Math.sin(this.camYaw) * ahead,
      p.y + 2,
      p.z + Math.cos(this.camYaw) * ahead,
    );
    const lookEase = 1 - Math.exp(-CAMERA.easeLook * dt);
    this.smoothLook.lerp(this.look, lookEase);
    this.stage.camera.lookAt(this.smoothLook);
    void alpha;
  }

  /**
   * Drifts the shot round behind the penguin. Lifted from the caterpillar's
   * rig, which had already worked out that this is two problems.
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
    const diff = shortestAngle(this.camYaw, this.penguin.heading);
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
    this.camYaw = this.penguin.heading;
    this.inputYaw = this.camYaw;
    const p = this.penguin.position;
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
    this.penguin.render(1);
    this.stage.followSun(p);
    this.sky.update(this.stage.camera.position);
    this.snowfall.update(SIM.step, this.stage.camera.position);
    this.hud.update(0, 0);
  }
}
