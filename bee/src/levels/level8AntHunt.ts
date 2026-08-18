import * as THREE from "three";
import {ANT_HUNT as A, ANT_PALETTE as P} from "../config";
import {Rng} from "../core/rng";
import {
  AntActor,
  createAntGeometry,
  type CargoKind,
} from "../entities/antActor";
import {BeeNet} from "../entities/beeNet";
import {DanglingLoad} from "../entities/danglingLoad";
import {FIREWORK_PALETTE} from "../fx/particles";
import {createBaby, type BabyModel} from "../render/geometry/bee";
import {createAntIslands, type AntIslands} from "../render/geometry/antIslands";
import {createWater, type Water} from "../render/geometry/water";
import {vertexToon} from "../render/materials";
import type {GameContext, Level} from "./level";

/**
 * Hunting one island, handing the net over, or done.
 *
 * There is no phase for crossing a bridge: she is flown the whole way, and
 * arriving at the next island is something the level notices rather than
 * something it stages.
 */
type Phase = "opening" | "hunting" | "handing" | "won" | "done";

const tmp = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const belly = new THREE.Vector3();
const eye = new THREE.Vector3();
const look = new THREE.Vector3();
const fromEye = new THREE.Vector3();
const fromLook = new THREE.Vector3();
const blend = new THREE.Vector3();
const blendLook = new THREE.Vector3();

const ease = (t: number): number =>
  t < 0.5 ? 2 * t * t : 1 - (1 - t) * (1 - t) * 2;

/**
 * Level 8 — the Ant Hunt.
 *
 * Three islands, joined one-two-three by wooden bridges with a gate on each.
 * Every island has ants running about with a flower or a jar of honey on their
 * backs, and a net hangs under the queen: fly the net into an ant and the
 * cargo is hers. Fill the net and the gate opens, a baby comes for it, and
 * she crosses to the next island and is handed a new one.
 *
 * Two things carry the level. The net swings on a rope rather than being
 * strapped to her, so catching is a matter of leading an ant rather than
 * flying at it; and each island is sealed until its work is done, so there is
 * never a moment where what to do next is somewhere else.
 *
 * She is flown normally throughout — this is the game's ordinary flight model,
 * with the bee kept inside the islands by hand every frame. See
 * `AntIslands.contain`, and the note there about why the flight model can't do
 * it: it knows about one circle, and this is three of them with corridors in
 * between.
 */
export class AntHuntLevel implements Level {
  readonly name = "Ant Hunt";
  readonly completionTitle = "Every last one!";
  readonly completionBody =
    "Three islands, three netfuls, and the ants have nothing left to carry.";
  /**
   * The card offers the map: the Mouldy Mountain is a different land, and the
   * map is how you get to it.
   */
  readonly finishesGame = true;

  complete = false;

  private world!: AntIslands;
  private water!: Water;
  private phase: Phase = "hunting";
  private phaseTime = 0;

  /** Which island she is working, 0-based. */
  private island = 0;
  /** Cargo in the net right now, which is also what the counter shows. */
  private collected = 0;
  /** How long she has been working this island, which is what tires its ants. */
  private islandTime = 0;

  private readonly ants: Array<AntActor> = [];
  private antGeometry!: THREE.BufferGeometry;
  private antMaterial!: THREE.Material;

  private net: BeeNet | null = null;
  private rope: DanglingLoad | null = null;
  /** Cargo in the air between an ant and the net. */
  private readonly inFlight: Array<{
    item: THREE.Object3D;
    from: THREE.Vector3;
    time: number;
  }> = [];

  /** The baby that comes for a full net, and the net it is taking. */
  private carrier: BabyModel | null = null;
  private carriedNet: BeeNet | null = null;
  private carrierFrom = new THREE.Vector3();
  private carrierTo = new THREE.Vector3();

  private nextBurst = 0;
  private bursts = 0;

  /** She is flown the whole way, once the opening shot has let go of her. */
  get controlsLocked(): boolean {
    return this.phase !== "hunting" && this.phase !== "handing";
  }

