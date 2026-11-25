'use client';

import type { TraceRoom } from '@fitly/layout-engine';
import { parseRoomLabel, type LabelGuess } from './labels';

/** 识别时把文字以外的东西（木地板纹理、瓷砖）过滤掉：亮度低于这个值的才当作字 */
const TEXT_LUM = 110;

type Worker = Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>>;

let workerPromise: Promise<Worker> | null = null;

/** 按需加载识别引擎和中文字库（首次约 5MB，浏览器会缓存）；图片只在本地识别，不上传 */
async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = import('tesseract.js').then(async ({ createWorker }) => {
      const w = await createWorker('chi_sim', 1);
      // 稀疏文字模式：户型图里的字零散分布
      await w.setParameters({ tessedit_pageseg_mode: '11' as never });
      return w;
    });
    workerPromise.catch(() => {
      workerPromise = null;
    });
  }
  return workerPromise;
}

/**
 * 去掉零散的小黑点（水磨石、瓷砖纹理），保留连成片的笔画。
 * 只在第一遍认不出房间名时使用：它也会去掉“次”的两点、小数点这类小笔画。
 */
function despeckle(px: ImageData, minArea: number, minSpan: number) {
  const { width: w, height: h, data: d } = px;
  const dark = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) dark[i] = d[i * 4] === 0 ? 1 : 0;
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  const comp: number[] = [];
  for (let s = 0; s < w * h; s++) {
    if (!dark[s] || seen[s]) continue;
    stack.length = 0;
    comp.length = 0;
    stack.push(s);
    seen[s] = 1;
    let x0 = w;
    let x1 = 0;
    let y0 = h;
    let y1 = 0;
    while (stack.length) {
      const i = stack.pop()!;
      comp.push(i);
      const x = i % w;
      const y = (i - x) / w;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const n = ny * w + nx;
          if (dark[n] && !seen[n]) {
            seen[n] = 1;
            stack.push(n);
          }
        }
      }
    }
    if (comp.length < minArea && Math.max(x1 - x0, y1 - y0) < minSpan) {
      for (const i of comp) d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = 255;
    }
  }
}

/** 从整张图里裁出一块，放大 2 倍并二值化，只留下深色文字 */
function cropForOcr(data: ImageData, x0: number, y0: number, x1: number, y1: number, clean = false): HTMLCanvasElement {
  const w = Math.max(1, Math.round(x1 - x0));
  const h = Math.max(1, Math.round(y1 - y0));
  const src = document.createElement('canvas');
  src.width = data.width;
  src.height = data.height;
  src.getContext('2d')!.putImageData(data, 0, 0);
  const out = document.createElement('canvas');
  out.width = w * 2;
  out.height = h * 2;
  const g = out.getContext('2d', { willReadFrequently: true })!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, x0, y0, w, h, 0, 0, w * 2, h * 2);
  const px = g.getImageData(0, 0, out.width, out.height);
  const d = px.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const v = lum < TEXT_LUM ? 0 : 255;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  if (clean) despeckle(px, 80, 12);
  g.putImageData(px, 0, 0);
  return out;
}

export interface RoomLabel extends LabelGuess {
  raw: string;
}

/** 逐个房间识别图上的房间名和面积 */
export async function readRoomLabels(data: ImageData, rooms: TraceRoom[], onProgress?: (done: number, total: number) => void): Promise<RoomLabel[]> {
  const worker = await getWorker();
  const out: RoomLabel[] = [];
  for (const [i, r] of rooms.entries()) {
    onProgress?.(i, rooms.length);
    const xs = r.polygon.map((p) => p.x);
    const ys = r.polygon.map((p) => p.y);
    const pad = 3;
    const box = [Math.max(0, Math.min(...xs) + pad), Math.max(0, Math.min(...ys) + pad), Math.min(data.width, Math.max(...xs) - pad), Math.min(data.height, Math.max(...ys) - pad)] as const;
    const read = async (clean: boolean) => {
      const { data: res } = await worker.recognize(cropForOcr(data, ...box, clean), {}, { blocks: true });
      const lines: string[] = [];
      for (const b of res.blocks ?? []) for (const p of b.paragraphs) for (const l of p.lines) if (l.confidence >= 30) lines.push(l.text.trim());
      const raw = lines.join(' | ');
      return { raw, ...parseRoomLabel(raw) };
    };
    // 第一遍原样识别；认不出房间名或面积，再去掉噪点识别一遍，两遍互相补齐
    const first = await read(false);
    if (first.name && first.area != null) {
      out.push(first);
      continue;
    }
    const second = await read(true);
    out.push({
      raw: `${first.raw} || ${second.raw}`,
      name: first.name ?? second.name,
      space: first.space ?? second.space,
      area: first.area ?? second.area,
    });
  }
  onProgress?.(rooms.length, rooms.length);
  return out;
}
