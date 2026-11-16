"""Adds ?v=<content hash> to the page's CSS/JS/image links so browsers load fresh files after each update.
Usage: python3 tools/stamp.py   (run from the repository root before uploading)"""
import hashlib, os, re
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
p = os.path.join(root, 'index.html')
html = open(p, encoding='utf-8').read()
def stamp(m):
    attr, path = m.group(1), m.group(2)
    f = os.path.join(root, path)
    if not os.path.isfile(f): return m.group(0)
    h = hashlib.sha1(open(f, 'rb').read()).hexdigest()[:8]
    return f'{attr}="{path}?v={h}"'
html = re.sub(r'(src|href)="((?:[\w./-]+)\.(?:css|js|png))(?:\?v=[0-9a-f]+)?"', stamp, html)
open(p, 'w', encoding='utf-8').write(html)
print('\n'.join(re.findall(r'(?:src|href)="[^"]+\?v=[0-9a-f]+"', html)))
