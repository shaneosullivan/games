import {
  COCONUT,
  EDGE,
  JUNGLE,
  LAKE,
  MONKEY,
  MUSHROOM,
  PARTY,
  RAIN,
  SIM,
  VOLCANO,
  WORLD,
} from "./config";
import {Input} from "./core/input";
import {Sound} from "./core/sound";
import {Monkey} from "./entities/monkey";
import {paint} from "./render/draw";
import {Party} from "./render/particles";
import {Screen} from "./render/screen";
import {Hud} from "./ui/hud";
import {Jungle} from "./world/jungle";

/**
 * The game: a jungle, a monkey, and the clock that drives them.
 *
 * Fixed step with an interpolated picture, the same as the other games here.
 * A pendulum worked out at whatever rate the device feels like would swing
 * differently on a fast phone and a slow one, and a swing that depends on the
 * hardware is not a swing anybody can learn.
 */
export class Game {
  readonly screen: Screen;
  readonly input: Input;
  jungle = new Jungle();
  monkey = new Monkey();
  camera = 0;
  readonly party = new Party();
  readonly sound = new Sound();
  readonly hud: Hud;
  /** How many bananas have been taken, and whether home has been reached. */
  bananas = 0;
  finished = false;
  /** While this is counting down the monkey is in the water and the game is
   *  letting the player see it before putting them back. */
  private sinking = 0;
  /** Whether the dunking was lava rather than water, which decides where
   *  the monkey is put back. */
  /** True while the monkey is being thrown back out of something rather
   *  than sinking into it: the lava does it, and so does a coconut. */
  private burnt = false;
  /** Where the monkey is put down when the pause is over, worked out at
   *  the moment it went wrong rather than afterwards. */
  private backTo = 0;
  /** How many lives are left. Only the rain level has any. */
  private lives = 0;
  private partyIn = 0;
  private time = 0;
  private behind = 0;
  private last = 0;
  private stopped = false;
  /** True while the chooser is up: the world is drawn but does not run. */
  private choosing = true;

  constructor(into: HTMLElement) {
    this.screen = new Screen(into);
    // The controls and the HUD hang off the picture rather than the
    // window, so they are never stranded in the black beside it.
    this.input = new Input(this.screen.canvas, this.screen.frame);
    this.hud = new Hud(
      this.screen.frame,
      () => this.restart(),
      muted => this.sound.setMuted(muted),
      at => this.beginAt(at),
      () => this.beginRain(),
    );
    this.hud.setChoosing(true);
    // A browser will not make a noise until the page has been touched, so
    // the audio is built on the first touch and not on load.
    const wake = (): void => this.sound.wake();
    window.addEventListener("pointerdown", wake, {once: true});
    window.addEventListener("keydown", wake, {once: true});
    this.last = performance.now();
    requestAnimationFrame(this.frame);
  }

  private frame = (now: number): void => {
    if (this.stopped) {
      return;
    }
    const dt = Math.min(SIM.most, (now - this.last) / 1000);
    this.last = now;
    this.behind += dt;
    let tapped = this.input.took();
    while (this.behind >= SIM.step) {
      this.behind -= SIM.step;
      this.step(SIM.step, tapped);
      // A tap belongs to one step, not to every step in a slow frame.
      tapped = false;
    }
    this.draw(this.behind / SIM.step);
    requestAnimationFrame(this.frame);
  };

