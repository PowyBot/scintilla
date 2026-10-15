// Scintilla, browser port of scintilla.py. Same rules and, thanks to a port of
// Python's Mersenne Twister, the same maps: ?seed=42 here == --seed 42 there.
// Runs in the browser (index.html) and in node (selftest.js).
"use strict";

const W = 60, H = 20;
const VIEW_RADIUS = 7;
const START_CHARGE = 30;
const MAX_CHARGE = 40;
const DRAIN_EVERY = 6;
const ARC_COST = 6;
const RUN_LIMIT = 60;
const ARC_RADIUS = 3;
const ARC_DAMAGE = 3;
const INDUCTOR_DEPTH = 3;
const CAP_CHANCE = 0.6;
const CAP_CHANCE_PER_GUARD = 0.15;

const WALL = "#", FLOOR = ".", VIA = ">";

// --- Python's random.Random, only the parts scintilla.py uses ---------------

class PyRandom {
  constructor(seed) {
    this.mt = new Uint32Array(624);
    this.index = 624;
    let n = BigInt(seed < 0 ? -seed : seed);
    const key = [];
    do {
      key.push(Number(n & 0xffffffffn));
      n >>= 32n;
    } while (n > 0n);
    this.initByArray(key);
  }

  initGenrand(s) {
    const mt = this.mt;
    mt[0] = s >>> 0;
    for (let i = 1; i < 624; i++) {
      mt[i] = Math.imul(1812433253, mt[i - 1] ^ (mt[i - 1] >>> 30)) + i;
    }
  }

  initByArray(key) {
    const mt = this.mt;
    this.initGenrand(19650218);
    let i = 1, j = 0;
    for (let k = Math.max(624, key.length); k; k--) {
      mt[i] = (mt[i] ^ Math.imul(mt[i - 1] ^ (mt[i - 1] >>> 30), 1664525)) + key[j] + j;
      i++; j++;
      if (i >= 624) { mt[0] = mt[623]; i = 1; }
      if (j >= key.length) j = 0;
    }
    for (let k = 623; k; k--) {
      mt[i] = (mt[i] ^ Math.imul(mt[i - 1] ^ (mt[i - 1] >>> 30), 1566083941)) - i;
      i++;
      if (i >= 624) { mt[0] = mt[623]; i = 1; }
    }
    mt[0] = 0x80000000;
  }

  genrand() {
    const mt = this.mt;
    if (this.index >= 624) {
      for (let k = 0; k < 624; k++) {
        const y = (mt[k] & 0x80000000) | (mt[(k + 1) % 624] & 0x7fffffff);
        mt[k] = mt[(k + 397) % 624] ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0);
      }
      this.index = 0;
    }
    let y = mt[this.index++];
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;
    return y >>> 0;
  }

  random() {
    const a = this.genrand() >>> 5, b = this.genrand() >>> 6;
    return (a * 67108864 + b) / 9007199254740992;
  }

  randbelow(n) { // n < 2**32 is all we ever need
    const k = n.toString(2).length;
    let r;
    do { r = this.genrand() >>> (32 - k); } while (r >= n);
    return r;
  }

  randint(a, b) { return a + this.randbelow(b - a + 1); }

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.randbelow(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  choice(arr) { return arr[this.randbelow(arr.length)]; }
}

// --- game ------------------------------------------------------------------

class Room {
  constructor(x, y, w, h) {
    this.x1 = x; this.y1 = y; this.x2 = x + w; this.y2 = y + h;
  }
  center() { return [(this.x1 + this.x2) >> 1, (this.y1 + this.y2) >> 1]; }
  overlaps(o) {
    return this.x1 <= o.x2 + 1 && this.x2 + 1 >= o.x1 && this.y1 <= o.y2 + 1 && this.y2 + 1 >= o.y1;
  }
}

const enemyName = e => (e.kind === "L" ? "induttore" : "resistore");

class Game {
  constructor(seed) {
    this.rng = new PyRandom(seed);
    this.depth = 0;
    this.charge = START_CHARGE;
    this.turn = 0;
    this.kills = 0;
    this.log = ["Sei una scintilla. Trova il via (>)."];
    this.over = false;
    this.nextLayer();
  }

  // generation

  nextLayer() {
    this.depth++;
    this.tiles = Array.from({ length: H }, () => Array(W).fill(WALL));
    this.seen = Array.from({ length: H }, () => Array(W).fill(false));
    const rooms = this.carveRooms();
    [this.px, this.py] = rooms[0].center();
    const [vx, vy] = rooms[rooms.length - 1].center();
    this.tiles[vy][vx] = VIA;
    this.via = [vx, vy];
    this.caps = new Set();
    this.enemies = [];
    for (const room of rooms.slice(1)) this.populate(room);
    this.reveal();
  }

