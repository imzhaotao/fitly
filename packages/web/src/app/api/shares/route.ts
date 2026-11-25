import { NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { readWorkspace } from '@/lib/workspace';

const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
function code(len = 8) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

/** 为一版或两版快照生成只读短链 */
export async function POST(req: Request) {
  const ws = await readWorkspace();
  const { planId, snapshotIds, title } = (await req.json()) as { planId: string; snapshotIds: string[]; title?: string };
  if (!planId || !Array.isArray(snapshotIds) || snapshotIds.length < 1 || snapshotIds.length > 2) {
    return NextResponse.json({ error: '需要 1–2 个版本' }, { status: 400 });
  }
  const plan = await db().from('plans').select('id, name').eq('id', planId).eq('workspace_id', ws ?? '').maybeSingle();
  if (!plan.data) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const snaps = await db().from('snapshots').select('id').eq('plan_id', planId).in('id', snapshotIds);
  if ((snaps.data?.length ?? 0) !== snapshotIds.length) return NextResponse.json({ error: '版本不存在' }, { status: 400 });
  const c = code();
  const { error } = await db()
    .from('shares')
    .insert({ code: c, plan_id: planId, snapshot_ids: snapshotIds, title: (title ?? '').trim() || plan.data.name });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await db().from('events').insert({ workspace_id: ws, name: 'plan_shared', props: { code: c, versions: snapshotIds.length } });
  return NextResponse.json({ code: c });
}
