'use client';

import { auditPlan, evaluateInteractive, PITFALLS, type EvaluatedPitfall } from '@fitly/content';
import { anchorPolygon, collisionsOf, findFreeSpot, createQuery, DEFAULT_SHAPE, edgeGap, roomOfAnchor, roomOfItem, toPolygons, type FurnitureItem, type Plan, type PlanNote, type Stage } from '@fitly/layout-engine';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { track } from '@/lib/track';
import { ANCHOR_LABEL, CATALOG_BY_TYPE, labelOf } from '@/plan/catalog';
import { PitfallCard, pitfallKey, PitfallList } from '@/pitfall/PitfallCard';
import { LinkedNotes, linkLabel, NotesSheet, type NoteLink } from './Notes';
import type { Highlight, ViewMode } from '@/scene/Scene';
import { AnchorInspector, CatalogPanel, ItemInspector, Panel, ShapePanel, spaceOfItem, SPACE_LABEL } from './Panels';
import { Button, Chip, cn, IconButton, Overlay, PillSelect, Seg, SegButton, SheetHead } from '@/ui';
import { reducer, type EditorState } from './state';
import { Versions } from './Versions';

const Scene = dynamic(() => import('@/scene/Scene'), { ssr: false, loading: () => <div className="absolute inset-0 flex items-center justify-center text-muted">正在搭建 3D 空间…</div> });

const VIEW_LABEL: Record<ViewMode, string> = { '3d': '3D', eye: '平视', top: '顶视量尺' };
const STAGE_LABEL: Record<Stage, string> = { measure: '定水电前', layout: '摆家具', confirm: '准备下单' };
const STAGE_HINT: Record<Stage, string> = {
  measure: '定水电前：按将来家具摆的位置，核对插座、开关该装在哪、装多高。点选餐桌、沙发、床试试。',
  layout: '摆家具：拖动试摆，挡门、挡插座、过道太窄、散热缝不够会实时提醒。',
  confirm: '准备下单：付款或定制前的最后核对，比如入户尺寸、找平后复尺。',
};

const AUTO_SNAPSHOT_MS = 10 * 60 * 1000;

const keyOf = pitfallKey;

let seq = 0;
const newId = (p: string) => `${p}-${Date.now().toString(36)}${(seq++).toString(36)}`;

type Panel = 'catalog' | 'shape' | 'inspect' | null;

