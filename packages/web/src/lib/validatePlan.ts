import type { Plan } from '@fitly/layout-engine';

const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 1e6;
const pt = (p: unknown) => !!p && num((p as { x: unknown }).x) && num((p as { y: unknown }).y);

/** 浏览器传来的方案做基本校验：结构完整、数量与数值在合理范围内 */
export function validatePlan(p: unknown): p is Omit<Plan, 'id'> {
  if (!p || typeof p !== 'object') return false;
  const plan = p as Plan;
  if (!Array.isArray(plan.walls) || !Array.isArray(plan.rooms) || !Array.isArray(plan.openings)) return false;
  if (plan.walls.length === 0 || plan.walls.length > 400 || plan.rooms.length > 60 || plan.openings.length > 400) return false;
  if (!plan.walls.every((w) => typeof w.id === 'string' && pt(w.a) && pt(w.b) && num(w.thickness))) return false;
  if (!plan.rooms.every((r) => typeof r.id === 'string' && Array.isArray(r.polygon) && r.polygon.length >= 3 && r.polygon.length < 500 && r.polygon.every(pt))) return false;
  if (!plan.openings.every((o) => typeof o.wallId === 'string' && num(o.offset) && num(o.width))) return false;
  if (!Array.isArray(plan.furniture) || plan.furniture.length > 300) return false;
  if (!plan.meta || typeof plan.meta.name !== 'string' || plan.meta.name.length > 60) return false;
  return true;
}
