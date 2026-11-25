import type { Plan } from '@fitly/layout-engine';
import { notFound } from 'next/navigation';
import Editor from '@/editor/Editor';
import { db } from '@/lib/supabase';
import { readWorkspace } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [{ data }, ws] = await Promise.all([db().from('plans').select('id, workspace_id, data').eq('id', id).maybeSingle(), readWorkspace()]);
  if (!data) notFound();
  return <Editor planId={data.id} initialPlan={data.data as Plan} canEdit={!!ws && ws === data.workspace_id} />;
}
