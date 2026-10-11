import {CLIMB, MONKEY, SWING, WORLD} from "../config";
import type {Jungle, Tree, Vine} from "../world/jungle";

/** What the monkey is doing. Three things, and the whole game is the moving
 *  between them. */
export type Doing = "ground" | "air" | "swing" | "climb";

/**
 * The monkey.
 *
 * On the ground it runs and jumps. In the air it is a thrown thing and
 * nothing more — no steering, because a monkey in mid-air has nothing to push
 * against, and because the skill of the game is choosing the moment to let
 * go rather than correcting afterwards.
 *
 * On a vine it is a pendulum: the one piece of real physics here, because a
 * swing that is faked never feels like a swing. The weight hangs at a
 * distance from a fixed point and gravity turns it; leaning adds a little,
 * the way a child on a rope swing adds a little; and letting go hands the
 * speed it had built up straight back to the monkey.
 */
export class Monkey {
  x = 40;
  y: number = WORLD.floor;
  vx = 0;
  vy = 0;
  doing: Doing = "air";
  facingLeft = false;

  /** The vine it is holding, how far down the vine it took hold, and how
   *  long until it may take hold of anything again. */
  vine: Vine | null = null;
  grip = 1;
  private waitFor = 0;
  /** The trunk it is on, and how long until it may take one again. */
  tree: Tree | null = null;
  private waitForTree = 0;

  /** For the drawing: how far through the running cycle, and the position
   *  last step so the picture can sit between two of them. */
  stride = 0;
  wasX = 40;
  wasY: number = WORLD.floor;

  /** Whether it has reached home. */
  arrived = false;

  /**
   * Where its hands are.
   *
   * `x` and `y` are the monkey's feet, because that is what stands on the
   * ground and what the sprite is drawn up from. A monkey holds a vine with
   * its hands, though, so every question about vines is asked about this
   * point and not about the feet — otherwise a monkey hangs with its toes on
   * the rope and the sprite floats above it.
   */
  get handY(): number {
    return this.y - MONKEY.tall + 2;
  }

  step(
    dt: number,
    lean: number,
    up: number,
    tapped: boolean,
    jungle: Jungle,
  ): void {
    this.wasX = this.x;
    this.wasY = this.y;
    this.waitFor = Math.max(0, this.waitFor - dt);
    this.waitForTree = Math.max(0, this.waitForTree - dt);

    if (this.doing === "swing" && this.vine) {
      this.swing(dt, lean, tapped);
    } else if (this.doing === "climb" && this.tree) {
      this.onTree(dt, lean, up, tapped, jungle);
    } else if (this.doing === "ground") {
      this.onGround(dt, lean, up, tapped, jungle);
    } else {
      this.inAir(dt, jungle);
    }

    if (this.doing !== "swing" && this.doing !== "climb") {
      this.catchAVine(jungle);
    }
    if (this.x >= jungle.homeX) {
      this.arrived = true;
    }
    if (this.doing === "climb") {
      // On a trunk it faces the way it would leap: wherever the stick says,
      // and forwards when the stick says nothing.
      this.facingLeft = lean < 0;
    } else if (lean !== 0 && this.doing !== "swing") {
      this.facingLeft = lean < 0;
    } else if (this.doing === "swing" && this.vine) {
      this.facingLeft = this.vine.spin < 0;
    }
  }

  /** Running about on the jungle floor. */
  private onGround(
    dt: number,
    lean: number,
    up: number,
    tapped: boolean,
    jungle: Jungle,
  ): void {
    const want = lean * MONKEY.run;
    const by = MONKEY.quickens * dt;
    this.vx += Math.max(-by, Math.min(by, want - this.vx));
    this.x += this.vx * dt;
    this.stride += Math.abs(this.vx) * dt;
    if (tapped) {
      this.vy = -MONKEY.jump;
      this.doing = "air";
      return;
    }
    // Pushing up at the foot of a tree starts a climb. Asked for rather than
    // automatic, unlike a vine: a monkey that grabbed every trunk it ran past
    // could not run anywhere.
    if (up < -0.3) {
      const tree = jungle.trunkAt(this.x, this.y - 2);
      if (tree && this.waitForTree <= 0) {
        this.takeTree(tree);
      }
    }
  }

