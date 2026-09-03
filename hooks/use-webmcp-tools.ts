'use client';

import { useEffect, useRef } from 'react';

import type { DeckEditorController } from '@/hooks/use-deck-editor';
import { createDeckPlan, GENERATED_LAYOUT_RECIPES } from '@/lib/deck/design-system';
import { getSlide } from '@/lib/deck/operations';
import { validateRenderedDeck } from '@/lib/deck/render-validation';
import { reviewDeckPage, reviewSlide, summarizeDeckQuality, summarizeSlideComposition } from '@/lib/deck/review';
import type {
  AgentElementInput,
  ArrangeOperation,
  ArtDirection,
  DeckPlan,
  EditCategory,
  ElementPatch,
  ElementRole,
  ElementStyle,
  GeneratedLayoutRecipeId,
  SlideBrief,
  SlideEditInput,
  SlidePurpose,
} from '@/lib/deck/types';

const afterPaint = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
const json = (value: unknown) => JSON.stringify(value);

const requireString = (value: unknown, name: string) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} must be a non-empty string.`);
  return value.trim();
};

const optionalString = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : undefined;

const optionalStringArray = (value: unknown, name: string): string[] | undefined => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) throw new Error(`${name} must be an array of strings.`);
  return value.map((item) => item.trim()).filter(Boolean);
};

const finiteNumber = (value: unknown, name: string) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${name} must be a finite number.`);
  return value;
};

const page = (offsetValue: unknown, limitValue: unknown) => {
  const offset = typeof offsetValue === 'number' && Number.isInteger(offsetValue) ? Math.max(0, offsetValue) : 0;
  const limit = typeof limitValue === 'number' && Number.isInteger(limitValue) ? Math.min(24, Math.max(1, limitValue)) : 12;
  return { offset, limit };
};

const normalizeStyle = (value: unknown): Partial<ElementStyle> | undefined => {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('style must be an object.');
  const source = value as Record<string, unknown>;
  const style: Partial<ElementStyle> = {};
  const stringFields = ['color', 'fill', 'stroke', 'font_family', 'font_style', 'text_decoration', 'background_color', 'text_align', 'vertical_align', 'shadow', 'text_transform'] as const;
  const stringMap: Record<(typeof stringFields)[number], keyof ElementStyle> = {
    color: 'color', fill: 'fill', stroke: 'stroke', font_family: 'fontFamily', font_style: 'fontStyle',
    text_decoration: 'textDecoration', background_color: 'backgroundColor', text_align: 'textAlign',
    vertical_align: 'verticalAlign', shadow: 'shadow', text_transform: 'textTransform',
  };
  stringFields.forEach((field) => {
    if (typeof source[field] === 'string') Object.assign(style, { [stringMap[field]]: source[field] });
  });
  const numberFields = ['stroke_width', 'font_size', 'font_weight', 'line_height', 'letter_spacing', 'radius', 'opacity', 'padding', 'padding_top', 'padding_right', 'padding_bottom', 'padding_left'] as const;
  const numberMap: Record<(typeof numberFields)[number], keyof ElementStyle> = {
    stroke_width: 'strokeWidth', font_size: 'fontSize', font_weight: 'fontWeight', line_height: 'lineHeight',
    letter_spacing: 'letterSpacing', radius: 'radius', opacity: 'opacity', padding: 'padding',
    padding_top: 'paddingTop', padding_right: 'paddingRight', padding_bottom: 'paddingBottom', padding_left: 'paddingLeft',
  };
  numberFields.forEach((field) => {
    if (typeof source[field] === 'number' && Number.isFinite(source[field])) Object.assign(style, { [numberMap[field]]: source[field] });
  });
  return style;
};

