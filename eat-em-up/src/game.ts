import * as THREE from "three";
import {CAMERA, CATERPILLAR, CLEARING, CLIMB, CROW, ENDING} from "./config";
import {GameLoop} from "./core/loop";
import {Joystick} from "./core/input";
import {AltitudeStick} from "./core/altitudeStick";
import {Rng} from "./core/rng";
import {Music} from "./core/music";
import {SoundButton} from "../../shared/soundButton";
import {Stage} from "./render/stage";
import {Forest} from "./entities/forest";
import {FoodField} from "./entities/food";
import {FallingLeaves} from "./entities/fallingLeaves";
import {CrowShadow} from "./entities/crowShadow";
import {Caterpillar} from "./entities/caterpillar";
import {Ending} from "./entities/ending";
import {Hud} from "./ui/hud";
import {Overlay} from "./ui/overlays";

/** The way round from `from` to `to`, in -PI..PI. */
function shortestAngle(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) {
    d -= Math.PI * 2;
  }
  if (d < -Math.PI) {
    d += Math.PI * 2;
  }
  return d;
}

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
  readonly crow: CrowShadow;
  /** Shown when the crow takes the caterpillar; see caughtByTheCrow. */
  private readonly caught: Overlay;
  private readonly music = new Music();
  readonly cat: Caterpillar;
  readonly ending: Ending;
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
  /** The eased point the camera actually looks at. */
  private readonly smoothedLook = new THREE.Vector3();
  private readonly viewSpace = new THREE.Vector3();
  private readonly viewForward = new THREE.Vector3();
  /** The bearing the camera is looking along. Chases the caterpillar's own. */
  private camYaw = 0;
  /**
   * The bearing the stick is read against, which is not always the camera's.
   *
   * Stepping onto a branch the camera is still swinging round to its side-on
   * bearing, and reading the stick against a moving frame steers the
   * caterpillar as the camera turns — hold "forward" while you step on and the
   * camera's own swing walks you off the side. So up there the frame is pinned
   * to where the camera is *going*, and the swing changes nothing under the
   * player's thumb.
   */
  private inputYaw = 0;

  constructor(app: HTMLElement, ui: HTMLElement) {
    const rng = new Rng(FOREST_SEED);

    this.stage = new Stage(app);
    this.forest = new Forest(rng);
    this.food = new FoodField(rng, this.forest);
    this.cat = new Caterpillar(this.forest, rng);
    this.ending = new Ending(this.forest);
    this.leaves = new FallingLeaves(rng, this.forest);
    this.crow = new CrowShadow(rng);

    this.stage.scene.add(this.forest.group);
    this.stage.scene.add(this.food.group);
    this.stage.scene.add(this.leaves.group);
    this.stage.scene.add(this.crow.group);
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
      "You are a hungry caterpillar. Crawl around the forest — up the trees and over the rocks — eating leaves, flowers, berries, fruit and mushrooms. Eat enough of everything and you will turn into a butterfly!",
      "Start eating",
      () => this.begin(),
    );
    this.win = new Overlay(ui, "You are a butterfly!", "", "Fly away!", () =>
      this.beginFlying(),
    );
    this.win.hide();

    this.caught = new Overlay(ui, "The crow got you!", "", "Try again", () =>
      window.location.reload(),
    );
    this.caught.hide();

    // Once you are flying there is nothing left to finish, so starting over
    // has to be reachable without the overlay in the way. A reload rather than
    // a reset: it is the one certain way to leave nothing over from the last
    // game, and it costs a child nothing.
    this.playAgain = document.createElement("button");
    this.playAgain.className = "play-again ui-interactive hidden";
    this.playAgain.textContent = "Play again";
    this.playAgain.addEventListener("click", () => window.location.reload());
    ui.appendChild(this.playAgain);

    // The shared switch, the same one the bee game has, in the one corner
    // nothing else uses: both sticks are along the bottom and the progress bar
    // runs across the top middle.
    const sound = new SoundButton({
      onToggle: muted => this.music.setMuted(muted),
      className: "sound-corner ui-interactive",
    });
    ui.appendChild(sound.root);

    this.snapCamera();
    this.loop = new GameLoop(this.update, this.render);
    this.loop.start();
  }

  private begin(): void {
    this.intro.hide();
    // The first touch of the game, and so the only moment the browser will
    // let the music start. See Music.
    this.music.start();
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
      if (this.cat.climbing || this.cat.dangling) {
        // Climbing and hanging both want the stick in plain screen axes — up
        // the screen is up the trunk or up the rope, left and right go round
        // or turn on the spot — so it is handed over untouched. Reading either
        // against the camera would change what the stick means as the camera
        // swung, which on a branch is constantly.
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
      const swallowed = this.food.bite(
        this.cat.mouth,
        this.cat.radius * CATERPILLAR.biteReach,
        this.cat.radius,
      );
      // A rainbow mushroom takes the caterpillar off you for a few seconds.
      if (swallowed?.magic) {
        this.cat.goMad();
      }
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
    this.tickCrow(dt);
    this.hud.update(this.food.eaten);
  };

  /**
   * The crow: the one thing here that can go wrong for you.
   *
   * It comes over at two minutes, circles, and gives you ten seconds to reach
   * the long grass. Reach it and it goes; don't and it has you, and the game
   * is over.
   */
  private tickCrow(dt: number): void {
    // Not once the transformation has started. A chrysalis cannot run for the
    // grass, and a butterfly has finished the game.
    if (this.transforming) {
      this.crow.callOff();
      this.hud.setAlert(null);
      return;
    }

    // Not while a rainbow mushroom has hold of it either. The fit lasts longer
    // than the crow's count and the player has no say in where the caterpillar
    // goes during it — being taken for something you could not have prevented
    // is the one shape a fair game must not have.
    if (this.cat.isMad) {
      this.crow.callOff();
      this.hud.setAlert(null);
      return;
    }

    const event = this.crow.update(dt, this.cat.position, this.hidden);
    if (event === "began") {
      this.hud.setAlert("Hide in the grass!", this.crow.secondsLeft);
    } else if (event === "left") {
      this.hud.setAlert(null);
    } else if (event === "caught") {
      this.hud.setAlert(null);
      this.caughtByTheCrow();
    } else if (this.crow.hunting) {
      this.hud.setAlert("Hide in the grass!", this.crow.secondsLeft);
    }
  }

  /**
   * Whether the crow can see the caterpillar.
   *
   * The meadow hides you, and gaps in it do not matter — a child who has run
   * to the grass has done the thing that was asked, and being taken while
   * standing in it because the particular tuft they were over had been eaten
   * would be unreadable. What does matter is the meadow as a whole: eat nearly
   * all of it and there is nothing left to hide behind. It grows back after
   * five minutes, so that is never permanent.
   */
  private get hidden(): boolean {
    if (!this.forest.inClearing(this.cat.position.x, this.cat.position.z)) {
      return false;
    }
    const left = this.food.remaining("grass") / CLEARING.tufts;
    return left >= CROW.hideNeedsGrass;
  }

  /** The crow got you. */
  private caughtByTheCrow(): void {
    this.running = false;
    this.stick.enabled = false;
    this.stick.release();
    this.hud.setVisible(false);
    // Which of the two ways it went wrong, because they call for different
    // things next time: run sooner, or leave some of the meadow standing.
    const bare = this.food.remaining("grass") / CLEARING.tufts;
    this.caught.setBody(
      bare < CROW.hideNeedsGrass
        ? "You had eaten nearly all the grass, so there was nowhere left to hide. It grows back — leave some of the meadow standing next time."
        : "The crow was looking for you and you were out in the open. When one comes over, run for the long grass!",
    );
    this.caught.show();
  }

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
    const forwardX = Math.sin(this.inputYaw);
    const forwardZ = Math.cos(this.inputYaw);
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
    // Which way the camera is, so the caterpillar can look at it when it asks
    // what you are waiting for. Last frame's camera, which is near enough.
    const eye = this.stage.camera.position;
    this.cat.cameraBearing = Math.atan2(
      eye.x - this.cat.position.x,
      eye.z - this.cat.position.z,
    );
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

    // Up on a branch the camera goes side-on to it; everywhere else it sits
    // behind the caterpillar. The ending keeps whatever bearing it had, so the
    // transformation is not watched through a spinning camera.
    const bough =
      this.transforming || this.cat.climbing
        ? null
        : this.forest.boughUnder(
            this.cat.position,
            this.cat.radius + CAMERA.branchGrip,
          );

    if (bough) {
      // Square on to the branch, from whichever of its two sides the camera is
      // already nearer — swinging the long way round would be a whip pan every
      // time you stepped onto a branch.
      const along = Math.atan2(bough.dir.x, bough.dir.y);
      const a = along + Math.PI / 2;
      const b = along - Math.PI / 2;
      const target =
        Math.abs(shortestAngle(this.camYaw, a)) <
        Math.abs(shortestAngle(this.camYaw, b))
          ? a
          : b;
      // No dead zone here: the target does not depend on the player's heading,
      // so there is no feedback loop to be gentle about.
      const step = shortestAngle(this.camYaw, target);
      this.camYaw += step * (1 - Math.exp(-CAMERA.branchSideLerp * dt));
      // Pinned to where the camera is going, not to where it currently is.
      this.inputYaw = target;
    } else if (!this.transforming || this.flying) {
      this.followYaw(
        dt,
        this.flying ? this.ending.heading : this.cat.heading,
        this.stick.magnitude > 0.01,
        this.flying ? ENDING.flySpeed : this.cat.planarSpeed,
      );
      this.inputYaw = this.camYaw;
    } else {
      this.inputYaw = this.camYaw;
    }
    // The direction the camera looks in: from behind the caterpillar, toward it.
    const backX = -Math.sin(this.camYaw);
    const backZ = -Math.cos(this.camYaw);

    if (this.transforming && !this.flying && this.ending.phase !== "seek") {
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
      //
      // It stays as far back as it is everywhere else, though. Climbing used
      // to pull it in to a fixed short boom, which for a grown caterpillar
      // meant the shot leaping from thirty-odd units out to eight and back
      // again every time it took hold of a tree.
      this.wantEye.set(
        focus.x + backX * distance,
        Math.max(CLIMB.cameraFloor, focus.y - CLIMB.cameraDrop),
        focus.z + backZ * distance,
      );
    } else {
      this.wantEye.set(
        focus.x + backX * distance,
        focus.y + height,
        focus.z + backZ * distance,
      );
    }
    // 1 - exp(-k dt) rather than k*dt: the same follow whatever the frame rate.
    this.stage.camera.position.lerp(
      this.wantEye,
      1 - Math.exp(-CAMERA.lerp * dt),
    );

    // The point it looks at is eased too. Aimed straight at a moving subject
    // the shot jitters, and every small correction of the body shows up in it.
    this.lookAt.set(focus.x, focus.y + CAMERA.lookAhead, focus.z);
    this.smoothedLook.lerp(this.lookAt, 1 - Math.exp(-CAMERA.lookLerp * dt));
    this.stage.camera.lookAt(this.smoothedLook);

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

  /**
   * Drifts the shot round to sit behind the caterpillar. Lifted from the bee
   * game's camera rig, which had already worked out that this is two problems.
   *
   * While the player is steering, the stick is read in the camera's frame, so
   * turning the camera turns the heading by the same amount: the offset
   * between them is a fixed point of the loop and no gain closes it. All the
   * follow can do is widen the arc, so it keeps a dead zone and a hard rate
   * cap and stays out of the way.
   *
   * The moment nobody is pushing, that loop is gone — the heading is fixed in
   * the world — and the camera can simply come round behind it, briskly.
   */
  private followYaw(
    dt: number,
    heading: number,
    steering: boolean,
    speed: number,
  ): void {
    const diff = shortestAngle(this.camYaw, heading);
    const size = Math.abs(diff);
    if (size < 1e-4) {
      return;
    }

    let rate: number;
    if (steering) {
      const off = size - CAMERA.yawDeadzone;
      if (off <= 0) {
        // Inside the dead zone the camera simply does not move.
        return;
      }
      rate =
        Math.min(off * CAMERA.yawGain, CAMERA.yawMaxRate) *
        Math.min(1, speed / CAMERA.yawSpeedFull);
    } else {
      rate = Math.min(size * CAMERA.yawIdleGain, CAMERA.yawIdleMaxRate);
    }

    // Never overshoot the heading in a single step.
    this.camYaw += Math.sign(diff) * Math.min(rate * dt, size);
  }

  /** Puts the camera where it belongs straight away, so the first frame isn't
   *  a swoop in from the origin. */
  private snapCamera(): void {
    this.camYaw = this.cat.heading;
    this.inputYaw = this.camYaw;
    this.wantEye.set(
      this.cat.position.x - Math.sin(this.camYaw) * CAMERA.distance,
      this.cat.position.y + CAMERA.height,
      this.cat.position.z - Math.cos(this.camYaw) * CAMERA.distance,
    );
    this.stage.camera.position.copy(this.wantEye);
    this.smoothedLook.set(
      this.cat.position.x,
      this.cat.position.y + CAMERA.lookAhead,
      this.cat.position.z,
    );
    this.stage.camera.lookAt(this.smoothedLook);
  }
}