  /** Thrown, and waiting to land or to catch something. */
  private inAir(dt: number, jungle: Jungle): void {
    this.vy += WORLD.gravity * dt;
    const slow = Math.exp(-MONKEY.drag * dt);
    this.vx *= slow;
    this.vy *= slow;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.y >= WORLD.floor) {
      this.y = WORLD.floor;
      this.vy = 0;
      this.doing = "ground";
      return;
    }
    // Nothing in the air takes hold of a tree. A tree is climbed from the
    // ground, by walking up to it and pushing up.
    //
    // Catching them automatically was the first try and it ate the game:
    // there is a tree every ninety pixels, so every swing ended a quarter of
    // a second later stuck to the next trunk, and no vine was ever reached
    // twice. Asking for it with the stick was the second, and that was
    // nearly as bad — the same thumb pumps the swing, so a child holding it
    // up and forwards through a release was snatched out of the flight by
    // the next trunk along. A flight should end where it was aimed: at a
    // vine, or on the floor.
    void jungle;
  }

  /**
   * Going up a tree.
   *
   * Straight up and down the trunk, at a steady pace — no gravity, because a
   * monkey holding a tree is holding it. A tap leaps off, up and outwards,
   * which is how the high vines are reached; pushing away from the trunk
   * steps off it gently.
   */
  private onTree(
    dt: number,
    lean: number,
    up: number,
    tapped: boolean,
    jungle: Jungle,
  ): void {
    const tree = this.tree;
    if (!tree) {
      return;
    }
    this.x = tree.x;
    this.vx = 0;
    this.vy = 0;
    this.y += up * CLIMB.speed * dt;
    const top = jungle.topOf(tree) + MONKEY.tall;
    this.y = Math.max(top, Math.min(WORLD.floor, this.y));
    this.stride += Math.abs(up) * CLIMB.speed * dt;
    if (this.y >= WORLD.floor) {
      this.leaveTree();
      this.doing = "ground";
      return;
    }
    if (tapped) {
      // Off and away: the leap that reaches a vine.
      //
      // Whichever way the stick is pushed, and forwards if it is not being
      // pushed at all. Leaping to the side the monkey happens to have
      // climbed was the first try and it threw a child who had climbed from
      // the left backwards into the jungle they had already crossed.
      const away = lean !== 0 ? Math.sign(lean) : 1;
      this.vy = -MONKEY.jump * CLIMB.leapUp;
      this.vx = away * CLIMB.leapOut;
      this.leaveTree();
      this.doing = "air";
      return;
    }
    if (Math.abs(lean) > 0.6) {
      this.vx = Math.sign(lean) * CLIMB.leapOut * 0.5;
      this.leaveTree();
      this.doing = "air";
    }
  }

  /** Takes hold of a trunk. */
  takeTree(tree: Tree): void {
    this.tree = tree;
    this.doing = "climb";
    this.x = tree.x;
    this.vx = 0;
    this.vy = 0;
  }

  private leaveTree(): void {
    this.tree = null;
    this.waitForTree = CLIMB.letGo;
  }

  /**
   * Hanging from a vine.
   *
   * A pendulum, worked out in the angle rather than in x and y: that is what
   * keeps the monkey exactly on the end of the rope for ever, with no drift
   * and no spring. Leaning pushes in whichever direction the swing is already
   * going, which is how pumping works — push with the swing and it grows,
   * push against it and it dies.
   */
  private swing(dt: number, lean: number, tapped: boolean): void {
    const vine = this.vine;
    if (!vine) {
      return;
    }
    const long = Math.max(8, vine.long * this.grip);
    vine.spin +=
      (-(WORLD.gravity / long) * Math.sin(vine.angle) + lean * SWING.pump) * dt;
    vine.spin *= Math.exp(-SWING.slows * dt);
    vine.spin = Math.max(-SWING.fastest, Math.min(SWING.fastest, vine.spin));
    vine.angle += vine.spin * dt;
    // The rope goes slack a little past level, so that is as far as a swing
    // gets. Stopping the spin there rather than bouncing off it: a monkey
    // at the top of its swing hangs for a moment, which is exactly the
    // moment a player is waiting for.
    if (Math.abs(vine.angle) > SWING.most) {
      vine.angle = Math.sign(vine.angle) * SWING.most;
      vine.spin = 0;
    }

    this.x = vine.x + Math.sin(vine.angle) * long;
    this.y = vine.y + Math.cos(vine.angle) * long + MONKEY.tall - 2;
    // Where it would fly off to from here, kept up to date so that letting
    // go is simply stopping: the speed is already right.
    this.vx = Math.cos(vine.angle) * vine.spin * long;
    this.vy = -Math.sin(vine.angle) * vine.spin * long;

    if (tapped) {
      this.letGo();
    }
  }

  /** Lets go, keeping the speed the swing had built up. */
  letGo(): void {
    this.vine = null;
    this.doing = "air";
    this.waitFor = MONKEY.letGo;
  }

  /**
   * Takes hold of any vine within reach.
   *
   * Automatic, because the plan asks for it and because it is the kind
   * choice: a child who flies at a vine and misses because they did not also
   * tap has been punished for something they did right. The skill lives in
   * the letting go.
   */
  private catchAVine(jungle: Jungle): void {
    if (this.waitFor > 0) {
      return;
    }
    let best: {vine: Vine; at: number; d: number} | null = null;
    for (const vine of jungle.vines) {
      // Only the ones nearby are worth measuring: the jungle is long.
      if (Math.abs(vine.x - this.x) > vine.long + MONKEY.reach) {
        continue;
      }
      // How far along the vine the monkey's hands are, as a fraction, found
      // by projecting onto the vine and then kept inside the part of it that
      // is worth holding.
      const dx = this.x - vine.x;
      const dy = this.handY - vine.y;
      const ux = Math.sin(vine.angle);
      const uy = Math.cos(vine.angle);
      const along = (dx * ux + dy * uy) / vine.long;
      const at = Math.max(SWING.grabLow, Math.min(1, along));
      const on = jungle.along(vine, at);
      const d = Math.hypot(this.x - on.x, this.handY - on.y);
      if (d <= MONKEY.reach && (!best || d < best.d)) {
        best = {vine, at, d};
      }
    }
    if (!best) {
      return;
    }
    this.takeHold(best.vine, best.at);
  }

  /** Grabs a particular vine at a particular point, handing the speed it was
   *  carrying to the swing so that a fast arrival swings hard. */
  takeHold(vine: Vine, at: number): void {
    const long = Math.max(8, vine.long * at);
    this.vine = vine;
    this.grip = at;
    this.doing = "swing";
    vine.angle = Math.atan2(this.x - vine.x, this.handY - vine.y);
    // The part of the speed that is going round the circle; the rest is
    // along the rope and a rope cannot do anything with it.
    vine.spin =
      (this.vx * Math.cos(vine.angle) - this.vy * Math.sin(vine.angle)) / long;
    this.x = vine.x + Math.sin(vine.angle) * long;
    this.y = vine.y + Math.cos(vine.angle) * long + MONKEY.tall - 2;
  }
}
