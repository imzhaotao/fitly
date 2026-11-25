'use client';

import { auditPlan, diffAudits, PITFALLS } from '@fitly/content';
import { createQuery, type Plan } from '@fitly/layout-engine';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { track } from '@/lib/track';
import { SeverityDot } from '@/pitfall/PitfallCard';
import type { ViewMode } from '@/scene/Scene';
import { cn, Seg, SegButton, Tag } from '@/ui';
import { TopBar } from '@/ui/TopBar';
import { diffFurniture, shapeText } from './diff';

const Scene = dynamic(() => import('@/scene/Scene'), { ssr: false, loading: () => <div className="absolute inset-0 flex items-center justify-center text-muted">加载中…</div> });

interface Version { id: string; label: string; plan: Plan }

export default function Compare({ planId, a, b }: { planId: string; a: Version; b: Version }) {
  const [mode, setMode] = useState<'split' | 'overlay'>('split');
  const [view, setView] = useState<ViewMode>('top');
  const auditA = useMemo(() => auditPlan(PITFALLS, a.plan, (s) => createQuery(a.plan, s)), [a.plan]);
  const auditB = useMemo(() => auditPlan(PITFALLS, b.plan, (s) => createQuery(b.plan, s)), [b.plan]);
  const d = useMemo(() => diffAudits(auditA, auditB), [auditA, auditB]);
  const changes = useMemo(() => diffFurniture(a.plan, b.plan), [a.plan, b.plan]);

  useEffect(() => track('snapshot_compared', { planId }), [planId]);

  const pf = (e: (typeof d.onlyA)[number], k: string, strike?: boolean) => (
    <p key={`${k}-${e.pitfall.id}-${e.itemId}`} className="my-1.5 flex items-center gap-2">
      <SeverityDot s={e.pitfall.severity} /> {strike ? <s>{e.title}</s> : e.title}
    </p>
  );
  const rows: [string, number, number][] = [
    ['必须处理', auditA.blockingCount, auditB.blockingCount],
    ['可能多花钱', auditA.costlyCount, auditB.costlyCount],
    ['有点别扭', auditA.annoyingCount, auditB.annoyingCount],
  ];
  const paneLabel = 'absolute left-2 top-2 z-[2] rounded-full bg-white/95 px-2.5 py-[3px] text-xs font-semibold';

  return (
    <div className="no-callout flex min-h-dvh flex-col">
      <TopBar>
        <Link href={`/plan/${planId}`} className="text-accent no-underline">
          ‹ 回到编辑
        </Link>
        <strong className="min-w-0 flex-1 truncate">
          {a.label} <span className="text-muted">vs</span> {b.label}
        </strong>
        <div className="ml-auto flex items-center gap-1.5">
          <Seg>
            <SegButton on={mode === 'split'} onClick={() => setMode('split')}>
              分屏
            </SegButton>
            <SegButton on={mode === 'overlay'} onClick={() => setMode('overlay')}>
              叠加
            </SegButton>
          </Seg>
          <Seg>
            <SegButton on={view === 'top'} onClick={() => setView('top')}>
              顶视
            </SegButton>
            <SegButton on={view === '3d'} onClick={() => setView('3d')}>
              3D
            </SegButton>
          </Seg>
        </div>
      </TopBar>

      <div
        className={cn(
          'grid gap-px bg-line',
          mode === 'split' ? 'h-[80dvh] grid-rows-2 desk:h-[58dvh] desk:grid-cols-2 desk:grid-rows-1' : 'h-[60dvh] desk:h-[58dvh]',
          'min-h-80',
        )}
      >
        {mode === 'split' ? (
          <>
            <div className="relative min-h-0 overflow-hidden bg-bg">
              <div className={paneLabel}>
                A · {a.label} · {auditA.totalCount} 处问题
              </div>
              <div className="absolute inset-0">
                <Scene plan={a.plan} view={view} readOnly />
              </div>
            </div>
            <div className="relative min-h-0 overflow-hidden bg-bg">
              <div className={paneLabel}>
                B · {b.label} · {auditB.totalCount} 处问题
              </div>
              <div className="absolute inset-0">
                <Scene plan={b.plan} view={view} readOnly />
              </div>
            </div>
          </>
        ) : (
          <div className="relative min-h-0 overflow-hidden bg-bg">
            <div className={paneLabel}>
              实体为 B · {b.label}，半透明为 A · {a.label}
            </div>
            <div className="absolute inset-0">
              <Scene plan={b.plan} ghost={a.plan} view={view} readOnly />
            </div>
          </div>
        )}
      </div>

      <section className="mx-auto grid w-full max-w-[1100px] grid-cols-1 gap-6 p-4 desk:grid-cols-2">
        <div>
          <h3 className="mb-2 mt-0 text-[15px] font-semibold">布局问题</h3>
          <table className="w-full max-w-80 border-collapse">
            <thead>
              <tr className="text-left">
                <th />
                <th className="px-2 py-1">A</th>
                <th className="px-2 py-1">B</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([k, x, y]) => (
                <tr key={k} className="border-b border-line">
                  <td className="px-2 py-1">{k}</td>
                  <td className="px-2 py-1">{x}</td>
                  <td className="px-2 py-1">{y}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {d.onlyA.length > 0 && <h4 className="mb-1 mt-3.5 text-[13px] text-muted">B 解决了</h4>}
          {d.onlyA.map((e) => pf(e, 'a', true))}
          {d.onlyB.length > 0 && <h4 className="mb-1 mt-3.5 text-[13px] text-muted">B 新出现</h4>}
          {d.onlyB.map((e) => pf(e, 'b'))}
          {d.both.length > 0 && <h4 className="mb-1 mt-3.5 text-[13px] text-muted">两版都有</h4>}
          {d.both.map((e) => pf(e, 'c'))}
        </div>
        <div>
          <h3 className="mb-2 mt-0 text-[15px] font-semibold">改了什么（A → B）</h3>
          <p className="text-xs text-muted">
            A：{shapeText(a.plan)}；B：{shapeText(b.plan)}
          </p>
          {changes.length === 0 && <p className="text-muted">家具没有变化。</p>}
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {changes.map((c, i) => (
              <li key={`${c.id}-${c.kind}-${i}`}>
                <Tag tone={c.kind === 'added' ? 'added' : c.kind === 'removed' ? 'removed' : 'neutral'}>{c.label}</Tag> {c.text}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
