import { describe, expect, it } from 'vitest';
import { bandsToWalls, classifyGap, detectBands, detectRooms, type Mask } from '../src';

/** 合成户型：外框 20..380 × 20..280，墙厚 10；x=200 处一道隔墙，中间留 40px 门洞；上墙留 60px 窗 */
function synth() {
  const w = 400;
  const h = 300;
  const data = new Uint8Array(w * h);
  // 地面画成木地板的亮度
  const lum = new Float32Array(w * h).fill(190);
  const fill = (x0: number, y0: number, x1: number, y1: number, v = 1) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) data[y * w + x] = v;
  };
  fill(20, 20, 380, 30); // 上
  fill(20, 270, 380, 280); // 下
  fill(20, 20, 30, 280); // 左
  fill(370, 20, 380, 280); // 右
  fill(195, 30, 205, 130); // 隔墙上段
  fill(195, 170, 205, 270); // 隔墙下段（130..170 是门洞）
  // 上墙开窗 260..320：掩膜挖空，亮度画成白条 + 一道灰线
  fill(260, 20, 320, 30, 0);
  for (let x = 260; x < 320; x++) lum[25 * w + x] = 180;
  // 隔墙门洞 130..170：门扇铰链在 y=130、开向右侧（+x），画半透明白色 1/4 圆 + 细弧线
  const hx = 205;
  const hy = 130;
  for (let y = hy; y < hy + 45; y++) {
    for (let x = hx; x < hx + 45; x++) {
      const r = Math.hypot(x - hx, y - hy);
      if (r < 38) lum[y * w + x] = 235;
      else if (r < 40) lum[y * w + x] = 150;
    }
  }
  // 下墙左段开窗 36..140：窗左侧只剩 16px 的墙头（不到墙厚的 2 倍，旧规则会丢掉它导致房间漏到室外）
  fill(36, 270, 140, 280, 0);
  for (let x = 36; x < 140; x++) lum[275 * w + x] = 180;
  // 墙体像素亮度
  for (let i = 0; i < w * h; i++) if (data[i]) lum[i] = 140;
  return { mask: { w, h, data } as Mask, lumAt: (x: number, y: number) => lum[Math.round(y) * w + Math.round(x)] ?? 255 };
}

const opts = { minLen: 15, minThick: 3, maxThick: 30, minGap: 20, maxGap: 120 };

describe('户型图描图', () => {
  const { mask, lumAt } = synth();
  const walls = bandsToWalls(detectBands(mask, opts), opts);

  it('识别出 5 面墙：4 面外墙 + 1 面带门洞的隔墙', () => {
    expect(walls.filter((w) => w.dir === 'h')).toHaveLength(2);
    expect(walls.filter((w) => w.dir === 'v')).toHaveLength(3);
    const part = walls.find((w) => w.dir === 'v' && Math.abs(w.c - 200) < 2)!;
    expect(part.gaps).toHaveLength(1);
    expect(part.gaps[0].a0).toBeCloseTo(130, 0);
    expect(part.gaps[0].a1).toBeCloseTo(170, 0);
  });

  it('上墙的缺口判为窗，隔墙缺口判为门', () => {
    const top = walls.find((w) => w.dir === 'h' && w.c < 50)!;
    expect(top.gaps).toHaveLength(1);
    expect(classifyGap(top, top.gaps[0], lumAt).kind).toBe('window');
    const part = walls.find((w) => w.dir === 'v' && Math.abs(w.c - 200) < 2)!;
    const g = classifyGap(part, part.gaps[0], lumAt);
    expect(g.kind).toBe('door');
    // 竖墙 +x 一侧为 'a'；铰链在缺口起点 y=130
    expect(g.side).toBe('a');
    expect(g.hinge).toBe('start');
  });

  it('窗边很短的墙头也保留，下墙识别为一面带窗的墙', () => {
    const bottom = walls.filter((w) => w.dir === 'h' && w.c > 250);
    expect(bottom).toHaveLength(1);
    expect(bottom[0].a0).toBeLessThanOrEqual(21);
    expect(bottom[0].gaps).toHaveLength(1);
  });

  it('门洞按封闭处理，分出左右两个房间，面积接近', () => {
    const rooms = detectRooms(walls, mask.w, mask.h, 2, 1000);
    expect(rooms).toHaveLength(2);
    // 左间净宽 30..195 = 165，净高 30..270 = 240
    const areas = rooms.map((r) => r.areaPx).sort((a, b) => a - b);
    expect(areas[0]).toBeGreaterThan(165 * 240 * 0.95);
    expect(areas[1]).toBeLessThan(175 * 240 * 1.05);
    for (const r of rooms) expect(r.polygon.length).toBe(4);
  });
});
