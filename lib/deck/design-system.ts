import {
  createId,
  createSlideFromTemplateLayout,
  getSlide,
  replaceElementContent,
} from './operations';
import type {
  ArtDirection,
  Deck,
  DeckPlan,
  DeckTheme,
  GeneratedLayoutRecipeId,
  Slide,
  SlideBrief,
  SlideElement,
  SlidePurpose,
} from './types';

export interface DeckPlanInput {
  title: string;
  audience: string;
  objective: string;
  artDirection?: ArtDirection;
  designMode?: 'auto' | 'generated' | 'imported_template';
  slides: SlideBrief[];
}

export interface LayoutRecipeDescriptor {
  id: GeneratedLayoutRecipeId;
  purpose: SlidePurpose;
  name: string;
  description: string;
  capacity: string;
}

export const GENERATED_LAYOUT_RECIPES: LayoutRecipeDescriptor[] = [
  { id: 'cover_minimal', purpose: 'cover', name: 'Minimal cover', description: 'A restrained opener with one clear promise.', capacity: 'One title, one short subtitle.' },
  { id: 'section_divider', purpose: 'section', name: 'Section divider', description: 'A dark pacing slide for a new chapter.', capacity: 'One short transition statement.' },
  { id: 'claim_focus', purpose: 'claim', name: 'Claim focus', description: 'A single argument with one supporting sentence.', capacity: 'One takeaway, up to 180 supporting characters.' },
  { id: 'split_editorial', purpose: 'split', name: 'Editorial split', description: 'Narrative on the left, structured evidence on the right.', capacity: 'Body plus 2–4 points.' },
  { id: 'comparison_balanced', purpose: 'comparison', name: 'Balanced comparison', description: 'Two alternatives without dashboard-like cards.', capacity: 'Two columns with concise headings and bodies.' },
  { id: 'three_points_flat', purpose: 'three_points', name: 'Three-point argument', description: 'Three numbered ideas in a flat editorial rhythm.', capacity: 'Exactly 3 points or columns.' },
  { id: 'process_flow', purpose: 'process', name: 'Process flow', description: 'A left-to-right sequence with native connectors.', capacity: '3–5 short steps.' },
  { id: 'timeline_horizontal', purpose: 'timeline', name: 'Horizontal timeline', description: 'Milestones arranged on one temporal baseline.', capacity: '3–5 dated or ordered steps.' },
  { id: 'metrics_editorial', purpose: 'metrics', name: 'Editorial metrics', description: 'Large evidence-led figures with restrained labels.', capacity: '2–4 metrics.' },
  { id: 'matrix_quadrants', purpose: 'matrix', name: 'Decision matrix', description: 'A labelled 2×2 for positioning or prioritization.', capacity: '4 quadrant labels.' },
  { id: 'closing_action', purpose: 'closing', name: 'Closing action', description: 'A decisive final statement and next action.', capacity: 'One conclusion and one action.' },
];

const RECIPE_BY_PURPOSE = Object.fromEntries(
  GENERATED_LAYOUT_RECIPES.map((recipe) => [recipe.purpose, recipe.id]),
) as Record<SlidePurpose, GeneratedLayoutRecipeId>;

const ART_DIRECTIONS: Record<ArtDirection, DeckTheme> = {
  editorial: { canvas: '#F3F0E7', ink: '#171914', muted: '#676A61', accent: '#6676EF', accentAlt: '#D8FF4F', signal: '#EF6B60' },
  bold: { canvas: '#F7F3EA', ink: '#161713', muted: '#62645D', accent: '#FF5D47', accentAlt: '#BFFF3C', signal: '#6E63F4' },
  calm: { canvas: '#F1F6F2', ink: '#15352C', muted: '#64766F', accent: '#347966', accentAlt: '#D8ECCA', signal: '#D09162' },
  technical: { canvas: '#F2F5F8', ink: '#11171D', muted: '#64707B', accent: '#356AF4', accentAlt: '#BDE5F5', signal: '#E68432' },
};

