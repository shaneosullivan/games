import qrcode from "qrcode-generator";

/**
 * The join code, as a square a phone's camera can read.
 *
 * Drawn as one SVG path rather than an image, because it is going on a screen a
 * child is holding up to another screen: an SVG is crisp at whatever size the
 * layout gives it, and a camera looking at a slightly blurry QR code is the
 * whole reason this would otherwise fail.
 *
 * Error correction M — a quarter of it can be obscured or glared out and it
 * still reads — and a quiet border, which is not decoration: a QR code with
 * nothing around it is one most cameras will not find at all.
 */
export function qrSquare(text: string): SVGSVGElement {
  // 0 is "pick the smallest size that fits", which for a short URL is a small
  // code with big modules, which is the one a camera reads from furthest away.
  const code = qrcode(0, "M");
  code.addData(text);
  code.make();

  const count = code.getModuleCount();
  const quiet = 2;
  const size = count + quiet * 2;

  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("class", "qr");
  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
  svg.setAttribute("shape-rendering", "crispEdges");
  svg.setAttribute("aria-hidden", "true");

  const paper = document.createElementNS(SVG, "rect");
  paper.setAttribute("width", String(size));
  paper.setAttribute("height", String(size));
  paper.setAttribute("fill", "#fff");
  svg.appendChild(paper);

  // One path for every dark module. A rect each would be a couple of thousand
  // elements for the browser to lay out; this is one.
  let d = "";
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (code.isDark(row, col)) {
        d += `M${col + quiet} ${row + quiet}h1v1h-1z`;
      }
    }
  }
  const dark = document.createElementNS(SVG, "path");
  dark.setAttribute("d", d);
  dark.setAttribute("fill", "#1d2430");
  svg.appendChild(dark);
  return svg;
}

/**
 * The address to put in the code: this page, with the race's code on the end.
 *
 * Whatever URL this copy of the game was opened from, which is the only thing
 * that can possibly work — the gallery on the internet, a dev server on
 * somebody's laptop, a phone browsing the iPad's address. Hard-coding the
 * published address would mean a code that could never be tested at home.
 */
export function joinUrl(code: string): string {
  const {origin, pathname} = window.location;
  return `${origin}${pathname}#join=${code}`;
}

const SVG = "http://www.w3.org/2000/svg";
