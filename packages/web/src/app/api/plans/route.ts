import { NextResponse } from 'next/server';
import { auditOf, auditSummary } from '@/lib/audit';
import { db } from '@/lib/supabase';
import { ensureWorkspace } from '@/lib/workspace';
import { createTemplatePlan } from '@/plan/templates';

/** 从设计模板新建方案，并存一个“模板原样”的自动快照 */
export async function POST(req: Request) {
  const { templateId } = (await req.json().catch(() => ({}))) as { templateId?: string };
  const ws = await ensureWorkspace();
  const plan = createTemplatePlan(templateId ?? 'movie');
  const { data, error } = await db()
    .from('plans')
    .insert({ workspace_id: ws, name: plan.meta.name, template_id: plan.meta.templateId, data: plan })
    .select('id')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  plan.id = data.id;
  await db().from('plans').update({ data: plan }).eq('id', data.id);
  await db()
    .from('snapshots')
    .insert({ plan_id: data.id, label: '模板原样', auto: true, data: plan, audit: auditSummary(auditOf(plan)) });
  await db().from('events').insert({ workspace_id: ws, name: 'plan_created', props: { templateId } });
  return NextResponse.json({ id: data.id });
}

export async function GET() {
  const ws = await ensureWorkspace();
  const { data, error } = await db()
    .from('plans')
    .select('id, name, template_id, updated_at')
    .eq('workspace_id', ws)
    .order('updated_at', { ascending: false })
    .limit(20);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ plans: data });
}
