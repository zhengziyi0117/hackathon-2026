"""Builds an artifacts/westlake-osm-candidate.json evidence candidate from an OpenStreetMap extract of West Lake.

Usage: python3 scenics/westlake/tools/westlake-osm.py [extract.json]
Without an argument it downloads the extract from the Overpass API into artifacts/.
Map data (c) OpenStreetMap contributors, ODbL 1.0. The generated file keeps that notice.
"""
import json, math, os, sys, urllib.parse, urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..'))
ORIGIN = (120.1428, 30.2459)          # map origin, roughly the middle of the lake
KX, KZ = 962, 1110                    # map units (100 m) per degree at this latitude
BOUNDS = dict(minX=-24, maxX=22, minZ=-24, maxZ=24)
QUERY = ('[out:json][timeout:60];('
         'relation["natural"="water"](30.225,120.125,30.268,120.165);'
         'way["natural"="water"](30.225,120.125,30.268,120.165);'
         'way["name"~"^(苏堤|白堤)$"](30.225,120.12,30.27,120.165);'
         'nwr["name"~"^(断桥|雷峰塔|三潭印月|花港观鱼|曲院风荷|平湖秋月|湖心亭|保俶塔|阮公墩|孤山|锦带桥|西泠桥|宝石山|夕照山|南屏山|映波桥|锁澜桥|望山桥|压堤桥|东浦桥|跨虹桥|玉带桥)$"](30.22,120.12,30.27,120.17);'
         ');out geom;')


def load(path):
    if not os.path.exists(path):
        req = urllib.request.Request('https://overpass-api.de/api/interpreter',
                                     data=urllib.parse.urlencode({'data': QUERY}).encode(),
                                     headers={'User-Agent': 'jingjian-demo/0.1', 'Accept': 'application/json'})
        with urllib.request.urlopen(req, timeout=120) as r, open(path, 'wb') as f:
            f.write(r.read())
    return json.load(open(path))


P = lambda lon, lat: ((lon - ORIGIN[0]) * KX, -(lat - ORIGIN[1]) * KZ)
pt = lambda g: P(g['lon'], g['lat'])


def join(ways):
    """Joins open ways that share endpoints into rings or polylines."""
    ways = [list(w) for w in ways]
    out = []
    while ways:
        r = ways.pop(0)
        grew = True
        while grew:
            grew = False
            for i, w in enumerate(ways):
                if math.dist(r[-1], w[0]) < 1e-6: r += w[1:]
                elif math.dist(r[-1], w[-1]) < 1e-6: r += w[::-1][1:]
                elif math.dist(r[0], w[-1]) < 1e-6: r = w[:-1] + r
                elif math.dist(r[0], w[0]) < 1e-6: r = w[::-1][:-1] + r
                else: continue
                ways.pop(i); grew = True; break
        out.append(r)
    return out


def area(r): return abs(sum(r[i][0] * r[i - 1][1] - r[i - 1][0] * r[i][1] for i in range(len(r)))) / 2


def inside(p, r):
    x, z = p; c = False
    for i in range(len(r)):
        (ax, az), (bx, bz) = r[i - 1], r[i]
        if (az > z) != (bz > z) and x < (bx - ax) * (z - az) / (bz - az) + ax: c = not c
    return c


def dp(pts, tol):
    """Douglas-Peucker simplification."""
    if len(pts) < 3: return pts
    (ax, az), (bx, bz) = pts[0], pts[-1]
    L = math.hypot(bx - ax, bz - az) or 1e-9
    best, k = 0, 0
    for i in range(1, len(pts) - 1):
        d = abs((bx - ax) * (az - pts[i][1]) - (ax - pts[i][0]) * (bz - az)) / L
        if d > best: best, k = d, i
    if best <= tol: return [pts[0], pts[-1]]
    return dp(pts[:k + 1], tol)[:-1] + dp(pts[k:], tol)


