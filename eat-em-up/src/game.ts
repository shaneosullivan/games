import * as THREE from "three";
import {CAMERA, CATERPILLAR, CLIMB, ENDING} from "./config";
import {GameLoop} from "./core/loop";
import {Joystick} from "./core/input";
import {AltitudeStick} from "./core/altitudeStick";
import {Rng} from "./core/rng";
import {Stage} from "./render/stage";
import {Forest} from "./entities/forest";
import {FoodField} from "./entities/food";
import {FallingLeaves} from "./entities/fallingLeaves";
import {Caterpillar} from "./entities/caterpillar";
import {Ending} from "./entities/ending";
import {Hud} from "./ui/hud";
import {Overlay} from "./ui/overlays";

/** Fixed, so the wood is laid out the same way every time you play. */
const FOREST_SEED = 20260820;

/**
 * Owns the scene, the actors and the flow between them.
 *
 * There is only one level here, unlike the bee game, so there is no Level
 * interface to hand a context to — the game runs the whole thing itself.
 */
export class Game {
  readonly stage: Stage;
  readonly loop: GameLoop;
  readonly stick: Joystick;
  readonly altitude: AltitudeStick;
  readonly forest: Forest;
  readonly food: FoodField;
  readonly leaves: FallingLeaves;
  readonly cat: Caterpillar;
  readonly ending = new Ending();
  readonly hud: Hud;

  /** update() does nothing unless this is set, so the intro can hold the game
   *  still while the scene is already being drawn behind it. */
  running = false;

  private readonly intro: Overlay;
  private readonly win: Overlay;
  private transforming = false;
  /** Set once the player has taken the butterfly's controls. */
  private flying = false;
  private playAgain: HTMLButtonElement | null = null;

  private readonly dir = new THREE.Vector3();
  private readonly wantEye = new THREE.Vector3();
  private readonly lookAt = new THREE.Vector3();
  private readonly viewSpace = new THREE.Vector3();
  private readonly viewForward = new THREE.Vector3();
  /** The bearing the camera is looking along. Chases the caterpillar's own. */
  private camYaw = 0;

  constructor(app: HTMLElement, ui: HTMLElement) {
    const rng = new Rng(FOREST_SEED);

    this.stage = new Stage(app);
    this.forest = new Forest(rng);
    this.food = new FoodField(rng, this.forest);
    this.cat = new Caterpillar(this.forest);
    this.leaves = new FallingLeaves(rng, this.forest);

    this.stage.scene.add(this.forest.group);
    this.stage.scene.add(this.food.group);
    this.stage.scene.add(this.leaves.group);
    this.stage.scene.add(this.cat.group);
    this.stage.scene.add(this.ending.group);

    // On the branch, a little way out from the trunk, facing along it.
    const start = this.forest.branchPoint(0.12, 0);
    start.y += this.cat.radius;
    this.cat.place(start, this.forest.branchHeading);

    this.hud = new Hud(ui);
    this.stick = new Joystick(ui);
    this.stick.enabled = false;
    // Hidden until there is a butterfly to fly, which is the only thing in the
    // game with an altitude to choose.
    this.altitude = new AltitudeStick(ui, ENDING.cruiseHeight);

    this.intro = new Overlay(
      ui,
      "Eat em up",
      "You are a hungry caterpillar. Crawl around the forest — and up the trees — eating leaves, flowers, berries and fruit. Eat enough of everything and you will turn into a butterfly!",
      "Start eating",
      () => this.begin(),
    );
    this.win = new Overlay(ui, "You are a butterfly!", "", "Fly away!", () =>
      this.beginFlying(),
    );
    this.win.hide();

    // Once you are flying there is nothing left to finish, so starting over
    // has to be reachable without the overlay in the way. A reload rather than
    // a reset: it is the one certain way to leave nothing over from the last
    // game, and it costs a child nothing.
    this.playAgain = document.createElement("button");
    this.playAgain.className = "play-again ui-interactive hidden";
    this.playAgain.textContent = "Play again";
    this.playAgain.addEventListener("click", () => window.location.reload());
    ui.appendChild(this.playAgain);

    this.snapCamera();
    this.loop = new GameLoop(this.update, this.render);
    this.loop.start();
  }

  private begin(): void {
    this.intro.hide();
    this.stick.enabled = true;
    this.running = true;
  }