const normalizeElement = (value: unknown): AgentElementInput => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Each addition must be an object.');
  const source = value as Record<string, unknown>;
  return {
    id: optionalString(source.id),
    type: requireString(source.type, 'type') as AgentElementInput['type'],
    role: requireString(source.role, 'role') as ElementRole,
    content: typeof source.content === 'string' ? source.content : '',
    label: optionalString(source.label),
    x: finiteNumber(source.x, 'x'),
    y: finiteNumber(source.y, 'y'),
    width: finiteNumber(source.width, 'width'),
    height: finiteNumber(source.height, 'height'),
    rotation: typeof source.rotation === 'number' ? finiteNumber(source.rotation, 'rotation') : undefined,
    zIndex: typeof source.z_index === 'number' ? finiteNumber(source.z_index, 'z_index') : undefined,
    shapePreset: optionalString(source.shape_preset),
    style: normalizeStyle(source.style),
  };
};

const normalizePatch = (value: unknown): ElementPatch => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('patch must be an object.');
  const source = value as Record<string, unknown>;
  const patch: ElementPatch = {};
  if (typeof source.content === 'string') patch.content = source.content;
  if (typeof source.label === 'string') patch.label = source.label;
  if (typeof source.role === 'string') patch.role = source.role as ElementRole;
  if (typeof source.x === 'number') patch.x = finiteNumber(source.x, 'x');
  if (typeof source.y === 'number') patch.y = finiteNumber(source.y, 'y');
  if (typeof source.width === 'number') patch.width = finiteNumber(source.width, 'width');
  if (typeof source.height === 'number') patch.height = finiteNumber(source.height, 'height');
  if (typeof source.rotation === 'number') patch.rotation = finiteNumber(source.rotation, 'rotation');
  if (typeof source.z_index === 'number') patch.zIndex = finiteNumber(source.z_index, 'z_index');
  if (typeof source.shape_preset === 'string') patch.shapePreset = source.shape_preset;
  if (source.style !== undefined) patch.style = normalizeStyle(source.style);
  if (!Object.keys(patch).length) throw new Error('patch must include at least one supported field.');
  return patch;
};

const objectArray = (value: unknown, name: string) => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => !item || typeof item !== 'object' || Array.isArray(item))) {
    throw new Error(`${name} must be an array of objects.`);
  }
  return value as Record<string, unknown>[];
};

const normalizeBrief = (value: unknown): SlideBrief => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Each slide brief must be an object.');
  const source = value as Record<string, unknown>;
  return {
    purpose: requireString(source.purpose, 'purpose') as SlidePurpose,
    takeaway: requireString(source.takeaway, 'takeaway'),
    eyebrow: optionalString(source.eyebrow),
    body: optionalString(source.body),
    points: optionalStringArray(source.points, 'points'),
    columns: objectArray(source.columns, 'columns')?.map((column) => ({
      heading: requireString(column.heading, 'columns.heading'),
      body: requireString(column.body, 'columns.body'),
    })),
    metrics: objectArray(source.metrics, 'metrics')?.map((metric) => ({
      value: requireString(metric.value, 'metrics.value'),
      label: requireString(metric.label, 'metrics.label'),
    })),
    steps: objectArray(source.steps, 'steps')?.map((step) => ({
      label: requireString(step.label, 'steps.label'),
      detail: optionalString(step.detail),
    })),
    layoutRecipeId: optionalString(source.layout_recipe_id) as GeneratedLayoutRecipeId | undefined,
    sourceSlideId: optionalString(source.source_slide_id),
    templateLayoutId: optionalString(source.template_layout_id),
    notes: optionalString(source.notes),
  };
};

const elementSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    type: { type: 'string', enum: ['text', 'shape', 'card', 'stat', 'line', 'code', 'pill'] },
    role: { type: 'string', enum: ['kicker', 'title', 'subtitle', 'body', 'visual', 'label', 'data', 'footer', 'accent'] },
    content: { type: 'string' }, label: { type: 'string' },
    x: { type: 'number' }, y: { type: 'number' }, width: { type: 'number' }, height: { type: 'number' },
    rotation: { type: 'number' }, z_index: { type: 'number' }, shape_preset: { type: 'string' },
    style: { type: 'object', description: 'Snake-case typography, fill, stroke, spacing, and alignment fields.' },
  },
  required: ['type', 'role', 'content', 'x', 'y', 'width', 'height'],
} as const;