  private step(dt: number, tapped: boolean): void {
    this.time += dt;
    this.party.update(dt);

    if (this.choosing) {
      // The chooser is up. The jungle breathes behind it — the wind in the
      // vines is what tells you the thing is alive and waiting for you —
      // but nothing is asked of the monkey and no tap reaches it.
      this.jungle.update(dt, this.time, null);
      return;
    }

    if (this.finished) {
      // Home. The jungle carries on breathing and the party keeps going up
      // over the hut until somebody presses the button.
      this.jungle.update(dt, this.time, null);
      this.partyIn -= dt;
      if (this.partyIn <= 0) {
        this.partyIn = PARTY.every;
        this.party.burst(
          this.jungle.homeX + (Math.random() - 0.5) * 70,
          WORLD.floor - 30 - Math.random() * 20,
        );
      }
      return;
    }

    if (this.sinking > 0) {
      // Out of play for a moment, while the player takes in what happened.
      // The water swallows the monkey, slowly; the lava spits it back out,
      // which is what lava does to anybody who steps in it in a game, and
      // is the difference between a hazard that is sad and one that is
      // funny. A child is going to do this on purpose.
      this.sinking -= dt;
      this.monkey.wasY = this.monkey.y;
      if (this.burnt) {
        this.monkey.vy += WORLD.gravity * dt;
        this.monkey.y += this.monkey.vy * dt;
      } else {
        this.monkey.y += 26 * dt;
      }
      this.jungle.update(dt, this.time, null);
      if (this.sinking <= 0) {
        this.toTheBank();
      }
      return;
    }

    this.monkey.step(
      dt,
      this.input.push,
      this.input.climb,
      tapped,
      this.jungle,
    );
    this.jungle.update(dt, this.time, this.monkey.vine, this.monkey.x);
    this.snapping();
    this.takeBananas();
    this.checkTheWater();
    this.checkTheLava();
    if (this.jungle.raining) {
      this.lightTheWay();
      this.checkTheCoconuts();
    }

    // The camera sits the monkey a third of the way across, so there is
    // twice as much jungle ahead as behind — which is where the next vine
    // is, and the only thing worth looking at.
    const want = this.monkey.x - this.screen.wide / 3;
    const ease = 1 - Math.exp(-6 * dt);
    this.camera += (want - this.camera) * ease;
    this.camera = Math.max(
      0,
      Math.min(WORLD.far - this.screen.wide + 40, this.camera),
    );
    this.keepInView();

    if (this.monkey.arrived && !this.finished) {
      this.finished = true;
      this.partyIn = 0;
      this.hud.setFinished(true, this.bananas, this.jungle.bananas.length);
    }
  }

  /** The crocodiles, when their jaws come together. Only the ones on screen
   *  — a chomp from a crocodile a child cannot see is a mystery noise. */
  private snapping(): void {
    for (const croc of this.jungle.crocs) {
      const at = croc.x - this.camera;
      const onScreen = at > -20 && at < this.screen.wide + 20;
      if (croc.bit && onScreen) {
        this.sound.chomp();
      }
      // Water thrown about as the head comes through the surface.
      if (croc.rose && onScreen) {
        this.party.burst(
          croc.x,
          WORLD.floor + LAKE.deep - 6,
          10,
          PARTY.splashColours,
          true,
        );
      }
    }
  }

  /**
   * Swinging through a banana takes it.
   *
   * Measured from the monkey's middle rather than its hands, because a
   * banana is taken by passing through it and the whole monkey passes
   * through it.
   */
  private takeBananas(): void {
    const mx = this.monkey.x;
    const my = this.monkey.y - MONKEY.tall / 2;
    for (const banana of this.jungle.bananas) {
      if (banana.taken || Math.abs(banana.x - mx) > JUNGLE.bananaReach) {
        continue;
      }
      if (Math.hypot(banana.x - mx, banana.y - my) > JUNGLE.bananaReach) {
        continue;
      }
      banana.taken = true;
      this.bananas += 1;
      this.sound.banana();
      this.hud.setScore(this.bananas);
      this.party.burst(banana.x, banana.y, 8, PARTY.colours, true);
    }
  }

  /**
   * Falling in the lake.
   *
   * The water is the one place a mistake costs anything, and it costs the
   * crossing rather than the jungle: back to the near bank, which is where
   * the attempt started. Letting go over water and missing is a thing a
   * child will do twenty times, and twenty times back to the beginning is
   * how a game gets put down.
   */
  private checkTheWater(): void {
    if (this.monkey.doing === "swing" || this.monkey.doing === "climb") {
      return;
    }
    if (!this.jungle.overWater(this.monkey.x)) {
      return;
    }
    if (this.monkey.y < WORLD.floor) {
      return;
    }
    this.sinking = LAKE.watchFor;
    this.backTo = this.jungle.lakeFrom - LAKE.backBy;
    this.sound.splash();
    this.monkey.vx = 0;
    this.monkey.vy = 0;
    this.party.burst(
      this.monkey.x,
      WORLD.floor + 2,
      PARTY.splashBits,
      PARTY.splashColours,
      true,
    );
  }

