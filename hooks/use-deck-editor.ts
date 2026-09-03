'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { createDemoDeck } from '@/lib/deck/demo-deck';
import { composeDeckFromPlan, reviseSlideFromBrief } from '@/lib/deck/design-system';
import {
  addElementsToSlide,
  addSlideToDeck,
  arrangeSlideElements,
  composeSlides as composeSlideOperation,
  createBlankSlide,
  createId,
  createSlideFromTemplateLayout,
  getElements,
  getSlide,
  moveSlideAfter,
  removeElementsFromSlide,
  updateSlideElements,
} from '@/lib/deck/operations';
import type {
  ActivityItem,
  Actor,
  AgentElementInput,
  ArrangeOperation,
  Deck,
  DeckPlan,
  EditCategory,
  EditDelta,
  EditorSnapshot,
  ElementPatch,
  Selection,
  SlideCompositionInput,
  SlideBrief,
  SlideEditInput,
  SlideElement,
} from '@/lib/deck/types';

const STORAGE_KEY = 'deckhand.deck.v1';
const MAX_HISTORY = 40;

interface MutationMeta {
  actor: Actor;
  action: string;
  summary: string;
  toolName?: string;
  deltas?: Omit<EditDelta, 'id' | 'actor' | 'timestamp'>[];
}

export type WebMcpStatus = 'checking' | 'ready' | 'unavailable' | 'error';

export interface DeckEditorController {
  deck: Deck;
  deckRef: React.RefObject<Deck>;
  currentSlideId: string;
  currentSlideIdRef: React.RefObject<string>;
  selection: Selection;
  selectionRef: React.RefObject<Selection>;
  activity: ActivityItem[];
  recentHumanEdits: EditDelta[];
  recentHumanEditsRef: React.RefObject<EditDelta[]>;
  canUndo: boolean;
  canRedo: boolean;
  webMcpStatus: WebMcpStatus;
  setWebMcpStatus: (status: WebMcpStatus) => void;
  setCurrentSlide: (slideId: string) => void;
  setSelection: (slideId: string, elementIds: string[]) => void;
  toggleSelection: (slideId: string, elementId: string) => void;
  clearSelection: () => void;
  renameDeck: (title: string) => void;
  updateElements: (
    slideId: string,
    changes: Array<{ elementId: string; patch: ElementPatch }>,
    meta?: Partial<MutationMeta>,
  ) => Deck;
  addElements: (slideId: string, elements: AgentElementInput[], meta?: Partial<MutationMeta>) => string[];
  deleteElements: (slideId: string, elementIds: string[], meta?: Partial<MutationMeta>) => void;
  arrangeElements: (slideId: string, elementIds: string[], operation: ArrangeOperation, actor?: Actor) => void;
  composeSlides: (
    slides: SlideCompositionInput[],
    options: { mode: 'append' | 'replace'; afterSlideId?: string; deckTitle?: string },
    actor?: Actor,
  ) => { slideIds: string[]; warnings: string[] };
  composeDeckPlan: (
    plan: DeckPlan,
    options: { mode: 'append' | 'replace'; afterSlideId?: string },
    actor?: Actor,
  ) => { slideIds: string[] };
  reviseSlide: (slideId: string, brief: SlideBrief, actor?: Actor) => void;
  editSlide: (slideId: string, input: SlideEditInput, actor?: Actor) => string[];
  createSlide: (title: string, layout: 'title' | 'statement' | 'two_column' | 'blank', afterSlideId?: string, actor?: Actor) => string;
  createSlideFromImportedLayout: (layoutId: string, title?: string, afterSlideId?: string, actor?: Actor) => string;
  duplicateSlide: (slideId: string, actor?: Actor) => string;
  deleteSlide: (slideId: string, actor?: Actor) => void;
  reorderSlide: (slideId: string, afterSlideId?: string, actor?: Actor) => void;
  applyTheme: (input: { accent?: string; background?: string; density?: Deck['grammar']['density']; target?: 'deck' | 'current_slide' }, actor?: Actor) => void;
  propagateHumanEdits: (sourceSlideId: string, targetSlideIds?: string[], include?: EditCategory[]) => number;
  undo: (actor?: Actor) => boolean;
  redo: () => void;
  resetDemo: () => void;
  replaceDeck: (deck: Deck, summary?: string) => void;
  exportDeck: () => void;
  importDeck: (deck: Deck) => void;
  addActivity: (item: Omit<ActivityItem, 'id' | 'timestamp'>) => void;
}

