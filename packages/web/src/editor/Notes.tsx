'use client';

import type { Plan, PlanNote } from '@fitly/layout-engine';
import { PITFALLS } from '@fitly/content';
import { useState } from 'react';
import { ANCHOR_LABEL, labelOf } from '@/plan/catalog';
import { Button, cn, inputClass, Sheet, Tag, TextButton } from '@/ui';

export type NoteLink = { itemId?: string; anchorId?: string };

function fmt(t: number) {
  const d = new Date(t);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 笔记关联对象的名字：家具 / 点位 / 提醒 */
export function linkLabel(plan: Plan, n: PlanNote): string | null {
  if (n.itemId) {
    const it = plan.furniture.find((f) => f.id === n.itemId);
    if (it) return labelOf(it);
  }
  if (n.anchorId) {
    const a = plan.anchors.find((x) => x.id === n.anchorId);
    if (a) return `${ANCHOR_LABEL[a.kind] ?? a.kind}点位`;
  }
  return null;
}

function pitfallTitle(id?: string) {
  if (!id) return null;
  return PITFALLS.find((p) => p.id === id)?.title.replace(/\{\{(mm|cm)\}\}/g, '…') ?? null;
}

function NoteRow({ n, plan, onToggle, onRemove, onPick }: { n: PlanNote; plan: Plan; onToggle: () => void; onRemove: () => void; onPick?: () => void }) {
  const link = linkLabel(plan, n);
  const pit = pitfallTitle(n.pitfallId);
  return (
    <div className="flex items-start gap-2.5 border-b border-line py-2.5">
      {n.pitfallId ? (
        <span className="mt-0.5 text-ok" aria-label="核对记录">
          ✓
        </span>
      ) : (
        <input type="checkbox" className="mt-1" checked={!!n.done} onChange={onToggle} aria-label="标为已办" />
      )}
      <div className="min-w-0 flex-1">
        <p className={cn('m-0 whitespace-pre-wrap break-words', n.done && !n.pitfallId && 'text-muted line-through')}>{n.text}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
          <span>{fmt(n.createdAt)}</span>
          {pit && (
            <Tag tone="ok" className="max-w-full truncate">
              核对：{pit}
            </Tag>
          )}
          {link &&
            (onPick ? (
              <TextButton className="text-xs" onClick={onPick}>
                {link} ›
              </TextButton>
            ) : (
              <Tag>{link}</Tag>
            ))}
        </div>
      </div>
      <TextButton className="text-xs text-muted" onClick={onRemove}>
        删除
      </TextButton>
    </div>
  );
}

function AddNote({ placeholder, linkName, onAdd }: { placeholder: string; linkName?: string | null; onAdd: (text: string, linked: boolean) => void }) {
  const [text, setText] = useState('');
  const [linked, setLinked] = useState(true);
  const submit = () => {
    if (!text.trim()) return;
    onAdd(text.trim(), linked && !!linkName);
    setText('');
  };
  return (
    <div className="flex flex-col gap-1.5">
      <textarea
        className={cn(inputClass, 'min-h-16 resize-none')}
        placeholder={placeholder}
        value={text}
        maxLength={500}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
        }}
      />
      <div className="flex items-center gap-2">
        {linkName && (
          <label className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-muted">
            <input type="checkbox" checked={linked} onChange={(e) => setLinked(e.target.checked)} />
            <span className="truncate">关联到：{linkName}</span>
          </label>
        )}
        <Button variant="primary" className="ml-auto" disabled={!text.trim()} onClick={submit}>
          记下来
        </Button>
      </div>
    </div>
  );
}

export function NotesSheet({
  plan,
  current,
  onAdd,
  onUpdate,
  onRemove,
  onPick,
  onClose,
}: {
  plan: Plan;
  /** 当前选中的家具 / 点位，新笔记默认关联它 */
  current: NoteLink & { name?: string | null };
  onAdd: (text: string, link: NoteLink) => void;
  onUpdate: (id: string, patch: Partial<PlanNote>) => void;
  onRemove: (id: string) => void;
  onPick: (link: NoteLink) => void;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState<'todo' | 'all'>('all');
  const isTodo = (n: PlanNote) => !n.done && !n.pitfallId;
  const notes = (plan.notes ?? []).filter((n) => filter === 'all' || isTodo(n));
  const todo = (plan.notes ?? []).filter(isTodo).length;
  return (
    <Sheet title={`笔记${todo ? ` · ${todo} 条未办` : ''}`} onClose={onClose}>
      <div className="mb-3 mt-1">
        <AddNote
          placeholder="随手记：要问师傅的事、量过的尺寸、看中的款式…"
          linkName={current.name}
          onAdd={(text, linked) => onAdd(text, linked ? { itemId: current.itemId, anchorId: current.anchorId } : {})}
        />
      </div>
      <div className="mb-1 flex gap-3 text-[13px]">
        <TextButton className={cn(filter === 'all' ? 'font-semibold text-ink' : 'text-muted')} onClick={() => setFilter('all')}>
          全部
        </TextButton>
        <TextButton className={cn(filter === 'todo' ? 'font-semibold text-ink' : 'text-muted')} onClick={() => setFilter('todo')}>
          未办
        </TextButton>
      </div>
      {notes.length === 0 && <p className="text-muted">还没有笔记。点提醒上的“已核对”时记的结果也会出现在这里。</p>}
      {notes.map((n) => (
        <NoteRow
          key={n.id}
          n={n}
          plan={plan}
          onToggle={() => onUpdate(n.id, { done: !n.done })}
          onRemove={() => onRemove(n.id)}
          onPick={n.itemId || n.anchorId ? () => onPick({ itemId: n.itemId, anchorId: n.anchorId }) : undefined}
        />
      ))}
    </Sheet>
  );
}

/** 属性面板里：和这件家具 / 这个点位有关的笔记 */
export function LinkedNotes({
  plan,
  link,
  onAdd,
  onUpdate,
  onRemove,
}: {
  plan: Plan;
  link: NoteLink;
  onAdd: (text: string, link: NoteLink) => void;
  onUpdate: (id: string, patch: Partial<PlanNote>) => void;
  onRemove: (id: string) => void;
}) {
  const notes = (plan.notes ?? []).filter((n) => (link.itemId && n.itemId === link.itemId) || (link.anchorId && n.anchorId === link.anchorId));
  return (
    <div className="flex flex-col gap-1.5 px-3.5 pb-3.5">
      <span className="text-xs text-muted">笔记{notes.length ? `（${notes.length}）` : ''}</span>
      {notes.map((n) => (
        <NoteRow key={n.id} n={n} plan={plan} onToggle={() => onUpdate(n.id, { done: !n.done })} onRemove={() => onRemove(n.id)} />
      ))}
      <AddNote placeholder="给它记一句，比如：商家说这款可以分段入户" onAdd={(text) => onAdd(text, link)} />
    </div>
  );
}