const FONT_FAMILY = 'Noto Sans JP';

const copyTheme = (theme: DeckTheme): DeckTheme => ({ ...theme });

const el = (
  id: string,
  type: SlideElement['type'],
  role: SlideElement['role'],
  x: number,
  y: number,
  width: number,
  height: number,
  content: string,
  style: SlideElement['style'] = {},
  label?: string,
  zIndex?: number,
): SlideElement => ({
  id,
  type,
  role,
  x,
  y,
  width,
  height,
  content,
  label,
  zIndex,
  style: { fontFamily: FONT_FAMILY, ...style },
});

const footer = (id: string, index: number, theme: DeckTheme, dark = false) => el(
  `${id}-footer`, 'text', 'footer', 91, 91, 4, 4,
  String(index + 1).padStart(2, '0'),
  { color: dark ? '#92968B' : theme.muted, fontSize: 12, fontWeight: 650, textAlign: 'right', letterSpacing: 0.8 },
);

const splitPoint = (point: string) => {
  const separator = point.search(/[：:—–]/);
  if (separator < 0) return { heading: point, body: '' };
  return { heading: point.slice(0, separator).trim(), body: point.slice(separator + 1).trim() };
};

const availableColumns = (brief: SlideBrief) => brief.columns?.length
  ? brief.columns
  : (brief.points ?? []).map(splitPoint);

const bodyCopy = (brief: SlideBrief) => brief.body?.trim()
  || brief.points?.filter(Boolean).join('\n')
  || brief.columns?.map((column) => `${column.heading}: ${column.body}`).join('\n')
  || '';

