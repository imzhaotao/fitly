import type { Opening, Plan, RoomZone, ShapeParams, Wall } from './types';

export const DEFAULT_SHAPE: ShapeParams = { livingW: 3600, depth: 7200, sideW: 3300, kitchenD: 3300 };

export const SHAPE_LIMITS: Record<keyof ShapeParams, [number, number]> = {
  livingW: [3000, 5000],
  depth: [6000, 9000],
  sideW: [2700, 4200],
  kitchenD: [2400, 4000],
};

const EXT = 200;
const INT = 120;

export function clampShape(p: ShapeParams): ShapeParams {
  const out = { ...p };
  (Object.keys(SHAPE_LIMITS) as (keyof ShapeParams)[]).forEach((k) => {
    const [lo, hi] = SHAPE_LIMITS[k];
    out[k] = Math.round(Math.max(lo, Math.min(hi, out[k])));
  });
  // 卧室进深至少 3000
  out.kitchenD = Math.min(out.kitchenD, out.depth - 3000);
  return out;
}

/**
 * 参数化户型：左侧客餐厅（上餐厅下客厅），右上厨房，右下卧室。
 * 墙与洞口的 ID 稳定不变，贴墙点位（wallId + offset）随墙自动移动。
 */
export function buildShape(params: ShapeParams): Pick<Plan, 'rooms' | 'walls' | 'openings'> & { areaSqm: number } {
  const p = clampShape(params);
  const L = p.livingW;
  const D = p.depth;
  const T = L + p.sideW;
  const K = p.kitchenD;
  const e = EXT / 2;
  const i = INT / 2;

  const walls: Wall[] = [
    { id: 'w-top', a: { x: 0, y: 0 }, b: { x: T, y: 0 }, thickness: EXT, exterior: true },
    { id: 'w-right', a: { x: T, y: 0 }, b: { x: T, y: D }, thickness: EXT, exterior: true },
    { id: 'w-bottom', a: { x: 0, y: D }, b: { x: T, y: D }, thickness: EXT, exterior: true },
    { id: 'w-left', a: { x: 0, y: 0 }, b: { x: 0, y: D }, thickness: EXT, exterior: true },
    { id: 'w-mid', a: { x: L, y: 0 }, b: { x: L, y: D }, thickness: INT },
    { id: 'w-kb', a: { x: L, y: K }, b: { x: T, y: K }, thickness: INT },
  ];

  const rect = (x0: number, y0: number, x1: number, y1: number) => [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];

  const rooms: RoomZone[] = [
    { id: 'r-living', space: 'living', name: '客餐厅', polygon: rect(e, e, L - i, D - e), floorMaterial: 'wood' },
    { id: 'r-kitchen', space: 'kitchen', name: '厨房', polygon: rect(L + i, e, T - e, K - i), floorMaterial: 'tile' },
    { id: 'r-bedroom', space: 'bedroom', name: '卧室', polygon: rect(L + i, K + i, T - e, D - e), floorMaterial: 'wood' },
  ];

  const openings: Opening[] = [
    { id: 'o-entry', wallId: 'w-top', kind: 'door', offset: 300, width: 900, height: 2100, swing: { side: 'left', hinge: 'start' } },
    { id: 'o-balcony', wallId: 'w-bottom', kind: 'door', offset: L - 1900, width: 900, height: 2100, swing: { side: 'right', hinge: 'start' } },
    { id: 'o-kitchen', wallId: 'w-mid', kind: 'door', offset: 1100, width: 800, height: 2100, swing: { side: 'right', hinge: 'start' } },
    { id: 'o-bedroom', wallId: 'w-mid', kind: 'door', offset: K + 150, width: 900, height: 2100, swing: { side: 'right', hinge: 'start' } },
    { id: 'o-kitchen-win', wallId: 'w-right', kind: 'window', offset: 900, width: 1500, height: 1200, sillHeightMm: 900 },
    { id: 'o-bedroom-win', wallId: 'w-bottom', kind: 'window', offset: L + 700, width: 1800, height: 1500, sillHeightMm: 800 },
    { id: 'o-living-win', wallId: 'w-left', kind: 'window', offset: D - 2900, width: 1800, height: 1500, sillHeightMm: 900 },
  ];

  return { rooms, walls, openings, areaSqm: Math.round((T * D) / 1e5) / 10 };
}

/** 按参数重建户型几何，保留家具与点位 */
export function applyShape(plan: Plan, params: ShapeParams): Plan {
  const s = buildShape(params);
  return {
    ...plan,
    shape: { kind: 'l-apartment', params: clampShape(params) },
    rooms: s.rooms,
    walls: s.walls,
    openings: s.openings,
    meta: { ...plan.meta, areaSqm: s.areaSqm },
  };
}
