import { describe, expect, it } from 'vitest';
import { applyShape, collisionsOf, DEFAULT_SHAPE, findFreeSpot, resolveMove, type FurnitureItem, type Plan } from '../src';
import { createTemplatePlan, TEMPLATES } from '../../web/src/plan/templates';

function plan(furniture: FurnitureItem[]): Plan {
  return applyShape(
    { id: 't', version: 1, unit: 'mm', calibrated: true, meta: { name: 't' }, rooms: [], walls: [], openings: [], anchors: [], fixtures: [], furniture },
    DEFAULT_SHAPE,
  );
}

const bed: FurnitureItem = { id: 'bed', type: 'bed', x: 5750, y: 5230, w: 1800, d: 2100, h: 1000, rotation: 90 };
const table: FurnitureItem = { id: 'tt', type: 'teaTable', x: 1700, y: 5000, w: 1200, d: 600, h: 400, rotation: -90 };

describe('碰撞', () => {
  it('两套模板初始没有重叠', () => {
    for (const t of TEMPLATES) {
      const p = createTemplatePlan(t.id);
      for (const f of p.furniture) {
        const c = collisionsOf(p, f);
        expect({ id: f.type, ...c }).toEqual({ id: f.type, itemIds: [], wall: false });
      }
    }
  });

  it('床不能穿墙拖进客厅，停在墙前', () => {
    const p = plan([bed]);
    const wd: FurnitureItem = { id: 'wd', type: 'wardrobe', x: 3960, y: 5500, w: 2000, d: 600, h: 2400, rotation: -90 };
    const p2 = plan([bed, wd]);
    const to = resolveMove(p2, bed, { x: bed.x, y: bed.y }, { x: 1700, y: 5230 });
    // 走到贴住衣柜为止（衣柜前沿 x=4260，床半长 1050）
    expect(Math.abs(to.x - (4260 + 1050))).toBeLessThanOrEqual(3);
    expect(to.y).toBe(5230);
    // 没有衣柜时停在墙前
    expect(Math.abs(resolveMove(p, bed, { x: bed.x, y: bed.y }, { x: 1700, y: 5230 }).x - (3660 + 1050))).toBeLessThanOrEqual(3);
  });

  it('拖到茶几上被挡住', () => {
    const sofa: FurnitureItem = { id: 's', type: 'sofa', x: 550, y: 5000, w: 2400, d: 900, h: 850, rotation: -90 };
    const p = plan([sofa, table]);
    const to = resolveMove(p, sofa, { x: 550, y: 5000 }, { x: 1700, y: 5000 });
    expect(Math.abs(to.x - (1400 - 450))).toBeLessThanOrEqual(3);
    expect(collisionsOf(p, { ...sofa, ...to }).itemIds).toEqual([]);
  });

  it('碰到障碍时沿另一轴滑动', () => {
    const sofa: FurnitureItem = { id: 's', type: 'sofa', x: 550, y: 5000, w: 2400, d: 900, h: 850, rotation: -90 };
    const p = plan([sofa]);
    // 往左撞墙同时往下拖：x 被墙挡住，y 照常移动
    const to = resolveMove(p, sofa, { x: 550, y: 5000 }, { x: 300, y: 5300 });
    expect(Math.abs(to.x - 550)).toBeLessThanOrEqual(2);
    expect(to.y).toBe(5300);
  });

  it('地毯、挂墙电视与电视柜、餐椅与餐桌不算碰撞', () => {
    const rug: FurnitureItem = { id: 'r', type: 'rug', x: 1700, y: 5000, w: 2300, d: 1600, h: 10, rotation: 0 };
    const cab: FurnitureItem = { id: 'c', type: 'tvCabinet', x: 3340, y: 5200, w: 2000, d: 400, h: 450, rotation: 90 };
    const tv: FurnitureItem = { id: 'tv', type: 'tv', x: 3400, y: 5200, z: 900, w: 1450, d: 80, h: 840, rotation: 90 };
    const dt: FurnitureItem = { id: 'dt', type: 'diningTable', x: 850, y: 2300, w: 1400, d: 800, h: 750, rotation: 0 };
    const ch: FurnitureItem = { id: 'ch', type: 'diningChair', x: 500, y: 1900, w: 450, d: 500, h: 850, rotation: 0 };
    const p = plan([rug, table, cab, tv, dt, ch]);
    expect(collisionsOf(p, table).itemIds).toEqual([]);
    expect(collisionsOf(p, tv).itemIds).toEqual([]);
    expect(collisionsOf(p, ch).itemIds).toEqual([]);
  });

  it('新加家具自动找空位', () => {
    const p = plan([table]);
    const room = p.rooms.find((r) => r.space === 'living')!;
    const sofa: FurnitureItem = { id: 'new', type: 'sofa', x: 0, y: 0, w: 2400, d: 900, h: 850, rotation: 0 };
    const spot = findFreeSpot(p, sofa, room.polygon);
    expect(collisionsOf(p, { ...sofa, ...spot })).toEqual({ itemIds: [], wall: false });
  });
});
