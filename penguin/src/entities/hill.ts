import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {FINISH, HILL} from "../config";
import {paint, PALETTE, toonRamp, vertexToon} from "../render/materials";

/**
 * The mountain.
 *
 * One function — heightAt — and a mesh built by sampling it. Everything else
 * in the game asks the function rather than the mesh: the penguin rides it,
 * the trees are planted on it, the fish float above it and the camera stays
 * out of it. That is the whole reason the ground is arithmetic and not a model
 * file. A model would have to be sampled with a raycast per query, which at
 * sixty steps a second across a few hundred props is a different game's budget.
 *
 * The shape is four things added together:
 *
 *  - a constant fall toward -Z, which is what makes it a hill;
 *  - banks either side of a wandering corridor, which is what keeps you on it;
 *  - rolling waves, which is what makes it a mountain rather than a ramp;
 *  - five kickers, which are what get you into the air.
 *
 * And then the last stretch flattens into a shelf of sea ice, because the run
 * has to end somewhere you can stand up.
 */
export class Hill {
  readonly group = new THREE.Group();

  /** Where the banner hangs and where the ice gives out. Both are worked out
   *  from HILL.length so there is one number to change. */
  readonly bannerZ = -(HILL.length - FINISH.bannerAt);
  readonly edgeZ = -(HILL.length - FINISH.edgeAt);
  /** The height of the flat shelf at the bottom, and of the sea below it. */
  readonly iceLevel: number;
  readonly seaLevel: number;

  /** Where the shelf starts flattening out, and over what distance. */
  private readonly flatFrom = -(HILL.length - 150);
  private readonly flatOver = 60;

  private readonly gradient = new THREE.Vector2();

  constructor() {
    this.iceLevel = this.shelfAt(this.edgeZ);
    this.seaLevel = this.iceLevel - FINISH.seaDrop;

    this.group.add(this.buildGround());
    this.group.add(this.buildLakes());
    this.group.add(this.buildCliff());
    this.group.add(this.buildSea());
  }

  /**
   * The middle of the corridor at this point down the hill.
   *
   * Two waves whose lengths do not divide into one another, so the run never
   * repeats a shape a child could learn by heart — and, more to the point, so
   * the corners do not arrive on a beat.
   */
  centreAt(z: number): number {
    return (
      Math.sin(z / HILL.meanderWave) * HILL.meander +
      Math.sin(z / HILL.meanderWave2) * HILL.meander2
    );
  }

  /**
   * The clear line down the hill: where nothing is planted.
   *
   * It wanders inside the corridor rather than running down the middle of it,
   * so the quick way through is a line you have to find and hold rather than
   * the obvious one straight ahead. The trees close in on both sides.
   */
  laneAt(z: number): number {
    return (
      this.centreAt(z) + Math.sin(z / 97) * 30 + Math.sin(z / 41 + 1.7) * 13
    );
  }

  /** How high the snow is at this point. The whole shape of the game. */
  heightAt(x: number, z: number): number {
    const full = this.rawHeight(x, z);
    if (z > this.flatFrom) {
      return full;
    }
    // The shelf. Blended rather than switched, or there would be a step across
    // the hill you could see from the top and trip over on the way down.
    const t = Math.min(1, (this.flatFrom - z) / this.flatOver);
    const s = t * t * (3 - 2 * t);
    return full * (1 - s) + this.shelfAt(z) * s;
  }

  /**
   * The shelf of sea ice at the bottom: still going downhill, just barely.
   *
   * See HILL.shelfSlope. A level shelf is where the run used to end — the
   * penguin arrived doing forty-three and stopped short of the line, every
   * time, because nothing pushes you along flat ground.
   */
  shelfAt(z: number): number {
    return this.flatFrom * HILL.slope + (z - this.flatFrom) * HILL.shelfSlope;
  }

  /**
   * How frozen this spot is: 1 out on the ice, 0 on the snow, and the rim in
   * between. The penguin reads this to know how much grip it has.
   */
  iceAt(x: number, z: number): number {
    let most = 0;
    for (let i = 0; i < HILL.lakes.length; i++) {
      most = Math.max(most, this.lakeAt(x, z, i));
    }
    return most;
  }

