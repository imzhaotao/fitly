import type { Anchor, FurnitureItem, Opening, Point, Wall } from './types';

export type Poly = Point[];

const EPS = 1e-6;

export function rotatePoint(p: Point, deg: number): Point {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

export interface LocalRect { x0: number; y0: number; x1: number; y1: number }

/** 物件在自身坐标系下的矩形分块：普通家具 1 块，L 型转角 2 块（避免转角空位误报） */
export function localRects(item: FurnitureItem): LocalRect[] {
  const hw = item.w / 2;
  const hd = item.d / 2;
  const main: LocalRect = { x0: -hw, y0: -hd, x1: hw, y1: hd };
  if ((item.variant === 'l-shape-left' || item.variant === 'l-shape-right') && item.chaiseW && item.chaiseD) {
    const cw = Math.min(item.chaiseW, item.w);
    const chaise: LocalRect =
      item.variant === 'l-shape-left'
        ? { x0: -hw, y0: hd, x1: -hw + cw, y1: hd + item.chaiseD }
        : { x0: hw - cw, y0: hd, x1: hw, y1: hd + item.chaiseD };
    return [main, chaise];
  }
  return [main];
}

export function toWorld(item: Pick<FurnitureItem, 'x' | 'y' | 'rotation'>, p: Point): Point {
  const r = rotatePoint(p, item.rotation);
  return { x: item.x + r.x, y: item.y + r.y };
}

export function toLocal(item: Pick<FurnitureItem, 'x' | 'y' | 'rotation'>, p: Point): Point {
  return rotatePoint({ x: p.x - item.x, y: p.y - item.y }, -item.rotation);
}

export function rectToPoly(r: LocalRect): Poly {
  return [
    { x: r.x0, y: r.y0 },
    { x: r.x1, y: r.y0 },
    { x: r.x1, y: r.y1 },
    { x: r.x0, y: r.y1 },
  ];
}

/** 物件 → 旋转后的凸多边形集合 */
export function toPolygons(item: FurnitureItem): Poly[] {
  return localRects(item).map((r) => rectToPoly(r).map((p) => toWorld(item, p)));
}

export function wallDir(w: Wall): Point {
  const dx = w.b.x - w.a.x;
  const dy = w.b.y - w.a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

export function wallLength(w: Wall): number {
  return Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
}

/** 有向墙 a->b 的左法线 */
export function leftNormal(w: Wall): Point {
  const d = wallDir(w);
  return { x: -d.y, y: d.x };
}

export function wallPolygon(w: Wall): Poly {
  const n = leftNormal(w);
  const t = w.thickness / 2;
  return [
    { x: w.a.x + n.x * t, y: w.a.y + n.y * t },
    { x: w.b.x + n.x * t, y: w.b.y + n.y * t },
    { x: w.b.x - n.x * t, y: w.b.y - n.y * t },
    { x: w.a.x - n.x * t, y: w.a.y - n.y * t },
  ];
}

export function pointOnWall(w: Wall, offset: number): Point {
  const d = wallDir(w);
  return { x: w.a.x + d.x * offset, y: w.a.y + d.y * offset };
}

/** 贴墙点位：wallId + offset + side 实时换算为墙面上的世界坐标 */
export function resolveAnchorPoint(anchor: Anchor, walls: Wall[]): Point | null {
  if (anchor.wallId != null && anchor.offset != null) {
    const w = walls.find((x) => x.id === anchor.wallId);
    if (!w) return anchor.at ?? null;
    const off = Math.max(0, Math.min(wallLength(w), anchor.offset));
    const p = pointOnWall(w, off);
    const n = leftNormal(w);
    const sign = anchor.side === 'right' ? -1 : 1;
    const t = w.thickness / 2;
    return { x: p.x + n.x * t * sign, y: p.y + n.y * t * sign };
  }
  return anchor.at ?? null;
}

/** 点位法线（指向房间内） */
export function anchorNormal(anchor: Anchor, walls: Wall[]): Point | null {
  const w = walls.find((x) => x.id === anchor.wallId);
  if (!w) return null;
  const n = leftNormal(w);
  const sign = anchor.side === 'right' ? -1 : 1;
  return { x: n.x * sign, y: n.y * sign };
}

/** 点位面板的小方块足迹：沿墙 86mm，向房间内凸出 20mm */
export function anchorPolygon(anchor: Anchor, walls: Wall[]): Poly | null {
  const p = resolveAnchorPoint(anchor, walls);
  if (!p) return null;
  const w = walls.find((x) => x.id === anchor.wallId);
  if (!w) {
    const s = 43;
    return [
      { x: p.x - s, y: p.y - s },
      { x: p.x + s, y: p.y - s },
      { x: p.x + s, y: p.y + s },
      { x: p.x - s, y: p.y + s },
    ];
  }
  const d = wallDir(w);
  const n = anchorNormal(anchor, walls)!;
  const s = 43;
  const depth = 20;
  return [
    { x: p.x - d.x * s, y: p.y - d.y * s },
    { x: p.x + d.x * s, y: p.y + d.y * s },
    { x: p.x + d.x * s + n.x * depth, y: p.y + d.y * s + n.y * depth },
    { x: p.x - d.x * s + n.x * depth, y: p.y - d.y * s + n.y * depth },
  ];
}

/** 洞口在墙上的足迹 */
export function openingPolygon(o: Opening, walls: Wall[]): Poly | null {
  const w = walls.find((x) => x.id === o.wallId);
  if (!w) return null;
  const n = leftNormal(w);
  const t = w.thickness / 2;
  const p0 = pointOnWall(w, o.offset);
  const p1 = pointOnWall(w, o.offset + o.width);
  return [
    { x: p0.x + n.x * t, y: p0.y + n.y * t },
    { x: p1.x + n.x * t, y: p1.y + n.y * t },
    { x: p1.x - n.x * t, y: p1.y - n.y * t },
    { x: p0.x - n.x * t, y: p0.y - n.y * t },
  ];
}

export interface DoorSwing {
  hinge: Point;
  /** 门扇关闭时指向的方向（沿墙） */
  closedDir: Point;
  /** 门扇开到 90° 时指向的方向（垂直墙，朝开门侧） */
  openDir: Point;
  radius: number;
  sector: Poly;
}

/** 门扇扫掠扇形（含铰链点的凸多边形） */
export function doorSwing(o: Opening, walls: Wall[], segments = 8): DoorSwing | null {
  if (o.kind !== 'door' || !o.swing) return null;
  const w = walls.find((x) => x.id === o.wallId);
  if (!w) return null;
  const d = wallDir(w);
  const n = leftNormal(w);
  const sign = o.swing.side === 'right' ? -1 : 1;
  const t = w.thickness / 2;
  const atStart = o.swing.hinge === 'start';
  const base = pointOnWall(w, atStart ? o.offset : o.offset + o.width);
  const hinge = { x: base.x + n.x * t * sign, y: base.y + n.y * t * sign };
  const closedDir = atStart ? d : { x: -d.x, y: -d.y };
  const openDir = { x: n.x * sign, y: n.y * sign };
  const angle = ((o.swing.angleDeg ?? 90) * Math.PI) / 180;
  const radius = o.width;
  const sector: Poly = [hinge];
  for (let i = 0; i <= segments; i++) {
    const a = (angle * i) / segments;
    const c = Math.cos(a);
    const s = Math.sin(a);
    // 在 closedDir 与 openDir 构成的平面内从关闭方向旋到打开方向
    sector.push({
      x: hinge.x + (closedDir.x * c + openDir.x * s) * radius,
      y: hinge.y + (closedDir.y * c + openDir.y * s) * radius,
    });
  }
  return { hinge, closedDir, openDir, radius, sector };
}

// ---------- 多边形运算 ----------

function project(poly: Poly, axis: Point): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const p of poly) {
    const v = p.x * axis.x + p.y * axis.y;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return [min, max];
}

/** 凸多边形 SAT 相交（严格相交，贴边不算） */
export function convexIntersects(a: Poly, b: Poly, tol = 1): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const len = Math.hypot(q.x - p.x, q.y - p.y);
      if (len < EPS) continue;
      const axis = { x: -(q.y - p.y) / len, y: (q.x - p.x) / len };
      const [a0, a1] = project(a, axis);
      const [b0, b1] = project(b, axis);
      if (a1 <= b0 + tol || b1 <= a0 + tol) return false;
    }
  }
  return true;
}

