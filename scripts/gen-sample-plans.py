"""
生成首页“试试示例户型”用的户型图（原创布局，不取自任何平台）。

画法与常见的彩色平面户型图一致：灰色实心墙、木地板 / 瓷砖 / 水磨石地面、
门 = 墙上缺口 + 半透明 1/4 圆和门扇线、窗 = 墙上白色细条、房间名与面积、四周尺寸链。
坐标单位为毫米（墙中线），输出到 packages/web/public/samples/。

用法：python3 scripts/gen-sample-plans.py
"""

import math
import os
import random

from PIL import Image, ImageDraw, ImageFont

FONT = '/System/Library/Fonts/Hiragino Sans GB.ttc'
OUT = os.path.join(os.path.dirname(__file__), '..', 'packages', 'web', 'public', 'samples')
MM_PER_PX = 10
MARGIN = 190
WALL = (153, 153, 153)
EXT_T = 22  # 外墙厚（px）
INT_T = 12  # 内墙厚（px）

FLOORS = {
    'wood': (212, 190, 150),
    'tile': (222, 222, 218),
    'living': (244, 242, 236),
    'terrazzo': (236, 234, 230),
}

# ---------------------------------------------------------------- 布局

LAYOUTS = {
    'a': {
        'title': '一室一厅',
        'rooms': [
            ('客厅', (0, 0, 4200, 4500), 'living'),
            ('卧室', (4200, 0, 7200, 6600), 'wood'),
            ('厨房', (0, 4500, 2100, 6600), 'tile'),
            ('卫生间', (2100, 4500, 4200, 6600), 'terrazzo'),
        ],
        # (墙所在轴线方向, 轴线位置, 起, 止, 开向的房间内一点, 铰链端 'start'/'end')
        'doors': [
            ('v', 4200, 3300, 4150, (5000, 3700), 'start'),
            ('h', 4500, 600, 1400, (1000, 5200), 'start'),
            ('h', 4500, 2700, 3400, (3000, 5200), 'end'),
            ('v', 0, 3300, 4200, (600, 3700), 'end'),
        ],
        'windows': [('h', 0, 800, 3400), ('h', 0, 4800, 6600), ('h', 6600, 500, 1600), ('h', 6600, 2800, 3500)],
        'slides': [],
    },
    'b': {
        'title': '两室一厅',
        'rooms': [
            ('阳台', (3600, -1500, 8400, 0), 'tile'),
            ('主卧', (0, 0, 3600, 4200), 'wood'),
            ('客餐厅', (3600, 0, 8400, 5400), 'living'),
            ('次卧', (0, 4200, 3600, 8400), 'wood'),
            ('卫生间', (3600, 5400, 5700, 8400), 'terrazzo'),
            ('厨房', (5700, 5400, 8400, 8400), 'tile'),
        ],
        'doors': [
            ('v', 3600, 3000, 3850, (2800, 3400), 'end'),
            ('v', 3600, 4500, 5300, (2800, 4900), 'start'),
            ('h', 5400, 4000, 4750, (4300, 6100), 'start'),
            ('h', 5400, 6000, 6850, (6400, 6100), 'end'),
            ('v', 8400, 3900, 4800, (7600, 4300), 'start'),
        ],
        'windows': [('h', 0, 600, 2700), ('v', 0, 5400, 7200), ('v', 8400, 6300, 7500), ('h', 8400, 4200, 5000), ('h', -1500, 3900, 8100)],
        'slides': [('h', 0, 4500, 7500)],
    },
    'c': {
        'title': '三室两厅',
        'rooms': [
            ('阳台', (3600, -1500, 7800, 0), 'tile'),
            ('主卧', (0, 0, 3600, 4500), 'wood'),
            ('客餐厅', (3600, 0, 7800, 9000), 'living'),
            ('次卧', (0, 4500, 3600, 9000), 'wood'),
            ('儿童房', (7800, 0, 10800, 3600), 'wood'),
            ('卫生间', (7800, 3600, 10800, 5700), 'terrazzo'),
            ('厨房', (7800, 5700, 10800, 9000), 'tile'),
        ],
        'doors': [
            ('v', 3600, 3300, 4150, (2800, 3700), 'end'),
            ('v', 3600, 4800, 5650, (2800, 5200), 'start'),
            ('v', 7800, 2400, 3250, (8600, 2800), 'end'),
            ('v', 7800, 3900, 4600, (8600, 4200), 'start'),
            ('v', 7800, 6300, 7150, (8600, 6700), 'start'),
            ('h', 9000, 5000, 5900, (5400, 8200), 'end'),
        ],
        'windows': [('h', 0, 600, 3000), ('h', 9000, 600, 3000), ('h', 0, 8400, 10200), ('v', 10800, 4200, 5100), ('v', 10800, 6600, 8400), ('h', -1500, 3900, 7500)],
        'slides': [('h', 0, 4200, 7200)],
    },
}

# ---------------------------------------------------------------- 绘制