const initialDeck = createDemoDeck();

const makeActivity = (item: Omit<ActivityItem, 'id' | 'timestamp'>): ActivityItem => ({
  ...item,
  id: createId('activity'),
  timestamp: Date.now(),
});

export function useDeckEditor(): DeckEditorController {
  const [deck, setDeck] = useState<Deck>(initialDeck);
  const deckRef = useRef<Deck>(initialDeck);
  const [currentSlideId, setCurrentSlideId] = useState(initialDeck.slides[0].id);
  const currentSlideIdRef = useRef(currentSlideId);
  const [selection, setSelectionState] = useState<Selection>({
    slideId: initialDeck.slides[0].id,
    elementIds: [],
  });
  const selectionRef = useRef(selection);
  const [activity, setActivity] = useState<ActivityItem[]>([
    {
      id: 'activity-initial',
      actor: 'system',
      action: 'ready',
      summary: 'Semantic canvas ready for humans and agents.',
      timestamp: 0,
    },
  ]);
  const [recentHumanEdits, setRecentHumanEdits] = useState<EditDelta[]>([]);
  const recentHumanEditsRef = useRef<EditDelta[]>([]);
  const undoRef = useRef<EditorSnapshot[]>([]);
  const redoRef = useRef<EditorSnapshot[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [webMcpStatus, setWebMcpStatus] = useState<WebMcpStatus>('checking');

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved) as Deck;
      if (!parsed.slides?.length || !parsed.theme || !parsed.grammar) return;
      queueMicrotask(() => {
        deckRef.current = parsed;
        setDeck(parsed);
        const firstId = parsed.slides[0].id;
        currentSlideIdRef.current = firstId;
        setCurrentSlideId(firstId);
        const nextSelection = { slideId: firstId, elementIds: [] };
        selectionRef.current = nextSelection;
        setSelectionState(nextSelection);
      });
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(deck));
  }, [deck]);

  const addActivity = useCallback((item: Omit<ActivityItem, 'id' | 'timestamp'>) => {
    setActivity((items) => [makeActivity(item), ...items].slice(0, 30));
  }, []);

  const commit = useCallback((updater: (current: Deck) => Deck, meta: MutationMeta): Deck => {
    const previous = deckRef.current;
    const next = updater(previous);
    if (next === previous) return previous;
    undoRef.current = [...undoRef.current.slice(-(MAX_HISTORY - 1)), {
      deck: previous,
      selection: selectionRef.current,
    }];
    redoRef.current = [];
    setCanUndo(true);
    setCanRedo(false);
    deckRef.current = next;
    setDeck(next);
    addActivity({ actor: meta.actor, action: meta.action, summary: meta.summary, toolName: meta.toolName });

    if (meta.actor === 'human' && meta.deltas?.length) {
      const now = Date.now();
      const deltas = meta.deltas.map((delta) => ({
        ...delta,
        id: createId('edit'),
        actor: 'human' as const,
        timestamp: now,
      }));
      recentHumanEditsRef.current = [...deltas, ...recentHumanEditsRef.current].slice(0, 24);
      setRecentHumanEdits(recentHumanEditsRef.current);
    }
    return next;
  }, [addActivity]);

  const setCurrentSlide = useCallback((slideId: string) => {
    getSlide(deckRef.current, slideId);
    currentSlideIdRef.current = slideId;
    setCurrentSlideId(slideId);
    const next = { slideId, elementIds: [] };
    selectionRef.current = next;
    setSelectionState(next);
  }, []);

  const setSelection = useCallback((slideId: string, elementIds: string[]) => {
    getElements(deckRef.current, slideId, elementIds);
    if (currentSlideIdRef.current !== slideId) {
      currentSlideIdRef.current = slideId;
      setCurrentSlideId(slideId);
    }
    const next = { slideId, elementIds: [...new Set(elementIds)] };
    selectionRef.current = next;
    setSelectionState(next);
  }, []);

  const toggleSelection = useCallback((slideId: string, elementId: string) => {
    getElements(deckRef.current, slideId, [elementId]);
    const current = selectionRef.current.slideId === slideId ? selectionRef.current.elementIds : [];
    const nextIds = current.includes(elementId)
      ? current.filter((id) => id !== elementId)
      : [...current, elementId];
    const next = { slideId, elementIds: nextIds };
    selectionRef.current = next;
    setSelectionState(next);
  }, []);

  const clearSelection = useCallback(() => {
    const next = { slideId: currentSlideIdRef.current, elementIds: [] };
    selectionRef.current = next;
    setSelectionState(next);
  }, []);

  const renameDeck = useCallback((title: string) => {
    const trimmed = title.trim();
    if (!trimmed || trimmed === deckRef.current.title) return;
    commit(
      (current) => ({ ...current, title: trimmed, updatedAt: new Date().toISOString(), version: current.version + 1 }),
      { actor: 'human', action: 'rename_deck', summary: `Renamed deck to “${trimmed}”.` },
    );
  }, [commit]);

  const updateElements = useCallback((
    slideId: string,
    changes: Array<{ elementId: string; patch: ElementPatch }>,
    meta: Partial<MutationMeta> = {},
  ) => {
    const sourceElements = getElements(deckRef.current, slideId, changes.map((change) => change.elementId));
    const deltas: MutationMeta['deltas'] = [];
    changes.forEach((change) => {
      const before = sourceElements.find((element) => element.id === change.elementId)!;
      Object.entries(change.patch).forEach(([field, after]) => {
        if (field === 'style') {
          Object.entries(change.patch.style ?? {}).forEach(([styleField, styleAfter]) => {
            deltas.push({
              slideId, elementId: before.id, elementRole: before.role,
              category: styleField.startsWith('font') || styleField === 'lineHeight' || styleField === 'letterSpacing' ? 'typography' : 'style',
              field: `style.${styleField}`,
              before: before.style[styleField as keyof typeof before.style], after: styleAfter,
            });
          });
        } else {
          const category: EditCategory = field === 'x' || field === 'y'
            ? 'position'
            : field === 'width' || field === 'height'
              ? 'size'
              : field === 'content'
                ? 'content'
                : 'style';
          deltas.push({
            slideId, elementId: before.id, elementRole: before.role, category, field,
            before: before[field as keyof SlideElement], after,
          });
        }
      });
    });
    return commit(
      (current) => updateSlideElements(current, slideId, changes),
      {
        actor: meta.actor ?? 'human',
        action: meta.action ?? 'update_elements',
        summary: meta.summary ?? `Updated ${changes.length} element${changes.length === 1 ? '' : 's'} on ${slideId}.`,
        toolName: meta.toolName,
        deltas,
      },
    );
  }, [commit]);

  const addElements = useCallback((slideId: string, elements: AgentElementInput[], meta: Partial<MutationMeta> = {}) => {
    const existingIds = new Set(getSlide(deckRef.current, slideId).elements.map((element) => element.id));
    const normalizedElements = elements.map((input) => {
      const requestedId = input.id?.trim();
      const id = requestedId && !existingIds.has(requestedId) ? requestedId : createId(input.type);
      existingIds.add(id);
      return { ...input, id };
    });
    const ids = normalizedElements.map((input) => input.id);
    commit(
      (current) => addElementsToSlide(current, slideId, normalizedElements).deck,
      {
        actor: meta.actor ?? 'human', action: meta.action ?? 'add_elements',
        summary: meta.summary ?? `Added ${elements.length} element${elements.length === 1 ? '' : 's'} to ${slideId}.`,
        toolName: meta.toolName,
        deltas: normalizedElements.map((input, index) => ({
          slideId, elementId: ids[index], elementRole: input.role, category: 'structure', field: 'create', after: input.type,
        })),
      },
    );
    setSelection(slideId, ids);
    return ids;
  }, [commit, setSelection]);

  const deleteElements = useCallback((slideId: string, elementIds: string[], meta: Partial<MutationMeta> = {}) => {
    const source = getElements(deckRef.current, slideId, elementIds);
    commit(
      (current) => removeElementsFromSlide(current, slideId, elementIds),
      {
        actor: meta.actor ?? 'human', action: meta.action ?? 'delete_elements',
        summary: meta.summary ?? `Removed ${elementIds.length} element${elementIds.length === 1 ? '' : 's'} from ${slideId}.`,
        toolName: meta.toolName,
        deltas: source.map((item) => ({ slideId, elementId: item.id, elementRole: item.role, category: 'structure', field: 'delete', before: item.type })),
      },
    );
    clearSelection();
  }, [clearSelection, commit]);

  const arrangeElements = useCallback((slideId: string, elementIds: string[], operation: ArrangeOperation, actor: Actor = 'human') => {
    commit(
      (current) => arrangeSlideElements(current, slideId, elementIds, operation),
      { actor, action: 'arrange_elements', toolName: actor === 'agent' ? 'arrange_elements' : undefined, summary: `${operation.replaceAll('_', ' ')} for ${elementIds.length} elements.` },
    );
  }, [commit]);

  const composeSlides = useCallback((
    slides: SlideCompositionInput[],
    options: { mode: 'append' | 'replace'; afterSlideId?: string; deckTitle?: string },
    actor: Actor = 'agent',
  ) => {
    const result = composeSlideOperation(deckRef.current, slides, options);
    commit(() => result.deck, {
      actor,
      action: 'compose_slides',
      toolName: actor === 'agent' ? 'compose_slides' : undefined,
      summary: `${options.mode === 'replace' ? 'Rebuilt the deck with' : 'Added'} ${result.slideIds.length} composed slide${result.slideIds.length === 1 ? '' : 's'} in one operation.`,
    });
    setCurrentSlide(result.slideIds[0]);
    return { slideIds: result.slideIds, warnings: result.warnings };
  }, [commit, setCurrentSlide]);

  const composeDeckPlan = useCallback((
    plan: DeckPlan,
    options: { mode: 'append' | 'replace'; afterSlideId?: string },
    actor: Actor = 'agent',
  ) => {
    const beforeIds = new Set(deckRef.current.slides.map((slide) => slide.id));
    const next = composeDeckFromPlan(deckRef.current, plan, options);
    const slideIds = options.mode === 'replace'
      ? next.slides.map((slide) => slide.id)
      : next.slides.filter((slide) => !beforeIds.has(slide.id)).map((slide) => slide.id);
    commit(() => next, {
      actor,
      action: 'compose_deck',
      toolName: actor === 'agent' ? 'compose_deck' : undefined,
      summary: `Composed ${slideIds.length} slides from plan “${plan.title}” with the ${plan.designSource.replace('_', ' ')} design system.`,
    });
    if (slideIds[0]) setCurrentSlide(slideIds[0]);
    return { slideIds };
  }, [commit, setCurrentSlide]);

  const reviseSlide = useCallback((slideId: string, brief: SlideBrief, actor: Actor = 'agent') => {
    const next = reviseSlideFromBrief(deckRef.current, slideId, brief);
    commit(() => next, {
      actor,
      action: 'revise_slide',
      toolName: actor === 'agent' ? 'revise_slide' : undefined,
      summary: `Recomposed “${brief.takeaway}” from its semantic brief.`,
    });
    setCurrentSlide(slideId);
  }, [commit, setCurrentSlide]);

  const editSlide = useCallback((slideId: string, input: SlideEditInput, actor: Actor = 'agent') => {
    getSlide(deckRef.current, slideId);
    const existingIds = new Set(getSlide(deckRef.current, slideId).elements.map((element) => element.id));
    const additions = (input.additions ?? []).map((addition) => {
      const requestedId = addition.id?.trim();
      const id = requestedId && !existingIds.has(requestedId) ? requestedId : createId(addition.type);
      existingIds.add(id);
      return { ...addition, id };
    });
    const touchedIds = new Set<string>([
      ...additions.map((addition) => addition.id),
      ...(input.updates ?? []).map((update) => update.elementId),
      ...(input.arrangements ?? []).flatMap((arrangement) => arrangement.elementIds),
    ]);
    (input.removeElementIds ?? []).forEach((id) => touchedIds.delete(id));

    commit((current) => {
      let next = current;
      if (additions.length) next = addElementsToSlide(next, slideId, additions).deck;
      if (input.updates?.length) next = updateSlideElements(next, slideId, input.updates);
      for (const arrangement of input.arrangements ?? []) {
        next = arrangeSlideElements(next, slideId, arrangement.elementIds, arrangement.operation);
      }
      if (input.removeElementIds?.length) next = removeElementsFromSlide(next, slideId, input.removeElementIds);
      if (input.slideTitle !== undefined || input.background !== undefined || input.notes !== undefined) {
        next = {
          ...next,
          slides: next.slides.map((slide) => slide.id === slideId ? {
            ...slide,
            title: input.slideTitle?.trim() || slide.title,
            background: input.background ?? slide.background,
            notes: input.notes ?? slide.notes,
          } : slide),
        };
      }
      return { ...next, version: current.version + 1, updatedAt: new Date().toISOString() };
    }, {
      actor,
      action: 'edit_slide',
      toolName: actor === 'agent' ? 'edit_slide' : undefined,
      summary: `Applied one atomic scene edit to ${slideId}.`,
    });

    const selectedIds = [...touchedIds];
    if (selectedIds.length) setSelection(slideId, selectedIds);
    else setCurrentSlide(slideId);
    return selectedIds;
  }, [commit, setCurrentSlide, setSelection]);

  const createSlide = useCallback((title: string, layout: 'title' | 'statement' | 'two_column' | 'blank', afterSlideId?: string, actor: Actor = 'human') => {
    const slide = createBlankSlide(deckRef.current, title, layout);
    commit(
      (current) => addSlideToDeck(current, slide, afterSlideId),
      { actor, action: 'create_slide', toolName: actor === 'agent' ? 'create_slide' : undefined, summary: `Created “${title}” with a ${layout.replace('_', ' ')} layout.` },
    );
    setCurrentSlide(slide.id);
    return slide.id;
  }, [commit, setCurrentSlide]);

  const createSlideFromImportedLayout = useCallback((layoutId: string, title?: string, afterSlideId?: string, actor: Actor = 'human') => {
    const layout = deckRef.current.importedTemplate?.layouts.find((candidate) => candidate.id === layoutId);
    if (!layout) throw new Error(`Imported layout "${layoutId}" was not found. Inspect the design grammar for valid layout IDs.`);
    const slide = createSlideFromTemplateLayout(deckRef.current, layout, title?.trim() || layout.name);
    commit(
      (current) => addSlideToDeck(current, slide, afterSlideId),
      {
        actor,
        action: 'create_slide',
        toolName: actor === 'agent' ? 'create_slide' : undefined,
        summary: `Created “${slide.title}” from imported layout “${layout.name}”.`,
      },
    );
    setCurrentSlide(slide.id);
    return slide.id;
  }, [commit, setCurrentSlide]);

  const duplicateSlide = useCallback((slideId: string, actor: Actor = 'human') => {
    const source = getSlide(deckRef.current, slideId);
    const id = createId('slide');
    const clone = {
      ...structuredClone(source), id, title: `${source.title} copy`,
      elements: source.elements.map((item) => ({ ...item, id: `${id}-${item.id}` })),
    };
    commit(
      (current) => addSlideToDeck(current, clone, slideId),
      { actor, action: 'duplicate_slide', summary: `Duplicated “${source.title}”.` },
    );
    setCurrentSlide(id);
    return id;
  }, [commit, setCurrentSlide]);

  const deleteSlide = useCallback((slideId: string, actor: Actor = 'human') => {
    if (deckRef.current.slides.length === 1) throw new Error('A deck must contain at least one slide.');
    const index = deckRef.current.slides.findIndex((slide) => slide.id === slideId);
    const fallback = deckRef.current.slides[Math.max(0, index - 1)].id;
    commit(
      (current) => ({ ...current, version: current.version + 1, updatedAt: new Date().toISOString(), slides: current.slides.filter((slide) => slide.id !== slideId) }),
      { actor, action: 'delete_slide', toolName: actor === 'agent' ? 'manage_deck' : undefined, summary: `Deleted slide ${index + 1}.` },
    );
    setCurrentSlide(fallback);
  }, [commit, setCurrentSlide]);

  const reorderSlide = useCallback((slideId: string, afterSlideId?: string, actor: Actor = 'agent') => {
    commit(
      (current) => moveSlideAfter(current, slideId, afterSlideId),
      { actor, action: 'reorder_slide', toolName: actor === 'agent' ? 'reorder_slide' : undefined, summary: `Moved ${slideId}${afterSlideId ? ` after ${afterSlideId}` : ' to the beginning'}.` },
    );
  }, [commit]);

  const applyTheme = useCallback((input: { accent?: string; background?: string; density?: Deck['grammar']['density']; target?: 'deck' | 'current_slide' }, actor: Actor = 'agent') => {
    const target = input.target ?? 'deck';
    commit((current) => {
      const oldAccent = current.theme.accent;
      const accent = input.accent ?? oldAccent;
      const slideIds = target === 'current_slide' ? new Set([currentSlideIdRef.current]) : new Set(current.slides.map((slide) => slide.id));
      return {
        ...current,
        version: current.version + 1,
        updatedAt: new Date().toISOString(),
        theme: { ...current.theme, accent, canvas: input.background ?? current.theme.canvas },
        grammar: { ...current.grammar, density: input.density ?? current.grammar.density },
        slides: current.slides.map((slide) => slideIds.has(slide.id) ? {
          ...slide,
          background: input.background ?? slide.background,
          elements: slide.elements.map((item) => ({
            ...item,
            style: {
              ...item.style,
              color: item.style.color === oldAccent ? accent : item.style.color,
              fill: item.style.fill === oldAccent ? accent : item.style.fill,
              stroke: item.style.stroke === oldAccent ? accent : item.style.stroke,
            },
          })),
        } : slide),
      };
    }, {
      actor, action: 'apply_theme', toolName: actor === 'agent' ? 'apply_theme' : undefined,
      summary: `Applied ${target === 'deck' ? 'deck-wide' : 'slide'} design tokens${input.density ? ` with ${input.density} density` : ''}.`,
    });
  }, [commit]);

  const propagateHumanEdits = useCallback((sourceSlideId: string, targetSlideIds?: string[], include: EditCategory[] = ['position', 'size', 'typography', 'style']) => {
    const latestByRoleAndField = new Map<string, EditDelta>();
    recentHumanEditsRef.current
      .filter((edit) => edit.slideId === sourceSlideId && include.includes(edit.category) && edit.elementRole)
      .forEach((edit) => {
        const key = `${edit.elementRole}:${edit.field}`;
        if (!latestByRoleAndField.has(key)) latestByRoleAndField.set(key, edit);
      });
    if (!latestByRoleAndField.size) {
      throw new Error(`No recent human style or geometry edits found on ${sourceSlideId}. Make a direct edit first.`);
    }
    const targetSet = new Set(targetSlideIds?.length ? targetSlideIds : deckRef.current.slides.filter((slide) => slide.id !== sourceSlideId).map((slide) => slide.id));
    let changed = 0;
    commit((current) => ({
      ...current,
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
      slides: current.slides.map((slide) => {
        if (!targetSet.has(slide.id)) return slide;
        return {
          ...slide,
          elements: slide.elements.map((item) => {
            const applicable = [...latestByRoleAndField.values()].filter((edit) => edit.elementRole === item.role);
            if (!applicable.length) return item;
            changed += 1;
            const next = { ...item, style: { ...item.style } };
            applicable.forEach((edit) => {
              if (edit.field.startsWith('style.')) {
                const styleField = edit.field.slice(6) as keyof SlideElement['style'];
                Object.assign(next.style, { [styleField]: edit.after });
              } else {
                Object.assign(next, { [edit.field]: edit.after });
              }
            });
            return next;
          }),
        };
      }),
    }), {
      actor: 'agent', action: 'propagate_human_edits', toolName: 'propagate_human_edits',
      summary: `Propagated the human’s ${[...new Set([...latestByRoleAndField.values()].map((item) => item.category))].join(', ')} choices to ${targetSet.size} slides.`,
    });
    return changed;
  }, [commit]);

  const undo = useCallback((actor: Actor = 'human') => {
    const snapshot = undoRef.current.pop();
    if (!snapshot) return false;
    redoRef.current.push({ deck: deckRef.current, selection: selectionRef.current });
    setCanUndo(undoRef.current.length > 0);
    setCanRedo(true);
    deckRef.current = snapshot.deck;
    setDeck(snapshot.deck);
    selectionRef.current = snapshot.selection;
    setSelectionState(snapshot.selection);
    currentSlideIdRef.current = snapshot.selection.slideId;
    setCurrentSlideId(snapshot.selection.slideId);
    addActivity({ actor, action: 'undo', toolName: actor === 'agent' ? 'undo_last_change' : undefined, summary: 'Reverted the last change.' });
    return true;
  }, [addActivity]);

  const redo = useCallback(() => {
    const snapshot = redoRef.current.pop();
    if (!snapshot) return;
    undoRef.current.push({ deck: deckRef.current, selection: selectionRef.current });
    setCanUndo(true);
    setCanRedo(redoRef.current.length > 0);
    deckRef.current = snapshot.deck;
    setDeck(snapshot.deck);
    selectionRef.current = snapshot.selection;
    setSelectionState(snapshot.selection);
    currentSlideIdRef.current = snapshot.selection.slideId;
    setCurrentSlideId(snapshot.selection.slideId);
    addActivity({ actor: 'human', action: 'redo', summary: 'Restored the reverted change.' });
  }, [addActivity]);

  const resetDemo = useCallback(() => {
    const next = createDemoDeck();
    deckRef.current = next;
    setDeck(next);
    undoRef.current = [];
    redoRef.current = [];
    setCanUndo(false);
    setCanRedo(false);
    recentHumanEditsRef.current = [];
    setRecentHumanEdits([]);
    setCurrentSlide(next.slides[0].id);
    addActivity({ actor: 'system', action: 'reset', summary: 'Restored the showcase deck.' });
  }, [addActivity, setCurrentSlide]);

  const replaceDeck = useCallback((next: Deck, summary = `Started “${next.title}”.`) => {
    if (!next.slides?.length || !next.theme || !next.grammar) throw new Error('This is not a valid Deckhand deck.');
    recentHumanEditsRef.current = [];
    setRecentHumanEdits([]);
    commit(() => next, { actor: 'human', action: 'start_deck', summary });
    setCurrentSlide(next.slides[0].id);
  }, [commit, setCurrentSlide]);

  const exportDeck = useCallback(() => {
    const blob = new Blob([JSON.stringify(deckRef.current, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${deckRef.current.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'deck'}.deckhand.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    addActivity({ actor: 'human', action: 'export', summary: 'Exported an editable Deckhand JSON file.' });
  }, [addActivity]);

  const importDeck = useCallback((next: Deck) => {
    if (!next.slides?.length || !next.theme || !next.grammar) throw new Error('This is not a valid Deckhand deck.');
    commit(() => next, { actor: 'human', action: 'import', summary: `Imported “${next.title}”.` });
    setCurrentSlide(next.slides[0].id);
  }, [commit, setCurrentSlide]);

  return {
    deck, deckRef, currentSlideId, currentSlideIdRef, selection, selectionRef,
    activity, recentHumanEdits, recentHumanEditsRef,
    canUndo,
    canRedo,
    webMcpStatus, setWebMcpStatus, setCurrentSlide, setSelection, toggleSelection,
    clearSelection, renameDeck, updateElements, addElements, deleteElements,
    arrangeElements, composeSlides, composeDeckPlan, reviseSlide, editSlide, createSlide, createSlideFromImportedLayout, duplicateSlide, deleteSlide, reorderSlide,
    applyTheme, propagateHumanEdits, undo, redo, resetDemo, replaceDeck, exportDeck, importDeck,
    addActivity,
  };
}
