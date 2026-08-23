import * as THREE from "three";
import {CAMERA, CONTROL, FEEL, LANDING, SIM, WORLD} from "./config";
import {GameLoop} from "./core/loop";
import {Joystick} from "./core/input";
import {Rng} from "./core/rng";
import {Stage} from "./render/stage";
import {Terrain} from "./entities/terrain";
import {Squirrel} from "./entities/squirrel";
import {Gates} from "./entities/gates";
import {Nuts} from "./entities/nuts";
import {Streaks} from "./entities/streaks";
import {Wind} from "./core/audio";
import {Hud} from "./ui/hud";
import {Overlay} from "./ui/overlays";
import {SoundButton} from "../../shared/soundButton";

/**
 * Squirrel Glider.
 *
 * You start on a cliff and you glide. There is no engine: the whole flight is
 * spending the height the cliff gave you, and the only question is how far
 * down the valley you can make it go and how many arches you can thread on the
 * way. Landing ends it, gently — see `land`.
 *
 * The Game owns the scene, the squirrel, the valley and the arches. Fixed
 * timestep at SIM.step with the render interpolating between steps, the same
 * as the other two games here.
 */
export class Game {
  readonly stage: Stage;
  readonly terrain: Terrain;
  readonly squirrel: Squirrel;
  readonly gates: Gates;
  readonly nuts: Nuts;
  readonly streaks: Streaks;
  readonly wind: Wind;
  readonly hud: Hud;
  readonly stick: Joystick;
  readonly loop: GameLoop;

  /** update() does nothing unless this is set, so the intro can hold the game
   *  still while the scene is already being drawn behind it. */
  running = false;

  private readonly intro: Overlay;
  private readonly done: Overlay;
  /** Seconds since it touched down, or null while it is still flying. */
  private runOut: number | null = null;
  /** The 'tap to jump' line, up while it is still on the ledge. */
  private readonly prompt: HTMLDivElement;

  private readonly dir = new THREE.Vector3();
  private readonly wantEye = new THREE.Vector3();
  private readonly lookAt = new THREE.Vector3();
  private readonly smoothedLook = new THREE.Vector3();
  private readonly from = new THREE.Vector3();
  private shakeClock = 0;
  /** The heading and climb the *camera* is using, which lag the squirrel's.
   *  See followCamera. */
  private camHeading = Math.PI;
  private camGamma = 0;

  constructor(host: HTMLElement, ui: HTMLElement) {
    const rng = new Rng(20260823);

    this.stage = new Stage(host);
    this.terrain = new Terrain(rng);
    this.gates = new Gates(
      rng,
      z => this.terrain.glidePathAt(z),
      z => this.terrain.wallAt(z),
      z => this.terrain.ribbonAt(z),
      this.terrain.reach,
    );
    this.nuts = new Nuts(
      rng,
      z => this.terrain.glidePathAt(z),
      z => this.terrain.wallAt(z),
      z => this.terrain.ribbonAt(z),
      this.terrain.reach,
    );
    this.squirrel = new Squirrel();
    this.streaks = new Streaks(rng);
    this.wind = new Wind();

    this.stage.scene.add(this.terrain.group);
    this.stage.scene.add(this.gates.group);
    this.stage.scene.add(this.nuts.group);
    this.stage.scene.add(this.squirrel.group);
    this.stage.scene.add(this.streaks.group);

    // On the lip of the cliff, facing down the valley.
    this.squirrel.place(new THREE.Vector3(0, WORLD.cliffHeight + 2.5, -2));

    this.hud = new Hud();
    this.hud.mount(ui);
    this.stick = new Joystick(ui);
    this.stick.enabled = false;

    this.intro = new Overlay(
      ui,
      "Squirrel Glider",
      "You are a flying squirrel on the edge of a huge cliff. Tap to jump off, then drag to fly. Drag up and you tip your nose down and dive, fast. Drag down and you throw your belly out into the wind and slow right down. Drag left or right to lean into a turn. Follow the floating acorns — they lead you through every glowing arch.",
      "Ready",
      () => this.begin(),
    );
    this.done = new Overlay(ui, "You landed!", "", "Go again", () =>
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
      onToggle: muted => this.wind.setMuted(muted),
      className: "ui-interactive",
    });
    corner.appendChild(sound.root);
    ui.appendChild(corner);