  update = (dt: number): void => {
    if (!this.running) {
      return;
    }

    // Growth first: everything else this step reads the new size.
    this.cat.growth = this.food.progress;

    if (this.transforming) {
      // Through the transformation the ending drives the caterpillar and the
      // stick is out of the loop; once it is over, the stick flies the
      // butterfly instead.
      this.dir.set(0, 0, 0);
      if (this.flying) {
        this.readStickAgainstCamera();
      }
      this.cat.update(
        dt,
        this.ending.update(
          dt,
          this.cat,
          this.dir,
          this.flying ? this.altitude.desiredHeight : undefined,
        ),
      );
      if (this.flying) {
        this.altitude.setActualHeight(this.ending.focus.y);
      }
      if (
        this.ending.phase === "free" &&
        this.win.root.classList.contains("hidden") &&
        !this.flying
      ) {
        this.showWin();
      }
    } else {
      if (this.cat.climbing) {
        // Climbing wants the stick in plain screen axes — up the screen is up
        // the trunk, left and right go round it — so it is handed over
        // untouched.
        this.dir
          .set(this.stick.x, 0, this.stick.y)
          .multiplyScalar(this.stick.magnitude);
      } else {
        // On the ground, read against the camera's bearing rather than the
        // world's. With the camera riding behind the caterpillar, "push up the
        // screen" has to mean "go the way we are looking"; in world axes it
        // would mean a fixed compass direction, and steering would fight the
        // view every time it swung.
        this.readStickAgainstCamera();
      }
      this.cat.update(dt, this.dir);
      this.food.bite(
        this.cat.mouth,
        this.cat.radius * CATERPILLAR.biteReach,
        this.cat.radius,
      );
      if (this.food.complete) {
        this.beginTransformation();
      }
    }

    // The food sways, and leaves come down, whether or not anyone is eating.
    this.food.update(dt);
    // The way the camera is looking, so leaves come down where they are
    // seen rather than behind the player's back.
    this.viewForward.set(Math.sin(this.camYaw), 0, Math.cos(this.camYaw));
    this.leaves.update(dt, this.cat.position, this.viewForward);
    this.hud.update(this.food.eaten);
  };

  /** Hands the butterfly to the player. */
  private beginFlying(): void {
    // The win overlay and its button are in the page from the first frame,
    // hidden. A click that reaches the button before the game is actually won
    // would otherwise hand out the butterfly's controls mid-crawl: the flight
    // UI appears, the counters vanish, and the camera starts taking its
    // bearing from a butterfly that does not exist yet — which leaves the
    // caterpillar unsteerable, because the stick is read against that bearing.
    if (!this.transforming || this.ending.phase !== "free") {
      return;
    }
    this.win.hide();
    this.flying = true;
    this.stick.enabled = true;
    // Docked for flight: a visible direction control beside the visible height
    // control, so both of the things you can do are on screen.
    this.stick.setDocked(true);
    this.altitude.setVisible(true);
    this.hud.setVisible(false);
    this.playAgain?.classList.remove("hidden");
  }

  /**
   * Turns the stick's screen axes into a world direction, read against the
   * camera's bearing: push up the screen and you go the way the camera is
   * looking, whichever way that happens to be pointing.
   *
   * For a camera looking along (sin y, 0, cos y), screen-right is
   * (-cos y, 0, sin y) — the look direction crossed with up. Using its
   * negative is what had left and right the wrong way round.
   */
  private readStickAgainstCamera(): void {
    const forwardX = Math.sin(this.camYaw);
    const forwardZ = Math.cos(this.camYaw);
    const ahead = -this.stick.y;
    const side = this.stick.x;
    this.dir
      .set(
        forwardX * ahead - forwardZ * side,
        0,
        forwardZ * ahead + forwardX * side,
      )
      .multiplyScalar(this.stick.magnitude);
  }

  private beginTransformation(): void {
    this.transforming = true;
    this.stick.enabled = false;
    this.stick.release();
  }

  private showWin(): void {
    this.win.setBody(
      `You ate ${this.food.total} things — ${this.food.eaten.leaf} leaves, ` +
        `${this.food.eaten.flower} flowers, ${this.food.eaten.berry} berries, ` +
        `${this.food.eaten.fruit} fruits and ${this.food.eaten.grass} tufts of ` +
        `grass. Now go and fly wherever you like — drag to fly, and use the ` +
        `slider to go up and down.`,
    );
    this.win.show();
  }

  render = (alpha: number, dt: number): void => {
    this.cat.render(alpha);
    this.followCamera(dt);
    this.stage.render();
  };

