'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/ui';

export function TemplateButton({ templateId }: { templateId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const go = async () => {
    setBusy(true);
    setErr(false);
    try {
      const r = await fetch('/api/plans', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ templateId }),
      });
      if (!r.ok) throw new Error();
      const { id } = await r.json();
      router.push(`/plan/${id}`);
    } catch {
      setErr(true);
      setBusy(false);
    }
  };
  return (
    <>
      <Button variant="primary" block disabled={busy} onClick={go}>
        {busy ? '正在复制模板…' : '用这套开始改'}
      </Button>
      {err && <p className="text-xs text-danger">创建失败，请稍后重试</p>}
    </>
  );
}
