# Monkey adventures

Swing from vine to vine through the jungle, climb the trees, and get home.

A touch-native 2D pixel game: TypeScript, Vite and a plain canvas, built to
one self-contained `index.html` and published by the gallery in the repo
root. The picture is drawn 180 pixels tall and blown up to fit the glass, so
a pixel is a thing you can count — see `CLAUDE.md` for what follows from
that.

## Running it

```bash
npm --prefix monkey-adventures run dev
```

Then open the URL Vite prints. On a tablet on the same Wi-Fi, use this Mac's LAN
address (`ipconfig getifaddr en0`) with the same port.

For the installed-app feel, **Share → Add to Home Screen** and launch from the
icon.

## Starting

The game opens on a chooser: **the jungle, the lake, the volcano, home**.
It is a start screen and a level skip in the same four buttons — while the
game is being built nobody wants to swing for four minutes to look at the
volcano, and a child who likes the volcano presses the same thing. The
parts live in `PARTS` in `src/config.ts`; the finish button comes back here
rather than straight into the jungle.

## The two crossings

The lake and the crater are the same bargain: swing across, and a fall
costs the crossing and nothing else. The monkey comes back on the **near**
edge every time, however far over it got — the crossing is the thing being
asked for, and putting it down on the far side would hand it the half it
did not swing. The jungle behind it is never in doubt.

## Controls

Two thumbs, and nothing that needs a keyboard.

- **The stick, bottom left.** It is drawn on the screen so a child can see
  it, but your thumb does not have to land on it: a drag anywhere in the
  left half works, measured from wherever it went down, and the knob shows
  it. Left and right runs along the ground and pumps a swing; up and down
  climbs — a tree, or the vine you are hanging from, hand over hand.
- **The button, bottom right.** Jump from the ground, let go of a vine, or
  leap off a tree. The whole right half does the same thing; the button is
  where a child looks for it.

On a vine the stick does one thing at a time: plainly up or down climbs the
rope, anything else pumps the swing. Pumping is a waggle and a waggling
thumb is never level, so a stick that climbed on any upward component would
crawl up the vine the whole time it was being swung.

A shorter vine swings faster and reaches higher, a longer one swings slower
and further, so climbing the rope is a choice and not only tidiness.

A vine is caught for you the moment you touch one — the skill is in choosing
when to let go. A tree is climbed only when you ask for it, by pushing up at
the trunk, because trees are everywhere and grabbing them by accident would
end every swing.

On a laptop it is the trackpad and the keyboard: drag in the left half to
move the stick, and the arrow keys do the same job, with the space bar for
the jump. The iPad is what it is for.

The picture fills the window, and the bar, the stick and the button are
pinned to the picture rather than to the window — so whatever black a
badly-shaped window leaves is empty, and nothing you have to press is ever
in it.

## Commands

```bash
npm --prefix monkey-adventures run dev         # dev server, hot reload
npm --prefix monkey-adventures run typecheck   # tsc --noEmit
npm --prefix monkey-adventures run build       # typechecks, then one dist/index.html
```

Formatting and linting come from the repo root (`npm run format`, `npm run
lint`), so this game is covered without any config of its own.

## Publishing

`game.json` carries a `status`. It starts as `"development"`, which lists the
game in the gallery's **In Development** section — flagged as unfinished. When
it is ready, change it to `"published"` and it moves to the main list of games.

## Layout

```
docs/
  plan-for-app.md  write the initial description of the game here, first
src/
  main.ts        the game (the starter scene, for now)
  assets/        images and models (empty to start)
index.html       the entry point
card.png         the gallery's thumbnail — replace the solid colour
game.json        title, description and status, for the gallery
```

Start in [docs/plan-for-app.md](docs/plan-for-app.md): write up what the game is
before you build it.

Everything is generated in code where it can be; see the bee game in the repo
for how far that goes and the patterns to follow.
