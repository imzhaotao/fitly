import type { Plan } from '@fitly/layout-engine';
import type { AuditSummary } from './audit';

export interface PlanRow {
  id: string;
  workspace_id: string;
  name: string;
  template_id: string | null;
  data: Plan;
  created_at: string;
  updated_at: string;
}

export interface SnapshotRow {
  id: string;
  plan_id: string;
  label: string;
  auto: boolean;
  data: Plan;
  audit: AuditSummary | null;
  created_at: string;
}

export interface ShareRow {
  code: string;
  plan_id: string;
  snapshot_ids: string[];
  title: string;
  created_at: string;
}

export interface VoteRow {
  id: string;
  share_code: string;
  snapshot_id: string;
  nickname: string | null;
  comment: string | null;
  created_at: string;
}

export type SnapshotMeta = Omit<SnapshotRow, 'data'>;
