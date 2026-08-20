import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {CATERPILLAR, CLIMB, IDLE, TREE_BRANCH} from "../config";
import {paint, vertexToon} from "../render/materials";
import {Climbable, Forest} from "./forest";

/** How far apart trail samples are taken, in units. */
const TRAIL_STEP = 0.06;

const BODY_LIGHT = 0x8ecb46;
const BODY_DARK = 0x63a733;
const HEAD_COLOUR = 0xd94f3d;

/**
 * The player: a caterpillar that crawls, eats, and gets longer and fatter as
 * it does.
 *
 * The body is not simulated — it follows. The head records where it has been,
 * and every segment sits a fixed distance back along that trail. That is what
 * makes crawling off the branch look right for free: the body drapes over the
 * edge because the trail it is following goes over the edge.
 */
export class Caterpillar {
  readonly group = new THREE.Group();

  readonly position = new THREE.Vector3();
  private readonly prevPosition = new THREE.Vector3();

  /** Which way the head points, radians about Y. */
  heading = 0;
  private vy = 0;

  /** The trunk being climbed, or null when on the ground. */
  climbing: Climbable | null = null;

  /** Whether it is hanging off a branch. The game reads the stick differently
   *  while it is — see `hang`. */
  get dangling(): boolean {
    return this.dangle !== null;
  }
  /** Where round that trunk the caterpillar is, radians. */
  private climbAngle = 0;
  /** How long the player has been pushing into a trunk, for the grab dwell. */
  private pressing = 0;
  /** Set after hauling back onto a branch: the stick does nothing until the
   *  player lets go of it. See CATERPILLAR.regainRelease. */
  private awaitRelease = false;
  /** How long the wait for a released stick has run, so it cannot last for
   *  ever and strand somebody who simply keeps holding it. */
  private awaitFor = 0;
  /** How long the player has been pushing across the branch, for the dwell
   *  that turns it into stepping off the side. */
  private sidePush = 0;
  /**
   * Whether a push across the branch is allowed to step off it yet.
   *
   * Disarmed the moment it hauls back up, and rearmed only when the player
   * eases off. On a branch the camera is side-on, so "up the screen" is both
   * "climb the rope" while hanging and "step off the side" while standing —
   * the same held push. Without this, hauling yourself up put you straight
   * back off the side, up and down for as long as you held it.
   */
  private sideStepArmed = true;
  /**
   * Hanging off the end of a branch by the tail, or null.
   *
   * `anchor` is the lip it is hanging from, `drop` is how far the head has
   * lowered below it, and `foothold` is the last place it definitely had
   * something under it — which is where it is put back if it hauls itself up.
   *
   * The body needs no special handling: it follows the trail as always, and
   * the trail goes over the lip and straight down, so the drape comes out
   * right on its own.
   */
  private dangle: {
    anchor: THREE.Vector3;
    foothold: THREE.Vector3;
    drop: number;
    /** How long it has been hanging, so it cannot climb back the instant it
     *  steps off. */
    age: number;
  } | null = null;
  /** Unit vector the head points along, pitch included. Where the mouth is. */
  private readonly facing = new THREE.Vector3(0, 0, 1);

  /** 0 at the start, 1 when fully grown. Set by the game from what's eaten. */
  growth = 0;

  private readonly segments: Array<THREE.Mesh> = [];
  private readonly head: THREE.Group;
  /** Its three mouths: the everyday smile, the questioning line, and the
   *  wide open one it yawns with. */
  private readonly smile: THREE.Mesh;
  private readonly askingMouth: THREE.Mesh;
  private readonly yawnMouth: THREE.Mesh;
  /**
   * The two front legs, used only for the asking pose.
   *
   * A separate pair rather than the feet on the body segments: those are baked
   * into the merged segment geometry, which is what makes a segment one draw
   * call, and there is no way to lift one of them on its own. These hang
   * hidden until they are wanted.
   */
  private readonly legs = new THREE.Group();
  private readonly legHinges: Array<THREE.Group> = [];
  /** Newest first. The path the head has taken. */
  private readonly trail: Array<THREE.Vector3> = [];
  private readonly segCur: Array<THREE.Vector3> = [];
  private readonly segPrev: Array<THREE.Vector3> = [];
  private crawlPhase = 0;
  /** How fast it is actually travelling across the ground, units a second.
   *  The camera's follow is scaled by it — barely moving should barely move
   *  the shot. */
  planarSpeed = 0;
  /** How long the player has been asking for nothing. Drives the idle
   *  behaviour: looking about, wagging, and scratching. */
  private still = 0;
  private readonly tmp = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();

  constructor(private readonly forest: Forest) {
    // Every segment is built at radius 1 and scaled, so growing is a scale
    // rather than a rebuild.
    const light = segmentGeometry(BODY_LIGHT);
    const dark = segmentGeometry(BODY_DARK);
    for (let i = 0; i < CATERPILLAR.segmentsMax; i++) {
      const mesh = new THREE.Mesh(i % 2 === 0 ? light : dark, vertexToon());
      mesh.visible = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      this.segments.push(mesh);
      this.segCur.push(new THREE.Vector3());
      this.segPrev.push(new THREE.Vector3());
    }

    const head = makeHead();
    // Everything the caterpillar is made of throws a shadow: on the floor it
    // is what puts the creature in the wood rather than on top of it.
    head.group.traverse(o => {
      o.castShadow = true;
      o.receiveShadow = true;
    });
    this.head = head.group;
    this.smile = head.smile;
    this.askingMouth = head.asking;
    this.yawnMouth = head.yawn;
    this.group.add(this.head);

    for (const side of [-1, 1]) {
      // Hinged at the shoulder, so raising a leg is a rotation of the hinge
      // and never touches the position the render puts the pair at.
      const hinge = new THREE.Group();
      const limb = new THREE.Mesh(legGeometry(), vertexToon());
      limb.castShadow = true;
      hinge.add(limb);
      hinge.position.x = side * 1.05;
      this.legs.add(hinge);
      this.legHinges.push(hinge);
    }
    this.legs.visible = false;
    this.group.add(this.legs);
  }

