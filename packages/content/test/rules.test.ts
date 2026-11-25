import { describe, expect, it } from 'vitest';
import { applyShape, createQuery, DEFAULT_SHAPE, type FurnitureItem, type Plan } from '@fitly/layout-engine';
import { auditPlan, evaluateInteractive, PITFALLS } from '../src';

function basePlan(furniture: FurnitureItem[], anchors: Plan['anchors'] = []): Plan {
  return applyShape(
    {
      id: 't', version: 1, unit: 'mm', calibrated: true, meta: { name: 't' },
      rooms: [], walls: [], openings: [], anchors, fixtures: [], furniture,
    },
    DEFAULT_SHAPE,
  );
}

const ids = (plan: Plan, ctx: Parameters<typeof evaluateInteractive>[1]) =>
  evaluateInteractive(PITFALLS, ctx, createQuery(plan, { selectedId: ctx.selectedId })).map((e) => e.pitfall.id);

const sofa = (w: number): FurnitureItem => ({ id: 'sofa', type: 'sofa', x: 550, y: 5200, w, d: 900, h: 850, rotation: -90 });

describe('沙发入户', () => {
  it('w=2201 且选中时触发，w=2200 或未选中不触发', () => {
    expect(ids(basePlan([sofa(2201)]), { selectedId: 'sofa', selectedType: 'sofa', space: 'living', stage: 'layout' })).toContain('living.sofa.cannot-enter');
    expect(ids(basePlan([sofa(2200)]), { selectedId: 'sofa', selectedType: 'sofa', space: 'living', stage: 'layout' })).not.toContain('living.sofa.cannot-enter');
    expect(ids(basePlan([sofa(2201)]), { space: 'living', stage: 'layout' })).not.toContain('living.sofa.cannot-enter');
  });
});

describe('衣柜门型', () => {
  const bed: FurnitureItem = { id: 'bed', type: 'bed', x: 5750, y: 5230, w: 1800, d: 2100, h: 1000, rotation: 90 };
  const wardrobe = (variant: FurnitureItem['variant']): FurnitureItem => ({ id: 'wd', type: 'wardrobe', x: 3960, y: 5500, w: 2000, d: 600, h: 2400, rotation: -90, variant });
  const ctx = { selectedId: 'wd', selectedType: 'wardrobe' as const, space: 'bedroom' as const, stage: 'layout' as const };

  it('平开门被床挡住报警，并带实测净空', () => {
    const plan = basePlan([wardrobe('hinged-door'), bed]);
    const r = evaluateInteractive(PITFALLS, ctx, createQuery(plan, { selectedId: 'wd' }));
    const hit = r.find((e) => e.pitfall.id === 'bedroom.wardrobe.blocked-by-bed');
    expect(hit?.hit?.valueMm).toBe(440);
    expect(hit?.title).toContain('44 cm');
  });
  it('切推拉门后解除', () => {
    expect(ids(basePlan([wardrobe('sliding-door'), bed]), ctx)).not.toContain('bedroom.wardrobe.blocked-by-bed');
  });
  it('门型未知时只问询', () => {
    const r = ids(basePlan([wardrobe('unknown'), bed]), ctx);
    expect(r).toContain('bedroom.wardrobe.door-type-unknown');
    expect(r).not.toContain('bedroom.wardrobe.blocked-by-bed');
  });
});

describe('餐桌插座（访谈案例）', () => {
  const table: FurnitureItem = { id: 'tb', type: 'diningTable', x: 850, y: 2300, w: 1400, d: 800, h: 750, rotation: 0 };
  const ctx = { selectedId: 'tb', selectedType: 'diningTable' as const, space: 'living' as const, stage: 'measure' as const };
  const socket = (confirmed: boolean) => [{ id: 's', kind: 'socket' as const, wallId: 'w-left', offset: 2300, side: 'right' as const, heightMm: 450, confirmed }];

  it('桌高 750、插座 450 已确认时显示低于桌面 30 cm', () => {
    const plan = basePlan([table], socket(true));
    const r = evaluateInteractive(PITFALLS, ctx, createQuery(plan, { selectedId: 'tb' }));
    expect(r.find((e) => e.pitfall.id === 'living.diningTable.socket-below-top')?.title).toBe('插座中心低于桌面 30 cm');
  });
  it('未确认点位时只给核对问题', () => {
    const r = ids(basePlan([table], socket(false)), ctx);
    expect(r).toContain('living.diningTable.socket-reach');
    expect(r).not.toContain('living.diningTable.socket-below-top');
  });
  it('非定水电阶段不打扰', () => {
    expect(ids(basePlan([table], socket(true)), { ...ctx, stage: 'layout' })).not.toContain('living.diningTable.socket-reach');
  });
  it('桌下插座本身不计入布局冲突', () => {
    expect(auditPlan(PITFALLS, basePlan([table], socket(true)), (s) => createQuery(basePlan([table], socket(true)), s)).totalCount).toBe(0);
  });
});

describe('几何', () => {
  it('门扇扫掠：沙发贵妃位压进阳台门扫掠区时报警', () => {
    const lsofa: FurnitureItem = { ...sofa(2800), variant: 'l-shape-left', chaiseW: 700, chaiseD: 650 };
    expect(ids(basePlan([lsofa]), { space: 'living', stage: 'layout' })).not.toContain('living.sofa.blocked-by-door');
    const moved = { ...lsofa, y: 5700 };
    const plan = basePlan([moved]);
    expect(ids(plan, { space: 'living', stage: 'layout' })).not.toContain('living.sofa.blocked-by-door');
    const deeper = { ...lsofa, y: 5800, chaiseD: 1000 };
    expect(ids(basePlan([deeper]), { space: 'living', stage: 'layout' })).toContain('living.sofa.blocked-by-door');
  });
  it('未校准时几何查询返回 null，不误报', () => {
    const plan = { ...basePlan([sofa(2800)]), calibrated: false };
    expect(createQuery(plan).clearance({ type: 'sofa' }, { wallKind: 'wall' })).toBeNull();
  });
  it('审计与选中状态无关', () => {
    const plan = basePlan([sofa(2800)]);
    const a = auditPlan(PITFALLS, plan, (s) => createQuery(plan, s));
    const b = auditPlan(PITFALLS, plan, (s) => createQuery(plan, { ...s }));
    expect(a.totalCount).toBe(b.totalCount);
  });
});