  /**
   * How much of lake `i` covers this spot: 1 anywhere on the ice, falling to 0
   * across the rim outside it.
   *
   * Flat out to the full radius, so the disc that gets drawn sits on ground
   * that really is level under every part of it. See HILL.lakeRim.
   */
  private lakeAt(x: number, z: number, i: number): number {
    const lake = HILL.lakes[i];
    const dx = x - (lake.x + this.centreAt(lake.z));
    const dz = z - lake.z;
    const d = Math.hypot(dx, dz) / lake.radius;
    if (d <= 1) {
      return 1;
    }
    if (d >= 1 + HILL.lakeRim) {
      return 0;
    }
    const t = 1 - (d - 1) / HILL.lakeRim;
    return t * t * (3 - 2 * t);
  }

  /**
   * The surface of a frozen lake: the bare fall line, with nothing on it.
   *
   * Not a level pan, which is what it was first. A pancake pressed into a
   * three-tenths slope leaves a step of twenty-five units at each end of an
   * eighty-unit lake — a wall to hit going in and a cliff to fall off coming
   * out — and measuring it was the only way that was ever going to be
   * noticed. Following the hill's own slope instead, the ice meets the snow at
   * exactly the same height all the way round, and what the lake takes away is
   * the rolls and the banks: no bumps, no walls, nothing to dig an edge into.
   */
  private lakeSurface(z: number): number {
    return z * HILL.slope;
  }

  private rawHeight(x: number, z: number): number {
    let h = z * HILL.slope;

    // The banks. Smoothstep up from the edge of the corridor, and then a plain
    // slope beyond it — a bank that levelled off at the top would give the
    // penguin somewhere to sit outside the course.
    const d = Math.abs(x - this.centreAt(z));
    if (d > HILL.corridor) {
      const t = Math.min(1, (d - HILL.corridor) / HILL.bankWidth);
      h += HILL.bankHeight * t * t * (3 - 2 * t);
      h += Math.max(0, d - HILL.corridor - HILL.bankWidth) * 0.55;
    }

    // The rolls.
    h +=
      Math.sin(z / HILL.rollAlong) *
        Math.cos(x / HILL.rollAcross) *
        HILL.rollHeight +
      Math.sin(z / HILL.rollAlong2 + 2.1) *
        Math.cos(x / HILL.rollAcross2 + 0.7) *
        HILL.rollHeight2;

    // The kickers. Steepening all the way up to a lip and then nothing: see
    // HILL.jumps for why a smooth hump throws no one anywhere.
    for (const jump of HILL.jumps) {
      const dx = x - this.laneAt(jump.z);
      const across = 1 - Math.abs(dx) / jump.width;
      if (across <= 0) {
        continue;
      }
      const dz = z - jump.z;
      let rise = 0;
      if (dz >= 0 && dz <= jump.length) {
        // The run-up, from the flat snow to the lip.
        const t = 1 - dz / jump.length;
        rise = jump.height * t * t;
      } else if (dz < 0) {
        const back = jump.length * HILL.jumpBack;
        if (dz > -back) {
          const u = -dz / back;
          rise = jump.height * (1 - u) * (1 - u);
        }
      }
      // Faded out across the run, so the ramp has sides rather than being a
      // wall the whole width of the valley.
      h += rise * across * across * (3 - 2 * across);
    }

    // The lakes, smoothed in last so they take out whatever was there — a roll
    // running through a frozen lake is a lake nobody believes in. Each one is
    // asked about separately rather than taking the strongest and applying it
    // once per lake, which is what this did to begin with and smoothed the
    // hill twice over.
    for (let i = 0; i < HILL.lakes.length; i++) {
      const t = this.lakeAt(x, z, i);
      if (t > 0) {
        h = h * (1 - t) + this.lakeSurface(z) * t;
      }
    }

    return h;
  }

  /**
   * Which way the hill falls away here, as a 2D gradient (dh/dx, dh/dz).
   *
   * Sampled rather than differentiated. The height is a sum of six or seven
   * terms with a loop in the middle of it, and the derivative of that by hand
   * would be a second thing to keep in step with the first every time the
   * shape changed.
   */
  slopeAt(x: number, z: number, out: THREE.Vector2): THREE.Vector2 {
    const e = 1.5;
    return out.set(
      (this.heightAt(x + e, z) - this.heightAt(x - e, z)) / (2 * e),
      (this.heightAt(x, z + e) - this.heightAt(x, z - e)) / (2 * e),
    );
  }

