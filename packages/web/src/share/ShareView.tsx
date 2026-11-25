'use client';

import { auditPlan, PITFALLS } from '@fitly/content';
import { createQuery, type Plan } from '@fitly/layout-engine';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import type { VoteRow } from '@/lib/types';
import { track } from '@/lib/track';
import { PitfallRow } from '@/pitfall/PitfallCard';
import { Button, cn, inputClass, Seg, SegButton, Tag } from '@/ui';
import { TopBar } from '@/ui/TopBar';
import type { ViewMode } from '@/scene/Scene';

const Scene = dynamic(() => import('@/scene/Scene'), { ssr: false, loading: () => <div className="absolute inset-0 flex items-center justify-center text-muted">正在加载 3D 方案…</div> });

interface Version { id: string; label: string; plan: Plan }

export default function ShareView({ code, title, versions, initialVotes }: { code: string; title: string; versions: Version[]; initialVotes: VoteRow[] }) {
  const [idx, setIdx] = useState(0);
  const [view, setView] = useState<ViewMode>('3d');
  const [votes, setVotes] = useState<VoteRow[]>(initialVotes);
  const [nickname, setNickname] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [voted, setVoted] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const v = versions[idx];
  const audit = useMemo(() => auditPlan(PITFALLS, v.plan, (s) => createQuery(v.plan, s)), [v.plan]);
  const letter = (i: number) => (versions.length > 1 ? String.fromCharCode(65 + i) : '');

  useEffect(() => {
    track('share_opened', { code });
    try {
      setNickname(localStorage.getItem('fitly:nickname') ?? '');
      setVoted(localStorage.getItem(`fitly:voted:${code}`));
    } catch {
      // 忽略
    }
  }, [code]);

  const submit = async () => {
    setBusy(true);
    const r = await fetch(`/api/shares/${code}/votes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ snapshotId: v.id, nickname, comment }),
    });
    setBusy(false);
    if (!r.ok) return;
    const row = (await r.json()) as VoteRow;
    setVotes((x) => [row, ...x]);
    setComment('');
    setVoted(v.id);
    try {
      localStorage.setItem('fitly:nickname', nickname);
      localStorage.setItem(`fitly:voted:${code}`, v.id);
    } catch {
      // 忽略
    }
  };

  const tally = (id: string) => votes.filter((x) => x.snapshot_id === id).length;

  return (
    <div className="no-callout flex min-h-dvh flex-col">
      <TopBar>
        <span className="text-lg font-extrabold tracking-wide">Fitly</span>
        <strong className="min-w-0 flex-1 truncate">{title}</strong>
        <Seg className="ml-auto">
          {(
            [
              ['3d', '3D'],
              ['eye', '平视'],
              ['top', '顶视'],
            ] as const
          ).map(([k, label]) => (
            <SegButton key={k} on={view === k} onClick={() => setView(k)}>
              {label}
            </SegButton>
          ))}
        </Seg>
      </TopBar>

      {versions.length > 1 && (
        <div className="flex gap-2 overflow-x-auto border-b border-line bg-panel px-3 py-2.5">
          {versions.map((x, i) => (
            <button
              key={x.id}
              className={cn(
                'flex items-center gap-1.5 whitespace-nowrap rounded-[10px] border px-3 py-1.5',
                i === idx ? 'border-ink bg-white ring-1 ring-ink' : 'border-line bg-field',
              )}
              onClick={() => setIdx(i)}
            >
              <strong>方案 {letter(i)}</strong> {x.label}
              <Tag>{tally(x.id)} 票</Tag>
            </button>
          ))}
        </div>
      )}

      <div className="relative h-[56dvh] min-h-80 overflow-hidden">
        <div className="absolute inset-0">
          <Scene key={v.id} plan={v.plan} view={view} readOnly />
        </div>
      </div>

      <section className="mx-auto grid w-full max-w-[1100px] grid-cols-1 gap-6 p-4 desk:grid-cols-[1.2fr_1fr]">
        <div>
          <h3 className="mb-2 mt-0 text-base font-semibold">
            {versions.length > 1 ? `方案 ${letter(idx)}：` : ''}
            {audit.totalCount === 0 ? '没有发现布局冲突' : `${audit.totalCount} 处布局问题`}
          </h3>
          {audit.conflicts.map((e) => {
            const k = `${e.pitfall.id}|${e.itemId}`;
            return <PitfallRow key={k} e={e} open={openKey === k} onToggle={() => setOpenKey(openKey === k ? null : k)} />;
          })}
        </div>

        <div className="flex flex-col gap-2 self-start rounded-[14px] bg-panel p-3.5 shadow-card">
          <h3 className="m-0 text-base font-semibold">{versions.length > 1 ? '你更喜欢哪一版？' : '说说你的看法'}</h3>
          <input className={inputClass} placeholder="你的称呼，比如：妈妈" value={nickname} maxLength={20} onChange={(e) => setNickname(e.target.value)} />
          <textarea
            className={cn(inputClass, 'min-h-16 resize-y')}
            placeholder="留一句话（可选），比如：沙发再小一号，过道太挤"
            value={comment}
            maxLength={140}
            onChange={(e) => setComment(e.target.value)}
          />
          <Button variant="primary" block disabled={busy} onClick={submit}>
            {versions.length > 1 ? `我选方案 ${letter(idx)}` : '提交'}
          </Button>
          {voted && <p className="text-xs text-muted">已收到，谢谢！可以切换方案再看看，也可以继续留言。</p>}
          <div className="mt-1.5 flex flex-col gap-2">
            {votes.map((x) => {
              const i = versions.findIndex((y) => y.id === x.snapshot_id);
              return (
                <div key={x.id} className="border-t border-line pt-2">
                  <strong>{x.nickname || '家人'}</strong>
                  {versions.length > 1 && <Tag className="ml-1.5">选了方案 {letter(i)}</Tag>}
                  {x.comment && <p className="mb-0 mt-0.5">{x.comment}</p>}
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
