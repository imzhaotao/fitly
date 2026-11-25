'use client';

import type { Plan } from '@fitly/layout-engine';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { SnapshotMeta } from '@/lib/types';
import { track } from '@/lib/track';
import { btnClass, Button, cn, inputClass, Sheet, Tag, TextButton } from '@/ui';

function fmt(t: string) {
  const d = new Date(t);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function AuditBadges({ a }: { a: SnapshotMeta['audit'] }) {
  if (!a) return null;
  if (a.total === 0) return <Tag tone="ok">无冲突</Tag>;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {a.blocking > 0 && <Tag tone="blocking">{a.blocking} 必须处理</Tag>}
      {a.costly > 0 && <Tag tone="costly">{a.costly} 多花钱</Tag>}
      {a.annoying > 0 && <Tag tone="annoying">{a.annoying} 别扭</Tag>}
    </span>
  );
}

export function Versions({
  planId,
  getPlan,
  canEdit,
  onRestore,
  onClose,
  refreshKey,
}: {
  planId: string;
  getPlan: () => Plan;
  canEdit: boolean;
  onRestore: (id: string) => void;
  onClose: () => void;
  refreshKey: number;
}) {
  const [list, setList] = useState<SnapshotMeta[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/plans/${planId}/snapshots`);
    const j = await r.json();
    setList(j.snapshots ?? []);
  }, [planId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const save = async () => {
    setBusy(true);
    setErr(null);
    const r = await fetch(`/api/plans/${planId}/snapshots`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ plan: getPlan(), label: label || undefined }),
    });
    setBusy(false);
    if (!r.ok) return setErr('保存失败，请稍后再试');
    const snap = (await r.json()) as SnapshotMeta;
    track('snapshot_saved', { planId });
    setLabel('');
    setList((l) => [snap, ...(l ?? [])]);
    setPicked((p) => [snap.id, ...p].slice(0, 2));
  };

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id].slice(-2)));

  const share = async () => {
    setBusy(true);
    setErr(null);
    const r = await fetch('/api/shares', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ planId, snapshotIds: picked }),
    });
    setBusy(false);
    if (!r.ok) return setErr('生成分享链接失败');
    const { code } = await r.json();
    setShareUrl(`${location.origin}/s/${code}`);
  };

  return (
    <Sheet
      title="版本与分享"
      onClose={onClose}
      footer={
        <>
          {picked.length === 2 ? (
            <Link className={btnClass()} href={`/plan/${planId}/compare?a=${picked[1]}&b=${picked[0]}`}>
              对比这两版
            </Link>
          ) : (
            <Button disabled>对比（选 2 版）</Button>
          )}
          <Button variant="primary" disabled={!canEdit || picked.length === 0 || busy} onClick={share}>
            {picked.length === 2 ? '发给家人投票' : '生成分享链接'}
          </Button>
        </>
      }
    >
      {canEdit && (
        <div className="my-2 flex gap-2">
          <input className={inputClass} placeholder="给这一版起个名，比如“2.8 米沙发”" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={30} />
          <Button variant="primary" disabled={busy} onClick={save}>
            保存当前版
          </Button>
        </div>
      )}
      <p className="text-xs text-muted">勾选 1 版可分享给家人看；勾选 2 版可以对比，或发给家人投票选哪一版。</p>
      {list == null && <p className="text-muted">加载中…</p>}
      {list?.map((s) => (
        <label key={s.id} className={cn('flex cursor-pointer items-center gap-2.5 rounded-[10px] px-2 py-2.5', picked.includes(s.id) && 'bg-soft')}>
          <input type="checkbox" checked={picked.includes(s.id)} onChange={() => toggle(s.id)} />
          <div className="min-w-0 flex-1">
            <div>
              <strong>{s.label}</strong>
              {s.auto && <Tag className="ml-1.5">自动</Tag>}
            </div>
            <div className="text-xs text-muted">{fmt(s.created_at)}</div>
          </div>
          <AuditBadges a={s.audit} />
          {canEdit && (
            <TextButton
              onClick={(e) => {
                e.preventDefault();
                onRestore(s.id);
              }}
            >
              恢复
            </TextButton>
          )}
        </label>
      ))}
      {err && <p className="text-danger">{err}</p>}
      {shareUrl && (
        <div className="mt-3 flex flex-col gap-1.5">
          <span className="text-xs text-muted">复制链接发到家庭群，家人不用登录就能看、能投票：</span>
          <div className="flex gap-1.5">
            <input className={inputClass} readOnly value={shareUrl} onFocus={(e) => e.target.select()} />
            <Button onClick={() => navigator.clipboard?.writeText(shareUrl)}>复制</Button>
            <a className={btnClass()} href={shareUrl} target="_blank" rel="noreferrer">
              打开
            </a>
          </div>
        </div>
      )}
    </Sheet>
  );
}
