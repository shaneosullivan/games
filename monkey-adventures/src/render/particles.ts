import {PARTY, WORLD} from "../config";

/**
 * Bits of colour thrown into the air.
 *
 * Its own small thing rather than the repo's shared `particles.ts`, which is
 * instanced three.js geometry and has nothing to offer a canvas. The rule in
 * this repo is that shared code earns its place by being furniture or by
 * being one fiddly mechanism; a dozen squares with gravity on them is
 * neither, so it lives here.
 *
 * One pixel square each, because anything else in this picture would be a
 * different game's art turning up in this one.
 */
interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
  colour: string;
}

export class Party {
  private bits: Array<Bit> = [];

  /** Throws a burst up from a point. */
  burst(
    x: number,
    y: number,
    many: number = PARTY.bits,
    colours: ReadonlyArray<string> = PARTY.colours,
    upward = true,
  ): void {
    for (let i = 0; i < many; i++) {
      // Thrown round a half-circle rather than a whole one, so a burst goes
      // up and out like something celebrating and not like something that
      // exploded on the ground.
      const turn = upward
        ? -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9
        : Math.random() * Math.PI * 2;
      const speed = PARTY.speed + (Math.random() - 0.5) * 2 * PARTY.varies;
      this.bits.push({
        x,
        y,
        vx: Math.cos(turn) * speed,
        vy: Math.sin(turn) * speed,
        life: PARTY.lasts * (0.6 + Math.random() * 0.7),
        size: Math.random() < 0.35 ? 2 : 1,
        colour: colours[Math.floor(Math.random() * colours.length)],
      });
    }
  }

  update(dt: number): void {
    for (const bit of this.bits) {
      bit.vy += WORLD.gravity * PARTY.weight * dt;
      bit.x += bit.vx * dt;
      bit.y += bit.vy * dt;
      bit.life -= dt;
    }
    // Kept as a filter rather than spliced in place: a burst is thirty
    // things and this happens once a frame, and the clear version is worth
    // more than the saved allocation.
    this.bits = this.bits.filter(bit => bit.life > 0);
  }

  draw(g: CanvasRenderingContext2D, camera: number): void {
    for (const bit of this.bits) {
      // Fading out over the last of its life, by going see-through rather
      // than by shrinking: a pixel that shrinks has nowhere to go.
      g.globalAlpha = Math.max(0, Math.min(1, bit.life / 0.45));
      g.fillStyle = bit.colour;
      g.fillRect(
        Math.round(bit.x - camera),
        Math.round(bit.y),
        bit.size,
        bit.size,
      );
    }
    g.globalAlpha = 1;
  }

  get busy(): boolean {
    return this.bits.length > 0;
  }

  clear(): void {
    this.bits.length = 0;
  }
}
