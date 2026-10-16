"""Same greedy bot as tools_bot.py, but it only knows what a player knows: seen tiles, seen capacitors,
the via once seen. Explores toward the nearest unseen edge. Compares deaths per layer with the omniscient bot,
because the omniscient one never pays for exploring and balance changes judged on it alone felt off when played.
Run from repo root: python3 tools_fogbot.py [seeds]"""
import sys; sys.path.insert(0, ".")
import scintilla as s
from collections import Counter, deque


def step_towards(g, goal, known_only):
    start = (g.px, g.py)
    prev = {start: None}
    q = deque([start])
    while q:
        c = q.popleft()
        if goal(c):
            break
        for dx, dy in s.KEYS.values():
            n = (c[0] + dx, c[1] + dy)
            if n in prev or not g.walkable(*n) or (known_only and not g.seen[n[1]][n[0]]):
                continue
            prev[n] = c
            q.append(n)
    else:
        return None
    while prev[c] != start:
        c = prev[c]
    return c[0] - g.px, c[1] - g.py


def is_frontier(g, c):
    return any(0 <= c[0] + dx < s.W and 0 <= c[1] + dy < s.H and not g.seen[c[1] + dy][c[0] + dx]
               for dx, dy in s.KEYS.values())


def next_move(g, fog):
    is_via = lambda c: g.tiles[c[1]][c[0]] == s.VIA
    if not fog:
        target = (lambda c: c in g.caps) if g.caps and g.charge < 25 else is_via
        return step_towards(g, target, False) or step_towards(g, is_via, False)
    seen_caps = {c for c in g.caps if g.seen[c[1]][c[0]]}
    via_seen = g.seen[g.via[1]][g.via[0]]
    if seen_caps and g.charge < 25:
        move = step_towards(g, lambda c: c in seen_caps, True)
        if move:
            return move
    if via_seen:
        return step_towards(g, is_via, True)
    return step_towards(g, lambda c: is_frontier(g, c), True)


def play(seed, fog):
    g = s.Game(seed)
    for _ in range(5000):
        if g.over:
            break
        near = [e for e in g.enemies if max(abs(e.x - g.px), abs(e.y - g.py)) <= 1]
        if len(near) >= 2:
            g.arc()
            continue
        if near:
            g.move(near[0].x - g.px, near[0].y - g.py)
            continue
        move = next_move(g, fog)
        if move is None:
            g.wait()
            continue
        g.move(*move)
    return g.depth


seeds = int(sys.argv[1]) if len(sys.argv) > 1 else 300
for fog in (False, True):
    depths = sorted(play(seed, fog) for seed in range(seeds))
    deaths = Counter(depths)
    print("fog " if fog else "omni", "median", depths[seeds // 2], "p90", depths[seeds * 9 // 10],
          "deaths/layer", " ".join(f"{d}:{deaths[d]}" for d in sorted(deaths)))