  /**
   * How much of a dip this is: positive in a hollow, negative on a crest.
   *
   * The discrete Laplacian — the height here against the average of the four
   * around it. Sampled eight units out rather than at the width of a triangle,
   * because what wants shading is the rolls in the hill, and a sample at the
   * mesh's own scale would only ever find the noise on top of them.
   */
  private hollow(x: number, z: number): number {
    const e = 8;
    return (
      this.heightAt(x + e, z) +
      this.heightAt(x - e, z) +
      this.heightAt(x, z + e) +
      this.heightAt(x, z - e) -
      4 * this.heightAt(x, z)
    );
  }

  /** How steep it is here, as a plain number: 0 flat, 1 forty-five degrees. */
  steepness(x: number, z: number): number {
    return this.slopeAt(x, z, this.gradient).length();
  }

  /** Is this spot on the run at all, rather than up the side of the valley? */
  onCourse(x: number, z: number): boolean {
    return Math.abs(x - this.centreAt(z)) < HILL.corridor + HILL.bankWidth;
  }

  /**
   * The snow itself.
   *
   * Smooth-shaded rather than faceted, which is a departure from the other
   * games here: snow is the one surface in the world that really is smooth,
   * and the toon ramp gives it broad soft bands that read as drifts. Faceting
   * it made a hillside of paper aeroplanes.
   */
  private buildGround(): THREE.Mesh {
    const zTop = 40;
    const zBottom = this.edgeZ;
    const along = Math.ceil((zTop - zBottom) / HILL.cell);
    const across = Math.ceil((HILL.halfWidth * 2) / HILL.cell);

    const geo = new THREE.PlaneGeometry(
      HILL.halfWidth * 2,
      zTop - zBottom,
      across,
      along,
    );
    // Flat on the ground, and then shifted so its far edge is the ice lip.
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0, (zTop + zBottom) / 2);