  /**
   * Bearing from the caterpillar to the camera, set by the game each frame.
   * Only used to turn and look at it when it asks what you are waiting for.
   */
  cameraBearing = 0;

  /** The point food is eaten at: just in front of the face. Follows the head's
   *  pitch, so climbing reaches the leaves above rather than the bark ahead. */
  get mouth(): THREE.Vector3 {
    return this.tmpB
      .copy(this.position)
      .addScaledVector(this.facing, this.radius * 1.1);
  }

  get radius(): number {
    return THREE.MathUtils.lerp(
      CATERPILLAR.radiusMin,
      CATERPILLAR.radiusMax,
      this.growth,
    );
  }

  get speed(): number {
    return THREE.MathUtils.lerp(
      CATERPILLAR.speedMin,
      CATERPILLAR.speedMax,
      this.growth,
    );
  }

  private get segmentCount(): number {
    return Math.round(
      THREE.MathUtils.lerp(
        CATERPILLAR.segmentsMin,
        CATERPILLAR.segmentsMax,
        this.growth,
      ),
    );
  }

  /** Puts the caterpillar down facing `heading`, with its body laid out behind. */
  place(at: THREE.Vector3, heading: number): void {
    this.position.copy(at);
    this.prevPosition.copy(at);
    this.heading = heading;
    this.vy = 0;
    this.climbing = null;
    this.dangle = null;
    this.pressing = 0;
    this.awaitRelease = false;
    this.facing.set(Math.sin(heading), 0, Math.cos(heading));
    this.trail.length = 0;
    // Seed the trail straight back from the head. Without this the whole body
    // starts stacked on one point and unfolds with a lurch on the first step.
    const back = new THREE.Vector3(-Math.sin(heading), 0, -Math.cos(heading));
    for (let i = 0; i < CATERPILLAR.trailLength; i++) {
      this.trail.push(
        new THREE.Vector3().copy(at).addScaledVector(back, i * TRAIL_STEP),
      );
    }
    this.layOutBody();
    for (let i = 0; i < this.segCur.length; i++) {
      this.segPrev[i].copy(this.segCur[i]);
    }
  }

  /**
   * `dir` is the direction to crawl in world space, length 0..1. A zero vector
   * means stand still.
   */
  update(dt: number, dir: THREE.Vector3): void {
    this.prevPosition.copy(this.position);
    for (let i = 0; i < this.segCur.length; i++) {
      this.segPrev[i].copy(this.segCur[i]);
    }

    if (this.climbing) {
      this.climb(dt, dir);
    } else if (this.dangle) {
      this.hang(dt, dir);
    } else {
      this.crawl(dt, dir);
    }

    this.recordTrail();
    this.layOutBody();
  }