const briefSchema = {
  type: 'object',
  properties: {
    purpose: { type: 'string', enum: ['cover', 'section', 'claim', 'split', 'comparison', 'three_points', 'process', 'timeline', 'metrics', 'matrix', 'closing'], description: 'The communication job of this slide.' },
    takeaway: { type: 'string', description: 'One audience-facing claim suitable as the slide title.' },
    eyebrow: { type: 'string' },
    body: { type: 'string', description: 'Short explanation supporting the takeaway.' },
    points: { type: 'array', maxItems: 6, items: { type: 'string' } },
    columns: { type: 'array', maxItems: 4, items: { type: 'object', properties: { heading: { type: 'string' }, body: { type: 'string' } }, required: ['heading', 'body'] } },
    metrics: { type: 'array', maxItems: 4, items: { type: 'object', properties: { value: { type: 'string' }, label: { type: 'string' } }, required: ['value', 'label'] } },
    steps: { type: 'array', maxItems: 5, items: { type: 'object', properties: { label: { type: 'string' }, detail: { type: 'string' } }, required: ['label'] } },
    layout_recipe_id: { type: 'string', enum: GENERATED_LAYOUT_RECIPES.map((recipe) => recipe.id), description: 'Optional generated recipe override.' },
    source_slide_id: { type: 'string', description: 'Optional real source slide to duplicate when using a PowerPoint template.' },
    template_layout_id: { type: 'string', description: 'Optional imported layout to fill when using a PowerPoint template.' },
    notes: { type: 'string' },
  },
  required: ['purpose', 'takeaway'],
} as const;

const inspectTool = (editorRef: React.RefObject<DeckEditorController>): WebMCP.ModelContextTool => ({
  name: 'inspect_project',
  title: 'Inspect the presentation project',
  description: 'Read the smallest useful page of the live deck, design system, current scene, selection, or human edits. Start with summary, then request only the context needed for the next action.',
  inputSchema: {
    type: 'object',
    properties: {
      scope: { type: 'string', enum: ['summary', 'current_slide', 'design_system', 'selection', 'recent_human_edits'] },
      slide_id: { type: 'string' }, include_style: { type: 'boolean' },
      offset: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 24 },
    },
    required: ['scope'],
  },
  annotations: { readOnlyHint: true, untrustedContentHint: true },
  execute: async ({ scope, slide_id, include_style, offset, limit }) => {
    const deck = editorRef.current.deckRef.current;
    const paging = page(offset, limit);
    if (scope === 'summary') {
      const items = deck.slides.slice(paging.offset, paging.offset + paging.limit).map((slide, pageIndex) => ({
        id: slide.id,
        index: paging.offset + pageIndex + 1,
        title: slide.title,
        purpose: slide.provenance?.purpose,
        recipe: slide.provenance?.recipeId,
        source: slide.provenance?.source,
        composition: summarizeSlideComposition(slide),
      }));
      const nextOffset = paging.offset + items.length < deck.slides.length ? paging.offset + items.length : null;
      return json({
        deck_id: deck.id, title: deck.title, version: deck.version, total_slides: deck.slides.length,
        design_system: deck.designSystem ?? { source: deck.importedTemplate ? 'imported_template' : 'generated', name: deck.importedTemplate?.name ?? 'Deckhand default' },
        quality: summarizeDeckQuality(deck), slides: items, next_offset: nextOffset,
      });
    }
    if (scope === 'current_slide') {
      const slide = getSlide(deck, optionalString(slide_id) ?? editorRef.current.currentSlideIdRef.current);
      return json({
        id: slide.id, title: slide.title, background: slide.background, notes: slide.notes,
        provenance: slide.provenance, composition: summarizeSlideComposition(slide),
        elements: slide.elements.map((element) => ({
          id: element.id, type: element.type, role: element.role, content: element.content, label: element.label,
          box: [element.x, element.y, element.width, element.height], locked: element.locked,
          ...(include_style ? { style: element.style } : {}),
        })),
      });
    }
    if (scope === 'design_system') {
      const imported = deck.importedTemplate?.layouts ?? [];
      const combined = [
        ...GENERATED_LAYOUT_RECIPES.map((recipe) => ({ type: 'generated_recipe', ...recipe })),
        ...imported.map((layout) => ({ type: 'imported_layout', id: layout.id, name: layout.name, purpose: layout.purposeHint, element_count: layout.elements.length })),
      ];
      const items = combined.slice(paging.offset, paging.offset + paging.limit);
      return json({
        active: deck.designSystem ?? null,
        imported_template: deck.importedTemplate ? { name: deck.importedTemplate.name, fidelity: deck.importedTemplate.fidelityScore, fonts: [deck.importedTemplate.headingFont, deck.importedTemplate.bodyFont], palette: deck.importedTemplate.palette } : null,
        layouts: items,
        next_offset: paging.offset + items.length < combined.length ? paging.offset + items.length : null,
      });
    }
    if (scope === 'selection') return json(editorRef.current.selectionRef.current);
    if (scope === 'recent_human_edits') return json({ edits: editorRef.current.recentHumanEditsRef.current.slice(paging.offset, paging.offset + paging.limit) });
    throw new Error('Unknown inspection scope.');
  },
});

