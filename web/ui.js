// Browser front end: rendering, keyboard, d-pad, swipe/tap, seed in URL, best score.
"use strict";

const $ = id => document.getElementById(id);
const mapEl = $("map"), wrapEl = $("map-wrap");
const BEST_KEY = "scintilla-best-depth";
const LINE_HEIGHT = 1.15;

let game, seed;
let view = { x0: 0, y0: 0, cols: W, rows: H, cellW: 10, cellH: 12 };

function randomSeed() { return Math.floor(Math.random() * 1e9); }

function start(newSeed) {
  seed = newSeed;
  game = new Game(seed);
  history.replaceState(null, "", `?seed=${seed}`);
  $("over").hidden = true;
  layout();
}

// Font size and camera: whole map when it fits legibly (desktop), otherwise a
// window that follows the spark (phone).
function layout() {
  const aw = wrapEl.clientWidth, ah = wrapEl.clientHeight;
  mapEl.style.fontSize = "100px";
  mapEl.textContent = "#";
  const ratio = mapEl.getBoundingClientRect().width / 100;
  const fit = Math.min(aw / (W * ratio), ah / (H * LINE_HEIGHT));
  let font, cols, rows;
  if (fit >= 13) {
    font = Math.min(fit, 30);
    cols = W; rows = H;
  } else {
    font = Math.max(15, Math.min(24, ah / (H * LINE_HEIGHT)));
    cols = Math.min(W, Math.floor(aw / (font * ratio)));
    rows = Math.min(H, Math.floor(ah / (font * LINE_HEIGHT)));
  }
  font = Math.floor(font);
  mapEl.style.fontSize = font + "px";
  view = { ...view, cols, rows, cellW: font * ratio, cellH: font * LINE_HEIGHT };
  render();
}

const CLASS = { "#": "w", ">": "v", "@": "p", r: "r", c: "c" };

function render() {
  const { cols, rows } = view;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  view.x0 = clamp(game.px - (cols >> 1), 0, W - cols);
  view.y0 = clamp(game.py - (rows >> 1), 0, H - rows);

  const lines = [];
  for (let y = view.y0; y < view.y0 + rows; y++) {
    let line = "";
    for (let x = view.x0; x < view.x0 + cols; x++) {
      const g = game.glyph(x, y);
      const cls = game.seen[y][x] && !game.visible(x, y) && g !== "@" ? "m" : CLASS[g];
      const ch = g === ">" ? "&gt;" : g;
      line += cls ? `<span class="${cls}">${ch}</span>` : ch;
    }
    lines.push(line);
  }
  mapEl.innerHTML = lines.join("\n");

  $("depth").textContent = game.depth;
  $("charge").textContent = game.charge;
  $("kills").textContent = game.kills;
  const fill = $("bar-fill");
  fill.style.width = (game.charge * 100 / MAX_CHARGE) + "%";
  fill.classList.toggle("low", game.charge <= 10);
  $("log").innerHTML = "";
  for (const line of game.log) $("log").appendChild(document.createElement("div")).textContent = line;

  const best = Math.max(Number(localStorage.getItem(BEST_KEY)) || 0, game.depth);
  localStorage.setItem(BEST_KEY, best);
  $("best").textContent = best;
  $("seed").textContent = seed;
  $("seed").href = `?seed=${seed}`;

  if (game.over && $("over").hidden) {
    $("over-text").textContent = `Layer ${game.depth}, resistori bruciati ${game.kills}. Record: layer ${best}.`;
    $("over").hidden = false;
  }
}

function act(dir) {
  if (game.over) return;
  if (dir) game.move(dir[0], dir[1]);
  else game.arc();
  render();
}

// keyboard

const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
document.addEventListener("keydown", e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (game.over) {
    if (e.key === "Enter") start(randomSeed());
    return;
  }
  const dir = ARROWS[e.key] || KEYS[e.key.toLowerCase()];
  if (dir) act(dir);
  else if (e.key.toLowerCase() === "z") act(null);
  else return;
  e.preventDefault();
});

// d-pad, with hold-to-repeat

let repeat = null;
function stopRepeat() {
  clearTimeout(repeat);
  repeat = null;
  document.querySelectorAll("#pad .held").forEach(b => b.classList.remove("held"));
}
for (const btn of document.querySelectorAll("#pad button")) {
  const dir = btn.dataset.dir ? btn.dataset.dir.split(",").map(Number) : null;
  btn.addEventListener("pointerdown", e => {
    e.preventDefault();
    stopRepeat();
    btn.classList.add("held");
    act(dir);
    if (!dir) return; // never auto-repeat the arc
    const tick = delay => { repeat = setTimeout(() => { act(dir); tick(110); }, delay); };
    tick(320);
  });
  for (const ev of ["pointerup", "pointercancel", "pointerleave"]) btn.addEventListener(ev, stopRepeat);
  btn.addEventListener("contextmenu", e => e.preventDefault());
}

// swipe on the map moves one step that way; a tap steps toward the tapped cell

let touchStart = null;
wrapEl.addEventListener("pointerdown", e => { touchStart = { x: e.clientX, y: e.clientY }; });
wrapEl.addEventListener("pointerup", e => {
  if (!touchStart) return;
  let dx = e.clientX - touchStart.x, dy = e.clientY - touchStart.y;
  touchStart = null;
  if (Math.hypot(dx, dy) < 15) {
    const rect = mapEl.getBoundingClientRect();
    const cx = view.x0 + Math.floor((e.clientX - rect.left) / view.cellW);
    const cy = view.y0 + Math.floor((e.clientY - rect.top) / view.cellH);
    dx = cx - game.px; dy = cy - game.py;
    if (!dx && !dy) return;
  }
  // 8 directions: snap the angle to the nearest 45 degrees
  const octant = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  const a = octant * Math.PI / 4;
  act([Math.round(Math.cos(a)), Math.round(Math.sin(a))]);
});
wrapEl.addEventListener("pointercancel", () => { touchStart = null; });

// game over buttons

$("again").addEventListener("click", () => start(randomSeed()));
$("retry").addEventListener("click", () => start(seed));

window.addEventListener("resize", layout);

const param = new URLSearchParams(location.search).get("seed");
start(/^-?\d+$/.test(param ?? "") ? BigInt(param) : randomSeed());