  /** Crawling about the forest floor, and along the start branch. */
  private crawl(dt: number, dir: THREE.Vector3): void {
    // Just back on a branch after hauling up: nothing happens until the stick
    // comes back to rest, so the push that got you up there cannot immediately
    // walk you off the other side.
    if (this.awaitRelease) {
      this.awaitFor += dt;
      if (
        dir.length() < CATERPILLAR.regainRelease ||
        this.awaitFor > CATERPILLAR.regainTimeout
      ) {
        this.awaitRelease = false;
      }
    }
    const drive = this.awaitRelease ? 0 : Math.min(1, dir.length());
    // Idling is a thing it does standing on the ground, so any input — and
    // climbing or hanging, handled elsewhere — puts a stop to it.
    this.still = drive > 0.02 ? 0 : this.still + dt;

    const bough = this.forest.boughUnder(this.position, this.radius + 0.4);

    // On a branch you are on a rail: only the part of the stick running along
    // the branch counts, and the part across it is dropped.
    //
    // A branch's crawlable strip is 0.9 wide and an ordinary turn sweeps an
    // arc wider than that, so steering freely up there walked you off the side
    // whatever you did — which is why there was no getting back to the trunk
    // from out on a branch. Left and right now run you up and down it, which
    // is what the side-on camera makes it look like they should do anyway.
    if (bough) {
      // Held firmly across the branch, this is someone asking to get off it.
      // Measured before the projection below, which is what throws it away.
      // Read from the stick itself, not from `drive`. While the wait for a
      // released stick is running, drive is forced to zero — and reading that
      // as "eased off" rearmed this every time, so the still-held push stepped
      // off again the moment the wait ended. Up and down, for as long as it
      // was held.
      const pushing = dir.length() > 0.001;
      const across = pushing ? -dir.x * bough.dir.y + dir.z * bough.dir.x : 0;

      if (Math.abs(across) <= CATERPILLAR.sideStepPush) {
        // Eased off: forget any dwell, and let the next firm push count.
        this.sidePush = 0;
        this.sideStepArmed = true;
      } else if (this.sideStepArmed) {
        this.sidePush += dt;
        if (this.sidePush >= CATERPILLAR.sideStepDwell) {
          this.sidePush = 0;
          // Hung from where it stood, without shifting it to the edge first.
          // That shift was a teleport of most of a body-width: the trail the
          // body follows got a jump in it, and the segments bunched either
          // side of the jump instead of hanging as one caterpillar.
          this.beginDangle();
          return;
        }
      }

      if (drive > 0.001) {
        let along = dir.x * bough.dir.x + dir.z * bough.dir.y;
        if (Math.abs(along) < 0.25 && !this.sideStepArmed) {
          // Pushed across the branch rather than along it, and not a fresh
          // push meaning to get off: carry on the way it is facing.
          //
          // Otherwise the stick simply does nothing up here, which is what
          // being stuck on a branch feels like — you arrive holding the push
          // that climbed you here, and that push is across the branch.
          const facing =
            Math.sin(this.heading) * bough.dir.x +
            Math.cos(this.heading) * bough.dir.y;
          along = (facing < 0 ? -1 : 1) * Math.min(1, Math.abs(across));
        }
        dir.set(bough.dir.x * along, 0, bough.dir.y * along);
      }
    } else {
      this.sidePush = 0;
      this.sideStepArmed = true;
    }

    // Taken from `drive`, not from the length of `dir`.
    //
    // `drive` is what the wait for a released stick zeroes, and the rail above
    // only projects when it is non-zero — so measuring the movement off `dir`
    // meant that during that wait the caterpillar moved along the *unprojected*
    // stick, straight off the side of the branch. Which is what made hauling
    // yourself up put you back off again, over and over.
    const railDrive = drive > 0.001 ? Math.min(1, dir.length()) : 0;

    if (railDrive > 0.001) {
      const want = Math.atan2(dir.x, dir.z);
      // Turn toward the new heading the short way round.
      let delta = want - this.heading;
      while (delta > Math.PI) {
        delta -= Math.PI * 2;
      }
      while (delta < -Math.PI) {
        delta += Math.PI * 2;
      }
      const step =
        CATERPILLAR.turnRate * dt * (bough ? CATERPILLAR.branchTurnBoost : 1);
      this.heading += THREE.MathUtils.clamp(delta, -step, step);

      // On a branch it travels along the rail rather than along its heading.
      // Constraining the input alone was not enough: through a turn the
      // heading sweeps across the branch, and moving along it carried the
      // caterpillar off the side before it had finished turning round.
      let moveX = Math.sin(this.heading);
      let moveZ = Math.cos(this.heading);
      let speed = this.speed * railDrive;
      if (bough) {
        moveX = dir.x / railDrive;
        moveZ = dir.z / railDrive;
        // ...and only once it is facing that way, so it turns on the spot
        // first instead of moonwalking off down the branch backwards.
        const align =
          Math.sin(this.heading) * moveX + Math.cos(this.heading) * moveZ;
        speed *= Math.max(0, align);
      }
      this.planarSpeed = speed;
      this.position.x += moveX * speed * dt;
      this.position.z += moveZ * speed * dt;
      this.crawlPhase += CATERPILLAR.humpRate * dt * railDrive;
    } else {
      this.planarSpeed = 0;
    }

    this.facing.set(Math.sin(this.heading), 0, Math.cos(this.heading));

    // Heading into a trunk for long enough takes hold of it.
    if (this.tryGrab(dt, dir, railDrive)) {
      return;
    }

    // Coming back along a branch toward its trunk, stop at the distance a
    // climber hangs at rather than carrying on into the trunk itself.
    //
    // Otherwise the grab, which takes a moment to register, happens once the
    // caterpillar is already well inside that radius — and taking hold of the
    // trunk then snaps it back out to arm's length. A grown one jumps the best
    // part of a unit, which reads as teleporting.
    if (bough?.trunk) {
      const t = bough.trunk;
      const dx = this.position.x - t.x;
      const dz = this.position.z - t.z;
      const d = Math.hypot(dx, dz);
      const cling = t.radius + this.radius;
      if (d > 1e-4 && d < cling) {
        this.position.x = t.x + (dx / d) * cling;
        this.position.z = t.z + (dz / d) * cling;
      }
    }

    this.forest.collide(this.position, this.radius);

    // Stand on whatever is underneath, or fall to it.
    const surface = this.forest.surfaceAt(
      this.position.x,
      this.position.z,
      this.position.y,
    );
    const rest = surface + this.radius;

    // Nothing underneath at all, having just been up on something: catch hold
    // of the lip and hang rather than fall.
    //
    // The test is that there is no surface here, not that we are above the one
    // there is. A bough tapers, so its top steps fractionally down with every
    // crawl out along it — measuring "am I higher than the surface?" made the
    // caterpillar let go of the branch on its very first step and hang there,
    // descending straight through the branch it had been standing on.
    if (surface <= 0 && this.prevPosition.y > this.radius + 0.2) {
      // Another branch within reach of its head? Step across to it rather than
      // hang — where one tree's branches reach into another's you should be
      // able to cross without climbing all the way down and up again.
      const near = this.forest.boughStepAcross(
        this.position,
        TREE_BRANCH.hopReach + this.radius,
        bough,
      );
      if (near) {
        this.position.copy(near.point);
        this.position.y += this.radius;
        return;
      }
      this.beginDangle();
      return;
    }

    if (this.position.y > rest + 1e-3) {
      this.vy -= CATERPILLAR.gravity * dt;
      this.position.y += this.vy * dt;
      if (this.position.y < rest) {
        this.position.y = rest;
        this.vy = 0;
      }
    } else {
      this.position.y = rest;
      this.vy = 0;
    }
  }