const buildGeneratedSlide = (
  deck: Deck,
  brief: SlideBrief & { layoutRecipeId: GeneratedLayoutRecipeId },
  index: number,
  theme: DeckTheme,
): Slide => {
  const id = createId('slide');
  const elements: SlideElement[] = [];
  const title = brief.takeaway.trim();
  const eyebrow = brief.eyebrow?.trim() || brief.purpose.replaceAll('_', ' ').toUpperCase();
  let background = theme.canvas;

  const addHeader = (titleY = 10, titleHeight = 18, titleWidth = 82) => {
    elements.push(
      el(`${id}-eyebrow`, 'text', 'kicker', 7, 6.5, 60, 4, eyebrow, { color: theme.accent, fontSize: 13, fontWeight: 760, letterSpacing: 1.5, textTransform: 'uppercase' }),
      el(`${id}-title`, 'text', 'title', 7, titleY, titleWidth, titleHeight, title, { color: theme.ink, fontSize: 44, fontWeight: 690, lineHeight: 1.06, letterSpacing: -1.8 }),
    );
  };

  switch (brief.layoutRecipeId) {
    case 'cover_minimal': {
      addHeader(19, 30, 78);
      if (brief.body) elements.push(el(`${id}-body`, 'text', 'body', 7.2, 59, 52, 15, brief.body, { color: theme.muted, fontSize: 21, fontWeight: 430, lineHeight: 1.42, letterSpacing: -0.25 }));
      elements.push(
        el(`${id}-rule`, 'line', 'accent', 7, 84, 86, 0.35, '', { color: theme.ink, stroke: theme.ink, strokeWidth: 1 }, undefined, 1),
        el(`${id}-signal`, 'shape', 'accent', 86.5, 73, 7.5, 13.3, '', { fill: theme.accentAlt, radius: 999 }, undefined, 2),
      );
      break;
    }
    case 'section_divider': {
      background = theme.ink;
      elements.push(
        el(`${id}-eyebrow`, 'text', 'kicker', 7, 13, 60, 5, eyebrow, { color: theme.accentAlt, fontSize: 14, fontWeight: 760, letterSpacing: 1.6 }),
        el(`${id}-title`, 'text', 'title', 7, 33, 76, 28, title, { color: '#F7F5EE', fontSize: 58, fontWeight: 680, lineHeight: 1.02, letterSpacing: -2.5 }),
      );
      if (brief.body) elements.push(el(`${id}-body`, 'text', 'body', 7.2, 68, 54, 11, brief.body, { color: '#AEB2A7', fontSize: 19, lineHeight: 1.42 }));
      elements.push(el(`${id}-bar`, 'shape', 'accent', 89.5, 12, 3.5, 72, '', { fill: theme.accent }, undefined, 1));
      break;
    }
    case 'claim_focus': {
      elements.push(
        el(`${id}-eyebrow`, 'text', 'kicker', 9, 13, 60, 5, eyebrow, { color: theme.accent, fontSize: 13, fontWeight: 760, letterSpacing: 1.5 }),
        el(`${id}-rail`, 'shape', 'accent', 7, 13, 0.8, 67, '', { fill: theme.accent }, undefined, 1),
        el(`${id}-title`, 'text', 'title', 12, 24, 76, 28, title, { color: theme.ink, fontSize: 58, fontWeight: 690, lineHeight: 1.02, letterSpacing: -2.5 }, undefined, 2),
      );
      const support = bodyCopy(brief);
      if (support) elements.push(el(`${id}-body`, 'text', 'body', 12.2, 62, 57, 15, support, { color: theme.muted, fontSize: 20, lineHeight: 1.45 }));
      break;
    }
    case 'split_editorial': {
      addHeader();
      const support = brief.body?.trim() || '';
      if (support) elements.push(el(`${id}-body`, 'text', 'body', 7.2, 35, 35, 38, support, { color: theme.muted, fontSize: 20, lineHeight: 1.46 }));
      elements.push(el(`${id}-divider`, 'line', 'accent', 48, 33, 0.18, 48, '', { color: '#C9C9C0', stroke: '#C9C9C0', strokeWidth: 1 }, undefined, 1));
      const points = (brief.points ?? availableColumns(brief).map((column) => `${column.heading}: ${column.body}`)).slice(0, 4);
      points.forEach((point, pointIndex) => {
        const parsed = splitPoint(point);
        const y = 34 + pointIndex * 12;
        elements.push(
          el(`${id}-number-${pointIndex}`, 'text', 'label', 53, y, 5, 6, String(pointIndex + 1).padStart(2, '0'), { color: theme.accent, fontSize: 13, fontWeight: 760, letterSpacing: 1 }),
          el(`${id}-point-${pointIndex}`, 'text', 'body', 60, y - 0.5, 32, 10, parsed.body ? `${parsed.heading}\n${parsed.body}` : parsed.heading, { color: theme.ink, fontSize: parsed.body ? 17 : 20, fontWeight: parsed.body ? 520 : 620, lineHeight: 1.3 }),
        );
      });
      break;
    }
    case 'comparison_balanced': {
      addHeader();
      const columns = availableColumns(brief).slice(0, 2);
      while (columns.length < 2) columns.push({ heading: `Option ${columns.length + 1}`, body: 'Add the evidence that makes this side distinct.' });
      columns.forEach((column, columnIndex) => {
        const x = columnIndex === 0 ? 7 : 53;
        elements.push(
          el(`${id}-column-rule-${columnIndex}`, 'shape', 'accent', x, 35, 40, 0.8, '', { fill: columnIndex === 0 ? theme.ink : theme.accent }),
          el(`${id}-column-heading-${columnIndex}`, 'text', 'label', x, 41, 38, 9, column.heading, { color: theme.ink, fontSize: 25, fontWeight: 690, letterSpacing: -0.6 }),
          el(`${id}-column-body-${columnIndex}`, 'text', 'body', x, 55, 37, 26, column.body, { color: theme.muted, fontSize: 18, lineHeight: 1.46 }),
        );
      });
      elements.push(el(`${id}-vs`, 'text', 'accent', 47, 45, 6, 10, 'VS', { color: theme.muted, fontSize: 13, fontWeight: 760, textAlign: 'center', letterSpacing: 1.2 }));
      break;
    }
    case 'three_points_flat': {
      addHeader();
      const columns = availableColumns(brief).slice(0, 3);
      while (columns.length < 3) columns.push({ heading: `Point ${columns.length + 1}`, body: 'Add one concise supporting idea.' });
      columns.forEach((column, columnIndex) => {
        const x = 7 + columnIndex * 30.5;
        elements.push(
          el(`${id}-number-${columnIndex}`, 'text', 'data', x, 38, 9, 10, String(columnIndex + 1).padStart(2, '0'), { color: columnIndex === 1 ? theme.accent : theme.muted, fontSize: 28, fontWeight: 720, letterSpacing: -1 }),
          el(`${id}-heading-${columnIndex}`, 'text', 'label', x, 51, 26, 11, column.heading, { color: theme.ink, fontSize: 22, fontWeight: 680, lineHeight: 1.12, letterSpacing: -0.5 }),
          el(`${id}-body-${columnIndex}`, 'text', 'body', x, 66, 25, 16, column.body, { color: theme.muted, fontSize: 16, lineHeight: 1.42 }),
        );
        if (columnIndex < 2) elements.push(el(`${id}-divider-${columnIndex}`, 'line', 'accent', x + 27.5, 39, 0.15, 42, '', { color: '#C7C8BF', stroke: '#C7C8BF', strokeWidth: 1 }));
      });
      break;
    }
    case 'process_flow':
    case 'timeline_horizontal': {
      addHeader();
      const steps = (brief.steps?.length
        ? brief.steps
        : (brief.points ?? []).map((point) => {
          const parsed = splitPoint(point);
          return { label: parsed.heading, detail: parsed.body };
        })).slice(0, 5);
      while (steps.length < 3) steps.push({ label: `Step ${steps.length + 1}`, detail: 'Add the next meaningful transition.' });
      const startX = 10;
      const span = 80;
      const gap = span / Math.max(1, steps.length - 1);
      elements.push(el(`${id}-track`, 'line', 'visual', startX, 53, span, 0.35, '', { color: '#B6B8AE', stroke: '#B6B8AE', strokeWidth: 2 }, undefined, 1));
      steps.forEach((step, stepIndex) => {
        const x = startX + stepIndex * gap;
        elements.push(
          el(`${id}-node-${stepIndex}`, 'shape', 'visual', x - 1.4, 50.5, 2.8, 5, '', { fill: stepIndex === steps.length - 1 ? theme.accent : theme.ink, radius: 999 }, undefined, 2),
          el(`${id}-step-label-${stepIndex}`, 'text', 'label', x - 7, stepIndex % 2 ? 61 : 40, 14, 7, step.label, { color: theme.ink, fontSize: 16, fontWeight: 680, textAlign: 'center', lineHeight: 1.14 }, undefined, 3),
        );
        if (step.detail) elements.push(el(`${id}-step-detail-${stepIndex}`, 'text', 'body', x - 8, stepIndex % 2 ? 70 : 31, 16, 8, step.detail, { color: theme.muted, fontSize: 12, textAlign: 'center', lineHeight: 1.25 }, undefined, 3));
      });
      break;
    }
    case 'metrics_editorial': {
      addHeader();
      const metrics = (brief.metrics ?? []).slice(0, 4);
      while (metrics.length < 2) metrics.push({ value: '—', label: 'Add a verified metric' });
      const width = 86 / metrics.length;
      metrics.forEach((metric, metricIndex) => {
        const x = 7 + metricIndex * width;
        elements.push(
          el(`${id}-metric-${metricIndex}`, 'text', 'data', x, 42, width - 3, 20, metric.value, { color: metricIndex === 0 ? theme.accent : theme.ink, fontSize: metrics.length > 3 ? 46 : 58, fontWeight: 720, letterSpacing: -2.6 }),
          el(`${id}-metric-label-${metricIndex}`, 'text', 'label', x, 66, width - 5, 12, metric.label, { color: theme.muted, fontSize: 15, fontWeight: 560, lineHeight: 1.3 }),
        );
        if (metricIndex) elements.push(el(`${id}-metric-divider-${metricIndex}`, 'line', 'accent', x - 2.2, 42, 0.15, 37, '', { color: '#C8CAC1', stroke: '#C8CAC1', strokeWidth: 1 }));
      });
      break;
    }
    case 'matrix_quadrants': {
      addHeader();
      const labels = availableColumns(brief).slice(0, 4);
      while (labels.length < 4) labels.push({ heading: `Quadrant ${labels.length + 1}`, body: '' });
      elements.push(
        el(`${id}-axis-x`, 'line', 'visual', 18, 58, 68, 0.3, '', { color: theme.ink, stroke: theme.ink, strokeWidth: 2 }, undefined, 1),
        el(`${id}-axis-y`, 'line', 'visual', 52, 32, 0.2, 52, '', { color: theme.ink, stroke: theme.ink, strokeWidth: 2 }, undefined, 1),
      );
      const boxes = [[20, 35], [56, 35], [20, 63], [56, 63]];
      labels.forEach((label, labelIndex) => elements.push(
        el(`${id}-quadrant-${labelIndex}`, 'text', labelIndex === 1 ? 'accent' : 'label', boxes[labelIndex][0], boxes[labelIndex][1], 28, 16, label.body ? `${label.heading}\n${label.body}` : label.heading, { color: labelIndex === 1 ? theme.accent : theme.ink, fontSize: 17, fontWeight: 650, lineHeight: 1.25 }),
      ));
      break;
    }
    case 'closing_action': {
      background = theme.accentAlt;
      elements.push(
        el(`${id}-eyebrow`, 'text', 'kicker', 7, 11, 60, 5, eyebrow, { color: theme.ink, fontSize: 13, fontWeight: 780, letterSpacing: 1.5 }),
        el(`${id}-title`, 'text', 'title', 7, 25, 79, 30, title, { color: theme.ink, fontSize: 58, fontWeight: 710, lineHeight: 1.02, letterSpacing: -2.6 }),
      );
      if (brief.body) elements.push(el(`${id}-body`, 'text', 'body', 7.2, 63, 54, 13, brief.body, { color: '#40452E', fontSize: 20, lineHeight: 1.42 }));
      const action = brief.points?.[0];
      if (action) elements.push(el(`${id}-action`, 'text', 'label', 68, 68, 24, 10, `→  ${action}`, { color: theme.ink, fontSize: 17, fontWeight: 700, textAlign: 'right' }));
      break;
    }
  }

  elements.push(footer(id, index, theme, brief.layoutRecipeId === 'section_divider'));
  return {
    id,
    title,
    background,
    elements,
    notes: brief.notes,
    provenance: { source: 'generated', recipeId: brief.layoutRecipeId, purpose: brief.purpose, brief: structuredClone(brief) },
  };
};

