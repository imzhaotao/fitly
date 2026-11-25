/** 浏览器端埋点：fire-and-forget，不阻塞交互 */
export function track(name: string, props?: Record<string, unknown>) {
  try {
    const body = JSON.stringify({ name, props });
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon('/api/events', new Blob([body], { type: 'application/json' }));
    } else {
      void fetch('/api/events', { method: 'POST', body, headers: { 'content-type': 'application/json' }, keepalive: true });
    }
  } catch {
    // 埋点失败不影响使用
  }
}