  /**
   * How far it will lower itself, in world units.
   *
   * A fraction of its length rather than all of it: the rest stays lying along
   * the branch, holding on. See CATERPILLAR.hangGrip.
   */
  private get hangReach(): number {
    return (
      (this.segmentCount - 1) *
      this.radius *
      CATERPILLAR.spacing *
      CATERPILLAR.hangGrip
    );
  }

  /** Catches hold of the lip just crawled over, or of `from` if given. */
  private beginDangle(from?: THREE.Vector3): void {
    this.dangle = {
      // Hung from the last place it actually had branch under it, not from the
      // step past the end where it ran out — it lowers itself from a point on
      // the branch, which is what holding on looks like. A deliberate step off
      // the side passes the edge it went over instead.
      anchor: (from ?? this.prevPosition).clone(),
      // The step before this one, which by definition had support under it.
      // Guessing a way back onto the branch from the anchor instead — a fixed
      // step back along the heading — put the caterpillar down off the side of
      // a neighbouring bough, and it fell straight off again.
      foothold: this.prevPosition.clone(),
      drop: 0,
      age: 0,
    };
    this.vy = 0;
    this.position.y = this.prevPosition.y;
    this.facing.set(0, -1, 0);
  }

  /**
   * Hanging by the tail off a branch.
   *
   * It lowers itself until either its head reaches the ground — in which case
   * it lets go and carries on crawling — or it runs out of body, in which case
   * it simply hangs there. Pushing back toward the branch hauls it up again.
   */
  private hang(dt: number, dir: THREE.Vector3): void {
    this.still = 0;
    this.planarSpeed = 0;
    const d = this.dangle;
    if (!d) {
      return;
    }

    // `dir` here is the stick in plain screen axes, not world ones — the game
    // hands it over untouched while hanging, exactly as it does while
    // climbing. Up the screen is up the rope whichever way the camera happens
    // to be pointing, which is the only mapping that stays true while the
    // camera is swinging about.
    d.age += dt;
    const haul = -dir.z;
    // Left and right turn on the spot, so the stick always does something and
    // you can choose the way you will be facing when you land.
    this.heading = wrapAngle(
      this.heading + dir.x * CATERPILLAR.turnRate * dt * 0.5,
    );

    if (haul > 0.2) {
      d.drop -= CATERPILLAR.hangClimbSpeed * dt * haul;
    } else {
      d.drop += CATERPILLAR.hangDropSpeed * dt;
    }
    d.drop = THREE.MathUtils.clamp(d.drop, 0, this.hangReach);

    this.position.set(d.anchor.x, d.anchor.y - d.drop, d.anchor.z);
    // Head down, so the mouth reaches whatever it is hanging over.
    this.facing.set(0, -1, 0);

    const floor = this.radius;
    if (this.position.y - floor <= CATERPILLAR.dangleLetGo) {
      // Close enough to the ground: let go and drop the rest of the way.
      this.dangle = null;
      this.position.y = floor;
      this.facing.set(Math.sin(this.heading), 0, Math.cos(this.heading));
      return;
    }

    if (d.drop <= 0 && d.age > CATERPILLAR.hangMinTime) {
      // Hauled all the way back up: put down exactly where it last had a
      // foothold, and given a moment before the stick means anything again.
      this.dangle = null;
      this.position.copy(d.foothold);
      this.awaitRelease = true;
      this.awaitFor = 0;
      // The push that hauled it up is still held, and up there that same push
      // means "step off the side". Not until they ease off.
      this.sideStepArmed = false;
      this.sidePush = 0;

      // Facing back the way it came — but along the branch, since that is the
      // only direction it can actually walk in up here. Whichever way along
      // the bough is nearer to "back the way I came" wins, which is right
      // whether it went off the end or off the side.
      const back = wrapAngle(this.heading + Math.PI);
      const bough = this.forest.boughUnder(d.foothold, this.radius + 0.5);
      if (bough) {
        const outward = Math.atan2(bough.dir.x, bough.dir.y);
        const inward = wrapAngle(outward + Math.PI);
        this.heading =
          Math.abs(wrapAngle(outward - back)) <
          Math.abs(wrapAngle(inward - back))
            ? outward
            : inward;
      } else {
        this.heading = back;
      }
      this.facing.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    }
  }

  /**
   * Takes hold of a trunk the player is deliberately pushing into.
   *
   * The dwell is what stops every glancing bump on the way across the wood
   * turning into a climb nobody asked for.
   */
  private tryGrab(dt: number, dir: THREE.Vector3, drive: number): boolean {
    const tree = this.forest.climbableAt(this.position, this.radius, 0.25);
    if (!tree || drive < 0.2 || tree.climbTop <= this.position.y) {
      this.pressing = 0;
      return false;
    }
    // Are we actually heading at it, or just passing?
    const tx = tree.x - this.position.x;
    const tz = tree.z - this.position.z;
    const len = Math.hypot(tx, tz);
    const dot = len > 1e-4 ? (dir.x * tx + dir.z * tz) / (drive * len) : 0;
    if (dot < CLIMB.grabDot) {
      this.pressing = 0;
      return false;
    }
    this.pressing += dt;
    if (this.pressing < CLIMB.grabDwell) {
      return false;
    }
    this.pressing = 0;
    this.climbing = tree;
    this.climbAngle = Math.atan2(
      this.position.z - tree.z,
      this.position.x - tree.x,
    );
    this.vy = 0;
    this.stickToTrunk();
    return true;
  }