const replaceByRole = (slide: Slide, role: SlideElement['role'], values: string[]) => {
  const matches = slide.elements
    .filter((element) => element.role === role && !element.locked)
    .sort((left, right) => (left.y - right.y) || (left.x - right.x));
  values.filter((value) => value.trim()).forEach((value, index) => {
    if (!matches[index]) return;
    const replacement = replaceElementContent(matches[index], value);
    Object.assign(matches[index], replacement);
  });
};

const buildTemplateSlide = (
  deck: Deck,
  brief: SlideBrief & { layoutRecipeId: GeneratedLayoutRecipeId },
): Slide => {
  let slide: Slide;
  if (brief.sourceSlideId) {
    const source = getSlide(deck, brief.sourceSlideId);
    const id = createId('slide');
    slide = {
      ...structuredClone(source),
      id,
      title: brief.takeaway,
      elements: source.elements.map((element, index) => ({ ...structuredClone(element), id: `${id}-${element.role}-${index + 1}` })),
      provenance: { source: 'template_slide', sourceId: source.id, purpose: brief.purpose, brief: structuredClone(brief) },
    };
  } else if (brief.templateLayoutId) {
    const layout = deck.importedTemplate?.layouts.find((candidate) => candidate.id === brief.templateLayoutId);
    if (!layout) throw new Error(`Imported layout “${brief.templateLayoutId}” was not found.`);
    slide = createSlideFromTemplateLayout(deck, layout, brief.takeaway);
    slide.provenance = { source: 'template_layout', sourceId: layout.id, purpose: brief.purpose, brief: structuredClone(brief) };
  } else {
    throw new Error('A template-backed slide requires sourceSlideId or templateLayoutId.');
  }

  replaceByRole(slide, 'title', [brief.takeaway]);
  replaceByRole(slide, 'subtitle', [brief.body ?? '']);
  replaceByRole(slide, 'body', [brief.body ?? '', ...(brief.points ?? []), ...(brief.columns ?? []).map((column) => column.body)]);
  replaceByRole(slide, 'label', [...(brief.columns ?? []).map((column) => column.heading), ...(brief.steps ?? []).map((step) => step.label)]);
  replaceByRole(slide, 'data', (brief.metrics ?? []).flatMap((metric) => [metric.value, metric.label]));
  slide.notes = brief.notes ?? slide.notes;
  return slide;
};

