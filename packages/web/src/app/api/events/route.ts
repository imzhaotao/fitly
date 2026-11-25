import { NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { readWorkspace } from '@/lib/workspace';

const ALLOWED = new Set([
  'plan_entered', 'item_added', 'item_moved', 'view_switched', 'stage_switched', 'pitfall_shown',
  'pitfall_dismissed', 'pitfall_acted', 'note_added', 'snapshot_saved', 'snapshot_compared', 'share_opened', 'shape_edited',
]);

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { name?: string; props?: Record<string, unknown> } | null;
  if (!body?.name || !ALLOWED.has(body.name)) return NextResponse.json({ ok: false }, { status: 400 });
  const ws = await readWorkspace();
  await db().from('events').insert({ workspace_id: ws ?? null, name: body.name, props: body.props ?? null });
  return NextResponse.json({ ok: true });
}
