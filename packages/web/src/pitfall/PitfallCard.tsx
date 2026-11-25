'use client';

import { ENGINEERING_DISCLAIMER, type EvaluatedPitfall, type Severity } from '@fitly/content';
import { useState } from 'react';
import { Button, cn, IconButton, inputClass, SeverityDot, Sheet, Tag, TextButton, useIsDesk } from '@/ui';

export { SeverityDot };

export const pitfallKey = (e: EvaluatedPitfall) => `${e.pitfall.id}|${e.itemId ?? e.roomId ?? ''}`;

export const SEVERITY_LABEL: Record<Severity, string> = { blocking: '必须处理', costly: '可能多花钱', annoying: '有点别扭' };

function LayerTag({ e, short }: { e: EvaluatedPitfall; short?: boolean }) {
  const text = e.layer === 'L2' ? (short ? '实测' : '按你家尺寸算出') : '待核对';
  return <span className="ml-2 inline-block rounded-full bg-soft px-1.5 align-[2px] text-[11px] font-normal text-muted">{text}</span>;
}

export function PitfallDetail({ e, onCopy }: { e: EvaluatedPitfall; onCopy?: () => void }) {
  const [copied, setCopied] = useState(false);
  const p = e.pitfall;
  const copy = async () => {
    const text = [e.title, ...(p.ask ?? []).map((q) => `· ${q}`)].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      onCopy?.();
    } catch {
      // 剪贴板不可用时忽略
    }
  };
  return (
    <div className="space-y-1 pl-[17px] pt-1.5">
      <p className="text-muted">{p.why}</p>
      {p.fix && <p className="font-medium">{p.fix}</p>}
      {p.engineering && <p className="text-xs text-muted">{ENGINEERING_DISCLAIMER}</p>}
      {p.ask && p.ask.length > 0 && (
        <div className="mt-2 rounded-[10px] bg-ask px-2.5 py-2">
          <div className="flex justify-between text-xs text-muted">
            <span>可以这样问师傅 / 商家</span>
            <TextButton onClick={copy}>{copied ? '已复制' : '复制问题'}</TextButton>
          </div>
          <ul className="mt-1 list-disc pl-[18px]">
            {p.ask.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** 标记“已核对”，可顺手记一句核对结果 */
function CheckForm({ onDone, onCancel }: { onDone: (note?: string) => void; onCancel: () => void }) {
  const [text, setText] = useState('');
  return (
    <div className="mt-2 flex flex-col gap-1.5 pl-[17px]">
      <textarea
        autoFocus
        className={cn(inputClass, 'min-h-14 resize-none')}
        placeholder="记一句核对结果（可选），比如：问了电工，插座提到桌面以上"
        value={text}
        maxLength={200}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex gap-2">
        <Button variant="primary" className="flex-1" onClick={() => onDone(text.trim() || undefined)}>
          {text.trim() ? '保存并标为已核对' : '标为已核对'}
        </Button>
        <Button onClick={onCancel}>取消</Button>
      </div>
    </div>
  );
}

export interface CheckInfo {
  at: number;
  note?: string;
}

const BORDER: Record<Severity, string> = { blocking: 'border-l-danger', costly: 'border-l-warn', annoying: 'border-l-calm' };

export function PitfallCard({
  top,
  restCount,
  onDismiss,
  onOpenList,
  onCopy,
  onCheck,
}: {
  top: EvaluatedPitfall;
  restCount: number;
  onDismiss: () => void;
  onOpenList: () => void;
  onCopy: () => void;
  onCheck: (note?: string) => void;
}) {
  const isDesk = useIsDesk();
  const [open, setOpen] = useState(top.pitfall.severity === 'blocking');
  const [checking, setChecking] = useState(false);
  // 手机：默认收成一行，点开再看详情，避免挡住 3D 操作区
  const [expanded, setExpanded] = useState(false);
  if (!isDesk && !expanded) {
    return (
      <div
        role="status"
        className={cn('flex w-full items-center gap-2 rounded-xl border-l-4 bg-panel py-1.5 pl-2.5 pr-1.5 shadow-card', BORDER[top.pitfall.severity])}
      >
        <SeverityDot s={top.pitfall.severity} />
        <button className="min-w-0 flex-1 truncate border-0 bg-transparent p-0 text-left text-[13px] font-semibold" onClick={() => setExpanded(true)}>
          {top.title}
        </button>
        {restCount > 0 && (
          <TextButton className="shrink-0 text-xs" onClick={onOpenList}>
            +{restCount}
          </TextButton>
        )}
        <IconButton className="size-7 shrink-0 text-base" aria-label="先收起，下次点选时再提醒" onClick={onDismiss}>
          ×
        </IconButton>
      </div>
    );
  }
  return (
    <div
      role="status"
      className={cn(
        'max-h-[45dvh] w-full max-w-[560px] overflow-y-auto rounded-[14px] border-l-4 bg-panel px-3 py-2.5 shadow-card desk:max-h-[42dvh] desk:px-3.5 desk:py-3',
        BORDER[top.pitfall.severity],
      )}
    >
      <div className="flex items-start gap-2">
        <span className="mt-[7px]">
          <SeverityDot s={top.pitfall.severity} />
        </span>
        <button
          className="flex-1 border-0 bg-transparent p-0 text-left text-sm font-semibold desk:text-[15px]"
          onClick={() => (isDesk ? setOpen((v) => !v) : setExpanded(false))}
        >
          {top.title}
          <LayerTag e={top} />
        </button>
        <IconButton aria-label="先收起，下次点选时再提醒" title="先收起，下次点选时再提醒" onClick={onDismiss}>
          ×
        </IconButton>
      </div>
      {(open || !isDesk) && <PitfallDetail e={top} onCopy={onCopy} />}
      {checking ? (
        <CheckForm onDone={onCheck} onCancel={() => setChecking(false)} />
      ) : (
        <div className="mt-1.5 flex items-center gap-3 pl-[17px]">
          {isDesk && !open && <TextButton onClick={() => setOpen(true)}>展开怎么办</TextButton>}
          {!isDesk && <TextButton onClick={() => setExpanded(false)}>收起</TextButton>}
          <TextButton onClick={() => setChecking(true)}>✓ 已核对</TextButton>
          {restCount > 0 && (
            <TextButton className="ml-auto" onClick={onOpenList}>
              还有 {restCount} 条 ›
            </TextButton>
          )}
        </div>
      )}
    </div>
  );
}

export function PitfallRow({
  e,
  open,
  onToggle,
  checked,
  onCheck,
  onUncheck,
}: {
  e: EvaluatedPitfall;
  open: boolean;
  onToggle: () => void;
  checked?: CheckInfo;
  onCheck?: (note?: string) => void;
  onUncheck?: () => void;
}) {
  const [checking, setChecking] = useState(false);
  return (
    <div className="border-b border-line py-2">
      <button className="flex w-full items-center gap-2 border-0 bg-transparent p-0 text-left" onClick={onToggle}>
        <SeverityDot s={e.pitfall.severity} />
        <span className={cn('flex-1', checked && 'text-muted')}>{e.title}</span>
        {checked ? <Tag tone="ok">✓ 已核对</Tag> : <LayerTag e={e} short />}
      </button>
      {checked?.note && <p className="mb-0 mt-1 pl-[17px] text-[13px]">📝 {checked.note}</p>}
      {open && <PitfallDetail e={e} />}
      {open && (onCheck || onUncheck) && !checking && (
        <div className="mt-1.5 pl-[17px]">
          {checked ? (
            <TextButton onClick={onUncheck}>撤销已核对</TextButton>
          ) : (
            <TextButton onClick={() => setChecking(true)}>✓ 标为已核对</TextButton>
          )}
        </div>
      )}
      {checking && onCheck && (
        <CheckForm
          onDone={(note) => {
            setChecking(false);
            onCheck(note);
          }}
          onCancel={() => setChecking(false)}
        />
      )}
    </div>
  );
}

export function PitfallList({
  title,
  items,
  onPick,
  onClose,
  empty,
  checkOf,
  onCheck,
  onUncheck,
}: {
  title: string;
  items: EvaluatedPitfall[];
  onPick?: (e: EvaluatedPitfall) => void;
  onClose: () => void;
  empty: string;
  checkOf?: (key: string) => CheckInfo | undefined;
  onCheck?: (e: EvaluatedPitfall, note?: string) => void;
  onUncheck?: (e: EvaluatedPitfall) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  // 未核对的排在前面
  const sorted = [...items].sort((a, b) => Number(!!checkOf?.(pitfallKey(a))) - Number(!!checkOf?.(pitfallKey(b))));
  return (
    <Sheet title={title} onClose={onClose}>
      {items.length === 0 && <p className="text-muted">{empty}</p>}
      {sorted.map((e) => {
        const key = pitfallKey(e);
        return (
          <PitfallRow
            key={key}
            e={e}
            checked={checkOf?.(key)}
            onCheck={onCheck ? (note) => onCheck(e, note) : undefined}
            onUncheck={onUncheck ? () => onUncheck(e) : undefined}
            open={openId === key}
            onToggle={() => {
              setOpenId(openId === key ? null : key);
              onPick?.(e);
            }}
          />
        );
      })}
    </Sheet>
  );
}