const chooseRecipe = (brief: SlideBrief): GeneratedLayoutRecipeId => brief.layoutRecipeId ?? RECIPE_BY_PURPOSE[brief.purpose];

const validateBrief = (brief: SlideBrief, index: number) => {
  if (!brief.takeaway?.trim()) throw new Error(`Slide ${index + 1} needs a takeaway-style title.`);
  if (brief.takeaway.length > 110) return `Slide ${index + 1}: the takeaway is long; keep the title to one spoken sentence.`;
  if (brief.purpose === 'comparison' && (brief.columns?.length ?? 0) !== 2) return `Slide ${index + 1}: comparison works best with exactly two columns.`;
  if (brief.purpose === 'metrics' && !brief.metrics?.length) return `Slide ${index + 1}: metrics layout needs verified values and labels.`;
  if (['process', 'timeline'].includes(brief.purpose) && (brief.steps?.length ?? brief.points?.length ?? 0) > 5) return `Slide ${index + 1}: sequence was limited to five visible steps.`;
  return undefined;
};

export const createDeckPlan = (deck: Deck, input: DeckPlanInput): DeckPlan => {
  if (!input.title?.trim()) throw new Error('The deck needs a title.');
  if (!input.audience?.trim()) throw new Error('Describe the intended audience.');
  if (!input.objective?.trim()) throw new Error('Describe what the audience should understand, decide, or do.');
  if (!input.slides?.length) throw new Error('Plan at least one slide.');
  if (input.slides.length > 24) throw new Error('Plan at most 24 slides in one coherent deck.');

  const designSource = input.designMode === 'generated'
    ? 'generated'
    : input.designMode === 'imported_template'
      ? 'imported_template'
      : deck.importedTemplate
        ? 'imported_template'
        : 'generated';
  if (designSource === 'imported_template' && !deck.importedTemplate) {
    throw new Error('No PowerPoint template is loaded. Use generated design mode or import a template first.');
  }

  const warnings = input.slides.map(validateBrief).filter((warning): warning is string => Boolean(warning));
  const slides = input.slides.map((brief) => ({ ...structuredClone(brief), layoutRecipeId: chooseRecipe(brief) }));
  slides.forEach((brief, index) => {
    const sources = [brief.sourceSlideId, brief.templateLayoutId].filter(Boolean);
    if (sources.length > 1) throw new Error(`Slide ${index + 1} has multiple template sources.`);
    if (brief.sourceSlideId) getSlide(deck, brief.sourceSlideId);
    if (brief.templateLayoutId && !deck.importedTemplate?.layouts.some((layout) => layout.id === brief.templateLayoutId)) {
      throw new Error(`Slide ${index + 1} references an unknown template layout.`);
    }
    if (designSource === 'imported_template' && !sources.length) {
      warnings.push(`Slide ${index + 1}: no template source was selected; generated design will be used for this slide.`);
    }
  });

  return {
    id: createId('plan'),
    title: input.title.trim(),
    audience: input.audience.trim(),
    objective: input.objective.trim(),
    artDirection: input.artDirection ?? 'editorial',
    designSource,
    slides,
    warnings,
  };
};