export default function Editor({ planId, initialPlan, canEdit }: { planId: string; initialPlan: Plan; canEdit: boolean }) {
  const [s, dispatch] = useReducer(reducer, undefined, (): EditorState => ({
    plan: initialPlan,
    past: [],
    future: [],
    dragBase: null,
    selection: null,
    view: '3d',
    stage: 'layout',
    rev: 0,
  }));
  const { plan, selection } = s;
  const [leftTab, setLeftTab] = useState<'catalog' | 'shape'>('catalog');
  const [mobilePanel, setMobilePanel] = useState<Panel>(null);
  const [sheet, setSheet] = useState<'versions' | 'list' | 'audit' | 'notes' | null>(null);
  /** 点 × 只是这次先收起；重新点选家具后会再出现。点“已核对”才会长期不弹 */
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [versionsKey, setVersionsKey] = useState(0);
  const [stageHint, setStageHint] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  /** 手指 / 鼠标正在 3D 区域操作：底部提示变淡且不可点，松手后恢复 */
  const [interacting, setInteracting] = useState(false);
  useEffect(() => {
    if (!interacting) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const end = () => {
      clearTimeout(t);
      t = setTimeout(() => setInteracting(false), 250);
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      clearTimeout(t);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
  }, [interacting]);
  useEffect(() => {
    if (!stageHint) return;
    const t = setTimeout(() => setStageHint(null), 5000);
    return () => clearTimeout(t);
  }, [stageHint]);

  useEffect(() => {
    track('plan_entered', { planId, template: initialPlan.meta.templateId });
  }, [planId, initialPlan.meta.templateId]);

  // ---------- 选择与空间 ----------
  // 选中点位时，沿用上一次选中的家具作为提醒的上下文，改完高度立刻能看到结果
  const lastItemId = useRef<string | undefined>(undefined);
  if (selection?.kind === 'item') lastItemId.current = selection.id;
  else if (!selection) lastItemId.current = undefined;
  const pickedItem = selection?.kind === 'item' ? plan.furniture.find((f) => f.id === selection.id) : undefined;
  const contextItem = pickedItem ?? plan.furniture.find((f) => f.id === lastItemId.current);
  const selectedItem = pickedItem;
  const selectedAnchor = selection?.kind === 'anchor' ? plan.anchors.find((a) => a.id === selection.id) : undefined;
  const focusRoom = plan.rooms.find((r) => r.id === s.focusRoomId);
  const space = (contextItem && spaceOfItem(plan, contextItem)) ?? focusRoom?.space ?? 'living';
  const roomId = contextItem ? roomOfItem(plan, contextItem) : s.focusRoomId;

  const nearbyAnchors = useMemo(() => {
    if (!selectedItem) return [];
    const polys = toPolygons(selectedItem);
    const rid = roomOfItem(plan, selectedItem);
    return plan.anchors
      .map((a) => {
        const poly = anchorPolygon(a, plan.walls);
        return poly && roomOfAnchor(plan, a.id) === rid ? { anchor: a, distMm: edgeGap(polys, [poly]).gap } : null;
      })
      .filter((x): x is { anchor: Plan['anchors'][number]; distMm: number } => !!x && x.distMm <= 1000)
      .sort((a, b) => a.distMm - b.distMm);
  }, [plan, selectedItem]);

  const collision = useMemo(() => (selectedItem ? collisionsOf(plan, selectedItem) : null), [plan, selectedItem]);
  const collisionText = useMemo(() => {
    if (!collision) return null;
    const names = collision.itemIds.map((id) => plan.furniture.find((f) => f.id === id)).filter(Boolean).map((f) => labelOf(f!));
    const parts = [...new Set(names)];
    if (collision.wall) parts.push('墙体');
    return parts.length ? `和${parts.join('、')}重叠了，挪一下或改小尺寸` : null;
  }, [collision, plan.furniture]);

  // ---------- 避坑求值 ----------
  const interactive = useMemo(
    () =>
      evaluateInteractive(
        PITFALLS,
        { selectedId: contextItem?.id, selectedType: contextItem?.type, roomId, space, stage: s.stage },
        createQuery(plan, { selectedId: contextItem?.id, roomId }),
      ),
    [plan, contextItem?.id, contextItem?.type, roomId, space, s.stage],
  );
  const audit = useMemo(() => auditPlan(PITFALLS, plan, (scope) => createQuery(plan, scope)), [plan]);
  const checks = plan.checks ?? {};
  const visible = interactive.filter((e) => !collapsed.has(keyOf(e)) && !checks[keyOf(e)]);
  const openConflicts = audit.conflicts.filter((c) => !checks[keyOf(c)]);
  const checkedConflicts = audit.totalCount - openConflicts.length;
  const checkInfo = (key: string) => {
    const c = checks[key];
    if (!c) return undefined;
    return { at: c.at, note: plan.notes?.find((n) => n.id === c.noteId)?.text };
  };

  // 换了选中的家具（或取消选中）后，之前点 × 收起的提醒重新可见
  const selItemKey = selection?.kind === 'anchor' ? 'anchor' : (selection?.id ?? null);
  useEffect(() => {
    if (selItemKey !== 'anchor') setCollapsed(new Set());
  }, [selItemKey]);
  const top = visible.find((e) => contextItem || e.pitfall.severity === 'blocking' || (e.layer === 'L2' && e.pitfall.severity === 'costly'));
  const highlight: Highlight | undefined = useMemo(() => {
    if (collision && collision.itemIds.length) return { itemIds: new Set(collision.itemIds), targetIds: new Set() };
    if (!top?.hit) return undefined;
    const h = top.hit;
    return {
      itemIds: new Set(h.fromId ? [h.fromId] : []),
      targetIds: new Set(h.targetId ? [h.targetId] : []),
      witness: h.witness && Number.isFinite(h.valueMm) && h.valueMm > 0 ? h.witness : undefined,
      label: Number.isFinite(h.valueMm) && h.valueMm > 0 ? `${Math.round(h.valueMm / 10)} cm` : undefined,
    };
  }, [top, collision]);

  // 提醒展示 / 被修正 的埋点
  const lastTop = useRef<{ key: string; id: string; itemId?: string } | null>(null);
  const lastRev = useRef(s.rev);
  useEffect(() => {
    const prev = lastTop.current;
    if (prev && s.rev !== lastRev.current && !interactive.some((e) => keyOf(e) === prev.key)) {
      track('pitfall_acted', { pitfall_id: prev.id, action: 'resolved' });
    }
    lastRev.current = s.rev;
    if (top && keyOf(top) !== prev?.key) track('pitfall_shown', { pitfall_id: top.pitfall.id, severity: top.pitfall.severity, layer: top.layer });
    lastTop.current = top ? { key: keyOf(top), id: top.pitfall.id, itemId: top.itemId } : null;
  }, [top, interactive, s.rev]);

  const dismiss = (e: EvaluatedPitfall) => {
    setCollapsed((c) => new Set(c).add(keyOf(e)));
    track('pitfall_dismissed', { pitfall_id: e.pitfall.id });
  };

  const checkPitfall = (e: EvaluatedPitfall, text?: string) => {
    const note: PlanNote | undefined = text
      ? { id: newId('note'), text, createdAt: Date.now(), itemId: e.itemId, pitfallId: e.pitfall.id }
      : undefined;
    dispatch({ type: 'check', key: keyOf(e), on: true, note });
    track('pitfall_acted', { pitfall_id: e.pitfall.id, action: 'checked', with_note: !!text });
  };
  const uncheckPitfall = (e: EvaluatedPitfall) => dispatch({ type: 'check', key: keyOf(e), on: false });

  const addNote = (text: string, link: NoteLink) => {
    dispatch({ type: 'addNote', note: { id: newId('note'), text, createdAt: Date.now(), ...link } });
    track('note_added', { linked: !!(link.itemId || link.anchorId) });
  };
  const noteHandlers = {
    onAdd: addNote,
    onUpdate: (id: string, patch: Partial<PlanNote>) => dispatch({ type: 'updateNote', id, patch }),
    onRemove: (id: string) => dispatch({ type: 'removeNote', id }),
  };
  const todoNotes = (plan.notes ?? []).filter((n) => !n.done && !n.pitfallId).length;

  // ---------- 自动保存 + 自动快照 ----------
  const planRef = useRef(plan);
  planRef.current = plan;
  const lastAutoSnap = useRef(Date.now());
  const savedRev = useRef(0);
  useEffect(() => {
    if (!canEdit || s.rev === savedRev.current || s.dragBase) return;
    try {
      localStorage.setItem(`fitly:draft:${planId}`, JSON.stringify({ at: Date.now(), plan }));
    } catch {
      // 忽略
    }
    setSaveState('saving');
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/plans/${planId}`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ plan: planRef.current }),
        });
        setSaveState(r.ok ? 'saved' : 'error');
        if (r.ok) savedRev.current = s.rev;
        if (r.ok && Date.now() - lastAutoSnap.current > AUTO_SNAPSHOT_MS) {
          lastAutoSnap.current = Date.now();
          const d = new Date();
          await fetch(`/api/plans/${planId}/snapshots`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ plan: planRef.current, label: `自动保存 ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`, auto: true }),
          });
          setVersionsKey((k) => k + 1);
        }
      } catch {
        setSaveState('error');
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [s.rev, s.dragBase, canEdit, planId, plan]);

  // ---------- 操作 ----------
  const addItem = useCallback(
    (type: FurnitureItem['type']) => {
      const cat = CATALOG_BY_TYPE[type];
      if (!cat) return;
      const targetSpace = cat.space;
      const room = (focusRoom?.space === targetSpace ? focusRoom : undefined) ?? plan.rooms.find((r) => r.space === targetSpace) ?? plan.rooms[0];
      const xs = room.polygon.map((p) => p.x);
      const ys = room.polygon.map((p) => p.y);
      const draft: FurnitureItem = {
        id: newId(type),
        type,
        x: Math.round((Math.min(...xs) + Math.max(...xs)) / 2 / 10) * 10,
        y: Math.round((Math.min(...ys) + Math.max(...ys)) / 2 / 10) * 10,
        z: cat.z,
        w: cat.w,
        d: cat.d,
        h: cat.h,
        rotation: 0,
        variant: cat.variant ?? (cat.variants ? cat.variants[0].value : undefined),
        materialPreset: cat.colors[0],
      };
      // 自动找一块不和现有家具、墙重叠的空位
      const spot = findFreeSpot(plan, draft, room.polygon);
      const item = { ...draft, ...spot };
      dispatch({ type: 'addItem', item });
      track('item_added', { type });
      setMobilePanel(null);
    },
    [plan, focusRoom],
  );

  const restore = async (snapshotId: string) => {
    const r = await fetch(`/api/snapshots/${snapshotId}`);
    if (!r.ok) return;
    const snap = await r.json();
    // 笔记和核对记录是“记录”，不随版本回退
    dispatch({ type: 'replace', plan: { ...snap.data, id: plan.id, notes: plan.notes, checks: plan.checks } });
    setSheet(null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? 'redo' : 'undo' });
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedItem && canEdit) {
        dispatch({ type: 'removeItem', id: selectedItem.id });
      } else if (e.key.toLowerCase() === 'r' && selectedItem && canEdit) {
        dispatch({ type: 'updateItem', id: selectedItem.id, patch: { rotation: ((selectedItem.rotation + 90 + 180) % 360) - 180 } });
      } else if (e.key === 'Escape') {
        dispatch({ type: 'select', selection: null });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedItem, canEdit]);

  const setView = (v: ViewMode) => {
    dispatch({ type: 'view', view: v });
    track('view_switched', { view: v });
  };

  const collideWarn = collisionText && <div className="rounded-lg bg-danger-soft px-2.5 py-1.5 text-[13px] text-danger">{collisionText}</div>;

  const inspector = selectedItem ? (
    <>
      {collideWarn && <div className="mx-3.5 mt-3">{collideWarn}</div>}
      <ItemInspector
        key={selectedItem.id}
        item={selectedItem}
        onChange={(patch) => dispatch({ type: 'updateItem', id: selectedItem.id, patch })}
        onRemove={() => dispatch({ type: 'removeItem', id: selectedItem.id })}
        onDuplicate={() => dispatch({ type: 'addItem', item: { ...selectedItem, id: newId(selectedItem.type), x: selectedItem.x + 300, y: selectedItem.y + 300 } })}
        nearby={nearbyAnchors}
        onPickAnchor={(id) => dispatch({ type: 'select', selection: { kind: 'anchor', id } })}
      />
      <LinkedNotes plan={plan} link={{ itemId: selectedItem.id }} {...noteHandlers} />
    </>
  ) : selectedAnchor ? (
    <>
      <AnchorInspector key={selectedAnchor.id} anchor={selectedAnchor} plan={plan} onChange={(patch) => dispatch({ type: 'updateAnchor', id: selectedAnchor.id, patch })} />
      <LinkedNotes plan={plan} link={{ anchorId: selectedAnchor.id }} {...noteHandlers} />
    </>
  ) : (
    <Panel className="text-xs text-muted">
      <p>点一下家具或墙上的插座，可以改尺寸、换款式、改离地高度。</p>
      <p>电脑：按住拖动家具和插座，R 旋转，⌘Z 撤销。手机：长按家具约 0.3 秒拿起后拖动，已选中的直接拖。</p>
      <p>转视角：单指 / 左键拖动空白处；手机上双指扭转也能转，顶视图同样可以；双击地面或家具，就以它为中心转；转乱了点右上角“回正”。</p>
    </Panel>
  );

  const shapePanel = (
    <ShapePanel
      params={plan.shape?.params ?? DEFAULT_SHAPE}
      onChange={(p) => {
        dispatch({ type: 'shape', params: p });
        track('shape_edited');
      }}
    />
  );
  const catalog = <CatalogPanel onAdd={addItem} defaultSpace={space} />;
  const auditTone = openConflicts.some((c) => c.pitfall.severity === 'blocking')
    ? 'font-semibold text-danger'
    : openConflicts.length
      ? 'text-warn-ink'
      : 'text-ok';
  const rotate90 = (it: FurnitureItem) => dispatch({ type: 'updateItem', id: it.id, patch: { rotation: ((it.rotation + 90 + 180) % 360) - 180 } });

  return (
    <div
      className="no-callout flex h-dvh flex-col overflow-hidden"
      onContextMenu={(e) => {
        const tag = (e.target as HTMLElement).tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA') e.preventDefault();
      }}
    >
      <header className="flex min-h-12 flex-none items-center gap-1.5 border-b border-line bg-panel px-2 py-1.5 desk:min-h-[52px] desk:gap-2.5 desk:px-3 desk:py-2">
        <Link href="/" className="text-lg font-extrabold tracking-wide no-underline">
          Fitly
        </Link>
        <input
          className="min-w-0 flex-auto rounded-lg border border-transparent bg-transparent px-2 py-1 font-semibold outline-none hover:border-line focus:border-line desk:max-w-[320px]"
          value={plan.meta.name}
          onChange={(e) => dispatch({ type: 'rename', name: e.target.value })}
          disabled={!canEdit}
          maxLength={40}
        />
        <span className={cn('hidden whitespace-nowrap text-xs desk:inline', saveState === 'error' ? 'text-danger' : 'text-muted')}>
          {!canEdit ? '只读' : saveState === 'saving' ? '保存中…' : saveState === 'saved' ? '已保存' : saveState === 'error' ? '保存失败（已存本机）' : ''}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <IconButton title="撤销" disabled={!s.past.length} onClick={() => dispatch({ type: 'undo' })}>
            ↶
          </IconButton>
          <IconButton title="重做" disabled={!s.future.length} onClick={() => dispatch({ type: 'redo' })}>
            ↷
          </IconButton>
          {canEdit && (
            <Button onClick={() => setSheet('notes')}>
              笔记{todoNotes ? ` ${todoNotes}` : ''}
            </Button>
          )}
          <Button variant="primary" onClick={() => setSheet('versions')}>
            <span className="hidden desk:inline">版本 / </span>分享
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {canEdit && (
          <aside className="hidden w-[280px] flex-none overflow-y-auto border-r border-line bg-panel desk:block">
            <div className="sticky top-0 z-[1] flex border-b border-line bg-panel">
              {(['catalog', 'shape'] as const).map((t) => (
                <button
                  key={t}
                  className={cn('flex-1 border-0 border-b-2 bg-transparent p-2.5', leftTab === t ? 'border-ink font-semibold text-ink' : 'border-transparent text-muted')}
                  onClick={() => setLeftTab(t)}
                >
                  {t === 'catalog' ? '添加家具' : '户型尺寸'}
                </button>
              ))}
            </div>
            {leftTab === 'catalog' ? catalog : shapePanel}
          </aside>
        )}

        <main className="relative min-w-0 flex-1 overflow-hidden">
          <div className="absolute inset-0" onPointerDownCapture={() => setInteracting(true)}>
            <Scene
              plan={plan}
              view={s.view}
              focusRoomId={s.focusRoomId}
              resetKey={resetKey}
              dragging={!!s.dragBase}
              selection={selection}
              highlight={highlight}
              readOnly={!canEdit}
              onSelect={(sel) => {
                dispatch({ type: 'select', selection: sel });
                // 手机上点选不弹整页属性，避免挡住 3D；用底部快捷栏
                if (mobilePanel === 'catalog' || mobilePanel === 'shape') setMobilePanel(null);
              }}
              onAnchorDrag={(phase, id, patch) => {
                if (phase === 'start') dispatch({ type: 'dragStart' });
                else if (phase === 'move' && patch) dispatch({ type: 'dragAnchor', id, patch });
                else if (phase === 'cancel') dispatch({ type: 'dragCancel' });
                else if (phase === 'end') dispatch({ type: 'dragEnd' });
              }}
              onDrag={(phase, id, pos) => {
                if (phase === 'start') dispatch({ type: 'dragStart' });
                else if (phase === 'move' && pos) dispatch({ type: 'dragMove', id, x: pos.x, y: pos.y });
                else if (phase === 'cancel') dispatch({ type: 'dragCancel' });
                else if (phase === 'end') {
                  dispatch({ type: 'dragEnd' });
                  track('item_moved');
                }
              }}
            />
          </div>

          {/* 工具条：手机一行放下（房间用下拉），电脑展开成分段按钮 */}
          <div className="absolute inset-x-2 top-2 z-[15] flex flex-nowrap gap-1.5 desk:inset-x-2.5 desk:top-2.5 desk:flex-wrap desk:gap-2">
            <Seg>
              {(Object.keys(VIEW_LABEL) as ViewMode[]).map((v) => (
                <SegButton key={v} on={s.view === v} onClick={() => setView(v)}>
                  {v === 'top' ? (
                    <>
                      顶视<span className="hidden desk:inline">量尺</span>
                    </>
                  ) : (
                    VIEW_LABEL[v]
                  )}
                </SegButton>
              ))}
            </Seg>
            <PillSelect className="flex-none basis-[76px] desk:hidden" aria-label="房间" value={s.focusRoomId ?? ''} onChange={(e) => dispatch({ type: 'focus', roomId: e.target.value || undefined })}>
              <option value="">全屋</option>
              {plan.rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </PillSelect>
            <div className="hidden desk:block">
            <Seg>
              <SegButton on={!s.focusRoomId} onClick={() => dispatch({ type: 'focus', roomId: undefined })}>
                全屋
              </SegButton>
              {plan.rooms.map((r) => (
                <SegButton key={r.id} on={s.focusRoomId === r.id} onClick={() => dispatch({ type: 'focus', roomId: r.id })}>
                  {r.name}
                </SegButton>
              ))}
            </Seg>
            </div>
            <PillSelect
              className="flex-1 desk:flex-none"
              aria-label="装修阶段"
              value={s.stage}
              onChange={(e) => {
                dispatch({ type: 'stage', stage: e.target.value as Stage });
                setStageHint(STAGE_HINT[e.target.value as Stage]);
                track('stage_switched', { stage: e.target.value });
              }}
            >
              {(Object.keys(STAGE_LABEL) as Stage[]).map((k) => (
                <option key={k} value={k}>
                  阶段：{STAGE_LABEL[k]}
                </option>
              ))}
            </PillSelect>
          </div>

          <button
            className="absolute right-2 top-[50px] z-[15] rounded-full border-0 bg-white/95 px-3 py-[5px] text-xs shadow-float desk:right-2.5 desk:top-[58px] desk:text-[13px]"
            onClick={() => setResetKey((k) => k + 1)}
            title="回到默认视角"
          >
            ⟲ 回正
          </button>

          {stageHint && (
            <button
              className="absolute left-1/2 top-[84px] z-[16] w-[min(440px,calc(100%-16px))] -translate-x-1/2 rounded-xl border-0 bg-ink px-3 py-2.5 text-left text-[13px] text-white shadow-card desk:top-24"
              onClick={() => setStageHint(null)}
            >
              {stageHint}
            </button>
          )}

          <button
            className={cn('absolute left-2 top-[50px] z-[15] rounded-full border-0 bg-white/95 px-3 py-[5px] text-xs shadow-float desk:left-2.5 desk:top-[58px] desk:text-[13px]', auditTone)}
            onClick={() => setSheet('audit')}
          >
            {openConflicts.length === 0 ? (audit.totalCount ? '全屋问题都已核对' : '全屋暂无布局冲突') : `全屋 ${openConflicts.length} 处待处理`}
            {checkedConflicts > 0 && <span className="font-normal text-ok"> · {checkedConflicts} 处已核对</span>}
            <span className="text-xs font-normal text-muted"> · {SPACE_LABEL[space]}</span>
          </button>

          <div
            className={cn(
              'pointer-events-none absolute inset-x-2 bottom-[calc(8px+env(safe-area-inset-bottom))] z-[15] flex flex-col items-center gap-2 transition-opacity duration-200 desk:inset-x-2.5 desk:bottom-2.5',
              interacting ? 'opacity-30' : '*:pointer-events-auto',
            )}
          >
            {top && (
              <PitfallCard
                key={keyOf(top)}
                top={top}
                restCount={visible.length - 1}
                onDismiss={() => dismiss(top)}
                onOpenList={() => setSheet('list')}
                onCopy={() => track('pitfall_acted', { pitfall_id: top.pitfall.id, action: 'copy_ask' })}
                onCheck={(note) => checkPitfall(top, note)}
              />
            )}
            {!top && visible.length > 0 && (
              <button className="rounded-full border-0 bg-white/95 px-3.5 py-1.5 shadow-card" onClick={() => setSheet('list')}>
                {SPACE_LABEL[space]}有 {visible.length} 条值得核对的提醒 ›
              </button>
            )}

            {/* 手机：选中后的快捷栏，完整属性点“更多”再展开 */}
            {canEdit && selectedItem && !mobilePanel && (
              <div className="flex w-full flex-col gap-1.5 rounded-[14px] bg-panel px-3 py-2.5 shadow-card desk:hidden">
                {collideWarn}
                <div className="flex items-center gap-2">
                  <strong>{labelOf(selectedItem)}</strong>
                  <span className="text-xs text-muted">
                    {Math.round(selectedItem.w / 10)}×{Math.round(selectedItem.d / 10)} cm
                  </span>
                  <Chip className="ml-auto" on onClick={() => dispatch({ type: 'select', selection: null })}>
                    完成
                  </Chip>
                </div>
                <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
                  {CATALOG_BY_TYPE[selectedItem.type]?.presets?.map((p) => (
                    <Chip
                      key={p.label}
                      on={p.w === selectedItem.w && p.d === selectedItem.d}
                      onClick={() => dispatch({ type: 'updateItem', id: selectedItem.id, patch: { w: p.w, d: p.d, h: p.h } })}
                    >
                      {p.label}
                    </Chip>
                  ))}
                  <Chip onClick={() => rotate90(selectedItem)}>⟳ 转 90°</Chip>
                  <Chip onClick={() => setMobilePanel('inspect')}>更多…</Chip>
                </div>
              </div>
            )}
            {canEdit && selectedAnchor && !mobilePanel && (
              <div className="flex w-full items-center gap-2 rounded-[14px] bg-panel px-3 py-2.5 shadow-card desk:hidden">
                <strong>{ANCHOR_LABEL[selectedAnchor.kind]}</strong>
                <span className="text-xs text-muted">
                  离地 {selectedAnchor.heightMm ?? '?'} mm · {selectedAnchor.confirmed ? '已确认' : '示例位置'}
                </span>
                <Chip className="ml-auto" onClick={() => setMobilePanel('inspect')}>
                  改高度
                </Chip>
                <Chip on onClick={() => dispatch({ type: 'select', selection: null })}>
                  完成
                </Chip>
              </div>
            )}
            {/* 选中时底部导航让位给快捷栏，点“完成”回来 */}
            {canEdit && !(selection && !mobilePanel) && (
              <nav className="flex gap-1.5 rounded-xl bg-white/95 p-1 shadow-card desk:hidden">
                {(
                  [
                    ['catalog', '家具'],
                    ['shape', '户型'],
                    ['inspect', '属性'],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    disabled={k === 'inspect' && !selection}
                    className={cn('rounded-lg border-0 px-3.5 py-1.5', mobilePanel === k ? 'bg-ink text-white' : 'bg-transparent')}
                    onClick={() => setMobilePanel(mobilePanel === k ? null : k)}
                  >
                    {label}
                  </button>
                ))}
                <button className="rounded-lg border-0 bg-transparent px-3.5 py-1.5" onClick={() => setSheet('notes')}>
                  笔记{todoNotes ? <span className="ml-1 rounded-full bg-danger px-1.5 text-[11px] text-white">{todoNotes}</span> : null}
                </button>
              </nav>
            )}
          </div>

          {mobilePanel && canEdit && (
            <div className="absolute inset-x-0 bottom-0 z-20 max-h-[52dvh] overflow-y-auto rounded-t-2xl bg-panel pb-[env(safe-area-inset-bottom)] shadow-sheet desk:hidden">
              <SheetHead
                className="sticky top-0 z-[1] bg-panel"
                title={mobilePanel === 'catalog' ? '添加家具' : mobilePanel === 'shape' ? '户型尺寸' : '属性'}
                onClose={() => setMobilePanel(null)}
              />
              {mobilePanel === 'catalog' ? catalog : mobilePanel === 'shape' ? shapePanel : inspector}
            </div>
          )}
        </main>

        {canEdit && <aside className="hidden w-[280px] flex-none overflow-y-auto border-l border-line bg-panel desk:block">{inspector}</aside>}
      </div>

      {sheet && (
        <Overlay onClose={() => setSheet(null)}>
          {sheet === 'versions' && (
            <Versions planId={planId} getPlan={() => planRef.current} canEdit={canEdit} onRestore={restore} onClose={() => setSheet(null)} refreshKey={versionsKey} />
          )}
          {sheet === 'list' && (
            <PitfallList
              title={`${SPACE_LABEL[space]} · ${STAGE_LABEL[s.stage]}的提醒`}
              items={interactive}
              onClose={() => setSheet(null)}
              empty="当前没有提醒。"
              checkOf={checkInfo}
              onCheck={canEdit ? checkPitfall : undefined}
              onUncheck={canEdit ? uncheckPitfall : undefined}
            />
          )}
          {sheet === 'audit' && (
            <PitfallList
              title="全屋布局问题（按你家尺寸实测）"
              items={audit.conflicts}
              onPick={(e) => {
                if (e.itemId) dispatch({ type: 'select', selection: { kind: 'item', id: e.itemId } });
              }}
              onClose={() => setSheet(null)}
              empty="没有发现会挡门、挡插座或过道太窄的问题。点选家具还能看到下单前该核对的事项。"
              checkOf={checkInfo}
              onCheck={canEdit ? checkPitfall : undefined}
              onUncheck={canEdit ? uncheckPitfall : undefined}
            />
          )}
          {sheet === 'notes' && (
            <NotesSheet
              plan={plan}
              current={{
                itemId: selectedItem?.id,
                anchorId: selectedAnchor?.id,
                name: selectedItem ? labelOf(selectedItem) : selectedAnchor ? linkLabel(plan, { id: '', text: '', createdAt: 0, anchorId: selectedAnchor.id }) : null,
              }}
              {...noteHandlers}
              onPick={(link) => {
                if (link.itemId) dispatch({ type: 'select', selection: { kind: 'item', id: link.itemId } });
                else if (link.anchorId) dispatch({ type: 'select', selection: { kind: 'anchor', id: link.anchorId } });
                setSheet(null);
              }}
              onClose={() => setSheet(null)}
            />
          )}
        </Overlay>
      )}
    </div>
  );
}