  /**
   * The lava, and the spurts out of it.
   *
   * The same bargain as the lake: it costs the crossing and not the
   * jungle. Standing on the crater floor burns, and so does being caught by
   * a column on its way up — which is the thing to time, and the reason the
   * vents grumble before they fire.
   */
  private checkTheLava(): void {
    const monkey = this.monkey;
    if (monkey.doing === "climb") {
      return;
    }
    const onTheLava =
      this.jungle.overCrater(monkey.x) &&
      monkey.y >= this.jungle.floorAt(monkey.x) - 1;
    let caught = false;
    if (!onTheLava) {
      for (const vent of this.jungle.vents) {
        if (vent.up <= 0 || Math.abs(vent.x - monkey.x) > VOLCANO.catches) {
          continue;
        }
        const top = this.jungle.floorAt(vent.x) - vent.up * VOLCANO.reaches;
        // Caught if the monkey is inside the column: below its top and
        // above the ground it came out of.
        if (
          monkey.y - MONKEY.tall < this.jungle.floorAt(vent.x) &&
          monkey.y > top
        ) {
          caught = true;
          break;
        }
      }
    }
    if (!onTheLava && !caught) {
      return;
    }
    this.sinking = VOLCANO.watchFor;
    this.backTo = this.jungle.craterFrom - VOLCANO.backBy;
    this.burnt = true;
    this.sound.splash();
    this.party.burst(monkey.x, monkey.y - 4, 16, PARTY.lavaColours, true);
    // Let go of properly rather than simply forgotten. Clearing the vine
    // off the monkey leaves the rope pinned to the hand that is no longer
    // there, and it hangs in the air at the angle of the moment it went
    // wrong — which is what it did. `letGo` releases the pin, and the vine
    // swings back the way it would if the monkey had dropped off it.
    monkey.letGo();
    // Thrown straight back up out of it, and left to fall: the step above
    // keeps the gravity on while `sinking` runs.
    monkey.vx = 0;
    monkey.vy = -VOLCANO.bounces;
    monkey.tree = null;
  }

  /**
   * Lighting the mushrooms as they are passed.
   *
   * Passed rather than touched: a revive point you can miss by jumping
   * over it is a revive point a child will miss, and then lose the level
   * to. Walking, swinging or flying past it all count.
   */
  private lightTheWay(): void {
    for (const one of this.jungle.mushrooms) {
      if (!one.lit && this.monkey.x > one.x - MUSHROOM.notices) {
        one.lit = true;
        this.party.burst(one.x, this.jungle.floorAt(one.x) - 8, 10);
      }
    }
  }

  /**
   * The coconuts, and what one costs.
   *
   * A life, and the walk back to the last mushroom — not to the start of
   * the level, which would be the whole rain level for one mistake. When
   * the last life goes the level begins again with both hearts back, which
   * is the only thing in this game that takes real progress away, and it
   * is what makes the hearts in the corner worth watching.
   */
  private checkTheCoconuts(): void {
    const monkey = this.monkey;
    for (const nut of this.jungle.coconuts) {
      if (!nut.falling) {
        continue;
      }
      if (Math.abs(nut.x - monkey.x) > COCONUT.catches) {
        continue;
      }
      if (nut.y < monkey.y - MONKEY.tall || nut.y > monkey.y) {
        continue;
      }
      // Burst on the monkey rather than on the ground, and gone.
      nut.falling = false;
      nut.splat = COCONUT.splats;
      nut.back = COCONUT.rests;
      this.bonked();
      return;
    }
  }

  /** A coconut on the head: a life, a bounce, and back to the mushroom. */
  private bonked(): void {
    const monkey = this.monkey;
    this.lives = Math.max(0, this.lives - 1);
    this.hud.setLives(this.lives);
    this.sound.chomp();
    this.party.burst(monkey.x, monkey.y - MONKEY.tall, 14);
    // The last mushroom passed, or the start of the level if none has
    // been. Out of lives and it is the start either way.
    let post: number = RAIN.backTo;
    if (this.lives > 0) {
      for (const one of this.jungle.mushrooms) {
        if (one.lit) {
          post = Math.max(post, one.x);
        }
      }
    } else {
      for (const one of this.jungle.mushrooms) {
        one.lit = false;
      }
      this.lives = RAIN.lives;
      this.hud.setLives(this.lives);
      this.bananas = 0;
      this.hud.setScore(0);
    }
    this.backTo = post;
    this.sinking = VOLCANO.watchFor;
    this.burnt = true;
    monkey.letGo();
    monkey.vx = 0;
    monkey.vy = -VOLCANO.bounces * 0.7;
    monkey.tree = null;
  }