  /**
   * Climbing a trunk.
   *
   * The stick keeps its screen meaning: push up the screen to go up the tree,
   * left and right to go round it. Mapping "around" onto the world direction
   * you happen to be facing would mean the same push did something different
   * on each side of the trunk.
   */
  private climb(dt: number, dir: THREE.Vector3): void {
    this.still = 0;
    this.planarSpeed = 0;
    const tree = this.climbing;
    if (!tree) {
      return;
    }
    // dir.z is the screen's up-down axis, positive toward the camera.
    const up = -dir.z;
    const around = dir.x;

    this.climbAngle += around * CLIMB.aroundSpeed * dt;
    this.position.y += up * CLIMB.speed * dt;
    this.crawlPhase +=
      CATERPILLAR.humpRate * dt * Math.min(1, Math.hypot(up, around));

    const floor = this.radius;
    const top = tree.climbTop;
    this.position.y = THREE.MathUtils.clamp(this.position.y, floor, top);
    this.stickToTrunk();

    // Facing up or down the bark, which is where the mouth needs to be.
    this.facing.set(0, up < -0.05 ? -1 : 1, 0);
    // The body still needs a yaw for the head to face out from the trunk.
    this.heading = Math.atan2(
      Math.cos(this.climbAngle),
      Math.sin(this.climbAngle),
    );

    // Going round the trunk is not an attempt to get onto a branch.
    //
    // The boarding window is deliberately wide, which means circling a trunk
    // sweeps through the window of every branch at that height. Without this
    // the caterpillar is snatched onto the first one it passes and then —
    // still being pushed sideways — walks straight off the side of it. From
    // the player's chair that reads as the tree refusing to let them turn.
    const circling = Math.abs(around) > Math.abs(up) * 1.2 + 0.15;
    if (circling) {
      return;
    }

    // Step off onto any of this trunk's branches when you climb level with one
    // on the side you are climbing. This is how you get out to the fruit.
    const bough = this.forest.boughToStepOnto(
      tree,
      this.position,
      this.position.y - this.radius,
    );
    if (bough) {
      // Put down on the branch's centre line facing along it, rather than left
      // wherever the climb happened to be. That is what makes a generous grab
      // safe: catch the branch from a little off to one side and you still end
      // up standing squarely on it, pointed the way you now want to go.
      const spot = this.forest.boardingSpot(
        bough,
        this.position.x,
        this.position.z,
      );
      this.climbing = null;
      this.pressing = 0;
      this.vy = 0;
      // The stick that climbed you here is still held, and on a branch that
      // same push is "step off the side" — which dropped you straight back off
      // the branch you had just reached, over and over. Not until they ease
      // off and mean it.
      this.sideStepArmed = false;
      this.sidePush = 0;
      this.position.copy(spot.point);
      this.position.y += this.radius;
      this.heading = spot.heading;
      this.facing.set(Math.sin(this.heading), 0, Math.cos(this.heading));
      return;
    }

    // Back on the floor, let go — otherwise you would be stuck to the bark
    // with nothing to do but climb again.
    if (this.position.y <= floor + 1e-3 && up < 0) {
      this.letGo(floor);
    }
  }

  /** Holds the caterpillar against the bark at its current height and angle. */
  private stickToTrunk(): void {
    const tree = this.climbing;
    if (!tree) {
      return;
    }
    const r = tree.radius + this.radius;
    this.position.x = tree.x + Math.cos(this.climbAngle) * r;
    this.position.z = tree.z + Math.sin(this.climbAngle) * r;
  }

  /** Lets go of a trunk onto a surface at height `y`. */
  private letGo(y: number): void {
    this.climbing = null;
    this.pressing = 0;
    this.vy = 0;
    this.position.y = y;
    this.facing.set(Math.sin(this.heading), 0, Math.cos(this.heading));
  }

  /** Samples the head's path at a fixed spacing, so the body's spacing along
   *  the trail doesn't depend on how fast the head was going. */
  private recordTrail(): void {
    const newest = this.trail[0];
    if (
      !newest ||
      newest.distanceToSquared(this.position) >= TRAIL_STEP * TRAIL_STEP
    ) {
      this.trail.unshift(new THREE.Vector3().copy(this.position));
      if (this.trail.length > CATERPILLAR.trailLength) {
        this.trail.pop();
      }
    }
  }

  /** Walks back along the trail placing each segment its own distance behind. */
  private layOutBody(): void {
    const radius = this.radius;
    const gap = radius * CATERPILLAR.spacing;
    const count = this.segmentCount;

    let index = 0;
    let travelled = 0;
    let target = gap;

    for (let s = 0; s < count; s++) {
      while (index < this.trail.length - 1 && travelled < target) {
        travelled += this.trail[index].distanceTo(this.trail[index + 1]);
        index++;
      }
      const point = this.trail[Math.min(index, this.trail.length - 1)];
      this.segCur[s].copy(point);
      // The inchworm ripple. Segments further back are further through the
      // wave, which is what makes it travel down the body instead of the whole
      // caterpillar bobbing as one.
      this.segCur[s].y +=
        Math.max(0, Math.sin(this.crawlPhase - s * CATERPILLAR.humpPhase)) *
        CATERPILLAR.humpHeight *
        radius *
        2;
      target += gap;
    }

    for (let s = 0; s < this.segments.length; s++) {
      this.segments[s].visible = s < count;
    }
  }

  /**
   * How far into its idle behaviour it is, 0 to 1.
   *
   * Eased in rather than switched on, so a caterpillar that has just stopped
   * does not immediately start performing.
   */
  private get idling(): number {
    if (this.still <= IDLE.delay) {
      return 0;
    }
    return Math.min(1, (this.still - IDLE.delay) / IDLE.easeIn);
  }

