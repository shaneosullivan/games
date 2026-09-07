import * as THREE from "three";
import {CAMERA, CAR, PLAYER, RIVALS, SCENERY, SKID, TRACK} from "./config";
import {TrackSpec} from "./track/spec";
import {Patches} from "./entities/patches";
import {GameLoop} from "./core/loop";
import {Joystick} from "./core/input";
import {Rng} from "./core/rng";
import {Engine} from "./core/audio";
import {Stage} from "./render/stage";
import {Track, wrap} from "./entities/track";
import {Car, Drive} from "./entities/car";
import {Rivals} from "./entities/rivals";
import {Skids} from "./entities/skids";
import {Scenery} from "./entities/scenery";
import {Hud, ordinal} from "./ui/hud";
import {Overlay} from "./ui/overlays";
import {SoundButton} from "../../shared/soundButton";

/**
 * Vroom.
 *
 * A car, a circuit and one lap. The plan asks for the Amiga game by name and
 * points at pictures of it, so this is what those pictures are: straight down
 * from above, flat colour, cars as sprites, kerbs and trees and a crowd.
 *
 * The controls are the caterpillar's, which the plan asks for by name — one
 * floating thumbstick, planted wherever the finger lands. Here it is the tiller
 * and the throttle at once, and because the shot never turns, the way you push
 * it *is* the way on the screen you want to go. Nothing to learn.
 *
 * The Game owns the scene and everything in it. Fixed timestep at SIM.step
 * with the render interpolating between steps, the same as the other games.
 */
export class Game {
  readonly stage: Stage;
  readonly track: Track;
  readonly car: Car;
  readonly rivals: Rivals;
  readonly skids: Skids;
  readonly patches: Patches;
  readonly engine: Engine;
  readonly hud: Hud;
  readonly stick: Joystick;
  readonly loop: GameLoop;

  /** update() does nothing unless this is set, so a card can hold the race
   *  still while the circuit is already being drawn behind it. */
  running = false;

  /** How far the player has come, in laps, and where they were last step. */
  private progress = 0;
  private lastT = 0;
  /** Over the line. */
  private finished = false;

  private readonly intro: Overlay;
  private readonly done: Overlay;

  /** Seconds since the flag dropped, and until the next mark is laid. */
  private time = 0;
  private skidIn = 0;
  /** How many times the barriers have been hit, for the finish card. */
  private knocks = 0;

  private readonly want = new THREE.Vector2();
  /** The two controls, held rather than made every step. */
  private readonly aimDrive: Drive = {kind: "aim", aim: this.want};
  private readonly keyDrive = {kind: "wheel" as const, steer: 0, throttle: 0};
  private readonly wheels = [new THREE.Vector2(), new THREE.Vector2()];
  private readonly eye = new THREE.Vector3();
  private readonly wantEye = new THREE.Vector3();
  private readonly here = new THREE.Vector3();