    const pos = geo.attributes.position;
    const colour = new Float32Array(pos.count * 3);
    const snow = new THREE.Color(PALETTE.snow).convertSRGBToLinear();
    const shade = new THREE.Color(PALETTE.snowShade).convertSRGBToLinear();
    const rock = new THREE.Color(PALETTE.rock).convertSRGBToLinear();
    const c = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, this.heightAt(x, z));

      // Snow does not stick to anything steeper than about forty degrees, so
      // the steepest parts of the banks show the mountain underneath. It is
      // also the one cue that tells a child which parts of the wall are worth
      // riding and which are just wall.
      const steep = this.steepness(x, z);
      c.copy(snow);
      c.lerp(shade, Math.min(1, steep * 0.5));
      // And the hollows go blue.
      //
      // A white hill lit by a white sky has almost no shading on it, and the
      // first version of this was a flat sheet you could not read the rolls
      // in — you found out about a bump by being thrown off it. This is the
      // curvature of the ground, which is what a photograph of snow actually
      // shows: dips hold shadow, crests catch the light.
      // The multiplier is off a measurement, not a guess: sampled over the
      // whole run the curvature lands between -0.4 and +1.4, so 0.45 takes a
      // deep hollow most of the way to the shaded blue and leaves a crest
      // white.
      c.lerp(shade, Math.min(0.7, Math.max(0, this.hollow(x, z) * 0.45)));
      c.lerp(rock, Math.min(1, Math.max(0, (steep - 0.85) * 1.4)));
      colour[i * 3] = c.r;
      colour[i * 3 + 1] = c.g;
      colour[i * 3 + 2] = c.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colour, 3));
    geo.computeVertexNormals();

    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshToonMaterial({
        vertexColors: true,
        gradientMap: toonRamp(),
      }),
    );
    mesh.receiveShadow = true;
    return mesh;
  }

  /**
   * The lakes themselves.
   *
   * A disc laid a hand's breadth above the snow rather than painted into the
   * ground: the ground is built out of five-unit triangles and a lake coloured
   * into it would have a staircase for a shore. Proud of the surface, because
   * coplanar faces z-fight and a lake that flickers as you cross it is the
   * worst possible thing to put under a child at fifty units a second.
   *
   * The ground under it really is flat — see rawHeight — so a flat disc sits
   * on it exactly.
   */
  private buildLakes(): THREE.Mesh {
    const parts: Array<THREE.BufferGeometry> = [];
    for (let i = 0; i < HILL.lakes.length; i++) {
      const lake = HILL.lakes[i];
      const x = lake.x + this.centreAt(lake.z);

      // No ring of piled snow round it, though there was one to begin with.
      // A flat ring sits over the ramp outside the ice, and the ramp is the
      // one part of a lake that is not level — so the ring was buried at its
      // outer edge and hanging in the air at its inner one. The ground is
      // already snow-coloured out there, and snow meeting ice is the shore.
      // Laid on the lake's own surface by sampling it, rather than by tilting
      // a flat disc: a tilted circle is an ellipse seen from above, and its
      // edge would no longer be where the ice actually stops.
      const ice = new THREE.CircleGeometry(lake.radius, 56);
      ice.rotateX(-Math.PI / 2);
      ice.translate(x, 0, lake.z);
      const pos = ice.attributes.position;
      for (let v = 0; v < pos.count; v++) {
        pos.setY(v, this.lakeSurface(pos.getZ(v)) + 0.06);
      }
      parts.push(paint(ice, PALETTE.ice));

      // Frost streaks. A big pale disc on its own reads as open water — which
      // is the last thing to put in front of a child at the bottom of a hill —
      // and a dozen white scratches across it is the whole of what says the
      // lake is frozen. Laid out from the lake's own index rather than from a
      // generator, so they are in the same places every run.
      for (let k = 0; k < 12; k++) {
        const a = (k * 2.399 + i) % Math.PI;
        const r = lake.radius * (0.12 + ((k * 7) % 10) / 13);
        const len = lake.radius * (0.2 + ((k * 3) % 5) / 11);
        const streak = new THREE.PlaneGeometry(len, 1.1 + (k % 3) * 0.5);
        streak.rotateX(-Math.PI / 2);
        streak.rotateY(a);
        const sx = x + Math.cos(a + 1.4) * r;
        const sz = lake.z + Math.sin(a + 1.4) * r;
        streak.translate(sx, 0, sz);
        const sp = streak.attributes.position;
        for (let v = 0; v < sp.count; v++) {
          sp.setY(v, this.lakeSurface(sp.getZ(v)) + 0.1);
        }
        parts.push(paint(streak, PALETTE.snow));
      }
    }
    const mesh = new THREE.Mesh(mergeGeometries(parts, false), vertexToon());
    mesh.receiveShadow = true;
    return mesh;
  }

  /**
   * The face of the ice where the shelf ends.
   *
   * Only ever seen for the second and a half the penguin is in the air over
   * the water, but without it you look straight through the lip into the sea
   * and the mountain is revealed as a sheet of paper.
   */
  private buildCliff(): THREE.Mesh {
    const height = FINISH.seaDrop + 30;
    const depth = 10;
    const geo = new THREE.BoxGeometry(HILL.halfWidth * 2, height, depth);
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshToonMaterial({
        color: PALETTE.ice,
        gradientMap: toonRamp(),
      }),
    );
    // Tucked in *under* the shelf, with its face on the lip — not hanging out
    // over the water, which is where it was: a block twenty-two units deep
    // reaching past the edge, so the penguin flew off the ice and splashed
    // down inside it, and the last thing anybody saw of the run was the
    // inside of a box.
    mesh.position.set(
      0,
      this.iceLevel - height / 2 + 1,
      this.edgeZ + depth / 2,
    );
    mesh.receiveShadow = true;
    return mesh;
  }

  /** The sea at the bottom, which is where the run ends. */
  private buildSea(): THREE.Mesh {
    const geo = new THREE.PlaneGeometry(FINISH.seaSize, FINISH.seaSize);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshToonMaterial({
        color: PALETTE.sea,
        gradientMap: toonRamp(),
      }),
    );
    mesh.position.set(0, this.seaLevel, this.edgeZ - FINISH.seaSize / 2);
    return mesh;
  }
}
