import { NextResponse } from 'next/server';
import type { Plan } from '@fitly/layout-engine';
import { auditOf, auditSummary } from '@/lib/audit';
import { db } from '@/lib/supabase';
import { readWorkspace } from '@/lib/workspace';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const { data, error } = await db()
    .from('snapshots')
    .select('id, plan_id, label, auto, audit, created_at')
    .eq('plan_id', id)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ snapshots: data });
}

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const ws = await readWorkspace();
  const { plan, label, auto } = (await req.json()) as { plan: Plan; label?: string; auto?: boolean };
  const owner = await db().from('plans').select('id').eq('id', id).eq('workspace_id', ws ?? '').maybeSingle();
  if (!owner.data) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const audit = auditSummary(auditOf(plan));
  const { data, error } = await db()
    .from('snapshots')
    .insert({ plan_id: id, label: (label ?? '').trim() || '未命名版本', auto: !!auto, data: plan, audit })
    .select('id, plan_id, label, auto, audit, created_at')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