  /**
   * Where it is in a scratch, 0 to 1, or 0 when it isn't scratching.
   *
   * Comes round every few seconds and lasts a moment and a half; the envelope
   * is a half sine, so it lifts into the scratch and settles out of it.
   */
  private get scratching(): number {
    if (this.idling <= 0) {
      return 0;
    }
    const t = this.still % IDLE.scratchEvery;
    if (t > IDLE.scratchFor) {
      return 0;
    }
    return Math.sin((t / IDLE.scratchFor) * Math.PI) * this.idling;
  }

  /**
   * How far into the asking pose it is, 0 to 1, or 0 when it isn't asking.
   *
   * Eased in and out at both ends so it rears up and settles back rather than
   * snapping into the pose and out of it.
   */
  private get asking(): number {
    if (this.still <= IDLE.askDelay || this.climbing || this.dangle) {
      return 0;
    }
    const t = (this.still - IDLE.askDelay) % IDLE.askEvery;
    if (t > IDLE.askFor) {
      return 0;
    }
    const p = t / IDLE.askFor;
    const ease = IDLE.askEase;
    const rise = Math.min(1, p / ease);
    const fall = Math.min(1, (1 - p) / ease);
    return smoothstep(Math.min(rise, fall));
  }

  /**
   * How far into a yawn it is, 0 to 1, or 0 when it isn't yawning.
   *
   * Only after a long wait — see IDLE.yawnDelay — and eased at both ends so
   * the mouth opens and closes rather than snapping.
   */
  private get yawning(): number {
    if (this.still <= IDLE.yawnDelay || this.climbing || this.dangle) {
      return 0;
    }
    const t = (this.still - IDLE.yawnDelay) % IDLE.yawnEvery;
    if (t > IDLE.yawnFor) {
      return 0;
    }
    const p = t / IDLE.yawnFor;
    return smoothstep(Math.min(p / IDLE.yawnEase, (1 - p) / IDLE.yawnEase, 1));
  }

  /** `alpha` is how far between the last two simulation steps we are. */
  render(alpha: number): void {
    const radius = this.radius;
    const idling = this.idling;
    const yawn = this.yawning;
    // A yawn takes precedence over the question; the small movements give way
    // to either rather than fighting them.
    const ask = this.asking * (1 - yawn);
    const big = Math.max(ask, yawn);
    const fidget = idling * (1 - big);
    const scratch = this.scratching * (1 - big);
    // Two waves of different lengths, so looking about never falls into an
    // obvious rhythm.
    const look =
      fidget *
      IDLE.lookAmount *
      (Math.sin(this.still * IDLE.lookRate) * 0.7 +
        Math.sin(this.still * IDLE.lookWanderRate) * 0.3);

    this.tmp.lerpVectors(this.prevPosition, this.position, alpha);
    this.head.position.copy(this.tmp);
    // YXZ: the yaw is applied first and the pitch about the head's own axis
    // after it, so a climbing caterpillar looks up the trunk it is facing
    // rather than up whatever direction the world calls forward.
    this.head.rotation.order = "YXZ";
    // Asking, it turns off its own heading and onto the camera.
    const toCamera = wrapAngle(this.cameraBearing - this.heading);
    this.head.rotation.y = this.heading + look + toCamera * big;
    this.head.rotation.x =
      -Math.atan2(this.facing.y, Math.hypot(this.facing.x, this.facing.z)) +
      fidget * IDLE.nodAmount * Math.sin(this.still * IDLE.nodRate) -
      ask * IDLE.askPitch -
      yawn * IDLE.yawnPitch;
    // Tipped over into a scratch, always to the same side so it reads as one
    // movement rather than a wobble — and tipped again, the other way, into
    // the quizzical lean of the asking pose.
    this.head.rotation.z = scratch * IDLE.scratchTilt - ask * IDLE.askTilt;

    // It stops smiling while it is asking. A smile and a raised eyebrow read
    // as pleased with itself; the question wants a small open mouth.
    const yawning = yawn > 0.15;
    const questioning = !yawning && ask > 0.25;
    this.smile.visible = !yawning && !questioning;
    this.askingMouth.visible = questioning;
    this.yawnMouth.visible = yawning;
    if (yawning) {
      // Opens and closes with the yawn, rather than appearing at full gape.
      this.yawnMouth.scale.set(1, 0.35 + yawn * IDLE.yawnOpen, 1);
    }
    this.head.scale.setScalar(radius * 1.16);

    const count = this.segmentCount;

    /**
     * The rear-up, as an offset for something `d` segments in front of the
     * pivot: swing it up about the pivot from lying along the ground to
     * standing at IDLE.askRear.
     *
     * Doing it as a rotation is what puts the head clear. Lifting each of the
     * front parts by its own share left the spacing between them unchanged, so
     * the head stayed exactly where it had been relative to the segment behind
     * it — up in the air, but still tucked in behind it.
     */
    const gap = radius * CATERPILLAR.spacing;
    const rearF = (Math.cos(IDLE.askRear) - 1) * ask;
    const rearUp = Math.sin(IDLE.askRear) * ask;
    const fwdX = Math.sin(this.heading);
    const fwdZ = Math.cos(this.heading);
    const rear = (out: THREE.Vector3, d: number): void => {
      out.x += fwdX * d * gap * rearF;
      out.y += d * gap * rearUp;
      out.z += fwdZ * d * gap * rearF;
    };
    if (ask > 0) {
      // The head stands out beyond the furthest segment — far enough that it
      // is clear of it rather than tucked in behind it.
      rear(this.head.position, IDLE.askSegments + IDLE.askHeadReach);
    }

    // Sideways, level, at right angles to the way it is facing — the axis both
    // the tail wag and the scratch jitter move along.
    const sideX = Math.cos(this.heading);
    const sideZ = -Math.sin(this.heading);
    const wagFrom = Math.floor(count * IDLE.wagFrom);

    for (let s = 0; s < count; s++) {
      const mesh = this.segments[s];
      mesh.position.lerpVectors(this.segPrev[s], this.segCur[s], alpha);

      if (ask > 0 && s < IDLE.askSegments) {
        rear(mesh.position, IDLE.askSegments - s);
      }

      if (fidget > 0) {
        // The back half wags, further the nearer the tail, and each segment a
        // little behind the one in front so the swing travels down the body.
        if (s >= wagFrom) {
          const along = (s - wagFrom) / Math.max(1, count - 1 - wagFrom);
          const swing =
            Math.sin(this.still * IDLE.wagRate - s * 0.45) *
            IDLE.wagAmount *
            along *
            fidget *
            radius *
            2;
          mesh.position.x += sideX * swing;
          mesh.position.z += sideZ * swing;
        }
        // And the segment or two behind the head do the scratching: lifted
        // against the head and jittering against it.
        if (scratch > 0 && s < IDLE.scratchSegments) {
          const share = 1 - s / IDLE.scratchSegments;
          mesh.position.y += scratch * IDLE.scratchLift * radius * share;
          const jitter =
            Math.sin(this.still * IDLE.scratchRate * Math.PI * 2) *
            IDLE.scratchJitter *
            radius *
            scratch *
            share;
          mesh.position.x += sideX * jitter;
          mesh.position.z += sideZ * jitter;
        }
      }
      // Segments taper toward the tail, so it reads as a caterpillar and not a
      // string of identical beads.
      const taper = 1 - (s / Math.max(1, count - 1)) * 0.32;
      mesh.scale.setScalar(radius * taper);
      // Each segment faces the one in front, so a turn bends the body and a
      // climb stands it on end. Taking the pitch from the body line rather
      // than from a climbing flag means the drape from trunk to floor is
      // right too: the segments still on the bark are vertical while the ones
      // that have reached the ground are already flat.
      const ahead = s === 0 ? this.position : this.segCur[s - 1];
      const dx = ahead.x - this.segCur[s].x;
      const dy = ahead.y - this.segCur[s].y;
      const dz = ahead.z - this.segCur[s].z;
      const horizontal = Math.hypot(dx, dz);
      mesh.rotation.order = "YXZ";
      // Straight up the trunk the horizontal part is nothing but noise, and
      // taking a yaw from it makes the whole body spin on the spot.
      if (horizontal > 0.02) {
        mesh.rotation.y = Math.atan2(dx, dz);
      }
      mesh.rotation.x = -Math.atan2(dy, horizontal);
    }

    this.poseLegs(ask, radius);
  }