  enter(ctx: GameContext): void {
    ctx.setEnvironment("islands");
    const rng = new Rng(0xa27_ba11);
    this.world = createAntIslands(rng);
    ctx.islands.add(this.world.group);
    this.water = createWater();
    this.world.group.add(this.water.mesh);

    this.antGeometry = createAntGeometry();
    this.antMaterial = vertexToon();
    this.ants.length = 0;
    this.inFlight.length = 0;
    this.island = 0;
    this.collected = 0;
    this.islandTime = 0;
    this.phase = "opening";
    this.phaseTime = 0;
    this.complete = false;
    this.bursts = 0;
    this.nextBurst = 0;
    this.carrier = null;
    this.carriedNet = null;

    for (let i = 0; i < A.islands.length; i++) {
      this.stockIsland(i, rng);
    }

    ctx.configureFlight({
      boundsRadius: 4000,
      minHeight: A.minHeight,
      maxHeight: A.maxHeight,
      cameraDistance: A.cameraDistance,
      cameraHeight: A.cameraHeight,
    });

    const start = this.world.islands[0].centre;
    ctx.placeBee(
      tmp.set(start.x, A.startHeight, start.z + A.islandRadius * 0.55),
      A.startHeight,
      Math.PI,
    );
    ctx.bee.setCrown(true);
    this.giveNet(ctx);

    ctx.hud.setBanner(this.name);
    ctx.hud.setObjective(
      "Catch the ants with your net and take their flowers and honey.",
    );
    ctx.hud.setCounters([
      {
        key: "cargo",
        label: "Net",
        color: P.netRim,
        value: 0,
        target: A.antsPerIsland,
      },
    ]);
    ctx.hud.setCallout("Fly your net into the ants!");

    // The opening shot: all three islands at once, before anything is asked of
    // her. See `frameTheIslands` for why it isn't simply a high camera.
    this.frameTheIslands(ctx);
    ctx.setCameraCinematic(fromEye, fromLook);
  }