export function intersects(as: Poly[], bs: Poly[], tol = 1): boolean {
  return as.some((a) => bs.some((b) => convexIntersects(a, b, tol)));
}

function closestOnSegment(p: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 < EPS) return a;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return { x: a.x + dx * t, y: a.y + dy * t };
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function centroid(poly: Poly): Point {
  let x = 0;
  let y = 0;
  for (const p of poly) {
    x += p.x;
    y += p.y;
  }
  return { x: x / poly.length, y: y / poly.length };
}

export interface GapResult { gap: number; witness: [Point, Point] }

/** 两个凸多边形之间的最短边距与最近点对；相交返回 0 */
export function polyGap(a: Poly, b: Poly): GapResult {
  if (convexIntersects(a, b, 0.5)) {
    const ca = centroid(a);
    const cb = centroid(b);
    return { gap: 0, witness: [ca, cb] };
  }
  let best: GapResult = { gap: Infinity, witness: [a[0], b[0]] };
  const check = (pts: Poly, edges: Poly, swap: boolean) => {
    for (const p of pts) {
      for (let i = 0; i < edges.length; i++) {
        const q = closestOnSegment(p, edges[i], edges[(i + 1) % edges.length]);
        const d = dist(p, q);
        if (d < best.gap) best = { gap: d, witness: swap ? [q, p] : [p, q] };
      }
    }
  };
  check(a, b, false);
  check(b, a, true);
  return best;
}

