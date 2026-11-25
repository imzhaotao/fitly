'use client';

import {
  roomOfItem,
  SHAPE_LIMITS,
  wallLength,
  type Anchor,
  type FurnitureItem,
  type Plan,
  type ShapeParams,
  type Space,
} from '@fitly/layout-engine';
import { useState, type ReactNode } from 'react';
import { ANCHOR_LABEL, CATALOG, CATALOG_BY_TYPE, labelOf } from '@/plan/catalog';
import { Button, Chip, cn, FieldLabel, Tag } from '@/ui';

function NumField({ label, value, onChange, min = 1, max = 9000 }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft == null) return;
    const v = Math.round(Number(draft));
    if (Number.isFinite(v)) onChange(Math.max(min, Math.min(max, v)));
    setDraft(null);
  };
  return (
    <label className="relative flex flex-col gap-[3px]">
      {label && <FieldLabel>{label}</FieldLabel>}
      <input
        inputMode="numeric"
        className="w-full rounded-lg border border-line bg-field py-1.5 pl-2 pr-7 text-base desk:text-sm"
        value={draft ?? String(value)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
      <em className="absolute bottom-[7px] right-2 text-[11px] not-italic text-muted">mm</em>
    </label>
  );
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-col gap-3 p-3.5', className)}>{children}</div>;
}

function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel>{label}</FieldLabel>
      {children}
    </div>
  );
}

const Chips = ({ children }: { children: ReactNode }) => <div className="flex flex-wrap gap-1.5">{children}</div>;
const Grid3 = ({ children }: { children: ReactNode }) => <div className="grid grid-cols-3 gap-2">{children}</div>;

