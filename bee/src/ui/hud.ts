import { POLLEN_COLOR, type PollenKind } from '../config';

const RING_R = 32;
const RING_C = 2 * Math.PI * RING_R;

export interface CounterDef {
  key: string;
  label: string;
  /** Dot colour, as a hex number. */
  color: number;
  value: number;
  target: number;
}

interface CounterRow {
  root: HTMLDivElement;
  count: HTMLSpanElement;
  target: number;
}

export class Hud {
  readonly root: HTMLDivElement;
  private readonly topLeft: HTMLDivElement;
  private readonly rows = new Map<string, CounterRow>();
  private readonly banner: HTMLDivElement;
  private readonly objective: HTMLDivElement;
  private readonly harvest: SVGSVGElement;
  private readonly harvestFill: SVGCircleElement;
  private readonly carry: HTMLDivElement;
  private readonly carryDot: HTMLDivElement;
  private readonly carryLabel: HTMLDivElement;
  private readonly perf: HTMLDivElement;
  private showPerf = false;

  constructor(
    host: HTMLElement,
    onMuteToggle: (muted: boolean) => void,
    onMenu: () => void,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'hud';

    this.banner = el('div', 'hud-banner', 'Sunny Meadow');
    this.objective = el('div', 'hud-objective', '');
    this.topLeft = el('div', 'hud-topleft');

    // Harvest / feed progress ring
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'harvest');
    svg.setAttribute('viewBox', '0 0 74 74');
    const track = ring('track');
    const fill = ring('fill');
    fill.style.strokeDasharray = `${RING_C}`;
    fill.style.strokeDashoffset = `${RING_C}`;
    svg.append(track, fill);
    this.harvest = svg;
    this.harvestFill = fill;

    // "You are carrying" chip, bottom centre
    this.carry = el('div', 'carry');
    this.carryDot = el('div', 'carry-dot');
    this.carryLabel = el('div', 'carry-label', '');
    this.carry.append(this.carryDot, this.carryLabel);

    const buttons = el('div', 'hud-buttons ui-interactive');

    // Always-available way out: back to the level menu. Without it, finishing
    // the last level leaves you flying with nowhere to go but a page reload.
    const menu = document.createElement('button');
    menu.className = 'icon-btn ui-interactive';
    menu.textContent = '🏠';
    menu.title = 'Level menu';
    menu.setAttribute('aria-label', 'Level menu');
    menu.addEventListener('click', onMenu);
    buttons.appendChild(menu);

    const mute = document.createElement('button');
    mute.className = 'icon-btn ui-interactive';
    mute.textContent = '🔊';
    mute.setAttribute('aria-label', 'Mute');
    let muted = false;
    mute.addEventListener('click', () => {
      muted = !muted;
      mute.textContent = muted ? '🔇' : '🔊';
      onMuteToggle(muted);
    });
    buttons.appendChild(mute);

    this.perf = el('div', 'hud-perf', '');
    this.perf.classList.add('ui-interactive');
    this.perf.style.pointerEvents = 'auto';
    this.perf.style.minWidth = '44px';
    this.perf.style.minHeight = '20px';
    this.perf.addEventListener('click', () => {
      this.showPerf = !this.showPerf;
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === '`') this.showPerf = !this.showPerf;
    });

    this.root.append(this.topLeft, this.banner, this.objective, svg, this.carry, buttons, this.perf);
    host.appendChild(this.root);
  }

  /** Replace the top-left counter stack. Levels call this on entry. */
  setCounters(defs: readonly CounterDef[]): void {
    this.topLeft.replaceChildren();
    this.rows.clear();
    for (const def of defs) {
      const row = el('div', 'pollen');
      const dot = el('div', 'pollen-dot');
      dot.style.background = `#${def.color.toString(16).padStart(6, '0')}`;
      const label = el('div', 'pollen-label', def.label);
      const count = document.createElement('span');
      count.className = 'pollen-count';
      row.append(dot, label, count);
      this.topLeft.appendChild(row);
      this.rows.set(def.key, { root: row, count, target: def.target });
      this.setCount(def.key, def.value, def.target);
    }
  }

  setBanner(text: string): void {
    this.banner.textContent = text;
  }

  setObjective(text: string): void {
    this.objective.textContent = text;
  }

  setCount(key: string, value: number, target?: number, pop = false): void {
    const row = this.rows.get(key);
    if (!row) return;
    if (target !== undefined) row.target = target;
    row.count.textContent = `${value}/${row.target}`;
    row.root.classList.toggle('done', value >= row.target);
    if (pop) {
      row.root.classList.remove('pop');
      void row.root.offsetWidth; // restart the transition
      row.root.classList.add('pop');
      setTimeout(() => row.root.classList.remove('pop'), 150);
    }
  }

  /** Circular dwell meter, used for both harvesting and feeding. */
  setHarvest(progress: number): void {
    this.harvest.classList.toggle('on', progress > 0.001);
    this.harvestFill.style.strokeDashoffset = `${RING_C * (1 - progress)}`;
  }

  /** What the bee is holding, shown as a chip above the controls. */
  setCarrying(kind: PollenKind | null, label = ''): void {
    this.carry.classList.toggle('on', kind !== null);
    if (!kind) return;
    this.carryDot.style.background = `#${POLLEN_COLOR[kind].toString(16).padStart(6, '0')}`;
    this.carryLabel.textContent = label;
  }

  setPerf(fps: number, calls: number): void {
    this.perf.textContent = this.showPerf ? `${fps.toFixed(0)} fps · ${calls} calls` : '·';
  }
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function ring(className: string): SVGCircleElement {
  const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  c.setAttribute('class', className);
  c.setAttribute('cx', '37');
  c.setAttribute('cy', '37');
  c.setAttribute('r', `${RING_R}`);
  return c;
}