export const composeDeckFromPlan = (
  deck: Deck,
  plan: DeckPlan,
  options: { mode: 'append' | 'replace'; afterSlideId?: string },
) => {
  const generatedTheme = copyTheme(ART_DIRECTIONS[plan.artDirection]);
  const theme = plan.designSource === 'generated' ? generatedTheme : deck.theme;
  const built = plan.slides.map((brief, index) => (
    plan.designSource === 'imported_template' && (brief.sourceSlideId || brief.templateLayoutId)
      ? buildTemplateSlide(deck, brief)
      : buildGeneratedSlide(deck, brief, options.mode === 'append' ? deck.slides.length + index : index, theme)
  ));

  let slides: Slide[];
  if (options.mode === 'replace') slides = built;
  else if (!options.afterSlideId) slides = [...deck.slides, ...built];
  else {
    const afterIndex = deck.slides.findIndex((slide) => slide.id === options.afterSlideId);
    if (afterIndex < 0) throw new Error(`Slide “${options.afterSlideId}” was not found.`);
    slides = [...deck.slides];
    slides.splice(afterIndex + 1, 0, ...built);
  }

  return {
    ...deck,
    title: options.mode === 'replace' ? plan.title : deck.title,
    importedTemplate: options.mode === 'replace' && plan.designSource === 'generated'
      ? undefined
      : deck.importedTemplate,
    theme,
    grammar: {
      ...deck.grammar,
      density: 'airy' as const,
      titleTop: 10,
      titleLeft: 7,
      titleMaxWidth: 82,
      bodyMaxLines: 6,
      visualRatio: 46,
      cornerRadius: 12,
      narrative: `For ${plan.audience}: ${plan.objective}`,
    },
    slides,
    version: deck.version + 1,
    updatedAt: new Date().toISOString(),
    designSystem: plan.designSource === 'imported_template'
      ? {
        source: 'imported_template' as const,
        name: deck.importedTemplate?.name ?? 'Imported PowerPoint',
        headingFont: deck.importedTemplate?.headingFont ?? FONT_FAMILY,
        bodyFont: deck.importedTemplate?.bodyFont ?? FONT_FAMILY,
        recipeCount: deck.importedTemplate?.layouts.length ?? 0,
      }
      : {
        source: 'generated' as const,
        name: `${plan.artDirection[0].toUpperCase()}${plan.artDirection.slice(1)} system`,
        artDirection: plan.artDirection,
        headingFont: FONT_FAMILY,
        bodyFont: FONT_FAMILY,
        recipeCount: GENERATED_LAYOUT_RECIPES.length,
      },
  } satisfies Deck;
};

export const reviseSlideFromBrief = (deck: Deck, slideId: string, brief: SlideBrief): Deck => {
  const index = deck.slides.findIndex((slide) => slide.id === slideId);
  if (index < 0) throw new Error(`Slide “${slideId}” was not found.`);
  const recipe = chooseRecipe(brief);
  const theme = deck.theme;
  const built = brief.sourceSlideId || brief.templateLayoutId
    ? buildTemplateSlide(deck, { ...brief, layoutRecipeId: recipe })
    : buildGeneratedSlide(deck, { ...brief, layoutRecipeId: recipe }, index, theme);
  const stable = {
    ...built,
    id: slideId,
    elements: built.elements.map((element, elementIndex) => ({ ...element, id: `${slideId}-${element.role}-${elementIndex + 1}` })),
  };
  return {
    ...deck,
    slides: deck.slides.map((slide) => slide.id === slideId ? stable : slide),
    version: deck.version + 1,
    updatedAt: new Date().toISOString(),
  };
};
