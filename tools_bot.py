"""Greedy BFS bot with full map knowledge: rough difficulty check. Run from repo root."""
import sys; sys.path.insert(0, ".")
import scintilla as s
from collections import deque
def path(g, goal):
    start=(g.px,g.py); prev={start:None}; q=deque([start])
    while q:
        c=q.popleft()
        if goal(c): break
        for dx,dy in s.KEYS.values():
            n=(c[0]+dx,c[1]+dy)
            if n in prev or not g.walkable(*n): continue
            prev[n]=c; q.append(n)
    else: return None
    while prev[c]!=start: c=prev[c]
    return c[0]-g.px,c[1]-g.py
depths=[]
for seed in range(100):
    g=s.Game(seed)
    for _ in range(5000):
        if g.over: break
        near=[e for e in g.enemies if max(abs(e.x-g.px),abs(e.y-g.py))<=1]
        if len(near)>=2: g.arc(); continue
        if near: g.move(near[0].x-g.px, near[0].y-g.py); continue
        tgt=(lambda c:c in g.caps) if g.caps and g.charge<25 else (lambda c:g.tiles[c[1]][c[0]]==s.VIA)
        st=path(g,tgt) or path(g,lambda c:g.tiles[c[1]][c[0]]==s.VIA)
        g.move(*st)
    depths.append(g.depth)
depths.sort(); print('median',depths[50],'max',depths[-1],'min',depths[0])
