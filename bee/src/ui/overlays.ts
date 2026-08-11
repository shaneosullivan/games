/** Full-screen modal cards: codename entry and level-complete. */

export interface Overlay {
  root: HTMLDivElement;
  show(): void;
  hide(): void;
  /** Re-word the card, so one overlay can serve every level. */
  setText(title: string, body: string): void;
}

function makeOverlay(host: HTMLElement): { root: HTMLDivElement; card: HTMLDivElement } {
  const root = document.createElement('div');
  root.className = 'overlay hidden';
  const card = document.createElement('div');
  card.className = 'card';
  root.appendChild(card);
  host.appendChild(root);
  return { root, card };
}

export interface LevelChoice {
  number: number;
  name: string;
  /** Shown under the name, e.g. "Replay". */
  note?: string;
}

export interface CodenameOptions {
  existing: string;
  /** Levels the player may start at. One entry means no picker is shown. */
  levels: readonly LevelChoice[];
  /** Which level is selected when the card opens. */
  selected: number;
  onStart: (codename: string, level: number) => void;
  onReset: () => void;
}

export function createCodenameScreen(host: HTMLElement, opts: CodenameOptions): Overlay {
  const { existing, levels, selected, onStart, onReset } = opts;
  const { root, card } = makeOverlay(host);

  const h1 = document.createElement('h1');
  h1.textContent = existing ? `Welcome back` : 'Bee';
  const p = document.createElement('p');
  p.textContent = existing
    ? levels.length > 1
      ? 'Pick where you want to fly.'
      : 'Ready to get back to the meadow?'
    : 'Every queen needs a code name. Choose yours.';

  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 14;
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.placeholder = 'CODE NAME';
  input.value = existing;

  const start = document.createElement('button');
  start.textContent = existing ? 'Continue' : 'Start';

  const sync = () => {
    start.disabled = input.value.trim().length === 0;
  };
  input.addEventListener('input', sync);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !start.disabled) start.click();
  });
  sync();

  // Level picker, only once there's more than one place to go.
  let chosen = selected;
  const picker = document.createElement('div');
  picker.className = 'levels';
  if (levels.length > 1) {
    const heading = document.createElement('div');
    heading.className = 'levels-heading';
    heading.textContent = 'Start at';
    picker.appendChild(heading);

    const row = document.createElement('div');
    row.className = 'levels-row';
    const chips: HTMLButtonElement[] = [];
    for (const level of levels) {
      const chip = document.createElement('button');
      chip.className = 'level-chip';
      chip.type = 'button';

      const num = document.createElement('span');
      num.className = 'level-chip-num';
      num.textContent = String(level.number);

      const text = document.createElement('span');
      text.className = 'level-chip-text';
      text.textContent = level.name;
      if (level.note) {
        const note = document.createElement('em');
        note.textContent = level.note;
        text.appendChild(note);
      }

      chip.append(num, text);
      chip.addEventListener('click', () => {
        chosen = level.number;
        for (const c of chips) c.classList.toggle('selected', c === chip);
      });
      chip.classList.toggle('selected', level.number === chosen);
      chips.push(chip);
      row.appendChild(chip);
    }
    picker.appendChild(row);
  }

  start.addEventListener('click', () => {
    const name = input.value.trim();
    if (!name) return;
    onStart(name, chosen);
  });

  card.append(h1, p, input, picker, start);

  if (existing) {
    const reset = document.createElement('button');
    reset.className = 'ghost';
    reset.textContent = 'Start a new hive (erases progress)';
    reset.addEventListener('click', () => {
      if (confirm('Erase your hive and start over?')) onReset();
    });
    card.appendChild(reset);
  }

  return {
    root,
    show() {
      root.classList.remove('hidden');
      // Don't autofocus on iPad — it yanks the software keyboard up over the game.
      if (!('ontouchstart' in window)) setTimeout(() => input.focus(), 60);
    },
    hide() {
      root.classList.add('hidden');
      input.blur();
    },
    setText(nextTitle, nextBody) {
      h1.textContent = nextTitle;
      p.textContent = nextBody;
    },
  };
}

export function createMessageScreen(
  host: HTMLElement,
  title: string,
  body: string,
  buttonLabel: string,
  onContinue: () => void,
): Overlay {
  const { root, card } = makeOverlay(host);
  const h1 = document.createElement('h1');
  h1.textContent = title;
  const p = document.createElement('p');
  p.textContent = body;
  const btn = document.createElement('button');
  btn.textContent = buttonLabel;
  btn.addEventListener('click', onContinue);
  card.append(h1, p, btn);
  return {
    root,
    show: () => root.classList.remove('hidden'),
    hide: () => root.classList.add('hidden'),
    setText(nextTitle, nextBody) {
      h1.textContent = nextTitle;
      p.textContent = nextBody;
    },
  };
}
