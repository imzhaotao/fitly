import { auditPlan, PITFALLS, type PlanAudit } from '@fitly/content';
import { createQuery, type Plan } from '@fitly/layout-engine';

export function auditOf(plan: Plan): PlanAudit {
  return auditPlan(PITFALLS, plan, (scope) => createQuery(plan, scope));
}

export function auditSummary(a: PlanAudit) {
  return { blocking: a.blockingCount, costly: a.costlyCount, annoying: a.annoyingCount, total: a.totalCount };
}

export type AuditSummary = ReturnType<typeof auditSummary>;
