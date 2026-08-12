/**
 * Placeholder art for the 4x4 bear puzzle.
 *
 * Hand-authored SVG so there's no binary to generate and it stays crisp at any
 * tile size. Swap this whole module's export for a real image import when the
 * artwork arrives — `puzzle.ts` only ever sees a URL:
 *
 *   import bearPuzzleUrl from './assets/scary-bear.png';
 */
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
  <defs>
    <radialGradient id="sky" cx="50%" cy="38%" r="72%">
      <stop offset="0%" stop-color="#8a3b2e"/>
      <stop offset="100%" stop-color="#2a1109"/>
    </radialGradient>
    <linearGradient id="fur" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#7c4a2a"/>
      <stop offset="100%" stop-color="#42210f"/>
    </linearGradient>
  </defs>

  <rect width="400" height="400" fill="url(#sky)"/>

  <!-- clawed slashes across the background -->
  <g stroke="#ffb15c" stroke-width="5" stroke-linecap="round" opacity="0.35">
    <path d="M40 30 L120 130"/><path d="M78 22 L158 122"/><path d="M116 18 L196 118"/>
  </g>

  <!-- shoulders -->
  <path d="M40 400 C60 300 140 268 200 268 C260 268 340 300 360 400 Z" fill="url(#fur)"/>

  <!-- ears -->
  <circle cx="112" cy="150" r="44" fill="#5c3520"/>
  <circle cx="288" cy="150" r="44" fill="#5c3520"/>
  <circle cx="112" cy="150" r="22" fill="#8a5a3a"/>
  <circle cx="288" cy="150" r="22" fill="#8a5a3a"/>

  <!-- head -->
  <ellipse cx="200" cy="212" rx="118" ry="106" fill="url(#fur)"/>

  <!-- brow, angled to look cross -->
  <path d="M108 172 L176 196 L170 212 L104 190 Z" fill="#31170a"/>
  <path d="M292 172 L224 196 L230 212 L296 190 Z" fill="#31170a"/>

  <!-- eyes -->
  <ellipse cx="152" cy="214" rx="22" ry="19" fill="#ffe9c9"/>
  <ellipse cx="248" cy="214" rx="22" ry="19" fill="#ffe9c9"/>
  <circle cx="156" cy="216" r="11" fill="#160b04"/>
  <circle cx="244" cy="216" r="11" fill="#160b04"/>
  <circle cx="160" cy="212" r="4" fill="#fff"/>
  <circle cx="248" cy="212" r="4" fill="#fff"/>

  <!-- muzzle -->
  <ellipse cx="200" cy="272" rx="72" ry="56" fill="#c79a6b"/>
  <ellipse cx="200" cy="246" rx="26" ry="19" fill="#241309"/>

  <!-- open mouth with teeth -->
  <path d="M148 284 C168 330 232 330 252 284 C232 300 168 300 148 284 Z" fill="#3d0f0f"/>
  <path d="M162 288 L172 306 L182 288 Z" fill="#fff"/>
  <path d="M186 292 L196 312 L206 292 Z" fill="#fff"/>
  <path d="M210 292 L220 312 L230 292 Z" fill="#fff"/>
  <path d="M234 288 L244 306 L254 288 Z" fill="#fff"/>
</svg>`;

export const bearPuzzleUrl = `data:image/svg+xml,${encodeURIComponent(SVG)}`;
