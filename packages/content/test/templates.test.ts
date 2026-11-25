import { describe, expect, it } from 'vitest';
import { createQuery } from '@fitly/layout-engine';
import { auditPlan, PITFALLS } from '../src';
import { createTemplatePlan, TEMPLATES } from '../../web/src/plan/templates';

describe('设计模板', () => {
  for (const t of TEMPLATES) {
    it(`${t.name}：初始布局没有 blocking 冲突`, () => {
      const plan = createTemplatePlan(t.id);
      const a = auditPlan(PITFALLS, plan, (s) => createQuery(plan, s));
      console.log(t.id, a.conflicts.map((c) => `${c.pitfall.id} ${c.title}`));
      expect(a.blockingCount).toBe(0);
    });
  }
});
