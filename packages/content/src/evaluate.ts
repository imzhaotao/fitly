import type { GeomHit, GeometryQuery, Plan, QueryScope } from '@fitly/layout-engine';
import { roomOfItem } from '@fitly/layout-engine';
import type {
  EvalContext,
  EvaluatedPitfall,
  GeomTest,
  Pitfall,
  PlanAudit,
  PropTest,
  Severity,
  Trigger,
} from './types';

const SEVERITY_ORDER: Record<Severity, number> = { blocking: 0, costly: 1, annoying: 2 };

interface TriggerResult { ok: boolean; hit?: GeomHit; measured?: boolean }

function testProp(q: GeometryQuery, t: Extract<Trigger, { kind: 'prop' }>): TriggerResult {
  const test: PropTest = t.test;
  if (test.field === 'variant') {
    const v = q.getItemVariant(t.target);
    if (v == null) return { ok: false };
    if (test.eq != null && v !== test.eq) return { ok: false };
    if (test.neq != null && v === test.neq) return { ok: false };
    if (test.in != null && !test.in.includes(v)) return { ok: false };
    return { ok: true, measured: true };
  }
  const v = q.getItemProp(t.target, test.field);
  if (v == null) return { ok: false };
  if (test.gt != null && !(v > test.gt)) return { ok: false };
  if (test.lt != null && !(v < test.lt)) return { ok: false };
  return { ok: true, measured: true, hit: { valueMm: v } };
}

function finite(h: GeomHit | null): h is GeomHit {
  return h != null && Number.isFinite(h.valueMm);
}

function testGeom(q: GeometryQuery, test: GeomTest): TriggerResult {
  switch (test.op) {
    case 'clearance': {
      const h = q.clearance(test.from, test.to, { face: test.face, checkHeight: test.checkHeight });
      return finite(h) && h.valueMm < test.lt ? { ok: true, hit: h, measured: true } : { ok: false };
    }
    case 'distance': {
      const h = q.distance(test.a, test.b);
      return finite(h) && h.valueMm < test.lt ? { ok: true, hit: h, measured: true } : { ok: false };
    }
    case 'overlap': {
      const h = q.overlap(test.a, test.b, { checkHeight: test.checkHeight });
      return finite(h) ? { ok: true, hit: h, measured: true } : { ok: false };
    }
    case 'sweep': {
      const h = q.sweepBlocked(test.door, test.blockedBy);
      return finite(h) ? { ok: true, hit: h, measured: true } : { ok: false };
    }
    case 'sum': {
      const v = q.pathLength(test.parts);
      if (v == null) return { ok: false };
      if (test.lt != null && !(v < test.lt)) return { ok: false };
      if (test.gt != null && !(v > test.gt)) return { ok: false };
      return { ok: true, hit: { valueMm: v }, measured: true };
    }
    case 'socketBelowTop': {
      const h = q.socketBelowTop(test.target, test.maxDistMm);
      return finite(h) && h.valueMm > test.gt ? { ok: true, hit: h, measured: true } : { ok: false };
    }
  }
}

function testTrigger(t: Trigger, ctx: EvalContext, q: GeometryQuery): TriggerResult {
  switch (t.kind) {
    case 'select':
      if (t.space && t.space !== ctx.space) return { ok: false };
      if (t.objectType && t.objectType !== ctx.selectedType) return { ok: false };
      return { ok: true };
    case 'enter':
      return { ok: ctx.space === t.space };
    case 'stage':
      return { ok: ctx.stage === t.stage };
    case 'exists':
      return { ok: q.hasItem(t.target) };
    case 'prop':
      return testProp(q, t);
    case 'geom':
      return testGeom(q, t.test);
  }
}

export function fillTitle(title: string, hit?: GeomHit): string {
  if (!hit || !Number.isFinite(hit.valueMm)) return title;
  const mm = Math.round(hit.valueMm);
  const cm = Math.round(hit.valueMm / 10);
  return title.replace(/\{\{mm\}\}/g, String(mm)).replace(/\{\{cm\}\}/g, String(cm));
}

