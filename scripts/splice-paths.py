import sys,os
root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out=sys.stdin.read().strip().split('\n')
p=os.path.join(root,'src','westlake-geo.js');s=open(p).read()
a=s.index('export const NODES=');b=s.index('export const EDGES=')
s=s[:a]+out[0]+'\n'+out[1]+'\n'+s[b:]
open(p,'w').write(s)