  constructor(
    host: HTMLElement,
    ui: HTMLElement,
    spec: TrackSpec,
    /** Back to the track list. The gallery's own home button is beside it and
     *  goes somewhere else entirely, so both are needed. */
    private readonly onExit: () => void,
    /** Another go on the same circuit. The shell throws this Game away and
     *  builds a fresh one, which is much less to get wrong than unwinding a
     *  finished race in place. */
    private readonly onAgain: () => void,
  ) {
    // Seeded, so the trees and the crowd are in the same places every time. A
    // driver who learns a corner by the tree beside it should find that tree
    // there tomorrow.
    const rng = new Rng(SCENERY.seed);

    this.track = new Track(spec);
    const palette = this.track.palette;
    this.stage = new Stage(host, palette);
    this.car = new Car(PLAYER.colour);
    this.rivals = new Rivals(this.track);
    this.skids = new Skids(palette);
    this.patches = new Patches(this.track, spec.items);

    this.stage.scene.add(this.track.group);
    this.stage.scene.add(new Scenery(rng, this.track, palette).group);
    this.stage.scene.add(this.patches.group);
    this.stage.scene.add(this.skids.mesh);
    this.stage.scene.add(this.rivals.group);
    this.stage.scene.add(this.car.group);

    this.gridUp();

    this.engine = new Engine();
    this.hud = new Hud();
    this.hud.mount(ui);
    this.stick = new Joystick(ui);
    this.stick.enabled = false;

    this.intro = new Overlay(
      ui,
      spec.name,
      "You are the red car, and you are starting at the back. Drag anywhere on the screen to drive: push the way you want to go, and push harder to go faster. Pull back against yourself to brake. On a computer the arrow keys steer left and right, and up and down are the pedals. Take a corner too fast and the back end will step out and leave black marks all over the road — that is the whole fun of it, and it is quicker than it looks if you can catch it. The grass will slow you down and the wall at the edge will not let you past. One lap.",
      "Lights out",
      () => this.begin(),
    );
    this.done = new Overlay(ui, "Chequered flag!", "", "Race again", () =>
      this.onAgain(),
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
    const tracks = document.createElement("button");
    tracks.className = "icon-button ui-interactive";
    tracks.type = "button";
    tracks.textContent = "🏁";
    tracks.title = "Choose a track";
    tracks.setAttribute("aria-label", "Choose a track");
    tracks.addEventListener("click", () => this.onExit());
    corner.appendChild(tracks);
    const sound = new SoundButton({
      onToggle: muted => this.engine.setMuted(muted),
      className: "ui-interactive",
    });
    corner.appendChild(sound.root);
    ui.appendChild(corner);

    // Everything off on the way out. The gallery is one tap away and these
    // games are pages rather than tabs: a page left revving behind the one a
    // child has moved on to is a bug the caterpillar game had once already.
    window.addEventListener("pagehide", () => this.engine.stop());

    this.snapCamera();
    this.loop = new GameLoop(this.update, this.render);
    this.loop.start();
  }

  /** Everybody on the grid: the rivals in front, the player at the back. */
  private gridUp(): void {
    const t = this.track.gridAt(RIVALS.count, PLAYER.offset, this.here);
    const d = this.track.tangentAt(t, this.eye);
    this.car.place(
      this.here.x,
      this.here.z,
      Math.atan2(d.x, d.z),
      Math.round(t * TRACK.segments),
      0,
    );
    this.lastT = t;
    this.progress = 0;
  }

  private begin(): void {
    this.intro.hide();
    this.stick.enabled = true;
    this.running = true;
    // Here and not in the constructor: a browser will not start an audio
    // context outside a real gesture, and the button that got us here is one.
    this.engine.start();
  }

  update = (dt: number): void => {
    if (!this.running || this.finished) {
      return;
    }
    this.time += dt;

    this.car.update(dt, this.controls(), this.track, this.patches);
    if (this.car.keepIn(this.track)) {
      this.knocks++;
      this.engine.bump();
    }
    this.rivals.update(dt, this.track, this.patches);

    this.layRubber(dt);
    this.skids.update(dt);
    this.lapCount();
    this.engine.update(dt, this.car.speed, this.car.slip, CAR.top);
    this.hud.update(Math.min(1, this.progress), this.place());
  };

  /**
   * Whichever control is actually being used.
   *
   * The stick goes straight through, and this is the one game in the repo that
   * needs no camera-relative arithmetic to do it: the shot looks down and never
   * turns, so screen right is world +X and screen down is world +Z, full stop.
   *
   * A keyboard is a different control and not a squarer stick — left and right
   * of the car's own nose — so it is handed over as one. A finger on the glass
   * always wins.
   */
  private controls(): Drive {
    if (this.stick.onKeys) {
      this.keyDrive.steer = this.stick.steer;
      this.keyDrive.throttle = this.stick.throttle;
      return this.keyDrive;
    }
    this.want.set(this.stick.x, this.stick.y);
    return this.aimDrive;
  }

  /**
   * Where the player is in the race.
   *
   * Straight off how far everybody has come. There is no lap logic to it
   * because there is only one lap — the plan asks for one and one is plenty
   * when a child is learning to hold a car sideways.
   */
  private place(): number {
    let ahead = 0;
    for (let i = 0; i < RIVALS.count; i++) {
      if (this.rivals.progress(i) > this.progress) {
        ahead++;
      }
    }
    return ahead + 1;
  }

  /**
   * The marks.
   *
   * Only while the back end is actually out — CAR.skidAt — and rate-limited,
   * because at sixty steps a second a mark a step would empty the pool in half
   * a lap. The mark is laid along the way the *tyre* is travelling rather than
   * the way the car is pointing, which is the whole difference between a skid
   * mark and a stripe: a sliding car leaves rubber pointing where it is going,
   * not where it is aimed.
   */
  private layRubber(dt: number): void {
    this.skidIn -= dt;
    if (this.car.slip < CAR.skidAt || this.skidIn > 0) {
      return;
    }
    this.skidIn = SKID.every;
    const travel = Math.atan2(this.car.velocity.x, this.car.velocity.y);
    const length = Math.max(SKID.width, this.car.speed * SKID.every * 2.2);
    this.car.wheels(SKID.gauge, this.wheels);
    for (const w of this.wheels) {
      this.skids.lay(w.x, w.y, travel, length);
    }
  }

  /**
   * How far round the lap, and whether that was the flag.
   *
   * The progress is accumulated rather than read off the curve, because the
   * curve's own parameter wraps at the start line and a car that has done
   * ninety-nine per cent of a lap would otherwise read as one per cent. The
   * finish is a real crossing of the line, guarded by having come most of the
   * way round — the grid is a few metres behind the line, so every race
   * crosses it in its first second and that must not count.
   */
  private lapCount(): void {
    const found = this.track.nearest(
      this.car.position.x,
      this.car.position.z,
      this.car.hint,
    );
    let step = found.t - this.lastT;
    if (step > 0.5) {
      step -= 1;
    } else if (step < -0.5) {
      step += 1;
    }
    this.progress += step;

    const crossed =
      step > 0 &&
      wrap(this.lastT - this.track.startAt) > 0.5 &&
      wrap(found.t - this.track.startAt) < 0.5;
    this.lastT = found.t;

    if (crossed && this.progress > 0.5) {
      this.flag();
    }
  }

  private flag(): void {
    this.finished = true;
    this.running = false;
    this.stick.enabled = false;
    this.stick.release();
    this.hud.setVisible(false);
    this.engine.flag();
    this.engine.setMuted(true);

    const place = this.place();
    const clean = this.knocks === 0;
    this.done.setTitle(place === 1 ? "You won!" : "Chequered flag!");
    this.done.setBody(
      `${ordinal(place)} of ${RIVALS.count + 1}, in ${this.time.toFixed(1)} seconds.` +
        (clean
          ? " And you never once touched the wall."
          : ` You hit the wall ${this.knocks === 1 ? "once" : `${this.knocks} times`} — the long way round the outside is usually the quick way.`),
    );
    this.done.show();
  }

  render = (alpha: number, dt: number): void => {
    this.car.render(alpha);
    this.rivals.render(alpha);
    this.followCamera(dt);
    this.stage.render();
  };

  /**
   * The shot: straight down, never turning, leading the car a little.
   *
   * The lead is along the car's own heading and not its velocity. Leading on
   * the velocity sounds more correct and is much worse — this is a game about
   * going sideways, and it would swing the entire picture every time the back
   * end stepped out, at exactly the moment a child needs to see where they are
   * going.
   */
  private followCamera(dt: number): void {
    const p = this.car.group.position;
    const lead = CAMERA.lead * Math.min(1, this.car.speed / CAR.top);
    this.wantEye.set(
      p.x + Math.sin(this.car.group.rotation.y) * lead,
      this.stage.camera.position.y,
      p.z + Math.cos(this.car.group.rotation.y) * lead,
    );
    const ease = 1 - Math.exp(-CAMERA.ease * dt);
    this.stage.camera.position.lerp(this.wantEye, ease);
    // Looking straight down, always. There is nothing to aim: the camera's
    // rotation is fixed and only its position moves.
  }

  /** Everything off, for a screen that is going away. */
  dispose(): void {
    this.running = false;
    this.loop.stop();
    this.engine.stop();
    this.stick.enabled = false;
    this.stage.dispose();
  }

  /** Puts the camera over the car straight away, so the first frame is not a
   *  swoop in from the origin. */
  private snapCamera(): void {
    this.car.render(1);
    this.rivals.render(1);
    const p = this.car.group.position;
    this.stage.camera.position.set(p.x, this.stage.camera.position.y, p.z);
    this.hud.update(0, RIVALS.count + 1);
  }
}
