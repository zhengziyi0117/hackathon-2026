"""Import generated route JSON into the map package; never rewrite renderer source."""
import json, os, sys
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
network = json.load(sys.stdin)
if not isinstance(network.get('nodes'), dict) or not isinstance(network.get('edges'), list):
    raise ValueError('Expected nodes and edges in a JSON object')
p = os.path.join(root, 'src/map3d/data/westlake/geography.json')
with open(p) as f: data = json.load(f)
data['network'] = network
with open(p, 'w') as f: json.dump(data, f, ensure_ascii=False, indent=2); f.write('\n')
print('Updated geography.json network. Run npm run check:map next.', file=sys.stderr)