const planTool = (
  editorRef: React.RefObject<DeckEditorController>,
  plansRef: React.RefObject<Map<string, DeckPlan>>,
): WebMCP.ModelContextTool => ({
  name: 'plan_deck',
  title: 'Plan a coherent deck',
  description: 'Validate a narrative and map each semantic slide brief to a generated recipe or an explicit PowerPoint source. This does not change the canvas; pass the returned plan_id to compose_deck.',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      audience: { type: 'string', description: 'Who will view the deck.' },
      objective: { type: 'string', description: 'What the audience should understand, decide, or do.' },
      art_direction: { type: 'string', enum: ['editorial', 'bold', 'calm', 'technical'] },
      design_mode: { type: 'string', enum: ['auto', 'generated', 'imported_template'] },
      slides: { type: 'array', minItems: 1, maxItems: 24, items: briefSchema },
    },
    required: ['title', 'audience', 'objective', 'slides'],
  },
  annotations: { readOnlyHint: true, untrustedContentHint: true },
  execute: async ({ title, audience, objective, art_direction, design_mode, slides }) => {
    if (!Array.isArray(slides)) throw new Error('slides must be an array of semantic slide briefs.');
    const plan = createDeckPlan(editorRef.current.deckRef.current, {
      title: requireString(title, 'title'),
      audience: requireString(audience, 'audience'),
      objective: requireString(objective, 'objective'),
      artDirection: optionalString(art_direction) as ArtDirection | undefined,
      designMode: optionalString(design_mode) as 'auto' | 'generated' | 'imported_template' | undefined,
      slides: slides.map(normalizeBrief),
    });
    plansRef.current.set(plan.id, plan);
    return json({
      plan_id: plan.id, title: plan.title, design_source: plan.designSource, art_direction: plan.artDirection,
      slide_count: plan.slides.length,
      slides: plan.slides.map((slide, index) => ({ index: index + 1, takeaway: slide.takeaway, purpose: slide.purpose, recipe: slide.layoutRecipeId, template_source: slide.sourceSlideId ?? slide.templateLayoutId ?? null })),
      warnings: plan.warnings,
      next: 'Call compose_deck with this plan_id when the narrative is ready.',
    });
  },
});

