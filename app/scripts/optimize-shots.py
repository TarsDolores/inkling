import os, sys
from PIL import Image
src = r'D:\desktop\inkling\docs\screenshots'
for name in sorted(os.listdir(src)):
    if not name.lower().endswith('.png'): continue
    p = os.path.join(src, name)
    im = Image.open(p).convert('RGB')
    w, h = im.size
    tw = 1800
    if w > tw:
        im = im.resize((tw, round(h * tw / w)), Image.LANCZOS)
    webp = p[:-4] + '.webp'
    im.save(webp, 'WEBP', quality=84, method=6)
    old = os.path.getsize(p)
    new = os.path.getsize(webp)
    print(f'{name:22} {old/1024:7.0f} KB -> {new/1024:6.0f} KB  webp')