def ring(r, tol=.05):
    r = r[:-1] if math.dist(r[0], r[-1]) < 1e-6 else r
    k = max(range(len(r)), key=lambda i: math.dist(r[0], r[i]))
    s = dp(r[:k + 1], tol)[:-1] + dp(r[k:] + [r[0]], tol)[:-1]
    return [[round(x, 2), round(z, 2)] for x, z in s]


def centre(e):
    if 'center' in e: return P(e['center']['lon'], e['center']['lat'])
    if 'lat' in e: return P(e['lon'], e['lat'])
    if 'bounds' in e:
        b = e['bounds']; return P((b['minlon'] + b['maxlon']) / 2, (b['minlat'] + b['maxlat']) / 2)
    g = e.get('geometry') or [x for m in e.get('members', []) for x in m.get('geometry', [])]
    return P(sum(x['lon'] for x in g) / len(g), sum(x['lat'] for x in g) / len(g))


def main():
    data = load(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'artifacts', 'osm-westlake-src.json'))
    els = data['elements']
    lake = next(e for e in els if e['type'] == 'relation' and e.get('tags', {}).get('name') == '西湖')
    rings = []
    for role in ('outer', 'inner'):
        for r in join([[pt(g) for g in m['geometry']] for m in lake['members'] if m['role'] == role and m['type'] == 'way']):
            if area(r) >= .06: rings.append(r)
    lake_rings = list(rings)
    on_land = lambda p: sum(inside(p, r) for r in lake_rings) % 2 == 0
    # Garden ponds (Huagang's fish pond, Quyuan's lotus pools...) count as water when they sit on land.
    for e in els:
        if e is lake or e.get('tags', {}).get('natural') != 'water': continue
        parts = [[pt(g) for g in e['geometry']]] if e['type'] == 'way' else join([[pt(g) for g in m['geometry']] for m in e['members'] if m['role'] == 'outer'])
        for r in parts:
            c = (sum(p[0] for p in r) / len(r), sum(p[1] for p in r) / len(r))
            if area(r) >= .25 and on_land(c): rings.append(r)
    water = [ring(r) for r in rings]
    named = lambda n: [e for e in els if e.get('tags', {}).get('name') == n]
    def causeway(names, axis):
        # Causeways are split into many ways at the bridges; they run roughly straight, so sort all points along the axis.
        pts = sorted({tuple(pt(g)) for e in els if e['type'] == 'way' and e.get('tags', {}).get('name') in names
                      and e['tags'].get('highway') in ('pedestrian', 'footway') for g in e['geometry']}, key=lambda p: p[axis])
        return [[round(x, 2), round(z, 2)] for x, z in dp(pts, .03)]
    poi = {}
    for e in els:
        n = e.get('tags', {}).get('name')
        if not n or e.get('tags', {}).get('natural') == 'water' or e.get('tags', {}).get('highway') in ('bus_stop', 'pedestrian', 'unclassified', 'secondary'):
            if not (e.get('tags', {}).get('bridge') or e.get('tags', {}).get('man_made') == 'bridge'): continue
        x, z = centre(e)
        poi.setdefault(n, []).append([round(x, 2), round(z, 2), e['type'] + '/' + str(e['id'])])
    out = {'source': '© OpenStreetMap contributors, ODbL 1.0', 'fetched': data.get('osm3s', {}).get('timestamp_osm_base', ''),
           'origin': ORIGIN, 'bounds': BOUNDS, 'water': water, 'su': causeway({'苏堤', '跨虹桥', '东浦桥', '压堤桥', '望山桥', '锁澜桥', '映波桥'}, 1), 'bai': causeway({'白堤', '锦带桥', '断桥'}, 0), 'poi': poi}
    target = os.path.join(ROOT, 'artifacts', 'westlake-osm-candidate.json')
    os.makedirs(os.path.dirname(target), exist_ok=True)
    with open(target, 'w') as f: json.dump(out, f, ensure_ascii=False, indent=2)
    print('Candidate:', target, 'rings', len(water), 'points', sum(map(len, water)))
    print('Review and import with: node scenics/westlake/tools/import-westlake-osm.mjs', target)
    for k, v in sorted(poi.items()): print(' ', k, v)


main()