const composeTool = (
  editorRef: React.RefObject<DeckEditorController>,
  plansRef: React.RefObject<Map<string, DeckPlan>>,
): WebMCP.ModelContextTool => ({
  name: 'compose_deck',
  title: 'Compose an approved deck plan',
  description: 'Turn a validated plan into complete, editable slides in one visible and undoable transaction. Generated mode uses Deckhand recipes; template mode duplicates explicit source slides or layouts.',
  inputSchema: {
    type: 'object',
    properties: {
      plan_id: { type: 'string' }, mode: { type: 'string', enum: ['append', 'replace'] }, after_slide_id: { type: 'string' },
    },
    required: ['plan_id', 'mode'],
  },
  execute: async ({ plan_id, mode, after_slide_id }) => {
    const id = requireString(plan_id, 'plan_id');
    const plan = plansRef.current.get(id);
    if (!plan) throw new Error(`Plan “${id}” is unavailable. Run plan_deck again in this tab.`);
    const operationMode = requireString(mode, 'mode') as 'append' | 'replace';
    const result = editorRef.current.composeDeckPlan(plan, { mode: operationMode, afterSlideId: optionalString(after_slide_id) }, 'agent');
    await afterPaint();
    return json({
      plan_id: id, created_slide_ids: result.slideIds, version: editorRef.current.deckRef.current.version,
      quality: summarizeDeckQuality(editorRef.current.deckRef.current),
      next: 'Run validate_deck, then revise only slides with findings.',
    });
  },
});

const reviseTool = (editorRef: React.RefObject<DeckEditorController>): WebMCP.ModelContextTool => ({
  name: 'revise_slide',
  title: 'Recompose one slide semantically',
  description: 'Replace one slide composition from an updated semantic brief while keeping its slide ID and the active design system. Prefer this for layout, density, hierarchy, or message changes.',
  inputSchema: {
    type: 'object',
    properties: { slide_id: { type: 'string' }, brief: briefSchema },
    required: ['slide_id', 'brief'],
  },
  execute: async ({ slide_id, brief }) => {
    const id = requireString(slide_id, 'slide_id');
    editorRef.current.reviseSlide(id, normalizeBrief(brief), 'agent');
    await afterPaint();
    return json({ slide_id: id, version: editorRef.current.deckRef.current.version, review: reviewSlide(editorRef.current.deckRef.current, getSlide(editorRef.current.deckRef.current, id), editorRef.current.deckRef.current.slides.findIndex((slide) => slide.id === id) + 1) });
  },
});

