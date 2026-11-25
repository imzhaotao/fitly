import type { Space } from '@fitly/layout-engine';

export interface LabelGuess {
  name?: string;
  space?: Space;
  /** 图上标注的面积（㎡） */
  area?: number;
}

/**
 * 把识别出来的房间文字（可能有错字、空格）解析成房间名、类型和面积。
 * 按关键字模糊匹配：识别常把“卧”认成“臣”、把“间”认成“司”，所以只看最有区分度的字。
 */
export function parseRoomLabel(raw: string): LabelGuess {
  const t = raw.replace(/\s+/g, '');
  const out: LabelGuess = {};

  const rules: [RegExp, string, Space][] = [
    [/客.?餐|餐.?厅|客.{1,2}厅/, '客餐厅', 'living'],
    [/客厅|起居/, '客厅', 'living'],
    [/主卫/, '主卫', 'bath'],
    [/客卫/, '客卫', 'bath'],
    [/卫生|卫|洗手|浴|生间|平生/, '卫生间', 'bath'],
    [/主[卧臣室]|主$/, '主卧', 'bedroom'],
    [/次[卧臣室]|次$/, '次卧', 'bedroom'],
    [/儿童/, '儿童房', 'bedroom'],
    [/书房/, '书房', 'bedroom'],
    [/卧|臣/, '卧室', 'bedroom'],
    [/厨/, '厨房', 'kitchen'],
    [/阳台|阳|台/, '阳台', 'balcony'],
    [/玄关|门厅|玄/, '玄关', 'entry'],
  ];
  for (const [re, name, space] of rules) {
    if (re.test(t)) {
      out.name = name;
      out.space = space;
      break;
    }
  }
  // 面积：优先找带小数的数字（13.54），其次是后面跟 m / ㎡ / 平 的整数
  // 去掉噪点时小数点也可能被去掉：“3 65m” 按 3.65 处理
  const spaced = raw.match(/(\d{1,3})\s+(\d{2})\s*(?:m|㎡|平)/);
  if (spaced) {
    const v2 = Number(`${spaced[1]}.${spaced[2]}`);
    if (v2 > 0.5 && v2 < 200) out.area = v2;
  }
  const dec = t.match(/(\d{1,3}\.\d{1,2})/);
  const int = t.match(/(\d{1,3})(?=\s*(?:m|㎡|平))/);
  const v = dec ? Number(dec[1]) : int ? Number(int[1]) : undefined;
  if (out.area == null && v != null && v > 0.5 && v < 200) out.area = v;
  return out;
}

/** 识别面积和算出面积的偏差（相对图上标注） */
export function areaDiff(computed: number, labeled?: number): number | null {
  if (!labeled) return null;
  return (computed - labeled) / labeled;
}
