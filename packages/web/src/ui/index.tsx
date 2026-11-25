'use client';

import { clsx, type ClassValue } from 'clsx';
import { useSyncExternalStore, type ButtonHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';

export const cn = (...v: ClassValue[]) => clsx(v);

// ---------- 按钮 ----------

type BtnVariant = 'default' | 'primary' | 'danger';

export function btnClass(variant: BtnVariant = 'default', block = false) {
  return cn(
    'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[9px] border px-3.5 no-underline',
    block ? 'h-10 w-full' : 'h-[34px]',
    variant === 'primary' && 'border-ink bg-ink text-white',
    variant === 'default' && 'border-line bg-panel',
    variant === 'danger' && 'border-line bg-panel text-danger',
  );
}

export function Button({
  variant = 'default',
  block,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; block?: boolean }) {
  return <button className={cn(btnClass(variant, block), className)} {...rest} />;
}

export function TextButton({ className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={cn('border-0 bg-transparent p-0 text-accent', className)} {...rest} />;
}

export function IconButton({ className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn('inline-flex size-8 items-center justify-center rounded-lg border border-line bg-panel text-lg leading-none', className)}
      {...rest}
    />
  );
}

export function Chip({ on, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { on?: boolean }) {
  return (
    <button
      className={cn(
        'shrink-0 rounded-full border px-3 py-1.5 text-[13px] desk:px-2.5 desk:py-1 desk:text-xs',
        on ? 'border-ink bg-ink text-white' : 'border-line bg-panel',
        className,
      )}
      {...rest}
    />
  );
}

// ---------- 标签与严重度 ----------

export type Tone = 'neutral' | 'ok' | 'blocking' | 'costly' | 'annoying' | 'added' | 'removed';

const TONE: Record<Tone, string> = {
  neutral: 'bg-soft-2 text-muted',
  ok: 'bg-ok-soft text-ok',
  blocking: 'bg-danger-soft text-danger',
  costly: 'bg-warn-soft text-warn-ink',
  annoying: 'bg-soft-2 text-muted',
  added: 'bg-ok-soft text-ok',
  removed: 'bg-danger-soft text-danger',
};

export function Tag({ tone = 'neutral', className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return <span className={cn('inline-block whitespace-nowrap rounded-full px-[7px] py-px text-[11px]', TONE[tone], className)}>{children}</span>;
}

export function SeverityDot({ s }: { s: 'blocking' | 'costly' | 'annoying' }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block size-[9px] flex-none rounded-full',
        s === 'blocking' && 'bg-danger shadow-[0_0_0_3px_rgba(229,72,59,0.18)]',
        s === 'costly' && 'bg-warn',
        s === 'annoying' && 'bg-calm',
      )}
    />
  );
}

// ---------- 悬浮工具条 ----------

export const floatPill = 'rounded-[10px] bg-white/92 shadow-float backdrop-blur-md';

export function Seg({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('inline-flex shrink-0 p-[3px]', floatPill, className)}>{children}</div>;
}

export function SegButton({ on, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { on?: boolean }) {
  return (
    <button
      className={cn('whitespace-nowrap rounded-[7px] border-0 px-2 py-[5px] text-[13px] desk:px-2.5', on ? 'bg-ink text-white' : 'bg-transparent', className)}
      {...rest}
    />
  );
}

export function PillSelect({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className={cn('inline-flex min-w-0 items-center p-[3px]', floatPill, className)}>
      <select className="w-full min-w-0 rounded-[7px] border-0 bg-soft px-1.5 py-1 text-[13px]" {...rest}>
        {children}
      </select>
    </label>
  );
}

// ---------- 弹层 ----------

/** 全屏遮罩：手机从底部升起，电脑居中 */
export function Overlay({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(30,25,20,0.35)] desk:items-center" onClick={onClose}>
      <div className="w-full max-w-[560px]" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function Sheet({ title, onClose, footer, children, className }: { title: ReactNode; onClose: () => void; footer?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex max-h-[82dvh] flex-col rounded-t-2xl bg-panel desk:rounded-2xl', className)}>
      <SheetHead title={title} onClose={onClose} />
      <div className="overflow-y-auto px-3.5 pb-3.5 pt-2">{children}</div>
      {footer && <div className="flex gap-2 border-t border-line px-3.5 py-2.5 *:flex-1">{footer}</div>}
    </div>
  );
}

export function SheetHead({ title, onClose, className }: { title: ReactNode; onClose: () => void; className?: string }) {
  return (
    <div className={cn('flex items-center justify-between border-b border-line px-3.5 py-3', className)}>
      <strong>{title}</strong>
      <IconButton onClick={onClose} aria-label="关闭">
        ×
      </IconButton>
    </div>
  );
}

// ---------- 表单 ----------

export const inputClass = 'min-w-0 flex-1 rounded-lg border border-line bg-field px-2.5 py-[7px] text-base desk:text-sm';

export function FieldLabel({ children }: { children: ReactNode }) {
  return <span className="text-xs text-muted">{children}</span>;
}

/** 3D 场景里的尺寸标签（drei Html 内使用） */
export function dimLabelClass(alert?: boolean) {
  return cn(
    'whitespace-nowrap rounded-md border px-[5px] py-px font-semibold',
    alert ? 'border-danger bg-danger text-xs text-white' : 'border-accent-line bg-white text-[11px] text-accent',
  );
}

const DESK_QUERY = '(min-width: 900px)';

/** 是否电脑宽度（与 desk: 断点一致）；服务端渲染时按手机处理 */
export function useIsDesk(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(DESK_QUERY);
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    () => window.matchMedia(DESK_QUERY).matches,
    () => false,
  );
}