  /**
   * The two front legs: up and gesturing while it asks, put away otherwise.
   */
  private poseLegs(ask: number, radius: number): void {
    this.legs.visible = ask > 0.02;
    if (!this.legs.visible) {
      return;
    }
    // Hung off the first body segment rather than the head. Hung off the head
    // they sat inside it: the hinge is half a radius out and the head is more
    // than that across, so most of each leg was swallowed by the face.
    this.legs.position.copy(this.segments[0].position);
    this.legs.position.y -= radius * 0.35;
    // Carried forward of that segment, following the head, so the raised legs
    // are in front of the body rather than lost against it.
    this.legs.position.x += Math.sin(this.head.rotation.y) * radius * 0.5;
    this.legs.position.z += Math.cos(this.head.rotation.y) * radius * 0.5;
    this.legs.rotation.y = this.head.rotation.y;
    this.legs.scale.setScalar(radius);

    const waggle = Math.sin(this.still * IDLE.askWaggleRate) * IDLE.askWaggle;
    this.legHinges.forEach((hinge, i) => {
      const side = i === 0 ? -1 : 1;
      // Swung forward and up from hanging, the two of them out of step so it
      // reads as a gesture rather than a salute.
      hinge.rotation.x = -(IDLE.legRaise * ask) - waggle * side * ask;
      hinge.rotation.z = side * IDLE.legSpread * ask;
    });
  }
}