  carveRooms() {
    const rooms = [];
    for (let i = 0; i < 40; i++) {
      const w = this.rng.randint(4, 10), h = this.rng.randint(3, 6);
      const room = new Room(this.rng.randint(1, W - w - 2), this.rng.randint(1, H - h - 2), w, h);
      if (rooms.some(r => room.overlaps(r))) continue;
      this.carve(room);
      if (rooms.length) this.connect(rooms[rooms.length - 1].center(), room.center());
      rooms.push(room);
    }
    return rooms;
  }

  carve(room) {
    for (let y = room.y1; y < room.y2; y++)
      for (let x = room.x1; x < room.x2; x++) this.tiles[y][x] = FLOOR;
  }

  connect(a, b) {
    const corner = this.rng.random() < 0.5 ? [b[0], a[1]] : [a[0], b[1]];
    for (const [[x1, y1], [x2, y2]] of [[a, corner], [corner, b]])
      for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++)
        for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) this.tiles[y][x] = FLOOR;
  }

  populate(room) {
    const spots = [];
    for (let y = room.y1; y < room.y2; y++)
      for (let x = room.x1; x < room.x2; x++)
        if (this.tiles[y][x] === FLOOR) spots.push([x, y]);
    this.rng.shuffle(spots);
    const enemyCount = this.rng.randint(0, 1 + Math.floor(this.depth / 2));
    for (const [x, y] of spots.slice(0, enemyCount)) {
      const hp = 1 + Math.floor(this.depth / 3), drain = 1 + Math.floor(this.depth / 4);
      if (this.depth >= INDUCTOR_DEPTH && this.rng.random() < 0.3) {
        // Inductors resist change: twice as tough, but sluggish.
        this.enemies.push({ x, y, hp: hp * 2, drain, kind: "L" });
        continue;
      }
      this.enemies.push({ x, y, hp, drain, kind: "r" });
    }
    // Guarded rooms pay better (see scintilla.py populate).
    if (this.rng.random() < CAP_CHANCE + CAP_CHANCE_PER_GUARD * enemyCount && spots.length > enemyCount) this.caps.add(spots[enemyCount].join());
  }

  // queries

  enemyAt(x, y) { return this.enemies.find(e => e.x === x && e.y === y); }
  walkable(x, y) { return x >= 0 && x < W && y >= 0 && y < H && this.tiles[y][x] !== WALL; }
  visible(x, y) {
    if ((x - this.px) ** 2 + (y - this.py) ** 2 > VIEW_RADIUS ** 2) return false;
    return this.lineClear(x, y);
  }

  // Bresenham from the player to (x, y): no wall strictly in between.
  lineClear(x, y) {
    let x0 = this.px, y0 = this.py;
    if (x0 === x && y0 === y) return true;
    const dx = Math.abs(x - x0), dy = -Math.abs(y - y0);
    const sx = x > x0 ? 1 : -1, sy = y > y0 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
      if (x0 === x && y0 === y) return true;
      if (this.tiles[y0][x0] === WALL) return false;
    }
  }

  reveal() {
    for (let y = Math.max(0, this.py - VIEW_RADIUS); y < Math.min(H, this.py + VIEW_RADIUS + 1); y++)
      for (let x = Math.max(0, this.px - VIEW_RADIUS); x < Math.min(W, this.px + VIEW_RADIUS + 1); x++)
        if (this.visible(x, y)) this.seen[y][x] = true;
  }

  say(text) {
    this.log.push(text);
    this.log = this.log.slice(-2);
  }

  // actions

  move(dx, dy) {
    if (this.over) return;
    const tx = this.px + dx, ty = this.py + dy;
    const enemy = this.enemyAt(tx, ty);
    if (enemy) {
      this.hit(enemy, 1);
      this.endTurn();
      return;
    }
    if (!this.walkable(tx, ty)) return;
    this.px = tx; this.py = ty;
    this.pickup();
    if (this.tiles[ty][tx] === VIA) {
      this.say(`Via! Scendi al layer ${this.depth + 1}.`);
      this.nextLayer();
      return;
    }
    this.endTurn();
  }

  // Shift-run: step until blocked, the layer changes, or something new shows up.
  run(dx, dy) {
    for (let i = 0; i < RUN_LIMIT; i++) {
      const depth = this.depth, bx = this.px, by = this.py;
      const viaKnown = this.seen[this.via[1]][this.via[0]];
      const caps = this.visibleCaps();
      this.move(dx, dy);
      if (this.over || this.depth !== depth || (this.px === bx && this.py === by)) return;
      if (this.alert(caps) || (!viaKnown && this.seen[this.via[1]][this.via[0]])) return;
    }
  }

  visibleCaps() {
    return new Set([...this.caps].filter(c => { const [x, y] = c.split(",").map(Number); return this.visible(x, y); }));
  }

  // Something worth stopping for: a visible enemy, or a capacitor not already in view.
  alert(capsBefore = new Set()) {
    return this.enemies.some(e => this.visible(e.x, e.y))
      || [...this.visibleCaps()].some(c => !capsBefore.has(c));
  }

  arc() {
    if (this.over) return;
    if (this.charge <= ARC_COST) {
      this.say("Carica troppo bassa per un arco.");
      return;
    }
    this.charge -= ARC_COST;
    const targets = this.enemies.filter(e => Math.max(Math.abs(e.x - this.px), Math.abs(e.y - this.py)) <= ARC_RADIUS);
    for (const enemy of targets) this.hit(enemy, ARC_DAMAGE);
    this.say(`ZAP! Arco su ${targets.length} componenti.`);
    this.endTurn();
  }

  // Stand still for a turn: let them come to you (the drain clock still ticks).
  wait() {
    if (this.over) return;
    this.endTurn();
  }

  hit(enemy, damage) {
    enemy.hp -= damage;
    if (enemy.hp > 0) return;
    this.enemies.splice(this.enemies.indexOf(enemy), 1);
    this.kills++;
    const name = enemyName(enemy);
    this.say(`${name[0].toUpperCase()}${name.slice(1)} bruciato.`);
  }

  pickup() {
    const key = [this.px, this.py].join();
    if (!this.caps.has(key)) return;
    this.caps.delete(key);
    const gain = Math.min(10, MAX_CHARGE - this.charge);
    this.charge += gain;
    this.say(`Condensatore: +${gain} carica.`);
  }

  endTurn() {
    this.turn++;
    if (this.turn % DRAIN_EVERY === 0) this.charge--;
    for (const enemy of this.enemies) this.enemyAct(enemy);
    this.reveal();
    if (this.charge > 0) return;
    this.charge = 0;
    this.over = true;
    this.say(`Ti spegni al layer ${this.depth}. Componenti bruciati: ${this.kills}.`);
  }

  enemyAct(enemy) {
    const dist = Math.max(Math.abs(enemy.x - this.px), Math.abs(enemy.y - this.py));
    if (dist > VIEW_RADIUS || !this.visible(enemy.x, enemy.y)) return;
    if (dist === 1) {
      this.charge -= enemy.drain;
      this.say(`Un ${enemyName(enemy)} ti succhia ${enemy.drain} di carica.`);
      return;
    }
    if (enemy.kind === "L" && this.turn % 2) return;
    const sx0 = Math.sign(this.px - enemy.x), sy0 = Math.sign(this.py - enemy.y);
    for (const [sx, sy] of [[sx0, sy0], [sx0, 0], [0, sy0]]) {
      const nx = enemy.x + sx, ny = enemy.y + sy;
      if ((sx === 0 && sy === 0) || !this.walkable(nx, ny)) continue;
      if (this.enemyAt(nx, ny) || (nx === this.px && ny === this.py)) continue;
      enemy.x = nx; enemy.y = ny;
      return;
    }
  }

  // rendering

  // What a visible enemy is standing on, if worth knowing: "c" or ">" (else null).
  under(x, y) {
    if (this.caps.has([x, y].join())) return "c";
    return this.tiles[y][x] === ">" ? ">" : null;
  }

  glyph(x, y) {
    if (x === this.px && y === this.py) return "@";
    if (!this.seen[y][x]) return " ";
    if (!this.visible(x, y)) return this.caps.has([x, y].join()) ? "c" : this.tiles[y][x]; // capacitors don't move: remember them
    const enemy = this.enemyAt(x, y);
    if (enemy) return enemy.kind;
    if (this.caps.has([x, y].join())) return "c";
    return this.tiles[y][x];
  }
}

// Same order as KEYS in scintilla.py: the selftest bot picks from it.
const KEYS = {
  h: [-1, 0], l: [1, 0], k: [0, -1], j: [0, 1],
  y: [-1, -1], u: [1, -1], b: [-1, 1], n: [1, 1],
  a: [-1, 0], d: [1, 0], w: [0, -1], s: [0, 1],
};

if (typeof module !== "undefined") {
  module.exports = { Game, PyRandom, KEYS, W, H, MAX_CHARGE };
}
