import { NextResponse } from 'next/server';
import type { Plan } from '@fitly/layout-engine';
import { db } from '@/lib/supabase';
import { readWorkspace } from '@/lib/workspace';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const { data, error } = await db().from('plans').select('*').eq('id', id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(data);
}

/** 自动保存当前方案（仅本工作区可写） */
export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  const ws = await readWorkspace();
  const body = (await req.json()) as { plan: Plan };
  if (!body?.plan?.rooms) return NextResponse.json({ error: 'bad plan' }, { status: 400 });
  const { data, error } = await db()
    .from('plans')
    .update({ data: body.plan, name: body.plan.meta.name, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('workspace_id', ws ?? '')
    .select('id, updated_at');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  return NextResponse.json(data[0]);
}