/** 多边形集合之间的最短边距 */
export function edgeGap(as: Poly[], bs: Poly[]): GapResult {
  let best: GapResult = { gap: Infinity, witness: [{ x: 0, y: 0 }, { x: 0, y: 0 }] };
  for (const a of as) {
    for (const b of bs) {
      const r = polyGap(a, b);
      if (r.gap < best.gap) best = r;
    }
  }
  return best;
}

/**
 * 方向性净空：从物件的某条功能边（正前/背后/两侧）出发，只统计落在该方向投影带内的障碍物。
 * 返回 null 表示目标不在该方向上。
 */
export function directionalGap(item: FurnitureItem, face: 'front' | 'back' | 'sides', targets: Poly[]): GapResult | null {
  const hw = item.w / 2;
  const hd = item.d / 2;
  let best: GapResult | null = null;
  for (const poly of targets) {
    const local = poly.map((p) => toLocal(item, p));
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of local) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    const tol = 1;
    const candidates: { gap: number; from: Point; to: Point }[] = [];
    const latOverlapX = Math.min(maxX, hw) - Math.max(minX, -hw);
    const latOverlapY = Math.min(maxY, hd) - Math.max(minY, -hd);
    if (face === 'front' && latOverlapX > tol && maxY > hd - tol) {
      const midX = (Math.max(minX, -hw) + Math.min(maxX, hw)) / 2;
      const gap = Math.max(0, minY - hd);
      candidates.push({ gap, from: { x: midX, y: hd }, to: { x: midX, y: hd + gap } });
    }
    if (face === 'back' && latOverlapX > tol && minY < -hd + tol) {
      const midX = (Math.max(minX, -hw) + Math.min(maxX, hw)) / 2;
      const gap = Math.max(0, -hd - maxY);
      candidates.push({ gap, from: { x: midX, y: -hd }, to: { x: midX, y: -hd - gap } });
    }
    if (face === 'sides' && latOverlapY > tol) {
      const midY = (Math.max(minY, -hd) + Math.min(maxY, hd)) / 2;
      if (minX > -tol && maxX > hw - tol) {
        const gap = Math.max(0, minX - hw);
        candidates.push({ gap, from: { x: hw, y: midY }, to: { x: hw + gap, y: midY } });
      }
      if (maxX < tol && minX < -hw + tol) {
        const gap = Math.max(0, -hw - maxX);
        candidates.push({ gap, from: { x: -hw, y: midY }, to: { x: -hw - gap, y: midY } });
      }
    }
    for (const c of candidates) {
      if (!best || c.gap < best.gap) {
        best = { gap: c.gap, witness: [toWorld(item, c.from), toWorld(item, c.to)] };
      }
    }
  }
  return best;
}

export function heightOverlap(a: [number, number], b: [number, number]): boolean {
  return Math.min(a[1], b[1]) - Math.max(a[0], b[0]) > 0;
}

export function pointInPolygon(p: Point, poly: Poly): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function distance(a: Point, b: Point): number {
  return dist(a, b);
}

export function signedArea(poly: Poly): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/**
 * 直角多边形向内收缩 d（用于把墙中线围成的房间换算成净面积边界）。
 * 每个顶点沿相邻两条边的内法线之和移动，凸角、凹角都适用。
 */
export function insetOrthoPolygon(poly: Poly, d: number): Poly {
  const ccw = signedArea(poly) > 0;
  const n = poly.length;
  const inward = (a: Point, b: Point): Point => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    // y 轴向下的平面里：逆时针（面积为正）时左法线朝内
    return ccw ? { x: -dy / len, y: dx / len } : { x: dy / len, y: -dx / len };
  };
  return poly.map((p, i) => {
    const prev = poly[(i - 1 + n) % n];
    const next = poly[(i + 1) % n];
    const n1 = inward(prev, p);
    const n2 = inward(p, next);
    return { x: Math.round(p.x + (n1.x + n2.x) * d), y: Math.round(p.y + (n1.y + n2.y) * d) };
  });
}

export function polygonArea(poly: Poly): number {
  return Math.abs(signedArea(poly));
}