const editTool = (editorRef: React.RefObject<DeckEditorController>): WebMCP.ModelContextTool => ({
  name: 'edit_slide',
  title: 'Precisely edit an inspected slide',
  description: 'Apply known-ID additions, patches, removals, or alignment as one undoable edit. Use only after inspect_project when semantic recomposition would be too broad.',
  inputSchema: {
    type: 'object',
    properties: {
      slide_id: { type: 'string' }, slide_title: { type: 'string' }, background: { type: 'string' }, notes: { type: 'string' },
      additions: { type: 'array', maxItems: 24, items: elementSchema },
      updates: { type: 'array', maxItems: 24, items: { type: 'object', properties: { element_id: { type: 'string' }, patch: { type: 'object' } }, required: ['element_id', 'patch'] } },
      remove_element_ids: { type: 'array', maxItems: 24, items: { type: 'string' } },
      arrangements: { type: 'array', maxItems: 8, items: { type: 'object', properties: { element_ids: { type: 'array', minItems: 2, items: { type: 'string' } }, operation: { type: 'string', enum: ['align_left', 'align_center', 'align_right', 'align_top', 'align_middle', 'align_bottom', 'distribute_horizontal', 'distribute_vertical'] } }, required: ['element_ids', 'operation'] } },
    },
    required: ['slide_id'],
  },
  execute: async ({ slide_id, slide_title, background, notes, additions, updates, remove_element_ids, arrangements }) => {
    const input: SlideEditInput = {
      slideTitle: optionalString(slide_title), background: optionalString(background), notes: typeof notes === 'string' ? notes : undefined,
      additions: additions === undefined ? undefined : (Array.isArray(additions) ? additions.map(normalizeElement) : (() => { throw new Error('additions must be an array.'); })()),
      updates: updates === undefined ? undefined : objectArray(updates, 'updates')?.map((update) => ({ elementId: requireString(update.element_id, 'element_id'), patch: normalizePatch(update.patch) })),
      removeElementIds: optionalStringArray(remove_element_ids, 'remove_element_ids'),
      arrangements: arrangements === undefined ? undefined : objectArray(arrangements, 'arrangements')?.map((arrangement) => ({ elementIds: optionalStringArray(arrangement.element_ids, 'element_ids') ?? [], operation: requireString(arrangement.operation, 'operation') as ArrangeOperation })),
    };
    const id = requireString(slide_id, 'slide_id');
    const selected = editorRef.current.editSlide(id, input, 'agent');
    await afterPaint();
    return json({ slide_id: id, selected_element_ids: selected, version: editorRef.current.deckRef.current.version, next: 'Run validate_deck for this slide.' });
  },
});

const manageTool = (editorRef: React.RefObject<DeckEditorController>): WebMCP.ModelContextTool => ({
  name: 'manage_deck',
  title: 'Manage deck structure and focus',
  description: 'Focus a slide or selection, rename the deck, duplicate a slide, reorder it, or delete it through one explicit structural action. All deck mutations remain undoable.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['focus', 'rename', 'duplicate', 'reorder', 'delete'] },
      slide_id: { type: 'string' }, after_slide_id: { type: 'string' }, title: { type: 'string' },
      element_ids: { type: 'array', items: { type: 'string' } },
    },
    required: ['action'],
  },
  execute: async ({ action, slide_id, after_slide_id, title, element_ids }) => {
    const operation = requireString(action, 'action');
    let resultId: string | undefined;
    if (operation === 'focus') editorRef.current.setSelection(requireString(slide_id, 'slide_id'), optionalStringArray(element_ids, 'element_ids') ?? []);
    else if (operation === 'rename') editorRef.current.renameDeck(requireString(title, 'title'));
    else if (operation === 'duplicate') resultId = editorRef.current.duplicateSlide(requireString(slide_id, 'slide_id'), 'agent');
    else if (operation === 'reorder') editorRef.current.reorderSlide(requireString(slide_id, 'slide_id'), optionalString(after_slide_id), 'agent');
    else if (operation === 'delete') editorRef.current.deleteSlide(requireString(slide_id, 'slide_id'), 'agent');
    else throw new Error('Unknown manage_deck action.');
    await afterPaint();
    return json({ action: operation, slide_id: resultId ?? optionalString(slide_id) ?? null, version: editorRef.current.deckRef.current.version });
  },
});

const validateTool = (editorRef: React.RefObject<DeckEditorController>): WebMCP.ModelContextTool => ({
  name: 'validate_deck',
  title: 'Validate rendered slide quality',
  description: 'Check narrative structure plus the rendered browser canvas for overflow, clipping, unavailable fonts, collisions, placeholders, and density. Use after composition and revisions.',
  inputSchema: {
    type: 'object',
    properties: { slide_id: { type: 'string' }, offset: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 24 } },
  },
  annotations: { readOnlyHint: true },
  execute: async ({ slide_id, offset, limit }) => {
    await afterPaint();
    const deck = editorRef.current.deckRef.current;
    const id = optionalString(slide_id);
    const paging = page(offset, limit);
    const structural = id
      ? { deck_id: deck.id, version: deck.version, slides: [reviewSlide(deck, getSlide(deck, id), deck.slides.findIndex((slide) => slide.id === id) + 1)] }
      : reviewDeckPage(deck, paging.offset, paging.limit);
    const rendered = validateRenderedDeck(deck);
    const renderIssues = id ? rendered.issues.filter((issue) => issue.slideId === id) : rendered.issues.slice(0, 30);
    return json({
      quality: summarizeDeckQuality(deck), structural,
      rendered: { measured_slide_count: rendered.measuredSlideCount, issue_count: id ? renderIssues.length : rendered.issueCount, issues: renderIssues, omitted_issue_count: Math.max(0, rendered.issueCount - renderIssues.length) },
      next: renderIssues.length ? 'Inspect and revise the affected slides, then validate again.' : 'The rendered quality gate passed; ask the human for visual approval.',
    });
  },
});