/** Smooth 0..1, for easing a pose in and out. */
function smoothstep(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

/**
 * One front leg, at radius 1: a tapered limb hanging from the hinge with a
 * foot on the end.
 *
 * Long, and in the head's colours rather than the body's. Built short and
 * green to begin with, each was about as long as a segment is wide and the
 * same colour as the thing it was in front of — two dark nubs by the neck,
 * which is not a gesture anyone would read.
 */
function legGeometry(): THREE.BufferGeometry {
  const limb = new THREE.CylinderGeometry(0.19, 0.27, 2, 6);
  limb.translate(0, -1, 0);
  const foot = new THREE.SphereGeometry(0.29, 7, 6);
  foot.scale(1, 0.85, 1.1);
  foot.translate(0, -1.95, 0.04);
  const geo = mergeGeometries([paint(limb, 0xb1462f), paint(foot, 0x8d3324)]);
  if (!geo) {
    throw new Error("could not merge caterpillar leg");
  }
  return geo;
}

/** Keeps an angle in -PI..PI, so it doesn't wander off into big numbers as
 *  the caterpillar turns about. */
function wrapAngle(a: number): number {
  let out = a;
  while (out > Math.PI) {
    out -= Math.PI * 2;
  }
  while (out < -Math.PI) {
    out += Math.PI * 2;
  }
  return out;
}

/** One body segment, at radius 1: a slightly squashed ball with two feet. */
function segmentGeometry(colour: number): THREE.BufferGeometry {
  const parts: Array<THREE.BufferGeometry> = [];
  const body = new THREE.SphereGeometry(1, 10, 8);
  body.scale(1, 0.92, 1);
  parts.push(paint(body, colour));

  for (const side of [-1, 1]) {
    const foot = new THREE.SphereGeometry(0.3, 6, 5);
    foot.scale(1, 0.8, 1.1);
    // Tucked into the body rather than sitting on its surface, so no seam
    // shows where the two meet.
    foot.translate(side * 0.82, -0.72, 0);
    parts.push(paint(foot, 0x4d7f2a));
  }
  const geo = mergeGeometries(parts);
  if (!geo) {
    throw new Error("could not merge caterpillar segment");
  }
  return geo;
}

/**
 * The face, at radius 1: eyes, two antennae, and both of its mouths.
 */
function makeHead(): {
  group: THREE.Group;
  smile: THREE.Mesh;
  asking: THREE.Mesh;
  yawn: THREE.Mesh;
} {
  const group = new THREE.Group();
  const parts: Array<THREE.BufferGeometry> = [];

  const skull = new THREE.SphereGeometry(1, 12, 10);
  parts.push(paint(skull, HEAD_COLOUR));

  for (const side of [-1, 1]) {
    // The whites stand 0.02 proud of the skull; coplanar with it they flicker.
    const white = new THREE.SphereGeometry(0.34, 8, 7);
    white.translate(side * 0.42, 0.26, 0.86);
    parts.push(paint(white, 0xfdfdfd));

    const pupil = new THREE.SphereGeometry(0.17, 7, 6);
    pupil.translate(side * 0.44, 0.26, 1.12);
    parts.push(paint(pupil, 0x241a1a));

    // Antenna: a stalk with a bobble, leaning forward and out.
    const stalk = new THREE.CylinderGeometry(0.06, 0.07, 0.85, 5);
    stalk.translate(0, 0.42, 0);
    stalk.rotateZ(side * -0.42);
    stalk.rotateX(-0.22);
    stalk.translate(side * 0.34, 0.86, 0.12);
    parts.push(paint(stalk, 0x9c3a2c));

    const bobble = new THREE.SphereGeometry(0.19, 7, 6);
    bobble.translate(side * 0.66, 1.6, 0.28);
    parts.push(paint(bobble, 0xffd94a));
  }

  const geo = mergeGeometries(parts);
  if (!geo) {
    throw new Error("could not merge caterpillar head");
  }
  group.add(new THREE.Mesh(geo, vertexToon()));

  // The mouth is its own mesh rather than merged in, because it has two of
  // them: the usual smile, and the small open one it wears while it is asking
  // you what you are waiting for. Both are children of the head, so they
  // follow the face wherever it looks without any work.
  const smile = new THREE.Mesh(smileGeometry(), vertexToon());
  const asking = new THREE.Mesh(askingMouthGeometry(), vertexToon());
  asking.visible = false;
  const yawn = new THREE.Mesh(yawningMouthGeometry(), vertexToon());
  yawn.visible = false;
  group.add(smile, asking, yawn);

  return {group, smile, asking, yawn};
}

/** The everyday mouth: a torus tipped forward, most of it buried in the head
 *  so only the curve of the smile shows. */
function smileGeometry(): THREE.BufferGeometry {
  const smile = new THREE.TorusGeometry(0.36, 0.075, 6, 14, Math.PI);
  smile.rotateZ(Math.PI);
  smile.rotateX(0.24);
  smile.translate(0, -0.28, 0.95);
  return paint(smile, 0x7a2418);
}

/**
 * The yawning mouth: a wide open one, built at its resting size and stretched
 * open by the render.
 *
 * Its own mesh rather than the questioning line stretched, because a line has
 * no inside to it — opening one only gives a thicker line.
 */
function yawningMouthGeometry(): THREE.BufferGeometry {
  // Wide and flat at rest, so that once the render stretches it open it comes
  // out round rather than as a tall narrow slot. Built the other way about it
  // was half as wide as it was tall at full gape.
  const mouth = new THREE.SphereGeometry(0.19, 12, 9);
  mouth.scale(1.45, 0.6, 0.45);
  mouth.translate(0, -0.32, 0.93);
  return paint(mouth, 0x5e1a12);
}

/**
 * The questioning mouth: a short straight line, set at a slight angle.
 *
 * Not a smile turned upside down, which reads as sad rather than curious, and
 * not a round one either, which reads as surprised. A flat line is a face
 * reserving judgement, and the angle on it is the whole expression — dead
 * level it would be a face with nothing going on at all.
 *
 * A capsule rather than a bar: rounded ends read better than square corners at
 * the size this is ever seen.
 */
function askingMouthGeometry(): THREE.BufferGeometry {
  const mouth = new THREE.CylinderGeometry(0.062, 0.062, 0.4, 6);
  // Built up the Y axis, so it is laid on its side and then tipped.
  mouth.rotateZ(Math.PI / 2 + 0.26);
  mouth.translate(0.02, -0.29, 0.95);
  return paint(mouth, 0x7a2418);
}
