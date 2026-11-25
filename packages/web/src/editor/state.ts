import type { Anchor, FurnitureItem, Plan, PlanNote, ShapeParams, Stage } from '@fitly/layout-engine';
import { applyShape } from '@fitly/layout-engine';
import type { ViewMode } from '@/scene/Scene';

export type Selection = { kind: 'item' | 'anchor'; id: string } | null;

export interface EditorState {
  plan: Plan;
  past: Plan[];
  future: Plan[];
  /** 拖拽开始前的方案，拖拽结束时入撤销栈 */
  dragBase: Plan | null;
  selection: Selection;
  view: ViewMode;
  focusRoomId?: string;
  stage: Stage;
  /** 每次用户改动 +1，用于自动保存 */
  rev: number;
}

export type Action =
  | { type: 'select'; selection: Selection }
  | { type: 'view'; view: ViewMode }
  | { type: 'focus'; roomId?: string }
  | { type: 'stage'; stage: Stage }
  | { type: 'dragStart' }
  | { type: 'dragMove'; id: string; x: number; y: number }
  | { type: 'dragEnd' }
  | { type: 'dragCancel' }
  | { type: 'dragAnchor'; id: string; patch: Partial<Anchor> }
  | { type: 'updateItem'; id: string; patch: Partial<FurnitureItem> }
  | { type: 'updateAnchor'; id: string; patch: Partial<Anchor> }
  | { type: 'addItem'; item: FurnitureItem }
  | { type: 'removeItem'; id: string }
  | { type: 'shape'; params: ShapeParams }
  | { type: 'rename'; name: string }
  | { type: 'replace'; plan: Plan }
  | { type: 'check'; key: string; on: boolean; note?: PlanNote }
  | { type: 'addNote'; note: PlanNote }
  | { type: 'updateNote'; id: string; patch: Partial<PlanNote> }
  | { type: 'removeNote'; id: string }
  | { type: 'undo' }
  | { type: 'redo' };

const HISTORY = 80;

function commit(s: EditorState, plan: Plan, base: Plan = s.plan): EditorState {
  return { ...s, plan, past: [...s.past, base].slice(-HISTORY), future: [], rev: s.rev + 1 };
}

export function reducer(s: EditorState, a: Action): EditorState {
  switch (a.type) {
    case 'select':
      return { ...s, selection: a.selection };
    case 'view':
      return { ...s, view: a.view };
    case 'focus':
      return { ...s, focusRoomId: a.roomId };
    case 'stage':
      return { ...s, stage: a.stage };
    case 'dragStart':
      return { ...s, dragBase: s.plan };
    case 'dragMove':
      return {
        ...s,
        plan: { ...s.plan, furniture: s.plan.furniture.map((f) => (f.id === a.id ? { ...f, x: a.x, y: a.y } : f)) },
      };
    case 'dragAnchor':
      return { ...s, plan: { ...s.plan, anchors: s.plan.anchors.map((x) => (x.id === a.id ? { ...x, ...a.patch } : x)) } };
    case 'dragEnd': {
      if (!s.dragBase) return s;
      const moved =
        s.dragBase !== s.plan &&
        (JSON.stringify(s.dragBase.furniture) !== JSON.stringify(s.plan.furniture) || JSON.stringify(s.dragBase.anchors) !== JSON.stringify(s.plan.anchors));
      if (!moved) return { ...s, dragBase: null };
      return { ...commit(s, s.plan, s.dragBase), dragBase: null };
    }
    case 'dragCancel':
      return s.dragBase ? { ...s, plan: s.dragBase, dragBase: null } : s;
    case 'updateItem':
      return commit(s, { ...s.plan, furniture: s.plan.furniture.map((f) => (f.id === a.id ? { ...f, ...a.patch } : f)) });
    case 'updateAnchor':
      return commit(s, { ...s.plan, anchors: s.plan.anchors.map((x) => (x.id === a.id ? { ...x, ...a.patch } : x)) });
    case 'addItem':
      return { ...commit(s, { ...s.plan, furniture: [...s.plan.furniture, a.item] }), selection: { kind: 'item', id: a.item.id } };
    case 'removeItem':
      return { ...commit(s, { ...s.plan, furniture: s.plan.furniture.filter((f) => f.id !== a.id) }), selection: null };
    case 'shape':
      return commit(s, applyShape(s.plan, a.params));
    case 'rename':
      return { ...s, plan: { ...s.plan, meta: { ...s.plan.meta, name: a.name } }, rev: s.rev + 1 };
    case 'replace':
      return commit(s, a.plan);
    case 'check': {
      const checks = { ...(s.plan.checks ?? {}) };
      let notes = s.plan.notes ?? [];
      if (a.on) {
        checks[a.key] = { at: Date.now(), noteId: a.note?.id };
        if (a.note) notes = [a.note, ...notes];
      } else {
        delete checks[a.key];
      }
      return commit(s, { ...s.plan, checks, notes });
    }
    case 'addNote':
      return commit(s, { ...s.plan, notes: [a.note, ...(s.plan.notes ?? [])] });
    case 'updateNote':
      return commit(s, { ...s.plan, notes: (s.plan.notes ?? []).map((n) => (n.id === a.id ? { ...n, ...a.patch } : n)) });
    case 'removeNote':
      return commit(s, { ...s.plan, notes: (s.plan.notes ?? []).filter((n) => n.id !== a.id) });
    case 'undo': {
      const prev = s.past[s.past.length - 1];
      if (!prev) return s;
      return { ...s, plan: prev, past: s.past.slice(0, -1), future: [s.plan, ...s.future], rev: s.rev + 1 };
    }
    case 'redo': {
      const next = s.future[0];
      if (!next) return s;
      return { ...s, plan: next, past: [...s.past, s.plan], future: s.future.slice(1), rev: s.rev + 1 };
    }
  }
}