export function ItemInspector({
  item,
  onChange,
  onRemove,
  onDuplicate,
  nearby = [],
  onPickAnchor,
}: {
  item: FurnitureItem;
  onChange: (patch: Partial<FurnitureItem>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  nearby?: { anchor: Anchor; distMm: number }[];
  onPickAnchor?: (id: string) => void;
}) {
  const cat = CATALOG_BY_TYPE[item.type];
  const rot = (d: number) => onChange({ rotation: (((item.rotation + d) % 360) + 540) % 360 - 180 });
  const nudge = (dx: number, dy: number) => onChange({ x: item.x + dx, y: item.y + dy });
  return (
    <Panel>
      <div className="flex items-baseline justify-between gap-2">
        <strong className="text-[15px]">{labelOf(item)}</strong>
        <span className="text-muted">
          {Math.round(item.w / 10)}×{Math.round(item.d / 10)}×{Math.round(item.h / 10)} cm
        </span>
      </div>
      {cat?.presets && (
        <Chips>
          {cat.presets.map((p) => (
            <Chip key={p.label} on={p.w === item.w && p.d === item.d} onClick={() => onChange({ w: p.w, d: p.d, h: p.h })}>
              {p.label}
            </Chip>
          ))}
        </Chips>
      )}
      <Grid3>
        <NumField label="宽" value={item.w} onChange={(w) => onChange({ w })} min={100} />
        <NumField label="深" value={item.d} onChange={(d) => onChange({ d })} min={10} />
        <NumField label="高" value={item.h} onChange={(h) => onChange({ h })} min={5} max={3000} />
      </Grid3>
      {cat?.variants && (
        <Field label={item.type === 'wardrobe' ? '门型' : '款式'}>
          <Chips>
            {cat.variants.map((v) => (
              <Chip
                key={v.value}
                on={(item.variant ?? 'standard') === v.value}
                onClick={() =>
                  onChange({
                    variant: v.value,
                    ...(v.value.startsWith('l-shape') ? { chaiseW: item.chaiseW ?? cat.chaiseW, chaiseD: item.chaiseD ?? cat.chaiseD } : {}),
                  })
                }
              >
                {v.label}
              </Chip>
            ))}
          </Chips>
        </Field>
      )}
      {item.variant?.startsWith('l-shape') && (
        <Grid3>
          <NumField label="贵妃宽" value={item.chaiseW ?? 700} onChange={(chaiseW) => onChange({ chaiseW })} min={300} max={item.w} />
          <NumField label="贵妃伸出" value={item.chaiseD ?? 650} onChange={(chaiseD) => onChange({ chaiseD })} min={200} max={1500} />
        </Grid3>
      )}
      {cat && cat.colors.length > 1 && (
        <Field label="配色">
          <div className="flex gap-2">
            {cat.colors.map((c) => (
              <button
                key={c}
                aria-label={c}
                className={cn('size-[26px] rounded-full border-2 border-white', item.materialPreset === c ? 'ring-2 ring-ink' : 'ring-1 ring-line')}
                style={{ background: c }}
                onClick={() => onChange({ materialPreset: c })}
              />
            ))}
          </div>
        </Field>
      )}
      <Field label={`旋转 ${Math.round(item.rotation)}°`}>
        <Chips>
          <Chip onClick={() => rot(-90)}>⟲ 90°</Chip>
          <Chip onClick={() => rot(-15)}>⟲ 15°</Chip>
          <Chip onClick={() => rot(15)}>⟳ 15°</Chip>
          <Chip onClick={() => rot(90)}>⟳ 90°</Chip>
        </Chips>
      </Field>
      <Field label="微调位置">
        <Chips>
          <Chip onClick={() => nudge(-50, 0)}>← 5cm</Chip>
          <Chip onClick={() => nudge(50, 0)}>→ 5cm</Chip>
          <Chip onClick={() => nudge(0, -50)}>↑ 5cm</Chip>
          <Chip onClick={() => nudge(0, 50)}>↓ 5cm</Chip>
        </Chips>
      </Field>
      {nearby.length > 0 && (
        <Field label="附近墙上点位（点开可改成你家实测高度）">
          <div className="flex flex-col gap-1.5">
            {nearby.map(({ anchor: a, distMm }) => (
              <button
                key={a.id}
                className="flex items-center gap-2 rounded-lg border border-line bg-field px-2 py-1.5 text-left"
                onClick={() => onPickAnchor?.(a.id)}
              >
                <span>{ANCHOR_LABEL[a.kind] ?? a.kind}</span>
                <span className="flex-1 text-xs text-muted">
                  离地 {a.heightMm ?? '?'} mm · 相距 {Math.round(distMm / 10)} cm
                </span>
                <Tag tone={a.confirmed ? 'ok' : 'neutral'}>{a.confirmed ? '已确认' : '示例'}</Tag>
              </button>
            ))}
          </div>
        </Field>
      )}
      <div className="flex gap-2 *:flex-1">
        <Button onClick={onDuplicate}>复制一件</Button>
        <Button variant="danger" onClick={onRemove}>
          删除
        </Button>
      </div>
    </Panel>
  );
}

export function AnchorInspector({ anchor, plan, onChange }: { anchor: Anchor; plan: Plan; onChange: (patch: Partial<Anchor>) => void }) {
  const wall = plan.walls.find((w) => w.id === anchor.wallId);
  return (
    <Panel>
      <div className="flex items-baseline justify-between gap-2">
        <strong className="text-[15px]">{ANCHOR_LABEL[anchor.kind] ?? anchor.kind}点位</strong>
        <Tag tone={anchor.confirmed ? 'ok' : 'neutral'}>{anchor.confirmed ? '已现场确认' : '示例位置'}</Tag>
      </div>
      <p className="text-xs text-muted">
        模板里的点位只是示例。可以在 3D 里沿墙拖动它，量好你家实际离地高度后标为“已确认”，涉及高差的提醒才会给出具体数字。
      </p>
      <Grid3>
        <NumField label="离地高" value={anchor.heightMm ?? 300} onChange={(heightMm) => onChange({ heightMm })} min={0} max={2600} />
        {wall && <NumField label="距墙端" value={anchor.offset ?? 0} onChange={(offset) => onChange({ offset })} min={0} max={Math.round(wallLength(wall))} />}
      </Grid3>
      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" checked={!!anchor.confirmed} onChange={(e) => onChange({ confirmed: e.target.checked })} />
        这是我家实测的位置和高度
      </label>
    </Panel>
  );
}

export const SPACE_LABEL: Record<Space, string> = { living: '客餐厅', kitchen: '厨房', bedroom: '卧室', bath: '卫生间', entry: '玄关', balcony: '阳台' };

export function CatalogPanel({ onAdd, defaultSpace }: { onAdd: (type: FurnitureItem['type']) => void; defaultSpace: Space }) {
  const [space, setSpace] = useState<Space>(defaultSpace);
  const spaces: Space[] = ['living', 'kitchen', 'bedroom'];
  return (
    <Panel>
      <Chips>
        {spaces.map((s) => (
          <Chip key={s} on={space === s} onClick={() => setSpace(s)}>
            {SPACE_LABEL[s]}
          </Chip>
        ))}
      </Chips>
      <div className="grid grid-cols-3 gap-2 desk:grid-cols-2">
        {CATALOG.filter((c) => c.space === space).map((c) => (
          <button
            key={c.type}
            className="flex flex-col items-start gap-0.5 rounded-[10px] border border-line bg-field p-2.5 text-left"
            onClick={() => onAdd(c.type)}
          >
            <span className="mb-1 h-[26px] w-full rounded-md" style={{ background: c.colors[0] }} />
            <span>{c.label}</span>
            <em className="text-[11px] not-italic text-muted">
              {Math.round(c.w / 10)}×{Math.round(c.d / 10)}
            </em>
          </button>
        ))}
      </div>
    </Panel>
  );
}

const SHAPE_LABEL: Record<keyof ShapeParams, string> = {
  livingW: '客餐厅开间',
  depth: '总进深',
  sideW: '厨房/卧室开间',
  kitchenD: '厨房进深',
};

export function ShapePanel({ params, onChange }: { params: ShapeParams; onChange: (p: ShapeParams) => void }) {
  return (
    <Panel>
      <p className="text-xs text-muted">按轴线尺寸填写（墙中到墙中）。门窗和墙上点位会跟着墙一起移动，家具位置不变。</p>
      {(Object.keys(SHAPE_LABEL) as (keyof ShapeParams)[]).map((k) => {
        const [lo, hi] = SHAPE_LIMITS[k];
        return (
          <div key={k} className="flex flex-col gap-1">
            <div className="flex items-end justify-between gap-2.5">
              <span>{SHAPE_LABEL[k]}</span>
              <div className="w-[110px]">
                <NumField label="" value={params[k]} onChange={(v) => onChange({ ...params, [k]: v })} min={lo} max={hi} />
              </div>
            </div>
            <input
              type="range"
              className="w-full accent-ink"
              min={lo}
              max={hi}
              step={50}
              value={params[k]}
              onChange={(e) => onChange({ ...params, [k]: Number(e.target.value) })}
            />
          </div>
        );
      })}
      <p className="text-xs text-muted">卧室进深 = 总进深 − 厨房进深 = {params.depth - params.kitchenD} mm</p>
    </Panel>
  );
}

export function spaceOfItem(plan: Plan, item: FurnitureItem): Space | undefined {
  const rid = roomOfItem(plan, item);
  return plan.rooms.find((r) => r.id === rid)?.space;
}
