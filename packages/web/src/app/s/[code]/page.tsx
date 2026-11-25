import type { Plan } from '@fitly/layout-engine';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { auditOf } from '@/lib/audit';
import { db } from '@/lib/supabase';
import type { VoteRow } from '@/lib/types';
import ShareView from '@/share/ShareView';

export const dynamic = 'force-dynamic';

const load = cache(async (code: string) => {
  const share = await db().from('shares').select('*').eq('code', code).maybeSingle();
  if (!share.data) return null;
  const ids: string[] = share.data.snapshot_ids;
  const [snaps, votes] = await Promise.all([
    db().from('snapshots').select('id, label, data').in('id', ids),
    db().from('votes').select('*').eq('share_code', code).order('created_at', { ascending: false }).limit(200),
  ]);
  const versions = ids
    .map((id) => snaps.data?.find((s) => s.id === id))
    .filter(Boolean)
    .map((s) => ({ id: s!.id as string, label: s!.label as string, plan: s!.data as Plan }));
  return { title: share.data.title as string, versions, votes: (votes.data ?? []) as VoteRow[] };
});

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  const d = await load(code);
  if (!d) return { title: 'Fitly' };
  const parts = d.versions.map((v, i) => {
    const a = auditOf(v.plan);
    const name = d.versions.length > 1 ? `方案${String.fromCharCode(65 + i)}「${v.label}」` : `「${v.label}」`;
    return `${name}${a.totalCount ? `${a.totalCount} 处布局问题` : '无布局冲突'}`;
  });
  const title = d.versions.length > 1 ? `帮我选一版：${d.title}` : `看看我家的布局：${d.title}`;
  const description = `${parts.join('；')}。点开可 3D 查看，不用登录就能投票。`;
  return { title, description, openGraph: { title, description } };
}

export default async function SharePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const d = await load(code);
  if (!d || d.versions.length === 0) notFound();
  return <ShareView code={code} title={d.title} versions={d.versions} initialVotes={d.votes} />;
}
