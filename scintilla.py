#!/usr/bin/env python3
"""Scintilla: a tiny terminal roguelike. You are a spark crossing a circuit.

Charge is both your life and your ammo. Every few steps you lose a bit of it,
resistors (r) drain it on contact, capacitors (c) refill it. Bump a resistor
to zap it, press z to discharge an arc on everything nearby (costs charge).
Reach the via (>) to go one layer deeper. How deep can you go?

Stdlib only. Run: python3 scintilla.py   (or --selftest / --seed N)
"""
import random
import sys

W, H = 60, 20
VIEW_RADIUS = 7
START_CHARGE = 30
MAX_CHARGE = 40
DRAIN_EVERY = 6
ARC_COST = 6
ARC_RADIUS = 3
ARC_DAMAGE = 3

WALL, FLOOR, VIA = "#", ".", ">"


class Room:
    def __init__(self, x, y, w, h):
        self.x1, self.y1, self.x2, self.y2 = x, y, x + w, y + h

    def center(self):
        return (self.x1 + self.x2) // 2, (self.y1 + self.y2) // 2

    def overlaps(self, other):
        return (self.x1 <= other.x2 + 1 and self.x2 + 1 >= other.x1
                and self.y1 <= other.y2 + 1 and self.y2 + 1 >= other.y1)


class Enemy:
    def __init__(self, x, y, hp, drain):
        self.x, self.y, self.hp, self.drain = x, y, hp, drain