  /**
   * A chase camera that rides behind the caterpillar and swings round to stay
   * there, the way the bee game's does.
   *
   * The swing is deliberately slower than the caterpillar can turn. Matching
   * its turn rate exactly would peg the view to the body and make a sharp
   * corner feel like the whole world spun instead.
   */
  private followCamera(dt: number): void {
    // During the ending the camera watches the chrysalis, then the butterfly.
    const focus = this.transforming ? this.ending.focus : this.cat.position;

    // Further back as the caterpillar gets longer, so more of the body stays in
    // frame instead of trailing off the bottom of the screen — and only a
    // little higher, to keep the shot out of the canopy. See CAMERA.
    const distance = CAMERA.distance + this.cat.growth * CAMERA.growthPullback;
    const height = CAMERA.height + this.cat.growth * CAMERA.heightPullback;

    // Swing round behind, the short way. The ending keeps whatever bearing it
    // had, so the transformation isn't watched through a spinning camera.
    if (!this.transforming || this.flying) {
      let delta =
        (this.flying ? this.ending.heading : this.cat.heading) - this.camYaw;
      while (delta > Math.PI) {
        delta -= Math.PI * 2;
      }
      while (delta < -Math.PI) {
        delta += Math.PI * 2;
      }
      this.camYaw += delta * Math.min(1, dt * CAMERA.yawLerp);
    }
    // The direction the camera looks in: from behind the caterpillar, toward it.
    const backX = -Math.sin(this.camYaw);
    const backZ = -Math.cos(this.camYaw);

    if (this.transforming && !this.flying) {
      // Close in for the transformation, whatever size the caterpillar grew to.
      this.wantEye.set(
        focus.x + backX * ENDING.cameraDistance,
        focus.y + ENDING.cameraHeight,
        focus.z + backZ * ENDING.cameraDistance,
      );
    } else if (this.flying) {
      // Behind and a little above, so the wings are seen against the wood.
      this.wantEye.set(
        focus.x + backX * CAMERA.distance,
        focus.y + CAMERA.height * 0.55,
        focus.z + backZ * CAMERA.distance,
      );
    } else if (this.cat.climbing && !this.transforming) {
      // Climbing, the camera drops below the caterpillar and looks up the
      // trunk. Keeping it overhead would put it inside the crown, and the shot
      // would go dark exactly when the player most needs to see.
      this.wantEye.set(
        focus.x + backX * CLIMB.cameraDistance,
        Math.max(CLIMB.cameraFloor, focus.y - CLIMB.cameraDrop),
        focus.z + backZ * CLIMB.cameraDistance,
      );
    } else {
      this.wantEye.set(
        focus.x + backX * distance,
        focus.y + height,
        focus.z + backZ * distance,
      );
    }
    this.stage.camera.position.lerp(
      this.wantEye,
      Math.min(1, dt * CAMERA.lerp),
    );
    this.lookAt.set(focus.x, focus.y + CAMERA.lookAhead, focus.z);
    this.stage.camera.lookAt(this.lookAt);

    // Dissolve whatever stands between the eye and whatever is being watched —
    // the caterpillar, or the chrysalis and butterfly during the ending. The
    // shader wants that thing's depth in view space, which is what it compares
    // each fragment against.
    //
    // The ending needs this every bit as much as the crawling does: the camera
    // goes where the chrysalis is, and a wood this thick will happily put three
    // trunks between you and the one thing you are meant to be looking at.
    const camera = this.stage.camera;
    // The renderer refreshes these itself, but not until stage.render() below,
    // and a fade a frame behind the camera shows as a flicker on the trunk you
    // are moving past.
    camera.updateMatrixWorld();
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    this.viewSpace.copy(focus).applyMatrix4(camera.matrixWorldInverse);
    this.forest.setFadeDepth(-this.viewSpace.z);
  }

  /** Puts the camera where it belongs straight away, so the first frame isn't
   *  a swoop in from the origin. */
  private snapCamera(): void {
    this.camYaw = this.cat.heading;
    this.wantEye.set(
      this.cat.position.x - Math.sin(this.camYaw) * CAMERA.distance,
      this.cat.position.y + CAMERA.height,
      this.cat.position.z - Math.cos(this.camYaw) * CAMERA.distance,
    );
    this.stage.camera.position.copy(this.wantEye);
    this.stage.camera.lookAt(
      this.cat.position.x,
      this.cat.position.y + CAMERA.lookAhead,
      this.cat.position.z,
    );
  }
}
