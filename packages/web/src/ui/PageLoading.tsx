/** 路由切换时立即显示的加载状态（服务端还在查数据时，避免页面“没反应”） */
export function PageLoading({ text }: { text: string }) {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-bg text-muted" role="status" aria-live="polite">
      <span className="size-8 animate-spin rounded-full border-[3px] border-line border-t-ink" />
      <span className="text-sm">{text}</span>
    </div>
  );
}