    // Standing on the ledge with one thing to do. Its own line rather than
    // words on the card, because it has to still be there once the card has
    // gone — the whole point is that the squirrel is stood on the edge waiting
    // for the player to decide to jump.
    this.prompt = document.createElement("div");
    this.prompt.className = "prompt hidden";
    this.prompt.textContent = "Tap to jump!";
    ui.appendChild(this.prompt);

    // Everything off on the way out. The gallery is one tap away and these
    // games are pages rather than tabs: a page that keeps howling behind the
    // one a child has moved on to is a bug the caterpillar game had once
    // already, and it is worth not having twice.
    window.addEventListener("pagehide", () => this.wind.stop());

    this.snapCamera();
    this.loop = new GameLoop(this.update, this.render);
    this.loop.start();
  }

  private begin(): void {
    this.intro.hide();
    this.stick.enabled = true;
    this.running = true;

    // The leap. The plan asks for a tap or the space bar, and this is the one
    // moment in the game where any touch at all counts: a child on the ledge
    // has one thing to do, and hunting for a button to do it with would be a
    // strange way to start a game about jumping off a cliff.
    this.prompt.classList.remove("hidden");
    const leap = (): void => {
      if (this.squirrel.perched) {
        this.squirrel.jump();
        this.prompt.classList.add("hidden");
        // Here and not in the constructor: a browser will not start an audio
        // context outside a real gesture, and this is the gesture.
        this.wind.start();
      }
    };
    window.addEventListener("pointerdown", leap);
    window.addEventListener("keydown", event => {
      if (event.key === " ") {
        leap();
      }
    });
  }

  update = (dt: number): void => {
    if (!this.running) {
      return;
    }

    // The run-out after touchdown: the squirrel is down and sliding, and the
    // card waits until it has stopped. Landing is the end of the flight, not
    // the end of the moment.
    if (this.runOut !== null) {
      this.runOut += dt;
      if (this.runOut > LANDING.runOut) {
        this.runOut = null;
        this.showCard();
      }
      return;
    }

    // The stick, straight through: x banks, y works the membrane. No camera
    // projection — unlike the crawling game the shot is always behind the
    // animal, so screen-right and its own right are the same thing.
    //
    // Not negated, and the plan is exact about why: the stick reads positive
    // when it is pulled *back*, and pulling back is what raises the head and
    // slows it down. Pushing forward points the head at the ground and lets it
    // run. That is also which way round a real one works.
    this.dir.set(
      expo(this.stick.x, CONTROL.bankExpo),
      expo(this.stick.y, CONTROL.pitchExpo),
      0,
    );

    this.from.copy(this.squirrel.position);
    this.squirrel.update(dt, this.dir);
    this.gates.check(this.from, this.squirrel.position);
    this.nuts.check(this.from, this.squirrel.position);
    this.nuts.update(dt);

    // Nothing to land on until it has left the ledge.
    if (this.squirrel.perched) {
      return;
    }

    this.hitWall();

    const floor = this.terrain.groundAt();
    if (this.squirrel.position.y <= floor + LANDING.height) {
      this.land(floor);
    }
  };

  /**
   * Into the side of the valley.
   *
   * Gently, because nothing in this game is allowed to end a flight by
   * surprise: the squirrel is held off the rock, turned back toward the middle
   * and loses some of its speed to the scrape. That is a real cost — speed is
   * the whole currency of a glide — without being a wall that kills you.
   *
   * The wall is where Terrain says it is, so the thing being drawn and the
   * thing being hit cannot drift apart.
   */
  private hitWall(): void {
    const s = this.squirrel;
    const wall = this.terrain.wallAt(s.position.z) - WORLD.wallClearance;
    if (Math.abs(s.position.x) < wall) {
      return;
    }
    const side = Math.sign(s.position.x);
    s.position.x = side * wall;
    s.speed *= WORLD.wallScrub;
    // Turned back in by a fixed amount rather than reflected: a bounce off a
    // wall at sixty units a second would spin a child round to face the way
    // they came, which is far worse than being nudged straight.
    s.heading += -side * WORLD.wallTurn;
  }

  /**
   * Down.
   *
   * Gently either way: a fast arrival is a tumble and a slow one is a slide,
   * and neither is a failure. There is nothing to lose in this game — the only
   * score is how far you got and how many arches you took, both of which are
   * already yours by the time you touch the ground.
   */
  private land(floor: number): void {
    this.squirrel.position.y = floor + LANDING.height;
    this.squirrel.landed = true;
    this.stick.enabled = false;
    this.stick.release();
    this.runOut = 0;
  }

  /**
   * What you did, in a sentence a child can read.
   *
   * The distance is given as a fraction of the valley rather than as a number
   * of units, because "1393" means nothing to anybody: what a player wants to
   * know is whether they got to the end, and the end is Terrain.reach — as far
   * as this squirrel can fly.
   */
  private showCard(): void {
    this.hud.setVisible(false);
    const along = this.terrain.progressAt(this.squirrel.position.z);
    const arches = this.gates.passed;
    const nuts = this.nuts.eaten;
    const everything = arches === this.gates.total && nuts === this.nuts.total;
    const far =
      along > 0.97
        ? "You flew the whole valley, right to the end of it."
        : along > 0.7
          ? "You got most of the way down the valley."
          : "You came down early — there is a lot more valley out there.";

    this.done.setBody(
      everything
        ? `Every single arch — all ${this.gates.total} of them — and every last acorn. ${far} There is nothing left out there to catch.`
        : `${far} You flew through ${arches} of the ${this.gates.total} arches and caught ${nuts} of the ${this.nuts.total} acorns. Follow the acorns and they will take you through all of them. Drag down to slow yourself and line up a tricky arch; drag up to dive and go fast. Let go and you will glide the furthest of all.`,
    );
    this.done.show();
  }

  render = (alpha: number): void => {
    this.squirrel.render(alpha);
    this.followCamera(SIM.step);
    const s = this.squirrel;
    this.streaks.update(s.group.position, s.heading, s.gamma, s.speed);
    this.wind.update(SIM.step, this.run());
    this.hud.update(
      this.terrain.progressAt(this.squirrel.position.z),
      this.nuts.eaten,
      this.gates.passed,
      this.squirrel.speed,
      this.squirrel.position.y - this.terrain.groundAt(),
    );
    this.stage.render();
  };

  /**
   * Behind and a little above, looking down the valley ahead of the squirrel.
   *
   * Deliberately loose. A camera pinned to the animal turns when it turns and
   * the world swings instead, which reads as the wood spinning rather than the
   * squirrel banking — letting it lag means a hard turn throws the squirrel
   * across the frame first and the shot follows it round, which is most of
   * what makes a glide feel quick.
   */
  private followCamera(dt: number): void {
    const s = this.squirrel;
    const fast = this.run();
    const distance = CAMERA.distance + fast * CAMERA.speedPullback;

    // The looseness is in which way the camera is pointing, not in how far
    // back it is.
    //
    // It used to be both — the eye chased a wanted point with a soft lerp —
    // and at these speeds that does not work: a camera that closes five per
    // cent of the gap each frame while the squirrel covers most of a unit sits
    // permanently behind, and it was measured at a hundred units back on a
    // shot asked to be eleven. Everything the game had just been given to make
    // it feel fast was being watched through the wrong end of a telescope.
    //
    // So the eye is placed exactly, off a heading that lags. A turn still
    // throws the squirrel across the frame before the shot comes round after
    // it, which is the part that was worth having, and the distance is now the
    // distance.
    let swing = s.heading - this.camHeading;
    swing = Math.atan2(Math.sin(swing), Math.cos(swing));
    this.camHeading += swing * (1 - Math.exp(-CAMERA.lerp * dt));
    this.camGamma +=
      (s.gamma - this.camGamma) * (1 - Math.exp(-CAMERA.lerp * dt));

    // Behind along the path rather than behind along the ground: in a dive the
    // shot belongs above and behind, looking down the way the squirrel is
    // going, not level with it.
    const climb = Math.sin(this.camGamma) * CAMERA.pathFollow;
    const flat = Math.cos(Math.asin(climb));
    const backX = -Math.sin(this.camHeading) * flat;
    const backZ = -Math.cos(this.camHeading) * flat;
    this.wantEye.set(
      s.position.x + backX * distance,
      s.position.y + CAMERA.height - climb * distance,
      s.position.z + backZ * distance,
    );
    this.stage.camera.position.copy(this.wantEye);

    // Aimed ahead of it rather than at it, so the shot is mostly the valley
    // it is flying into instead of the ground it is falling toward — and aimed
    // along the *path*, not at a fixed slope. Looking ten degrees down out of
    // a fifty-degree dive put the ground rushing up below the bottom of the
    // screen, which is the one shot the whole game is for.
    // Forward is (sin, cos) of the heading — the same pair the squirrel moves
    // along, and worth writing that way rather than as the negation of the
    // vector that points backwards. Written as the negation it was wrong, and
    // the camera spent an afternoon aimed up the valley at the cliff.
    this.lookAt.set(
      s.position.x + Math.sin(s.heading) * CAMERA.lookAhead * flat,
      s.position.y + CAMERA.lookAhead * climb,
      s.position.z + Math.cos(s.heading) * CAMERA.lookAhead * flat,
    );
    this.smoothedLook.lerp(this.lookAt, 1 - Math.exp(-CAMERA.lookLerp * dt));
    this.stage.camera.lookAt(this.smoothedLook);

    // The lens opens as it runs. See CAMERA.fovFast: this is most of what
    // makes ninety units a second feel like ninety units a second, because the
    // widening is felt at the edges of the frame where the rock is.
    const open = CAMERA.fovSlow + fast * (CAMERA.fovFast - CAMERA.fovSlow);
    const camera = this.stage.camera;
    camera.fov += (open - camera.fov) * (1 - Math.exp(-CAMERA.fovRate * dt));
    camera.updateProjectionMatrix();

    // A trembling lens, and it is worth the two lines. Flying low feels fast
    // and flying high feels slow — the eye reads speed in eye-heights a second
    // rather than in units — so the shake carries a term for how close the
    // ground is as well as one for how fast the squirrel is going. Squared, so
    // gentle flying is perfectly steady and only a real dive is felt.
    const low =
      1 -
      Math.min(1, (s.position.y - this.terrain.groundAt()) / CAMERA.shakeFrom);
    const trauma = Math.min(1, fast + low * CAMERA.shakeLow);
    const shake = trauma * trauma * CAMERA.shake;
    if (shake > 0.0001) {
      this.shakeClock += dt;
      camera.position.x += Math.sin(this.shakeClock * 37.1) * shake;
      camera.position.y += Math.sin(this.shakeClock * 51.7) * shake;
    }
  }

  /**
   * How hard it is running, 0 at an easy glide and 1 flat out. See FEEL: the
   * one number every cue in the game takes its reading from.
   */
  private run(): number {
    return Math.min(
      1,
      Math.max(0, (this.squirrel.speed - FEEL.slow) / (FEEL.fast - FEEL.slow)),
    );
  }

  /** Puts the camera where it belongs before the first frame is drawn. */
  private snapCamera(): void {
    for (let i = 0; i < 60; i++) {
      this.followCamera(SIM.step);
    }
  }
}

/**
 * The expo curve: gentle in the middle of the stick, full at the ends. See
 * CONTROL, which is where the reasoning lives.
 */
function expo(v: number, power: number): number {
  return Math.sign(v) * Math.pow(Math.abs(v), power);
}
