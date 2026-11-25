import { describe, expect, it } from 'vitest';
import { autoDetectWalls, bandsToWalls, detectBands, detectRooms, type Mask } from '../src';
import { readPng } from './png';

/**
 * 回归测试：用自己生成的三张示例户型图（scripts/gen-sample-plans.py，10mm/像素）跑墙体识别和分房。
 * 这些图包含：窗紧挨墙角、宽窗、推拉门线贴着墙、外墙和内墙在一条直线上、水磨石卫生间。
 */
const DIR = new URL('../../web/public/samples/', import.meta.url).pathname;
const S = 10;
const opts = { minLen: 150 / S, minThick: 50 / S, maxThick: 450 / S, minGap: 400 / S, maxGap: 4500 / S };

function detect(name: string) {
  const { w, h, rgb } = readPng(`${DIR}${name}`);
  const data = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const d = Math.abs(rgb[i * 3] - 153) + Math.abs(rgb[i * 3 + 1] - 153) + Math.abs(rgb[i * 3 + 2] - 153);
    if (d < 54) data[i] = 1;
  }
  const walls = bandsToWalls(detectBands({ w, h, data } as Mask, opts), opts);
  const rooms = detectRooms(walls, w, h, 5, 1.2e6 / (S * S));
  return rooms.map((r) => (r.areaPx * S * S) / 1e6).sort((a, b) => b - a);
}

describe('示例户型图识别回归', () => {
  it.each([
    ['plan-a.png', [18.3, 18.3, 3.7, 3.7]],
    ['plan-b.png', [25.9, 13.4, 13.4, 6.9, 5.6, 5.3]],
    ['plan-c.png', [36.0, 14.5, 14.5, 9.6, 8.7, 5.5, 5.4]],
  ])('%s：房间一个不少，面积与设计值相差不超过 15%%', (name, expected) => {
    const areas = detect(name as string);
    expect(areas).toHaveLength((expected as number[]).length);
    // 按面积从大到小一一对应
    (expected as number[])
      .sort((a, b) => b - a)
      .forEach((e, i) => expect(Math.abs(areas[i] - e) / e, `${name} 第 ${i + 1} 大的房间 ${areas[i].toFixed(2)}㎡ vs 设计 ${e}㎡`).toBeLessThan(0.15));
  });
});

describe('自动找墙体颜色', () => {
  it.each([
    ['plan-a.png', 4],
    ['plan-b.png', 6],
    ['plan-c.png', 7],
  ])('%s：不用点墙也能分出全部房间', (name, n) => {
    const { w, h, rgb } = readPng(`${DIR}${name}`);
    const r = autoDetectWalls(rgb, 3, w, h, opts, 5, 1.2e6 / (S * S))!;
    expect(r.rooms).toHaveLength(n as number);
    // 选中的颜色就是墙的灰色
    expect(Math.abs(r.color[0] - 153)).toBeLessThan(15);
  });
});
