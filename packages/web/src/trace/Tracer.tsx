'use client';

import {
  bandsToWalls,
  classifyGap,
  detectBands,
  detectRooms,
  polygonArea,
  type Space,
  type TraceGap,
  type TraceRoom,
  type TraceWall,
} from '@fitly/layout-engine';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Button, Chip, cn, inputClass, TextButton } from '@/ui';
import { TopBar } from '@/ui/TopBar';
import { buildPlanFromTrace, defaultGapSide, type RoomMeta, type Scale } from './buildPlan';

type Step = 'upload' | 'scaleX' | 'scaleY' | 'wall' | 'edit';
type Tool = 'select' | 'add';
type Sel = { kind: 'wall'; id: string } | { kind: 'gap'; wallId: string; index: number } | { kind: 'room'; index: number } | null;
type Pt = { x: number; y: number };

const MAX_SIDE = 1400;

const SPACE_OPTIONS: { space: Space; label: string }[] = [
  { space: 'living', label: '客餐厅' },
  { space: 'bedroom', label: '卧室' },
  { space: 'kitchen', label: '厨房' },
  { space: 'bath', label: '卫生间' },
  { space: 'balcony', label: '阳台' },
  { space: 'entry', label: '玄关' },
];

const STEP_TITLE: Record<Step, string> = {
  upload: '1 / 4 上传户型图',
  scaleX: '2 / 4 定横向比例',
  scaleY: '2 / 4 定纵向比例',
  wall: '3 / 4 点一下墙',
  edit: '4 / 4 检查并修正',
};

interface Img {
  url: string;
  w: number;
  h: number;
  data: ImageData;
}

function loadImage(file: File): Promise<Img> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      const k = Math.min(1, MAX_SIDE / Math.max(im.naturalWidth, im.naturalHeight));
      const w = Math.round(im.naturalWidth * k);
      const h = Math.round(im.naturalHeight * k);
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d', { willReadFrequently: true })!;
      g.drawImage(im, 0, 0, w, h);
      resolve({ url: c.toDataURL('image/jpeg', 0.85), w, h, data: g.getImageData(0, 0, w, h) });
      URL.revokeObjectURL(url);
    };
    im.onerror = reject;
    im.src = url;
  });
}

function sampleColor(img: Img, p: Pt): [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const x = Math.round(p.x) + dx;
      const y = Math.round(p.y) + dy;
      if (x < 0 || y < 0 || x >= img.w || y >= img.h) continue;
      const i = (y * img.w + x) * 4;
      r += img.data.data[i];
      g += img.data.data[i + 1];
      b += img.data.data[i + 2];
      n++;
    }
  }
  return [r / n, g / n, b / n];
}

function roomCentroid(r: TraceRoom): Pt {
  // 取多边形内部的一个代表点：包围盒中心若不在内部，退回到第一条边附近
  const xs = r.polygon.map((p) => p.x);
  const ys = r.polygon.map((p) => p.y);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
}

