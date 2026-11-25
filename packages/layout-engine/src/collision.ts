import { intersects, leftNormal, pointOnWall, toPolygons, wallLength, type Poly } from './geometry';
import type { FurnitureItem, ObjectType, Plan, Point, Wall } from './types';

/** 薄的平铺物（地毯）不参与碰撞 */
const FLAT_MAX_H = 30;

/** 允许互相穿插的组合：餐椅可以推进餐桌下 */
const ALLOWED_PAIRS: [ObjectType, ObjectType][] = [['diningChair', 'diningTable']];

function allowedPair(a: ObjectType, b: ObjectType): boolean {
  return ALLOWED_PAIRS.some(([x, y]) => (a === x && b === y) || (a === y && b === x));
}

function zRange(it: FurnitureItem): [number, number] {
  const z = it.z ?? 0;
  return [z, z + it.h];
}

function zOverlap(a: FurnitureItem, b: FurnitureItem): boolean {
  const [a0, a1] = zRange(a);
  const [b0, b1] = zRange(b);
  return Math.min(a1, b1) - Math.max(a0, b0) > 0;
}

/** 墙体实心部分：扣掉门洞 / 通道（窗洞下方仍是墙，挡家具） */
export function wallSolids(walls: Wall[], openings: Plan['openings']): Poly[] {
  const out: Poly[] = [];
  for (const w of walls) {
    const len = wallLength(w);
    const gaps = openings
      .filter((o) => o.wallId === w.id && (o.kind === 'door' || o.kind === 'pass'))
      .map((o) => [o.offset, o.offset + o.width] as [number, number])
      .sort((a, b) => a[0] - b[0]);
    let cur = 0;
    const spans: [number, number][] = [];
    for (const [g0, g1] of gaps) {
      if (g0 > cur) spans.push([cur, g0]);
      cur = Math.max(cur, g1);
    }
    if (cur < len) spans.push([cur, len]);
    const n = leftNormal(w);
    const t = w.thickness / 2;
    for (const [s0, s1] of spans) {
      const p0 = pointOnWall(w, s0);
      const p1 = pointOnWall(w, s1);
      out.push([
        { x: p0.x + n.x * t, y: p0.y + n.y * t },
        { x: p1.x + n.x * t, y: p1.y + n.y * t },
        { x: p1.x - n.x * t, y: p1.y - n.y * t },
        { x: p0.x - n.x * t, y: p0.y - n.y * t },
      ]);
    }
  }
  return out;
}

export interface Collision {
  /** 与之重叠的家具 ID */
  itemIds: string[];
  /** 是否压到墙 */
  wall: boolean;
}

/** 检查某件家具在当前方案中是否与其他家具或墙体重叠（贴边不算） */
export function collisionsOf(plan: Plan, item: FurnitureItem, solids = wallSolids(plan.walls, plan.openings)): Collision {
  const res: Collision = { itemIds: [], wall: false };
  if (item.h <= FLAT_MAX_H) return res;
  const polys = toPolygons(item);
  for (const other of plan.furniture) {
    if (other.id === item.id || other.h <= FLAT_MAX_H) continue;
    if (allowedPair(item.type, other.type)) continue;
    if (!zOverlap(item, other)) continue;
    if (intersects(polys, toPolygons(other), 2)) res.itemIds.push(other.id);
  }
  res.wall = intersects(polys, solids, 2);
  return res;
}

export function isFree(plan: Plan, item: FurnitureItem, solids?: Poly[]): boolean {
  const c = collisionsOf(plan, item, solids);
  return !c.wall && c.itemIds.length === 0;
}

/**
 * 拖动求解：从上一个合法位置走向目标位置。
 * 路径上逐段检查（防止一下跳过墙），撞到时沿 x 或 y 单轴滑动。
 */
export function resolveMove(plan: Plan, item: FurnitureItem, from: Point, to: Point): Point {
  const solids = wallSolids(plan.walls, plan.openings);
  const ok = (p: Point) => isFree(plan, { ...item, x: p.x, y: p.y }, solids);
  /** 沿直线走到第一次碰撞前的最远位置 */
  const walk = (a: Point, b: Point): Point => {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1) return a;
    const steps = Math.max(1, Math.ceil(len / 20));
    let last = a;
    for (let i = 1; i <= steps; i++) {
      const p = { x: Math.round(a.x + ((b.x - a.x) * i) / steps), y: Math.round(a.y + ((b.y - a.y) * i) / steps) };
      if (!ok(p)) {
        // 二分逼近到贴住障碍（1mm 精度）
        let lo = last;
        let hi = p;
        while (Math.hypot(hi.x - lo.x, hi.y - lo.y) > 1) {
          const mid = { x: Math.round((lo.x + hi.x) / 2), y: Math.round((lo.y + hi.y) / 2) };
          if ((mid.x === lo.x && mid.y === lo.y) || (mid.x === hi.x && mid.y === hi.y)) break;
          if (ok(mid)) lo = mid;
          else hi = mid;
        }
        return lo;
      }
      last = p;
    }
    return b;
  };
  // 起点本身就有重叠（比如刚改大了尺寸）时，允许自由移动直到脱离
  if (!ok(from)) return to;
  const direct = walk(from, to);
  if (direct.x === to.x && direct.y === to.y) return to;
  // 撞到后沿障碍滑动：先走位移大的轴，再走另一轴
  const xFirst = Math.abs(to.x - from.x) >= Math.abs(to.y - from.y);
  const slide = (p: Point, axis: 'x' | 'y') => walk(p, axis === 'x' ? { x: to.x, y: p.y } : { x: p.x, y: to.y });
  const a1 = slide(slide(direct, xFirst ? 'x' : 'y'), xFirst ? 'y' : 'x');
  const a2 = slide(slide(direct, xFirst ? 'y' : 'x'), xFirst ? 'x' : 'y');
  const d = (p: Point) => Math.hypot(to.x - p.x, to.y - p.y);
  return d(a1) <= d(a2) ? a1 : a2;
}

/** 在房间里找一个放得下的位置：从中心向外按网格搜索 */
export function findFreeSpot(plan: Plan, item: FurnitureItem, roomPolygon: Point[]): Point {
  const xs = roomPolygon.map((p) => p.x);
  const ys = roomPolygon.map((p) => p.y);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const solids = wallSolids(plan.walls, plan.openings);
  const step = 100;
  const maxR = Math.ceil(Math.max(x1 - x0, y1 - y0) / step);
  for (let r = 0; r <= maxR; r++) {
    for (let i = -r; i <= r; i++) {
      for (let j = -r; j <= r; j++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
        const p = { x: Math.round((cx + i * step) / 10) * 10, y: Math.round((cy + j * step) / 10) * 10 };
        if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue;
        const cand = { ...item, x: p.x, y: p.y };
        const b = toPolygons(cand).flat();
        if (b.some((q) => q.x < x0 - 1 || q.x > x1 + 1 || q.y < y0 - 1 || q.y > y1 + 1)) continue;
        if (isFree(plan, cand, solids)) return p;
      }
    }
  }
  return { x: Math.round(cx), y: Math.round(cy) };
}