function evaluateOne(p: Pitfall, ctx: EvalContext, q: GeometryQuery): EvaluatedPitfall | null {
  let hit: GeomHit | undefined;
  let measured = false;
  for (const t of p.check) {
    const r = testTrigger(t, ctx, q);
    if (!r.ok) return null;
    if (r.measured) measured = true;
    if (r.hit && (!hit || t.kind === 'geom')) hit = r.hit;
  }
  return {
    pitfall: p,
    title: fillTitle(p.title, hit),
    hit,
    itemId: hit?.fromId ?? ctx.selectedId,
    roomId: ctx.roomId,
    layer: measured ? 'L2' : 'L1',
  };
}

export function sortEvaluated(list: EvaluatedPitfall[]): EvaluatedPitfall[] {
  return [...list].sort((a, b) => {
    const s = SEVERITY_ORDER[a.pitfall.severity] - SEVERITY_ORDER[b.pitfall.severity];
    if (s !== 0) return s;
    // 同级里实测（L2）优先
    if (a.layer !== b.layer) return a.layer === 'L2' ? -1 : 1;
    return 0;
  });
}

/** 交互态求值：响应当前点选、所在空间与阶段（冷却/关闭过滤交给 UI 层） */
export function evaluateInteractive(pitfalls: Pitfall[], ctx: EvalContext, q: GeometryQuery): EvaluatedPitfall[] {
  const out: EvaluatedPitfall[] = [];
  const seen = new Set<string>();
  for (const p of pitfalls) {
    if (p.space !== ctx.space) continue;
    const r = evaluateOne(p, ctx, q);
    if (!r) continue;
    const key = `${p.id}|${r.itemId ?? r.roomId ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return sortEvaluated(out);
}

function isAuditable(p: Pitfall): boolean {
  const hasObjective = p.check.some((t) => t.kind === 'geom' || t.kind === 'prop');
  const hasStage = p.check.some((t) => t.kind === 'stage');
  return hasObjective && !hasStage;
}

/**
 * 快照静态审计：遍历全部房间与家具，只统计几何冲突与确定性属性告警。
 * 不依赖当前选中、所处空间或 UI 冷却状态，同一份快照结果恒定。
 */
export function auditPlan(
  pitfalls: Pitfall[],
  plan: Plan,
  createQueryForScope: (scope: QueryScope) => GeometryQuery,
): PlanAudit {
  const conflicts: EvaluatedPitfall[] = [];
  const seen = new Set<string>();
  const push = (r: EvaluatedPitfall | null, key: string) => {
    if (!r || seen.has(key)) return;
    seen.add(key);
    conflicts.push(r);
  };
  for (const p of pitfalls.filter(isAuditable)) {
    if (p.objectType) {
      for (const item of plan.furniture.filter((f) => f.type === p.objectType)) {
        const roomId = roomOfItem(plan, item);
        const room = plan.rooms.find((r) => r.id === roomId);
        if (!room || room.space !== p.space) continue;
        const ctx: EvalContext = { selectedId: item.id, selectedType: item.type, roomId, space: room.space, stage: p.stage };
        const r = evaluateOne(p, ctx, createQueryForScope({ selectedId: item.id, roomId }));
        if (r) r.itemId = item.id;
        push(r, `${p.id}|${item.id}`);
      }
    } else {
      for (const room of plan.rooms.filter((r) => r.space === p.space)) {
        const ctx: EvalContext = { roomId: room.id, space: room.space, stage: p.stage };
        const r = evaluateOne(p, ctx, createQueryForScope({ roomId: room.id }));
        push(r, `${p.id}|${r?.itemId ?? room.id}`);
      }
    }
  }
  const sorted = sortEvaluated(conflicts);
  const count = (s: Severity) => sorted.filter((c) => c.pitfall.severity === s).length;
  return {
    blockingCount: count('blocking'),
    costlyCount: count('costly'),
    annoyingCount: count('annoying'),
    totalCount: sorted.length,
    conflicts: sorted,
  };
}

/** 对比两份审计：按 (pitfall.id, itemId) 区分仅 A 有 / 仅 B 有 */
export function diffAudits(a: PlanAudit, b: PlanAudit) {
  const key = (c: EvaluatedPitfall) => `${c.pitfall.id}|${c.itemId ?? c.roomId ?? ''}`;
  const ka = new Set(a.conflicts.map(key));
  const kb = new Set(b.conflicts.map(key));
  return {
    onlyA: a.conflicts.filter((c) => !kb.has(key(c))),
    onlyB: b.conflicts.filter((c) => !ka.has(key(c))),
    both: a.conflicts.filter((c) => kb.has(key(c))),
  };
}
