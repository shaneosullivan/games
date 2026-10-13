import {EDGE, JUNGLE, LAKE, MONKEY, PARTY, SIM, VOLCANO, WORLD} from "./config";
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
  private burnt = false;
  /** Where the monkey went in, so it can be put down on the side of the
   *  water or the crater it was nearest to. */
  private fellAt = 0;
  private partyIn = 0;
  private time = 0;
  private behind = 0;
  private last = 0;
  private stopped = false;
  /** True while the chooser is up: the world is drawn but does not run. */
  private choosing = true;

  constructor(into: HTMLElement) {
    this.screen = new Screen(into);
    this.input = new Input(this.screen.canvas, into);
    this.hud = new Hud(
      into,
      () => this.restart(),
      muted => this.sound.setMuted(muted),
      at => this.beginAt(at),
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
    this.fellAt = this.monkey.x;
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
    this.fellAt = monkey.x;
    this.burnt = true;
    this.sound.splash();
    this.party.burst(monkey.x, monkey.y - 4, 16, PARTY.lavaColours, true);
    // Thrown straight back up out of it, and left to fall: the step above
    // keeps the gravity on while `sinking` runs.
    monkey.vx = 0;
    monkey.vy = -VOLCANO.bounces;
    monkey.vine = null;
    monkey.tree = null;
    monkey.doing = "air";
  }

  /**
   * Back on dry land beside whatever it fell into, to go again.
   *
   * Whichever side it was nearest: fall in with the far bank in reach and
   * you come up on the far bank. Most of a crossing taken away by its last
   * tap discourages a child as surely as losing the whole jungle does, and
   * the half it already swung is not in doubt.
   */
  private toTheBank(): void {
    const monkey = this.monkey;
    monkey.vine = null;
    monkey.tree = null;
    monkey.doing = "ground";
    const from = this.burnt ? this.jungle.craterFrom : this.jungle.lakeFrom;
    const to = this.burnt ? this.jungle.craterTo : this.jungle.lakeTo;
    // The lava puts you back on its own rim rather than at the foot of the
    // hill: the climb up is not the thing you got wrong, and walking it
    // again five times in a row is how a hazard turns into a chore.
    const backBy = this.burnt ? VOLCANO.backBy : LAKE.backBy;
    const past = this.fellAt > (from + to) / 2;
    monkey.x = past ? to + backBy : from - backBy;
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
   * Starts the run at one of the parts of the course.
   *
   * On the ground and standing, wherever it is put: the parts are chosen to
   * land on the flat with room to get running, so nobody begins the volcano
   * already falling down the hill.
   */
  private beginAt(at: number): void {
    const monkey = this.monkey;
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
