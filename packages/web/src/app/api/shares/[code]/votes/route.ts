import { NextResponse } from 'next/server';
import { db } from '@/lib/supabase';

type Ctx = { params: Promise<{ code: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { code } = await params;
  const { data, error } = await db()
    .from('votes')
    .select('id, snapshot_id, nickname, comment, created_at')
    .eq('share_code', code)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ votes: data });
}

/** 家人免登录投票 + 一句话批注 */
export async function POST(req: Request, { params }: Ctx) {
  const { code } = await params;
  const { snapshotId, nickname, comment } = (await req.json()) as { snapshotId: string; nickname?: string; comment?: string };
  const share = await db().from('shares').select('snapshot_ids').eq('code', code).maybeSingle();
  if (!share.data || !share.data.snapshot_ids.includes(snapshotId)) {
    return NextResponse.json({ error: '版本不存在' }, { status: 400 });
  }
  const { data, error } = await db()
    .from('votes')
    .insert({
      share_code: code,
      snapshot_id: snapshotId,
      nickname: (nickname ?? '').trim().slice(0, 20) || null,
      comment: (comment ?? '').trim().slice(0, 140) || null,
    })
    .select('id, snapshot_id, nickname, comment, created_at')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await db().from('events').insert({ name: 'vote_submitted', props: { code } });
  return NextResponse.json(data);
}