export default function Tracer() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('upload');
  const [img, setImg] = useState<Img | null>(null);
  const [pts, setPts] = useState<Pt[]>([]);
  const [mmInput, setMmInput] = useState('');
  const [scale, setScale] = useState<Scale>({ sx: 10, sy: 10 });
  const [walls, setWalls] = useState<TraceWall[]>([]);
  const [rooms, setRooms] = useState<TraceRoom[]>([]);
  const [roomMeta, setRoomMeta] = useState<RoomMeta[]>([]);
  const [tool, setTool] = useState<Tool>('select');
  const [sel, setSel] = useState<Sel>(null);
  const [addStart, setAddStart] = useState<Pt | null>(null);
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState('我家 · 上传户型');
  const boxRef = useRef<HTMLDivElement>(null);

  const s = (scale.sx + scale.sy) / 2;
  const opts = useMemo(
    () => ({ minLen: 150 / s, minThick: 50 / s, maxThick: 450 / s, minGap: 400 / s, maxGap: 2700 / s }),
    [s],
  );

  const lumAt = useCallback(
    (x: number, y: number) => {
      if (!img) return 255;
      const xi = Math.max(0, Math.min(img.w - 1, Math.round(x)));
      const yi = Math.max(0, Math.min(img.h - 1, Math.round(y)));
      const i = (yi * img.w + xi) * 4;
      const d = img.data.data;
      return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    },
    [img],
  );

  /** 墙改了以后重新分房间，尽量保留已经标好的房间类型 */
  const recomputeRooms = useCallback(
    (ws: TraceWall[], prevRooms: TraceRoom[], prevMeta: RoomMeta[]) => {
      if (!img) return;
      const cell = Math.max(2, Math.round(50 / s));
      const minArea = 1.2e6 / (scale.sx * scale.sy);
      const next = detectRooms(ws, img.w, img.h, cell, minArea);
      const meta = next.map((r, i): RoomMeta => {
        const old = prevRooms.findIndex((o) => {
          const c = roomCentroid(o);
          return r.polygon.length > 0 && pointIn(c, r.polygon);
        });
        if (old >= 0 && prevMeta[old]) return prevMeta[old];
        return i === 0 ? { space: 'living', name: '客餐厅' } : { space: 'bedroom', name: `房间${i}` };
      });
      setRooms(next);
      setRoomMeta(meta);
      return next;
    },
    [img, s, scale.sx, scale.sy],
  );

  const detect = (color: [number, number, number]) => {
    if (!img) return;
    const { w, h, data } = img;
    const mask = new Uint8Array(w * h);
    const d = data.data;
    for (let i = 0; i < w * h; i++) {
      const dr = d[i * 4] - color[0];
      const dg = d[i * 4 + 1] - color[1];
      const db = d[i * 4 + 2] - color[2];
      if (Math.abs(dr) + Math.abs(dg) + Math.abs(db) < 54) mask[i] = 1;
    }
    const ws = bandsToWalls(detectBands({ w, h, data: mask }, opts), opts);
    if (ws.length < 3) {
      setErr('没认出几面墙。换个位置再点一下墙体（点在墙的正中间），或者换一张更清晰的图。');
      return;
    }
    const rs = recomputeRooms(ws, [], []) ?? [];
    // 门窗：看缺口旁有没有画门扇的 1/4 圆，有就是门，顺便得到开门方向和铰链位置
    for (const wl of ws) {
      for (const g of wl.gaps) {
        const guess = classifyGap(wl, g, lumAt, wl.dir === 'h' ? scale.sx : scale.sy);
        g.kind = guess.kind;
        if (guess.kind === 'door') {
          g.side = guess.side ?? defaultGapSide(wl, g, rs);
          g.hinge = guess.hinge;
        }
      }
    }
    setWalls(ws);
    setErr(null);
    setStep('edit');
  };

  const toImg = (e: ReactPointerEvent): Pt => {
    const r = boxRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * (img?.w ?? 1), y: ((e.clientY - r.top) / r.height) * (img?.h ?? 1) };
  };

  // 点击命中：墙 / 缺口 / 房间
  const hitTest = (p: Pt): Sel => {
    const tol = 8;
    for (const w of walls) {
      const along = w.dir === 'h' ? p.x : p.y;
      const cross = w.dir === 'h' ? p.y : p.x;
      if (Math.abs(cross - w.c) > w.thick / 2 + tol || along < w.a0 - tol || along > w.a1 + tol) continue;
      const gi = w.gaps.findIndex((g) => along >= g.a0 - 2 && along <= g.a1 + 2);
      if (gi >= 0) return { kind: 'gap', wallId: w.id, index: gi };
      return { kind: 'wall', id: w.id };
    }
    const ri = rooms.findIndex((r) => pointIn(p, r.polygon));
    return ri >= 0 ? { kind: 'room', index: ri } : null;
  };

  /** 新墙端点吸附到已有墙的中线和端点 */
  const snap = (p: Pt): Pt => {
    const tol = 10;
    let { x, y } = p;
    for (const w of walls) {
      if (w.dir === 'h') {
        if (Math.abs(y - w.c) < tol) y = w.c;
        if (Math.abs(x - w.a0) < tol) x = w.a0;
        if (Math.abs(x - w.a1) < tol) x = w.a1;
      } else {
        if (Math.abs(x - w.c) < tol) x = w.c;
        if (Math.abs(y - w.a0) < tol) y = w.a0;
        if (Math.abs(y - w.a1) < tol) y = w.a1;
      }
    }
    return { x, y };
  };

  const onPointer = (e: ReactPointerEvent) => {
    if (!img) return;
    const p = toImg(e);
    if (step === 'scaleX' || step === 'scaleY') {
      setPts((old) => (old.length >= 2 ? [p] : [...old, p]));
      return;
    }
    if (step === 'wall') {
      detect(sampleColor(img, p));
      return;
    }
    if (step !== 'edit') return;
    if (tool === 'add') {
      const q = snap(p);
      if (!addStart) {
        setAddStart(q);
        return;
      }
      const dx = Math.abs(q.x - addStart.x);
      const dy = Math.abs(q.y - addStart.y);
      const thick = median(walls.map((w) => w.thick)) || 12;
      const nw: TraceWall =
        dx >= dy
          ? { id: `tw-add${Date.now()}`, dir: 'h', c: addStart.y, a0: Math.min(addStart.x, q.x), a1: Math.max(addStart.x, q.x), thick, gaps: [] }
          : { id: `tw-add${Date.now()}`, dir: 'v', c: addStart.x, a0: Math.min(addStart.y, q.y), a1: Math.max(addStart.y, q.y), thick, gaps: [] };
      setAddStart(null);
      if (nw.a1 - nw.a0 < 5) return;
      const ws = [...walls, nw];
      setWalls(ws);
      recomputeRooms(ws, rooms, roomMeta);
      return;
    }
    setSel(hitTest(p));
  };

  const confirmScale = () => {
    const mm = Number(mmInput);
    if (pts.length < 2 || !(mm > 0)) return;
    const d = step === 'scaleX' ? Math.abs(pts[1].x - pts[0].x) : Math.abs(pts[1].y - pts[0].y);
    if (d < 5) return setErr('两个点离得太近了，选一段长一点的尺寸。');
    setErr(null);
    if (step === 'scaleX') {
      setScale({ sx: mm / d, sy: mm / d });
      setStep('scaleY');
    } else {
      setScale((sc) => ({ ...sc, sy: mm / d }));
      setStep('wall');
    }
    setPts([]);
    setMmInput('');
  };

  const updateWall = (id: string, fn: (w: TraceWall) => TraceWall | null) => {
    const ws = walls.map((w) => (w.id === id ? fn(w) : w)).filter((w): w is TraceWall => !!w);
    setWalls(ws);
    return ws;
  };

  const selWall = sel?.kind === 'wall' || sel?.kind === 'gap' ? walls.find((w) => w.id === (sel.kind === 'wall' ? sel.id : sel.wallId)) : undefined;
  const selGap: TraceGap | undefined = sel?.kind === 'gap' && selWall ? selWall.gaps[sel.index] : undefined;
  const selRoom = sel?.kind === 'room' ? sel.index : -1;
  const areaOf = (r: TraceRoom) => (polygonArea(r.polygon) * scale.sx * scale.sy) / 1e6;

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const plan = buildPlanFromTrace(walls, rooms, roomMeta, scale, name.trim() || '我家 · 上传户型');
      if (plan.rooms.length === 0) throw new Error('至少要有一个房间');
      const r = await fetch('/api/plans', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ plan }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? '保存失败');
      const { id } = await r.json();
      router.push(`/plan/${id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '保存失败');
      setBusy(false);
    }
  };

  // ---------- 渲染 ----------

  const hint: Record<Step, React.ReactNode> = {
    upload: '选一张户型图（售楼处、中介给的平面图都行）。图片只在你的浏览器里处理，不会上传。',
    scaleX: '找一段标了尺寸的横向墙（比如底部的 3242），在图上点它的左右两端，再填上这个数字。',
    scaleY: '再找一段竖向尺寸点两端。很多截图横竖被拉伸过，分开定比例更准；确定没拉伸可以跳过。',
    wall: '在图上点一下墙体（深色的墙中间），程序会找出同样颜色的墙。',
    edit:
      tool === 'add'
        ? addStart
          ? '再点一下墙的另一端（自动横平竖直、吸附到已有的墙）。'
          : '点新墙的起点。'
        : '点墙可以删掉，点门窗可以改类型和开门方向，点房间可以改名称和类型。面积可以和图上标的对一对。',
  };

  return (
    <div className="no-callout flex h-dvh flex-col overflow-hidden">
      <TopBar>
        <Link href="/" className="text-lg font-extrabold tracking-wide no-underline">
          Fitly
        </Link>
        <strong className="min-w-0 flex-1 truncate">{STEP_TITLE[step]}</strong>
        {img && (
          <div className="flex items-center gap-1">
            <Chip on={zoom === 1} onClick={() => setZoom(1)}>
              1×
            </Chip>
            <Chip on={zoom === 2} onClick={() => setZoom(2)}>
              2×
            </Chip>
            <Chip on={zoom === 3} onClick={() => setZoom(3)}>
              3×
            </Chip>
          </div>
        )}
      </TopBar>

      <div className="flex min-h-0 flex-1 flex-col desk:flex-row">
        <div className="min-h-0 flex-1 overflow-auto overscroll-contain bg-[#e9e4dc] p-2">
          {!img ? (
            <label className="mx-auto mt-10 flex max-w-md cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-line bg-panel p-8 text-center">
              <span className="text-3xl">🏠</span>
              <strong>选择户型图</strong>
              <span className="text-xs text-muted">支持 jpg / png，手机相册或截图都可以</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  try {
                    setImg(await loadImage(f));
                    setStep('scaleX');
                  } catch {
                    setErr('图片读不出来，换一张试试');
                  }
                }}
              />
            </label>
          ) : (
            <div ref={boxRef} className="relative mx-auto touch-manipulation" style={{ width: `${zoom * 100}%`, maxWidth: zoom === 1 ? 900 : undefined }} onPointerDown={onPointer}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt="户型图" className="block w-full select-none" draggable={false} />
              <svg viewBox={`0 0 ${img.w} ${img.h}`} preserveAspectRatio="none" className="absolute inset-0 size-full">
                {step === 'edit' &&
                  rooms.map((r, i) =>
                    roomMeta[i]?.skip ? null : (
                      <polygon
                        key={r.id}
                        points={r.polygon.map((p) => `${p.x},${p.y}`).join(' ')}
                        fill={selRoom === i ? 'rgba(47,111,237,0.28)' : 'rgba(47,111,237,0.1)'}
                        stroke="rgba(47,111,237,0.6)"
                        strokeWidth={1}
                      />
                    ),
                  )}
                {step === 'edit' &&
                  walls.map((w) => {
                    const on = selWall?.id === w.id && sel?.kind === 'wall';
                    const segs: [number, number][] = [];
                    let cur = w.a0;
                    for (const g of w.gaps) {
                      segs.push([cur, g.a0]);
                      cur = g.a1;
                    }
                    segs.push([cur, w.a1]);
                    const rect = (a0: number, a1: number) =>
                      w.dir === 'h'
                        ? { x: a0, y: w.c - w.thick / 2, width: a1 - a0, height: w.thick }
                        : { x: w.c - w.thick / 2, y: a0, width: w.thick, height: a1 - a0 };
                    return (
                      <g key={w.id}>
                        {segs.map(([a0, a1], i) => (
                          <rect key={i} {...rect(a0, a1)} fill={on ? 'rgba(229,72,59,0.75)' : 'rgba(31,29,26,0.55)'} />
                        ))}
                        {w.gaps.map((g, i) => {
                          const gOn = sel?.kind === 'gap' && sel.wallId === w.id && sel.index === i;
                          const color = g.kind === 'window' ? '#2bb3c0' : g.kind === 'door' ? '#e08a1e' : '#8a8a8a';
                          return <rect key={`g${i}`} {...rect(g.a0, g.a1)} fill={color} opacity={gOn ? 1 : 0.75} stroke={gOn ? '#1f1d1a' : 'none'} strokeWidth={2} />;
                        })}
                      </g>
                    );
                  })}
                {step === 'edit' &&
                  rooms.map((r, i) => {
                    if (roomMeta[i]?.skip) return null;
                    const c = labelPoint(r);
                    return (
                      <text key={`t${r.id}`} x={c.x} y={c.y} textAnchor="middle" fontSize={Math.max(12, img.w / 70)} fill="#1f3f8f" fontWeight={600} style={{ paintOrder: 'stroke', stroke: 'white', strokeWidth: 3 }}>
                        {roomMeta[i]?.name} {areaOf(r).toFixed(1)}㎡
                      </text>
                    );
                  })}
                {(step === 'scaleX' || step === 'scaleY') &&
                  pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={Math.max(4, img.w / 200)} fill="#e5483b" />)}
                {(step === 'scaleX' || step === 'scaleY') && pts.length === 2 && (
                  <line
                    x1={pts[0].x}
                    y1={pts[0].y}
                    x2={step === 'scaleX' ? pts[1].x : pts[0].x}
                    y2={step === 'scaleX' ? pts[0].y : pts[1].y}
                    stroke="#e5483b"
                    strokeWidth={2}
                  />
                )}
                {addStart && <circle cx={addStart.x} cy={addStart.y} r={5} fill="#2f6fed" />}
              </svg>
            </div>
          )}
        </div>

        {/* 面板：内容区单独滚动，“生成”按钮固定在底部，始终可见 */}
        <aside className="flex max-h-[50dvh] flex-none flex-col border-t border-line bg-panel desk:max-h-none desk:w-[320px] desk:border-l desk:border-t-0">
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain p-3.5">
          <p className="m-0 text-[13px] text-muted">{hint[step]}</p>

          {(step === 'scaleX' || step === 'scaleY') && (
            <>
              <div className="flex items-center gap-2">
                <input
                  className={inputClass}
                  inputMode="numeric"
                  placeholder={pts.length < 2 ? '先在图上点两个点' : '这段的尺寸，单位 mm'}
                  value={mmInput}
                  onChange={(e) => setMmInput(e.target.value.replace(/[^\d]/g, ''))}
                />
                <span className="text-xs text-muted">mm</span>
              </div>
              <div className="flex gap-2">
                <Button variant="primary" className="flex-1" disabled={pts.length < 2 || !mmInput} onClick={confirmScale}>
                  确定
                </Button>
                {step === 'scaleY' && (
                  <Button
                    onClick={() => {
                      setStep('wall');
                      setPts([]);
                    }}
                  >
                    跳过，和横向一样
                  </Button>
                )}
              </div>
              {step === 'scaleY' && <p className="m-0 text-xs text-muted">横向：每像素 {scale.sx.toFixed(2)} mm</p>}
            </>
          )}

          {step === 'edit' && (
            <>
              <div className="flex gap-1.5">
                <Chip
                  on={tool === 'select'}
                  onClick={() => {
                    setTool('select');
                    setAddStart(null);
                  }}
                >
                  选择 / 修改
                </Chip>
                <Chip
                  on={tool === 'add'}
                  onClick={() => {
                    setTool('add');
                    setSel(null);
                  }}
                >
                  ＋ 画墙
                </Chip>
                <TextButton className="ml-auto text-xs" onClick={() => setStep('wall')}>
                  重新识别
                </TextButton>
              </div>

              {sel?.kind === 'wall' && selWall && (
                <div className="flex flex-col gap-2 rounded-xl bg-soft p-2.5">
                  <strong>这面墙</strong>
                  <span className="text-xs text-muted">
                    长 {Math.round((selWall.a1 - selWall.a0) * (selWall.dir === 'h' ? scale.sx : scale.sy))} mm · 厚{' '}
                    {Math.round(selWall.thick * (selWall.dir === 'h' ? scale.sy : scale.sx))} mm
                  </span>
                  <Button
                    variant="danger"
                    onClick={() => {
                      const ws = updateWall(selWall.id, () => null);
                      setSel(null);
                      recomputeRooms(ws, rooms, roomMeta);
                    }}
                  >
                    删掉这面墙（识别错了）
                  </Button>
                </div>
              )}

              {selGap && selWall && sel?.kind === 'gap' && (
                <div className="flex flex-col gap-2 rounded-xl bg-soft p-2.5">
                  <strong>墙上的缺口 · 宽 {Math.round((selGap.a1 - selGap.a0) * (selWall.dir === 'h' ? scale.sx : scale.sy))} mm</strong>
                  <div className="flex flex-wrap gap-1.5">
                    {(
                      [
                        ['window', '窗'],
                        ['door', '平开门'],
                        ['pass', '推拉门 / 门洞'],
                      ] as const
                    ).map(([k, label]) => (
                      <Chip
                        key={k}
                        on={selGap.kind === k}
                        onClick={() =>
                          updateWall(selWall.id, (w) => ({
                            ...w,
                            gaps: w.gaps.map((g, i) => (i === sel.index ? { ...g, kind: k, side: k === 'door' ? (g.side ?? defaultGapSide(w, g, rooms)) : g.side } : g)),
                          }))
                        }
                      >
                        {label}
                      </Chip>
                    ))}
                  </div>
                  {selGap.kind === 'door' && (
                    <Button
                      onClick={() =>
                        updateWall(selWall.id, (w) => ({
                          ...w,
                          gaps: w.gaps.map((g, i) => (i === sel.index ? { ...g, side: g.side === 'a' ? 'b' : 'a' } : g)),
                        }))
                      }
                    >
                      换开门方向（现在开向{selWall.dir === 'h' ? (selGap.side === 'a' ? '下' : '上') : selGap.side === 'a' ? '右' : '左'}侧）
                    </Button>
                  )}
                  <Button
                    onClick={() => {
                      const ws = updateWall(selWall.id, (w) => ({ ...w, gaps: w.gaps.filter((_, i) => i !== sel.index) }));
                      setSel(null);
                      recomputeRooms(ws, rooms, roomMeta);
                    }}
                  >
                    这里其实是墙，封上
                  </Button>
                </div>
              )}

              {/* 房间列表：每一行直接改名字、选类型；点户型图上的房间会高亮对应行 */}
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-muted">识别到的房间：直接改名字和类型，面积可以和图上标的对一对</span>
                {rooms.map((r, i) => {
                  const m = roomMeta[i];
                  if (!m) return null;
                  const setMeta = (patch: Partial<RoomMeta>) => setRoomMeta((all) => all.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                  return (
                    <div
                      key={r.id}
                      ref={(el) => {
                        if (el && selRoom === i) el.scrollIntoView({ block: 'nearest' });
                      }}
                      className={cn('flex items-center gap-1.5 rounded-lg px-1.5 py-1', selRoom === i ? 'bg-soft ring-1 ring-accent' : 'bg-transparent')}
                      onFocusCapture={() => setSel({ kind: 'room', index: i })}
                    >
                      <input
                        className={cn(inputClass, 'w-0 px-2 py-1.5', m.skip && 'text-muted line-through')}
                        value={m.name}
                        maxLength={12}
                        aria-label="房间名字"
                        onChange={(e) => setMeta({ name: e.target.value })}
                        disabled={m.skip}
                      />
                      <select
                        className="w-[76px] flex-none rounded-lg border border-line bg-field px-1 py-1.5 text-base desk:text-[13px]"
                        aria-label="房间类型"
                        value={m.skip ? 'skip' : m.space}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === 'skip') return setMeta({ skip: true });
                          const label = SPACE_OPTIONS.find((o) => o.space === v)!.label;
                          // 名字还是默认名时，跟着类型一起改
                          const isDefault = m.name.startsWith('房间') || SPACE_OPTIONS.some((o) => o.label === m.name);
                          setMeta({ space: v as Space, skip: false, name: isDefault ? label : m.name });
                        }}
                      >
                        {SPACE_OPTIONS.map((o) => (
                          <option key={o.space} value={o.space}>
                            {o.label}
                          </option>
                        ))}
                        <option value="skip">不是房间</option>
                      </select>
                      <span className="w-[58px] flex-none text-right text-xs text-muted">{areaOf(r).toFixed(2)}㎡</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
          {err && <p className="m-0 text-[13px] text-danger">{err}</p>}
          </div>
          {step === 'edit' && (
            <div className="flex flex-none gap-2 border-t border-line bg-panel px-3.5 pb-[calc(10px+env(safe-area-inset-bottom))] pt-2.5 desk:flex-col">
              <input className={cn(inputClass, 'desk:flex-none')} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} aria-label="方案名称" />
              <Button variant="primary" className="flex-none desk:h-10 desk:w-full" disabled={busy || rooms.length === 0} onClick={save}>
                {busy ? '正在生成…' : '生成 3D 户型'}
              </Button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function pointIn(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** 房间名字放在多边形里面积最大的那一格附近：简化为包围盒中心，若在外面则取第一条边中点往里 */
function labelPoint(r: TraceRoom): Pt {
  const c = roomCentroid(r);
  if (pointIn(c, r.polygon)) return c;
  const [a, b, d] = r.polygon;
  return { x: (a.x + b.x) / 2 + (d.x - b.x) * 0.3, y: (a.y + b.y) / 2 + (d.y - b.y) * 0.3 };
}

function median(v: number[]): number {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
