"""把霞鹜文楷 Lite 子集化为 woff2：GB2312 汉字 + ASCII + 中文标点 + 常用符号。
用法: python subset-font.py <src.ttf> <dst.woff2>
"""
import sys
from fontTools import subset
from fontTools.ttLib import TTFont

src, dst = sys.argv[1], sys.argv[2]

chars = set()

# ASCII 可见字符
for cp in range(0x20, 0x7F):
    chars.add(cp)

# GB2312 一二级汉字 + 全角符号
for hi in range(0xA1, 0xF8):
    for lo in range(0xA1, 0xFF):
        try:
            ch = bytes([hi, lo]).decode('gb2312')
            chars.add(ord(ch))
        except UnicodeDecodeError:
            pass

# 中文标点、常用符号、特殊空白
extra = (
    list(range(0x3000, 0x3040)) +   # CJK 标点
    list(range(0xFF00, 0xFFF0)) +   # 全角形式
    list(range(0x2010, 0x2030)) +   # 破折号/引号/省略号等
    [0x00A0, 0x00B7, 0x2022, 0x2026, 0x2030, 0x2103, 0x2116,
     0x2190, 0x2191, 0x2192, 0x2193, 0x2194, 0x2195,
     0x25A0, 0x25A1, 0x25CB, 0x25CF, 0x2605, 0x2606,
     0x2713, 0x2714, 0x2717, 0x2718, 0x2764]
)
chars.update(extra)

# 只保留字体真实包含的字符
font = TTFont(src)
cmap = font.getBestCmap()
chars = {cp for cp in chars if cp in cmap}
print(f'源字体字符数: {len(cmap)}, 子集字符数: {len(chars)}')
font.close()

options = subset.Options()
options.flavor = 'woff2'
options.desubroutinize = True
options.layout_features = ['*']
options.name_IDs = ['*']
options.notdef_outline = True
options.recalc_bounds = True
options.drop_tables += ['DSIG']

subsetter = subset.Subsetter(options=options)
font = TTFont(src)
subsetter.populate(unicodes=chars)
subsetter.subset(font)
font.flavor = 'woff2'
font.save(dst)
font.close()
print('已生成', dst)
