import type { FurnitureItem, Plan } from '@fitly/layout-engine';
import { labelOf } from '@/plan/catalog';

export interface ItemChange {
  id: string;
  label: string;
  kind: 'added' | 'removed' | 'resized' | 'moved' | 'variant';
  text: string;
}

const cm = (mm: number) => `${Math.round(mm / 10)}`;

/** 两版之间的家具差异：增删、尺寸、位置（> 5cm）、款式 */
export function diffFurniture(a: Plan, b: Plan): ItemChange[] {
  const out: ItemChange[] = [];
  const ma = new Map(a.furniture.map((f) => [f.id, f]));
  const mb = new Map(b.furniture.map((f) => [f.id, f]));
  for (const [id, fb] of mb) {
    const fa = ma.get(id);
    if (!fa) {
      out.push({ id, label: labelOf(fb), kind: 'added', text: `新增 ${cm(fb.w)}×${cm(fb.d)} cm` });
      continue;
    }
    if (fa.w !== fb.w || fa.d !== fb.d || fa.h !== fb.h) {
      out.push({ id, label: labelOf(fb), kind: 'resized', text: `${cm(fa.w)}×${cm(fa.d)} → ${cm(fb.w)}×${cm(fb.d)} cm` });
    }
    if ((fa.variant ?? '') !== (fb.variant ?? '')) {
      out.push({ id, label: labelOf(fb), kind: 'variant', text: '换了款式 / 门型' });
    }
    const moved = Math.hypot(fa.x - fb.x, fa.y - fb.y);
    if (moved > 50 || fa.rotation !== fb.rotation) {
      out.push({ id, label: labelOf(fb), kind: 'moved', text: `挪动 ${cm(moved)} cm${fa.rotation !== fb.rotation ? '，转了方向' : ''}` });
    }
  }
  for (const [id, fa] of ma) {
    if (!mb.has(id)) out.push({ id, label: labelOf(fa as FurnitureItem), kind: 'removed', text: '这一版去掉了' });
  }
  return out;
}

export function shapeText(p: Plan): string {
  const s = p.shape?.params;
  if (!s) return '';
  return `客餐厅 ${cm(s.livingW)}×${cm(s.depth)} cm`;
}
