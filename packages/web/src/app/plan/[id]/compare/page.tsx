import type { Plan } from '@fitly/layout-engine';
import { notFound } from 'next/navigation';
import Compare from '@/compare/Compare';
import { db } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export default async function ComparePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const { id } = await params;
  const { a, b } = await searchParams;
  if (!a || !b) notFound();
  const { data } = await db().from('snapshots').select('id, label, data').eq('plan_id', id).in('id', [a, b]);
  const va = data?.find((x) => x.id === a);
  const vb = data?.find((x) => x.id === b);
  if (!va || !vb) notFound();
  return (
    <Compare
      planId={id}
      a={{ id: va.id, label: va.label, plan: va.data as Plan }}
      b={{ id: vb.id, label: vb.label, plan: vb.data as Plan }}
    />
  );
}