class Game:
    def __init__(self, seed=None):
        self.rng = random.Random(seed)
        self.depth = 0
        self.charge = START_CHARGE
        self.turn = 0
        self.kills = 0
        self.log = ["Sei una scintilla. Trova il via (>)."]
        self.over = False
        self.next_layer()

    # --- generation -------------------------------------------------------

    def next_layer(self):
        self.depth += 1
        self.tiles = [[WALL] * W for _ in range(H)]
        self.seen = [[False] * W for _ in range(H)]
        rooms = self.carve_rooms()
        self.px, self.py = rooms[0].center()
        vx, vy = rooms[-1].center()
        self.tiles[vy][vx] = VIA
        self.caps = set()
        self.enemies = []
        for room in rooms[1:]:
            self.populate(room)
        self.reveal()

    def carve_rooms(self):
        rooms = []
        for _ in range(40):
            w, h = self.rng.randint(4, 10), self.rng.randint(3, 6)
            room = Room(self.rng.randint(1, W - w - 2), self.rng.randint(1, H - h - 2), w, h)
            if any(room.overlaps(r) for r in rooms):
                continue
            self.carve(room)
            if rooms:
                self.connect(rooms[-1].center(), room.center())
            rooms.append(room)
        return rooms

    def carve(self, room):
        for y in range(room.y1, room.y2):
            for x in range(room.x1, room.x2):
                self.tiles[y][x] = FLOOR

    def connect(self, a, b):
        (ax, ay), (bx, by) = a, b
        corner = (bx, ay) if self.rng.random() < 0.5 else (ax, by)
        for (x1, y1), (x2, y2) in ((a, corner), (corner, b)):
            for x in range(min(x1, x2), max(x1, x2) + 1):
                for y in range(min(y1, y2), max(y1, y2) + 1):
                    self.tiles[y][x] = FLOOR

    def populate(self, room):
        spots = [(x, y) for y in range(room.y1, room.y2) for x in range(room.x1, room.x2)
                 if self.tiles[y][x] == FLOOR]
        self.rng.shuffle(spots)
        enemy_count = self.rng.randint(0, 1 + self.depth // 2)
        for x, y in spots[:enemy_count]:
            self.enemies.append(Enemy(x, y, hp=1 + self.depth // 3, drain=1 + self.depth // 4))
        if self.rng.random() < 0.6 and len(spots) > enemy_count:
            self.caps.add(spots[enemy_count])

    # --- queries ----------------------------------------------------------

    def enemy_at(self, x, y):
        return next((e for e in self.enemies if e.x == x and e.y == y), None)

    def walkable(self, x, y):
        return 0 <= x < W and 0 <= y < H and self.tiles[y][x] != WALL

    def visible(self, x, y):
        return (x - self.px) ** 2 + (y - self.py) ** 2 <= VIEW_RADIUS ** 2

    def reveal(self):
        for y in range(max(0, self.py - VIEW_RADIUS), min(H, self.py + VIEW_RADIUS + 1)):
            for x in range(max(0, self.px - VIEW_RADIUS), min(W, self.px + VIEW_RADIUS + 1)):
                if self.visible(x, y):
                    self.seen[y][x] = True

    def say(self, text):
        self.log.append(text)
        del self.log[:-2]

    # --- actions ----------------------------------------------------------

    def move(self, dx, dy):
        if self.over:
            return
        tx, ty = self.px + dx, self.py + dy
        enemy = self.enemy_at(tx, ty)
        if enemy:
            self.hit(enemy, 1)
            self.end_turn()
            return
        if not self.walkable(tx, ty):
            return
        self.px, self.py = tx, ty
        self.pickup()
        if self.tiles[ty][tx] == VIA:
            self.say(f"Via! Scendi al layer {self.depth + 1}.")
            self.next_layer()
            return
        self.end_turn()

    def arc(self):
        if self.over:
            return
        if self.charge <= ARC_COST:
            self.say("Carica troppo bassa per un arco.")
            return
        self.charge -= ARC_COST
        targets = [e for e in self.enemies
                   if max(abs(e.x - self.px), abs(e.y - self.py)) <= ARC_RADIUS]
        for enemy in targets:
            self.hit(enemy, ARC_DAMAGE)
        self.say(f"ZAP! Arco su {len(targets)} resistori.")
        self.end_turn()

    def hit(self, enemy, damage):
        enemy.hp -= damage
        if enemy.hp > 0:
            return
        self.enemies.remove(enemy)
        self.kills += 1
        self.say("Resistore bruciato.")

    def pickup(self):
        if (self.px, self.py) not in self.caps:
            return
        self.caps.remove((self.px, self.py))
        gain = min(10, MAX_CHARGE - self.charge)
        self.charge += gain
        self.say(f"Condensatore: +{gain} carica.")

    def end_turn(self):
        self.turn += 1
        if self.turn % DRAIN_EVERY == 0:
            self.charge -= 1
        for enemy in self.enemies:
            self.enemy_act(enemy)
        self.reveal()
        if self.charge > 0:
            return
        self.charge = 0
        self.over = True
        self.say(f"Ti spegni al layer {self.depth}. Resistori bruciati: {self.kills}.")

    def enemy_act(self, enemy):
        dist = max(abs(enemy.x - self.px), abs(enemy.y - self.py))
        if dist > VIEW_RADIUS:
            return
        if dist == 1:
            self.charge -= enemy.drain
            self.say(f"Un resistore ti succhia {enemy.drain} di carica.")
            return
        step_x = (self.px > enemy.x) - (self.px < enemy.x)
        step_y = (self.py > enemy.y) - (self.py < enemy.y)
        for sx, sy in ((step_x, step_y), (step_x, 0), (0, step_y)):
            nx, ny = enemy.x + sx, enemy.y + sy
            if (sx, sy) == (0, 0) or not self.walkable(nx, ny):
                continue
            if self.enemy_at(nx, ny) or (nx, ny) == (self.px, self.py):
                continue
            enemy.x, enemy.y = nx, ny
            return

    # --- rendering --------------------------------------------------------

    def glyph(self, x, y):
        if (x, y) == (self.px, self.py):
            return "@"
        if not self.seen[y][x]:
            return " "
        if not self.visible(x, y):
            return self.tiles[y][x]
        if self.enemy_at(x, y):
            return "r"
        if (x, y) in self.caps:
            return "c"
        return self.tiles[y][x]

    def status(self):
        bar = "#" * (self.charge * 20 // MAX_CHARGE)
        return f"Layer {self.depth}  Carica [{bar:<20}] {self.charge:>2}  Kill {self.kills}"


KEYS = {
    "h": (-1, 0), "l": (1, 0), "k": (0, -1), "j": (0, 1),
    "y": (-1, -1), "u": (1, -1), "b": (-1, 1), "n": (1, 1),
    "a": (-1, 0), "d": (1, 0), "w": (0, -1), "s": (0, 1),
}


def put(stdscr, y, text):
    """Draw a line, silently clipped to the terminal (fits 80x24)."""
    import curses
    rows, cols = stdscr.getmaxyx()
    if y >= rows:
        return
    try:
        stdscr.addstr(y, 0, text[:cols - 1])
    except curses.error:
        pass


def play(stdscr, seed):
    import curses
    curses.curs_set(0)
    game = Game(seed)
    arrows = {curses.KEY_LEFT: (-1, 0), curses.KEY_RIGHT: (1, 0),
              curses.KEY_UP: (0, -1), curses.KEY_DOWN: (0, 1)}
    while True:
        stdscr.erase()
        for y in range(H):
            put(stdscr, y, "".join(game.glyph(x, y) for x in range(W)))
        put(stdscr, H, game.status())
        for i, line in enumerate(game.log):
            put(stdscr, H + 1 + i, line)
        put(stdscr, H + 3, "hjkl/wasd/frecce muovi · z arco · q esci")
        stdscr.refresh()
        key = stdscr.getch()
        if key in (ord("q"), 27):
            return game
        if game.over:
            continue
        if key == ord("z"):
            game.arc()
            continue
        step = arrows.get(key) or KEYS.get(chr(key) if 0 <= key < 256 else "")
        if step:
            game.move(*step)


def selftest(runs=200):
    """Random bots play many games; check invariants instead of crashing."""
    deepest = 0
    for seed in range(runs):
        game = Game(seed)
        bot = random.Random(seed)
        for _ in range(3000):
            if game.over:
                break
            if bot.random() < 0.05:
                game.arc()
            else:
                game.move(*bot.choice(list(KEYS.values())))
            assert game.walkable(game.px, game.py)
            assert 0 <= game.charge <= MAX_CHARGE
            assert all(game.walkable(e.x, e.y) for e in game.enemies)
        deepest = max(deepest, game.depth)
    print(f"selftest ok: {runs} partite, layer massimo raggiunto da un bot casuale: {deepest}")


def main():
    if "--selftest" in sys.argv:
        selftest()
        return
    seed = None
    if "--seed" in sys.argv:
        seed = int(sys.argv[sys.argv.index("--seed") + 1])
    import curses
    game = curses.wrapper(play, seed)
    print(game.status())
    print(game.log[-1])


if __name__ == "__main__":
    main()