  /**
   * Back on dry land at the near edge of whatever it fell into, to go
   * again.
   *
   * The near edge every time, however far across it got. The crossing is
   * the thing being asked for — swing the lake, swing the crater, reach
   * the other side — and a fall that puts you down on the far bank has
   * handed you the half you did not swing. It costs the crossing and never
   * more than the crossing: the jungle behind it is not in doubt.
   */
  private toTheBank(): void {
    const monkey = this.monkey;
    monkey.vine = null;
    monkey.tree = null;
    monkey.doing = "ground";
    // Wherever the thing that got you decided: the near edge of the water
    // or of the crater, or the last mushroom passed in the rain. Worked
    // out at the moment it happened, because by now the monkey has been
    // thrown about and is no longer anywhere useful.
    monkey.x = this.backTo;
    this.burnt = false;
    monkey.y = this.jungle.floorAt(monkey.x);
    monkey.wasX = monkey.x;
    monkey.wasY = monkey.y;
    monkey.vx = 0;
    monkey.vy = 0;
    monkey.facingLeft = false;
    // The camera goes with it. Without this the monkey is put on the bank
    // and then dragged straight back off it by the rule that keeps it on
    // screen, because the view is still out over the water.
    this.camera = monkey.x - this.screen.wide / 3;
  }

  /**
   * Keeps the monkey inside the picture.
   *
   * The camera follows it everywhere except at the two ends of the jungle,
   * where it has run out of world to show; there, and only there, the monkey
   * can out-walk the view. It is also possible to fly off the top of the
   * screen from a good swing. Both are the same fault — a monkey you cannot
   * see — so both are held here, against the view rather than against the
   * world, which is the thing a child actually looks at.
   *
   * A swing is left alone: the monkey is on the end of a rope and moving it
   * would take it off the rope. The vines all hang well inside the jungle,
   * so there is nothing to hold it away from.
   */
  private keepInView(): void {
    const left = this.camera + EDGE.margin;
    const right = this.camera + this.screen.wide - EDGE.margin;
    const top = MONKEY.tall + EDGE.margin;
    if (this.monkey.doing !== "swing") {
      if (this.monkey.x < left) {
        this.monkey.x = left;
        this.monkey.vx = Math.max(0, this.monkey.vx);
      } else if (this.monkey.x > right) {
        this.monkey.x = right;
        this.monkey.vx = Math.min(0, this.monkey.vx);
      }
    }
    if (this.monkey.y < top) {
      this.monkey.y = top;
      this.monkey.vy = Math.max(0, this.monkey.vy);
    }
  }

  /**
   * Everything back to the beginning, from the button at the end.
   *
   * Back to the chooser rather than straight into the jungle, so the part
   * you want is one tap away every time round instead of only on the first
   * run of the page.
   */
  private restart(): void {
    this.jungle = new Jungle();
    this.hud.setLives(0, 0);
    this.monkey = new Monkey();
    this.camera = 0;
    this.bananas = 0;
    this.finished = false;
    this.sinking = 0;
    this.party.clear();
    this.hud.setFinished(false);
    this.hud.setScore(0);
    this.hud.setProgress(0);
    this.choosing = true;
    this.hud.setChoosing(true);
  }

  /**
   * The rain level, from its beginning.
   *
   * A second jungle rather than a second game: the same class with the
   * weather turned on, so everything that was true of swinging is still
   * true. Its own seed, so it is not the dry jungle with rain over it.
   */
  private beginRain(): void {
    this.jungle = new Jungle(7, true);
    this.monkey = new Monkey();
    this.party.clear();
    this.bananas = 0;
    this.finished = false;
    this.sinking = 0;
    this.burnt = false;
    this.lives = RAIN.lives;
    this.hud.setScore(0);
    this.hud.setProgress(0);
    this.hud.setFinished(false);
    this.hud.setLives(this.lives);
    this.beginAt(RAIN.backTo);
  }

  /**
   * Starts the run at one of the parts of the course.
   *
   * On the ground and standing, wherever it is put: the parts are chosen to
   * land on the flat with room to get running, so nobody begins the volcano
   * already falling down the hill.
   */
  private beginAt(at: number): void {
    const monkey = this.monkey;
    if (!this.jungle.raining) {
      // No lives in the dry jungle, so no hearts: nothing there can be
      // lost, and a row of hearts that never changes is furniture.
      this.hud.setLives(0, 0);
    }
    monkey.vine = null;
    monkey.tree = null;
    monkey.doing = "ground";
    monkey.x = at;
    monkey.y = this.jungle.floorAt(at);
    monkey.wasX = monkey.x;
    monkey.wasY = monkey.y;
    monkey.vx = 0;
    monkey.vy = 0;
    monkey.facingLeft = false;
    this.camera = Math.max(0, at - this.screen.wide / 3);
    this.choosing = false;
    this.hud.setChoosing(false);
  }

  private draw(alpha: number): void {
    this.hud.setProgress(this.monkey.x / this.jungle.homeX);
    paint(
      this.screen,
      this.jungle,
      this.monkey,
      Math.round(this.camera),
      this.time,
      alpha,
      this.party,
      this.finished,
    );
  }

  stop(): void {
    this.stopped = true;
  }
}