def draw_plan(key, spec):
    rooms = spec['rooms']
    xs = [v for _, (x0, y0, x1, y1), _ in rooms for v in (x0, x1)]
    ys = [v for _, (x0, y0, x1, y1), _ in rooms for v in (y0, y1)]
    minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
    W = (maxx - minx) // MM_PER_PX + MARGIN * 2
    H = (maxy - miny) // MM_PER_PX + MARGIN * 2

    def P(x, y):
        return (MARGIN + (x - minx) / MM_PER_PX, MARGIN + (y - miny) / MM_PER_PX)

    img = Image.new('RGB', (int(W), int(H)), (248, 248, 247))
    d = ImageDraw.Draw(img, 'RGBA')
    rnd = random.Random(key)

    # 地面
    for name, (x0, y0, x1, y1), floor in rooms:
        a, b = P(x0, y0), P(x1, y1)
        d.rectangle([a, b], fill=FLOORS[floor])
        if floor == 'wood':
            for x in range(int(a[0]), int(b[0]), 9):
                shade = rnd.randint(-10, 10)
                c = tuple(max(0, min(255, v + shade)) for v in FLOORS['wood'])
                d.rectangle([x, a[1], x + 8, b[1]], fill=c)
        elif floor == 'tile':
            for x in range(int(a[0]), int(b[0]), 30):
                d.line([(x, a[1]), (x, b[1])], fill=(200, 200, 196), width=1)
            for y in range(int(a[1]), int(b[1]), 30):
                d.line([(a[0], y), (b[0], y)], fill=(200, 200, 196), width=1)
        elif floor == 'terrazzo':
            for _ in range(int((b[0] - a[0]) * (b[1] - a[1]) / 60)):
                x = rnd.uniform(a[0], b[0])
                y = rnd.uniform(a[1], b[1])
                r = rnd.uniform(0.8, 2.2)
                g = rnd.randint(70, 150)
                d.ellipse([x - r, y - r, x + r, y + r], fill=(g, g, g))

    # 墙：每条房间边都画一道；只属于一个房间的边是外墙（更厚）
    edges = {}
    for _, (x0, y0, x1, y1), _ in rooms:
        for seg in (('h', y0, x0, x1), ('h', y1, x0, x1), ('v', x0, y0, y1), ('v', x1, y0, y1)):
            edges.setdefault(seg, 0)

    def shared(dirn, c, a0, a1):
        mid = (a0 + a1) / 2
        n = 0
        for _, (x0, y0, x1, y1), _ in rooms:
            if dirn == 'h' and y0 <= c <= y1 and x0 < mid < x1 and (c == y0 or c == y1):
                n += 1
            if dirn == 'v' and x0 <= c <= x1 and y0 < mid < y1 and (c == x0 or c == x1):
                n += 1
        return n >= 2

    def wall_rect(dirn, c, a0, a1, t, cap=True):
        # cap：墙体两端各多出半个墙厚，盖住墙角；门窗缺口不加，宽度就是门窗本身
        e = t / 2 if cap else 0
        if dirn == 'h':
            (ax, ay), (bx, by) = P(a0, c), P(a1, c)
            return [ax - e, ay - t / 2, bx + e, by + t / 2]
        (ax, ay), (bx, by) = P(c, a0), P(c, a1)
        return [ax - t / 2, ay - e, bx + t / 2, by + e]

    for dirn, c, a0, a1 in edges:
        t = INT_T if shared(dirn, c, a0, a1) else EXT_T
        d.rectangle(wall_rect(dirn, c, a0, a1, t), fill=WALL)

    def thick_at(dirn, c, a0, a1):
        return INT_T if shared(dirn, c, a0, a1) else EXT_T

    # 窗：白色细条 + 三道灰线
    for dirn, c, a0, a1 in spec['windows']:
        t = EXT_T
        r = wall_rect(dirn, c, a0, a1, t, cap=False)
        d.rectangle(r, fill=(252, 252, 252))
        for k in (0.2, 0.5, 0.8):
            if dirn == 'h':
                y = r[1] + (r[3] - r[1]) * k
                d.line([(r[0], y), (r[2], y)], fill=(185, 185, 185), width=1)
            else:
                x = r[0] + (r[2] - r[0]) * k
                d.line([(x, r[1]), (x, r[3])], fill=(185, 185, 185), width=1)

    # 推拉门：墙上缺口画成地面色 + 两道细线
    for dirn, c, a0, a1 in spec['slides']:
        r = wall_rect(dirn, c, a0, a1, INT_T + 2, cap=False)
        d.rectangle(r, fill=(250, 250, 250))
        if dirn == 'h':
            d.line([(r[0], r[1] + 3), (r[2], r[1] + 3)], fill=(170, 170, 170), width=2)
            d.line([(r[0], r[3] - 3), (r[2], r[3] - 3)], fill=(170, 170, 170), width=2)

    # 门：缺口 + 白色门槛 + 半透明 1/4 圆 + 弧线 + 门扇线
    for dirn, c, a0, a1, into, hinge in spec['doors']:
        t = EXT_T if not shared(dirn, c, a0, a1) else INT_T
        r = wall_rect(dirn, c, a0, a1, t, cap=False)
        d.rectangle(r, fill=(250, 250, 250))
        for k in (0.3, 0.7):
            if dirn == 'h':
                y = r[1] + (r[3] - r[1]) * k
                d.line([(r[0], y), (r[2], y)], fill=(190, 190, 190), width=1)
            else:
                x = r[0] + (r[2] - r[0]) * k
                d.line([(x, r[1]), (x, r[3])], fill=(190, 190, 190), width=1)
        width_px = (a1 - a0) / MM_PER_PX
        sgn = 1 if (into[1] > c if dirn == 'h' else into[0] > c) else -1
        hinge_along = a0 if hinge == 'start' else a1
        toward = 1 if hinge == 'start' else -1
        # 铰链点在墙面上
        if dirn == 'h':
            hx, hy = P(hinge_along, c)
            hy += sgn * t / 2
        else:
            hx, hy = P(c, hinge_along)
            hx += sgn * t / 2
        pts = [(hx, hy)]
        for k in range(0, 31):
            th = math.pi / 2 * k / 30
            al = toward * math.cos(th) * width_px
            cr = sgn * math.sin(th) * width_px
            pts.append((hx + al, hy + cr) if dirn == 'h' else (hx + cr, hy + al))
        d.polygon(pts, fill=(255, 255, 255, 150))
        d.line(pts[1:], fill=(120, 120, 120), width=1)
        end = pts[-1]
        d.line([(hx, hy), end], fill=(120, 120, 120), width=2)

    # 房间名与面积（按净面积，扣掉墙厚）
    f_name = ImageFont.truetype(FONT, 22)
    f_area = ImageFont.truetype(FONT, 19)
    for name, (x0, y0, x1, y1), _ in rooms:
        cx, cy = P((x0 + x1) / 2, (y0 + y1) / 2)
        area = ((x1 - x0 - 160) * (y1 - y0 - 160)) / 1e6
        d.text((cx, cy - 12), name, font=f_name, fill=(51, 51, 51), anchor='mm')
        d.text((cx, cy + 14), f'{area:.2f}㎡', font=f_area, fill=(51, 51, 51), anchor='mm')

    # 尺寸链：下边 / 左边按所有墙轴线分段，上边 / 右边标总长
    f_dim = ImageFont.truetype(FONT, 14)
    dim_col = (85, 85, 85)
    xs_all = sorted(set(xs))
    ys_all = sorted(set(ys))

    def hchain(vals, y_line, text_below):
        a = P(vals[0], 0)[0]
        b = P(vals[-1], 0)[0]
        d.rectangle([a, y_line, b, y_line + 1], fill=dim_col)
        for v in vals:
            x = P(v, 0)[0]
            ty = (y_line, y_line + 22) if text_below else (y_line - 21, y_line + 1)
            d.rectangle([x, ty[0], x + 1, ty[1]], fill=dim_col)
        for v0, v1 in zip(vals, vals[1:]):
            x = (P(v0, 0)[0] + P(v1, 0)[0]) / 2
            d.text((x, y_line + (12 if text_below else -11)), str(v1 - v0), font=f_dim, fill=dim_col, anchor='mm')

    def vchain(vals, x_line, text_right):
        a = P(0, vals[0])[1]
        b = P(0, vals[-1])[1]
        d.rectangle([x_line, a, x_line + 1, b], fill=dim_col)
        for v in vals:
            y = P(0, v)[1]
            tx = (x_line, x_line + 22) if text_right else (x_line - 21, x_line + 1)
            d.rectangle([tx[0], y, tx[1], y + 1], fill=dim_col)
        for v0, v1 in zip(vals, vals[1:]):
            y = (P(0, v0)[1] + P(0, v1)[1]) / 2
            label = Image.new('RGBA', (60, 20), (0, 0, 0, 0))
            ImageDraw.Draw(label).text((30, 10), str(v1 - v0), font=f_dim, fill=dim_col, anchor='mm')
            label = label.rotate(90, expand=True)
            x = x_line + (12 if text_right else -11)
            img.paste(label, (int(x - label.width / 2), int(y - label.height / 2)), label)

    top = MARGIN - 70
    bottom = H - MARGIN + 70
    left = MARGIN - 70
    right = W - MARGIN + 70
    hchain([minx, maxx], top, True)
    hchain(xs_all, bottom, False)
    vchain(ys_all, left, True)
    vchain([miny, maxy], right, False)

    # 指北针
    d.polygon([(40, 40), (34, 62), (46, 62)], fill=(70, 110, 200))
    d.text((40, 30), 'N', font=f_dim, fill=(70, 70, 70), anchor='mm')

    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, f'plan-{key}.png')
    img.save(path, optimize=True)
    thumb = img.copy()
    thumb.thumbnail((360, 360))
    thumb.save(os.path.join(OUT, f'plan-{key}-thumb.jpg'), quality=82)
    print(path, img.size)


if __name__ == '__main__':
    for k, spec in LAYOUTS.items():
        draw_plan(k, spec)
