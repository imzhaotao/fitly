import { describe, expect, it } from 'vitest';
import { collisionsOf, createQuery, insetOrthoPolygon, polygonArea } from '@fitly/layout-engine';
import { auditPlan, PITFALLS } from '../src';
import { buildHomeA, HOME_A_LABELED_AREA } from '../../web/src/plan/homeA';

const plan = { id: 'h', ...buildHomeA() };

describe('自家户型（户型图录入）', () => {
  it('各房间净面积与户型图标注相差不超过 10%', () => {
    for (const r of plan.rooms) {
      // 户型图标注的是扣掉墙厚后的净面积：在地面区域基础上再收 40mm 近似外墙多出的半厚
      const net = polygonArea(insetOrthoPolygon(r.polygon, 40)) / 1e6;
      const labeled = HOME_A_LABELED_AREA[r.id];
      expect(Math.abs(net - labeled) / labeled, `${r.name} 算出 ${net.toFixed(2)}㎡，图上 ${labeled}㎡`).toBeLessThan(0.1);
    }
  });

  it('初始家具互不重叠、不压墙', () => {
    for (const f of plan.furniture) {
      expect({ type: f.type, ...collisionsOf(plan, f) }).toEqual({ type: f.type, itemIds: [], wall: false });
    }
  });

  it('初始布局没有必须处理的冲突，家具都落在房间里', () => {
    const a = auditPlan(PITFALLS, plan, (s) => createQuery(plan, s));
    console.log(a.conflicts.map((c) => c.title));
    expect(a.blockingCount).toBe(0);
    const q = createQuery(plan);
    expect(q.pathLength([{ type: 'fridge' }, { type: 'sink' }, { type: 'stove' }])).toBeGreaterThan(3600);
  });
});