const undoTool = (editorRef: React.RefObject<DeckEditorController>): WebMCP.ModelContextTool => ({
  name: 'undo_last_change',
  title: 'Undo the last deck change',
  description: 'Revert the most recent atomic deck mutation when the human asks or a visible result is worse. Reports whether history was actually available.',
  inputSchema: { type: 'object', properties: {} },
  execute: async () => {
    const undone = editorRef.current.undo('agent');
    await afterPaint();
    return json({ undone, version: editorRef.current.deckRef.current.version });
  },
});

export function useWebMcpTools(editor: DeckEditorController) {
  const editorRef = useRef(editor);
  const plansRef = useRef(new Map<string, DeckPlan>());
  useEffect(() => { editorRef.current = editor; }, [editor]);

  useEffect(() => {
    const modelContext = document.modelContext;
    if (!modelContext) {
      editorRef.current.setWebMcpStatus('unavailable');
      return;
    }
    const controller = new AbortController();
    const tools = [
      inspectTool(editorRef), planTool(editorRef, plansRef), composeTool(editorRef, plansRef), reviseTool(editorRef),
      editTool(editorRef), manageTool(editorRef), validateTool(editorRef), undoTool(editorRef),
    ];
    Promise.all(tools.map((tool) => modelContext.registerTool(tool, { signal: controller.signal })))
      .then(() => {
        editorRef.current.setWebMcpStatus('ready');
        editorRef.current.addActivity({ actor: 'system', action: 'tools_registered', summary: `${tools.length} outcome-focused WebMCP tools are live in this tab.` });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        editorRef.current.setWebMcpStatus('error');
        editorRef.current.addActivity({ actor: 'system', action: 'tool_error', summary: error instanceof Error ? error.message : 'WebMCP registration failed.' });
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!editor.recentHumanEdits.length || !document.modelContext) return;
    const controller = new AbortController();
    const tool: WebMCP.ModelContextTool = {
      name: 'propagate_human_edits',
      title: 'Propagate direct human edits',
      description: 'Available after direct canvas editing. Apply the human’s geometry, typography, or style choices to matching semantic roles on selected slides.',
      inputSchema: {
        type: 'object',
        properties: {
          source_slide_id: { type: 'string' }, target_slide_ids: { type: 'array', items: { type: 'string' } },
          include: { type: 'array', items: { type: 'string', enum: ['position', 'size', 'typography', 'style'] } },
        },
        required: ['source_slide_id'],
      },
      execute: async ({ source_slide_id, target_slide_ids, include }) => {
        const changed = editorRef.current.propagateHumanEdits(
          requireString(source_slide_id, 'source_slide_id'),
          optionalStringArray(target_slide_ids, 'target_slide_ids'),
          optionalStringArray(include, 'include') as EditCategory[] | undefined,
        );
        await afterPaint();
        return json({ changed_elements: changed, version: editorRef.current.deckRef.current.version });
      },
    };
    document.modelContext.registerTool(tool, { signal: controller.signal }).catch(() => undefined);
    return () => controller.abort();
  }, [editor.recentHumanEdits.length]);
}