  /**
   * Stand the camera where all three islands fit on the screen.
   *
   * Framed rather than placed: `framedCameraEye` is given the square the
   * islands occupy and works the distance out from the camera's own aspect, so
   * the shot holds on a portrait phone as well as on a landscape iPad. A
   * hand-placed height that looked right in one lost the far island in the
   * other.
   */
  private frameTheIslands(ctx: GameContext): void {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const island of this.world.islands) {
      minX = Math.min(minX, island.centre.x - A.islandRadius);
      maxX = Math.max(maxX, island.centre.x + A.islandRadius);
      minZ = Math.min(minZ, island.centre.z - A.islandRadius);
      maxZ = Math.max(maxZ, island.centre.z + A.islandRadius);
    }
    fromLook.set((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
    const half = Math.max(maxX - minX, maxZ - minZ) / 2;
    fromEye.copy(
      ctx.framedCameraEye(fromLook, half, A.opening.pitch, A.opening.fill),
    );
  }

  exit(ctx: GameContext): void {
    ctx.hud.setCallout(null);
    ctx.islands.remove(this.world.group);
    this.world.dispose();
    this.water.dispose();
    this.antGeometry.dispose();
    this.antMaterial.dispose();
    // The net and everything that belongs to it live in the Game's island
    // group rather than in this level's own, because the net has to keep
    // hanging under her while she is over open water between two islands. So
    // they have to be taken out by hand: disposing them alone left the last
    // net floating in the world, and starting the level again hung a second
    // one under her.
    for (const object of [
      this.net?.group,
      this.rope?.rope,
      this.carriedNet?.group,
      this.carrier?.group,
      ...this.inFlight.map(f => f.item),
    ]) {
      if (object) {
        ctx.islands.remove(object);
      }
    }
    this.net?.dispose();
    this.carriedNet?.dispose();
    this.net = null;
    this.rope = null;
    this.carriedNet = null;
    this.carrier = null;
    this.inFlight.length = 0;
    ctx.bee.setCrown(false);
  }

  resumeAfterCompletion(): void {
    // Nothing to re-arm: every ant on every island has been emptied.
  }

  update(dt: number, ctx: GameContext): void {
    this.phaseTime += dt;
    // Above every phase: the world's gates, the ants and anything in the air
    // keep moving whatever the level is otherwise doing.
    this.world.update(dt);
    this.water.update(dt);
    this.islandTime += dt;
    for (const ant of this.ants) {
      ant.update(dt, this.antPace(ant.islandIndex));
    }
    this.updateNet(dt, ctx);
    this.updateInFlight(dt);
    this.updateCarrier(ctx);

    // She may not leave the island she is on except by an open bridge. Done
    // after the flight model has moved her, which is the only place it can be.
    this.world.contain(ctx.bee.position);

    switch (this.phase) {
      case "opening":
        this.updateOpening(ctx);
        break;
      case "hunting":
        this.updateHunting(ctx);
        break;
      case "handing":
        // The baby is taking the net; she is free to fly on meanwhile, and
        // arriving at the next island is what ends this.
        this.checkArrival(ctx);
        break;
      case "won":
        this.updateWon(dt, ctx);
        break;
      case "done":
        break;
    }
  }

  /**
   * Hold the whole place in shot, then fall in behind her.
   *
   * The shot it falls to is the flight camera's own, worked out from the rig's
   * distance and height, so the last frame of the swoop and the first frame of
   * play are the same picture and there is no jump when the level hands over.
   */
  private updateOpening(ctx: GameContext): void {
    const hold = A.opening.holdTime;
    if (this.phaseTime < hold) {
      ctx.setCameraCinematic(fromEye, fromLook);
      return;
    }
    const t = ease(Math.min(1, (this.phaseTime - hold) / A.opening.swoopTime));
    // Where the follow camera would be standing: behind her by the rig's
    // distance, up by its height.
    look.copy(ctx.bee.position);
    eye.set(
      ctx.bee.position.x,
      ctx.bee.position.y + A.cameraHeight,
      ctx.bee.position.z + A.cameraDistance,
    );
    blend.copy(fromEye).lerp(eye, t);
    blendLook.copy(fromLook).lerp(look, t);
    ctx.setCameraCinematic(blend, blendLook);
    if (t >= 1) {
      // Hand the camera back; the rig glides on from where the shot ended.
      ctx.setCameraCinematic(null);
      this.phase = "hunting";
      this.phaseTime = 0;
    }
  }

  /**
   * How fast an island's ants are running just now.
   *
   * Two things multiplied: what that island runs at to begin with — see
   * ANT_HUNT.islandPace, which is the level's difficulty curve — and how much
   * the island she is working has tired since she arrived on it.
   *
   * The tiring is asked of her island alone. It is a clock that starts when
   * she lands, and an island she has not reached yet has no reason to be
   * flagging.
   */
  private antPace(island: number): number {
    const base = A.islandPace[island] ?? 1;
    if (island !== this.island) {
      return base;
    }
    const {from, to, floor} = A.antTire;
    if (this.islandTime <= from) {
      return base;
    }
    const t = Math.min(1, (this.islandTime - from) / (to - from));
    return base * (1 - (1 - floor) * t);
  }

  // ---- the hunt -----------------------------------------------------------

  private updateHunting(ctx: GameContext): void {
    const net = this.net;
    if (!net) {
      return;
    }
    for (const ant of this.ants) {
      if (!ant.carrying || ant.finished) {
        continue;
      }
      // The net catches it, and so does she — the net is the tool but flying
      // straight into an ant should never feel like a miss.
      const caughtByNet =
        tmp.copy(ant.cargoPosition).sub(net.mouth).length() < A.net.radius;
      const caughtByBee =
        tmpB.copy(ant.cargoPosition).sub(ctx.bee.position).length() <
        A.beeReach;
      if (!caughtByNet && !caughtByBee) {
        continue;
      }
      const cargo = ant.robCargo(this.world.group);
      if (!cargo) {
        continue;
      }
      this.inFlight.push({
        item: cargo,
        from: cargo.position.clone(),
        time: 0,
      });
      this.collected++;
      ctx.hud.setCount("cargo", this.collected, A.antsPerIsland, true);
      ctx.hud.setCallout(null);
      ctx.audio.collect(this.collected);
      // Every ant's cargo, which is what opens the gate.
      if (this.collected >= A.antsPerIsland) {
        this.islandDone(ctx);
        return;
      }
    }
  }

  /** The island's quota is met: open its gate and send for the net. */
  private islandDone(ctx: GameContext): void {
    const last = this.island >= A.islands.length - 1;
    if (last) {
      this.phase = "won";
      this.phaseTime = 0;
      ctx.hud.setCallout(null);
      return;
    }
    this.world.openGate(this.island);
    this.phase = "handing";
    this.phaseTime = 0;
    ctx.audio.quotaComplete();
    ctx.hud.setCallout("The gate is open — cross the bridge!");
    this.sendCarrier(ctx);
  }

  /** Has she reached the island the open bridge leads to? */
  private checkArrival(ctx: GameContext): void {
    const here = this.world.islandAt(ctx.bee.position);
    if (here !== this.island + 1) {
      return;
    }
    this.island = here;
    this.collected = 0;
    this.islandTime = 0;
    this.phase = "hunting";
    this.phaseTime = 0;
    ctx.hud.setCount("cargo", 0, A.antsPerIsland);
    ctx.hud.setCallout("A fresh net! Fill it up.");
    this.giveNet(ctx);
  }

  // ---- the net ------------------------------------------------------------

  /** Hang a new, empty net under her. */
  private giveNet(ctx: GameContext): void {
    this.net?.dispose();
    const net = new BeeNet();
    this.net = net;
    ctx.islands.add(net.group);
    const rope = new DanglingLoad(net.group, {
      ropeLength: A.net.ropeLength,
      gravity: A.net.gravity,
      damping: A.net.damping,
      ropeColor: P.rope,
      ropeRadius: 0.05,
    });
    rope.carried = true;
    ctx.islands.add(rope.rope);
    this.rope = rope;
    // Start it under her rather than at the origin, or it swings in from
    // wherever the world's middle happens to be.
    ctx.bee.headPosition(belly);
    net.group.position.set(
      ctx.bee.position.x,
      ctx.bee.position.y - A.net.ropeLength,
      ctx.bee.position.z,
    );
  }

  private updateNet(dt: number, ctx: GameContext): void {
    if (!this.net || !this.rope) {
      return;
    }
    belly.copy(ctx.bee.position);
    belly.y -= 0.35;
    this.rope.update(dt, belly);
    this.net.update();
  }

  /** Cargo taken off an ant flies to the net and drops in. */
  private updateInFlight(dt: number): void {
    for (let i = this.inFlight.length - 1; i >= 0; i--) {
      const flight = this.inFlight[i];
      flight.time += dt;
      const t = Math.min(1, flight.time / A.cargoFlyTime);
      const net = this.carriedNet ?? this.net;
      if (!net) {
        this.inFlight.splice(i, 1);
        continue;
      }
      tmp.copy(flight.from).lerp(net.mouth, ease(t));
      // Up and over, so it arcs into the bag rather than sliding there.
      tmp.y += Math.sin(Math.PI * t) * 1.2;
      flight.item.position.copy(tmp);
      if (t >= 1) {
        this.inFlight.splice(i, 1);
        net.hold(flight.item);
      }
    }
  }

  // ---- the hand-over ------------------------------------------------------

  /**
   * A baby comes for the full net.
   *
   * It flies in from off the island, takes the net — rope and all — and
   * carries it away, which is what says the island is finished. She keeps
   * flying throughout; this is scenery with a job, not a cutscene.
   */
  private sendCarrier(ctx: GameContext): void {
    const net = this.net;
    if (!net) {
      return;
    }
    // The net stops following her and belongs to the baby now.
    this.carriedNet = net;
    this.net = null;
    if (this.rope) {
      ctx.islands.remove(this.rope.rope);
      this.rope = null;
    }

    const baby = createBaby();
    // Smaller than the queen: she is the one with the crown, and a courier
    // that outsized her read as another adult come to take over.
    baby.group.scale.setScalar(0.95);
    baby.setGrowth(1);
    const centre = this.world.islands[this.island].centre;
    this.carrierFrom.set(
      centre.x - A.handoff.approach,
      A.handoff.height,
      centre.z - A.handoff.approach,
    );
    this.carrierTo.set(
      centre.x + A.handoff.approach,
      A.handoff.height,
      centre.z + A.handoff.approach,
    );
    baby.group.position.copy(this.carrierFrom);
    ctx.islands.add(baby.group);
    this.carrier = baby;
  }

  private updateCarrier(ctx: GameContext): void {
    const baby = this.carrier;
    if (!baby) {
      return;
    }
    const net = this.carriedNet;
    const inTime = A.handoff.inTime;
    const hold = A.handoff.holdTime;
    const t = this.phaseTime;

    if (t < inTime) {
      // In, to wherever the net is hanging.
      const k = ease(t / inTime);
      tmp.copy(net?.group.position ?? ctx.bee.position);
      tmp.y += 2.2;
      baby.group.position.copy(this.carrierFrom).lerp(tmp, k);
    } else if (t < inTime + hold) {
      // Holding over it, taking hold.
      tmp.copy(net?.group.position ?? ctx.bee.position);
      tmp.y += 2.2;
      baby.group.position.copy(tmp);
    } else {
      // Away, with the net under it.
      const k = ease(Math.min(1, (t - inTime - hold) / A.handoff.outTime));
      tmp.copy(net?.group.position ?? baby.group.position);
      tmp.y += 2.2;
      baby.group.position.lerp(this.carrierTo, k * 0.12 + 0.02);
      if (net) {
        net.group.position.set(
          baby.group.position.x,
          baby.group.position.y - 2.2,
          baby.group.position.z,
        );
      }
      if (k >= 1) {
        ctx.islands.remove(baby.group);
        if (net) {
          ctx.islands.remove(net.group);
          net.dispose();
        }
        this.carrier = null;
        this.carriedNet = null;
        return;
      }
    }

    baby.animate(this.phaseTime, 1);
    // Facing the way it is going.
    tmpB.copy(this.carrierTo).sub(baby.group.position).setY(0);
    if (tmpB.lengthSq() > 1e-3) {
      baby.group.rotation.y = Math.atan2(tmpB.x, tmpB.z);
    }
    if (net && t >= inTime && t < inTime + hold) {
      net.group.position.set(
        baby.group.position.x,
        baby.group.position.y - 2.2,
        baby.group.position.z,
      );
    }
    net?.update();
  }

  // ---- stocking and finishing --------------------------------------------

  /**
   * Fill an island with ants.
   *
   * One of each flower and jars for the rest. Every one of them has to be
   * caught to open the gate, which is safe to ask: an ant only runs for its
   * hill once it has already been robbed, so nothing here can carry its cargo
   * out of reach.
   */
  private stockIsland(index: number, rng: Rng): void {
    const island = this.world.islands[index];
    const kinds: Array<CargoKind> = ["white", "yellow", "orange"];
    while (kinds.length < A.antsPerIsland) {
      kinds.push("honey");
    }
    for (let i = kinds.length - 1; i > 0; i--) {
      const j = Math.floor(rng.range(0, i + 1));
      [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
    }
    for (const kind of kinds) {
      const angle = rng.range(0, Math.PI * 2);
      const radius = A.islandRadius * Math.sqrt(rng.range(0.05, 0.75));
      const ant = new AntActor(
        kind,
        index,
        island,
        rng,
        tmp.set(
          island.centre.x + Math.cos(angle) * radius,
          0,
          island.centre.z + Math.sin(angle) * radius,
        ),
        this.antGeometry,
        this.antMaterial,
      );
      this.world.group.add(ant.group);
      this.ants.push(ant);
    }
  }

  private updateWon(dt: number, ctx: GameContext): void {
    this.nextBurst -= dt;
    if (this.nextBurst <= 0 && this.bursts < A.winBursts) {
      this.nextBurst = A.winBurstEvery;
      this.bursts++;
      tmp.copy(ctx.bee.position);
      tmp.x += (this.bursts % 2 === 0 ? 1 : -1) * this.bursts * 1.6;
      tmp.y += 2 + this.bursts * 0.4;
      ctx.fireworks.burst(tmp, {
        color: FIREWORK_PALETTE,
        count: 28,
        speed: 10,
        spherical: 1,
        ttl: 1.6,
        size: 0.85,
      });
      ctx.audio.levelComplete();
    }
    if (this.bursts >= A.winBursts && this.nextBurst <= 0) {
      // Emptying the islands is what opens the Mouldy Mountain.
      ctx.save.mutate(d => {
        d.level = 9;
      });
      this.phase = "done";
      this.complete = true;
    }
  }
}
