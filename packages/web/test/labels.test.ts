import { describe, expect, it } from 'vitest';
import { parseRoomLabel } from '../src/trace/labels';

describe('户型图房间文字解析（识别结果有错字）', () => {
  it.each([
    ['客 餐厅 | 28.95m', '客餐厅', 'living', 28.95],
    ['主 臣 | 13.54mi', '主卧', 'bedroom', 13.54],
    ['次 臣 | 8.45mi', '次卧', 'bedroom', 8.45],
    ['， 卫 生 | 司 | 3.6', '卫生间', 'bath', 3.6],
    ['厨房 | 4.48mi', '厨房', 'kitchen', 4.48],
    ['阳台 | 5.52m', '阳台', 'balcony', 5.52],
    ['儿童房 9.8㎡', '儿童房', 'bedroom', 9.8],
    ['玄关', '玄关', 'entry', undefined],
    ['卫生 旧 | 3 65mi', '卫生间', 'bath', 3.65],
    ['客 佑 厅 ||', '客餐厅', 'living', undefined],
    ['平生 || 小 | 和', '卫生间', 'bath', undefined],
  ])('%s → %s', (raw, name, space, area) => {
    const g = parseRoomLabel(raw);
    expect(g.name).toBe(name);
    expect(g.space).toBe(space);
    expect(g.area).toBe(area);
  });

  it('认不出的字不乱猜', () => {
    expect(parseRoomLabel('二 、 * wa')).toEqual({});
  });
});
