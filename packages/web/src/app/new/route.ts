import { NextResponse } from 'next/server';
import { auditOf, auditSummary } from '@/lib/audit';
import { db } from '@/lib/supabase';
import { ensureWorkspace } from '@/lib/workspace';
import { createTemplatePlan, TEMPLATES } from '@/plan/templates';

/** 专属链接：/new?t=<模板 ID>，在访问者自己的工作区里复制一份并跳到编辑器 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const t = url.searchParams.get('t') ?? '';
  if (!TEMPLATES.some((x) => x.id === t)) return NextResponse.redirect(new URL('/', url));
  const ws = await ensureWorkspace();
  const plan = createTemplatePlan(t);
  const { data, error } = await db()
    .from('plans')
    .insert({ workspace_id: ws, name: plan.meta.name, template_id: t, data: plan })
    .select('id')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  plan.id = data.id;
  await db().from('plans').update({ data: plan }).eq('id', data.id);
  await db().from('snapshots').insert({ plan_id: data.id, label: '户型图原样', auto: true, data: plan, audit: auditSummary(auditOf(plan)) });
  return NextResponse.redirect(new URL(`/plan/${data.id}`, url));
}
