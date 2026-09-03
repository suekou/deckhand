import type {
  AgentElementInput,
  ArrangeOperation,
  BuiltInSlideLayout,
  Deck,
  ElementPatch,
  Slide,
  SlideCompositionInput,
  SlideCompositionResult,
  SlideElement,
  TemplateLayout,
} from './types';

export const clamp = (value: number, min = 0, max = 100) =>
  Math.min(max, Math.max(min, value));

export const createId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export const getSlide = (deck: Deck, slideId: string): Slide => {
  const slide = deck.slides.find((candidate) => candidate.id === slideId);
  if (!slide) throw new Error(`Slide "${slideId}" was not found. Inspect the deck for valid slide IDs.`);
  return slide;
};

export const getElements = (deck: Deck, slideId: string, elementIds: string[]) => {
  const slide = getSlide(deck, slideId);
  const missing = elementIds.filter((id) => !slide.elements.some((element) => element.id === id));
  if (missing.length) throw new Error(`Unknown element IDs: ${missing.join(', ')}. Inspect the slide first.`);
  return slide.elements.filter((element) => elementIds.includes(element.id));
};

export const replaceElementContent = (element: SlideElement, content: string): SlideElement => {
  if (!element.richText?.length) return { ...element, content };
  const lines = content.split('\n');
  const richText = lines.map((line, index) => {
    const source = element.richText![Math.min(index, element.richText!.length - 1)];
    const runStyle = source.runs.find((run) => run.text.length)?.style ?? source.runs[0]?.style;
    return {
      ...structuredClone(source),
      runs: [{ text: line, style: runStyle ? { ...runStyle } : undefined }],
    };
  });
  return { ...element, content, richText };
};

export const patchElement = (element: SlideElement, patch: ElementPatch): SlideElement => {
  const next: SlideElement = {
    ...element,
    ...patch,
    x: patch.x === undefined ? element.x : clamp(patch.x, -20, 120),
    y: patch.y === undefined ? element.y : clamp(patch.y, -20, 120),
    width: patch.width === undefined ? element.width : clamp(patch.width, 1, 120),
    height: patch.height === undefined ? element.height : clamp(patch.height, 1, 120),
    style: { ...element.style, ...patch.style },
  };
  return patch.content === undefined ? next : replaceElementContent(next, patch.content);
};

export const updateSlideElements = (
  deck: Deck,
  slideId: string,
  changes: Array<{ elementId: string; patch: ElementPatch }>,
): Deck => {
  getElements(deck, slideId, changes.map((change) => change.elementId));
  const changeMap = new Map(changes.map((change) => [change.elementId, change.patch]));
  return {
    ...deck,
    updatedAt: new Date().toISOString(),
    version: deck.version + 1,
    slides: deck.slides.map((slide) => {
      if (slide.id !== slideId) return slide;
      const elements = slide.elements.map((element) => {
        const patch = changeMap.get(element.id);
        return patch ? patchElement(element, patch) : element;
      });
      const title = elements.find((element) => element.role === 'title')?.content.trim();
      return { ...slide, title: title || slide.title, elements };
    }),
  };
};

function elementFromInput(deck: Deck, input: AgentElementInput): SlideElement {
  const isLine = input.type === 'line';
  const isText = input.type === 'text';
  return {
    ...input,
    id: input.id ?? createId(input.type),
    style: {
      color: isLine ? deck.theme.muted : deck.theme.ink,
      fill: isText || isLine ? 'transparent' : '#ffffff',
      fontSize: isText ? 32 : 22,
      fontWeight: 620,
      radius: input.shapePreset === 'ellipse' ? 999 : isText || isLine ? 0 : deck.grammar.cornerRadius,
      padding: isText || isLine ? 0 : 18,
      ...input.style,
    },
  };
}

export const addElementsToSlide = (
  deck: Deck,
  slideId: string,
  inputs: AgentElementInput[],
): { deck: Deck; elementIds: string[] } => {
  const slide = getSlide(deck, slideId);
  const existing = new Set(slide.elements.map((element) => element.id));
  const additions = inputs.map((input) => {
    const requestedId = input.id?.trim();
    const id = requestedId && !existing.has(requestedId) ? requestedId : createId(input.type);
    existing.add(id);
    return elementFromInput(deck, {
      ...input,
      id,
      x: clamp(input.x, -20, 120),
      y: clamp(input.y, -20, 120),
      width: clamp(input.width, 1, 120),
      height: clamp(input.height, 1, 120),
    });
  });

  return {
    elementIds: additions.map((addition) => addition.id),
    deck: {
      ...deck,
      updatedAt: new Date().toISOString(),
      version: deck.version + 1,
      slides: deck.slides.map((candidate) =>
        candidate.id === slideId
          ? { ...candidate, elements: [...candidate.elements, ...additions] }
          : candidate,
      ),
    },
  };
};

export const removeElementsFromSlide = (deck: Deck, slideId: string, elementIds: string[]): Deck => {
  getElements(deck, slideId, elementIds);
  return {
    ...deck,
    updatedAt: new Date().toISOString(),
    version: deck.version + 1,
    slides: deck.slides.map((slide) =>
      slide.id === slideId
        ? { ...slide, elements: slide.elements.filter((element) => !elementIds.includes(element.id)) }
        : slide,
    ),
  };
};

export const arrangeSlideElements = (
  deck: Deck,
  slideId: string,
  elementIds: string[],
  operation: ArrangeOperation,
): Deck => {
  const elements = getElements(deck, slideId, elementIds);
  if (elements.length < 2) throw new Error('Arrange operations require at least two valid element IDs.');

  const minX = Math.min(...elements.map((element) => element.x));
  const maxX = Math.max(...elements.map((element) => element.x + element.width));
  const minY = Math.min(...elements.map((element) => element.y));
  const maxY = Math.max(...elements.map((element) => element.y + element.height));
  const byX = [...elements].sort((a, b) => a.x - b.x);
  const byY = [...elements].sort((a, b) => a.y - b.y);
  const horizontalGap =
    (maxX - minX - elements.reduce((total, element) => total + element.width, 0)) /
    Math.max(1, elements.length - 1);
  const verticalGap =
    (maxY - minY - elements.reduce((total, element) => total + element.height, 0)) /
    Math.max(1, elements.length - 1);
  const xMap = new Map<string, number>();
  const yMap = new Map<string, number>();

  if (operation === 'distribute_horizontal') {
    let cursor = minX;
    byX.forEach((element) => {
      xMap.set(element.id, cursor);
      cursor += element.width + horizontalGap;
    });
  }
  if (operation === 'distribute_vertical') {
    let cursor = minY;
    byY.forEach((element) => {
      yMap.set(element.id, cursor);
      cursor += element.height + verticalGap;
    });
  }

  const changes = elements.map((element) => {
    const patch: ElementPatch = {};
    if (operation === 'align_left') patch.x = minX;
    if (operation === 'align_center') patch.x = (minX + maxX - element.width) / 2;
    if (operation === 'align_right') patch.x = maxX - element.width;
    if (operation === 'align_top') patch.y = minY;
    if (operation === 'align_middle') patch.y = (minY + maxY - element.height) / 2;
    if (operation === 'align_bottom') patch.y = maxY - element.height;
    if (operation === 'distribute_horizontal') patch.x = xMap.get(element.id);
    if (operation === 'distribute_vertical') patch.y = yMap.get(element.id);
    return { elementId: element.id, patch };
  });

  return updateSlideElements(deck, slideId, changes);
};

export const createBlankSlide = (
  deck: Deck,
  title: string,
  layout: BuiltInSlideLayout,
): Slide => {
  const id = createId('slide');
  const commonTitle = elementFromInput(deck, {
    id: `${id}-title`, type: 'text', role: 'title', content: title,
    x: 7, y: layout === 'statement' ? 31 : 14, width: layout === 'statement' ? 82 : 70,
    height: layout === 'statement' ? 24 : 14,
    style: { fontSize: layout === 'statement' ? 64 : 52, fontWeight: 690, letterSpacing: -2.5 },
  });
  const elements: SlideElement[] = layout === 'blank' ? [] : [commonTitle];
  if (layout === 'two_column') {
    elements.push(
      elementFromInput(deck, { id: `${id}-left`, type: 'card', role: 'visual', content: 'First idea', label: 'Add supporting detail', x: 7, y: 43, width: 40, height: 34 }),
      elementFromInput(deck, { id: `${id}-right`, type: 'card', role: 'visual', content: 'Second idea', label: 'Add supporting detail', x: 53, y: 43, width: 40, height: 34 }),
    );
  }
  return { id, title, background: deck.theme.canvas, elements };
};

export const createSlideFromTemplateLayout = (
  deck: Deck,
  layout: TemplateLayout,
  title = layout.name,
): Slide => {
  const slideId = createId('slide');
  const elements = layout.elements.map((element, index) => {
    const cloned = {
      ...structuredClone(element),
      id: `${slideId}-${element.role}-${index + 1}`,
      style: { ...element.style },
    };
    return element.role === 'title' && title.trim()
      ? replaceElementContent(cloned, title.trim())
      : cloned;
  });
  return {
    id: slideId,
    title: title.trim() || layout.name,
    background: layout.background,
    elements,
    notes: `Created from imported layout: ${layout.name}`,
    provenance: { source: 'template_layout', sourceId: layout.id, purpose: layout.purposeHint },
  };
};

const readingOrder = (left: SlideElement, right: SlideElement) =>
  (left.y - right.y) || (left.x - right.x) || ((left.zIndex ?? 0) - (right.zIndex ?? 0));

const cloneSourceSlide = (source: Slide, title: string): Slide => {
  const slideId = createId('slide');
  return {
    ...structuredClone(source),
    id: slideId,
    title,
    elements: source.elements.map((element, index) => ({
      ...structuredClone(element),
      id: `${slideId}-${element.role}-${index + 1}`,
    })),
    provenance: { source: 'template_slide', sourceId: source.id, purpose: source.provenance?.purpose },
  };
};

const materializeComposition = (
  deck: Deck,
  input: SlideCompositionInput,
): { slide: Slide; warnings: string[] } => {
  const sources = [input.sourceSlideId, input.templateLayoutId, input.layout].filter(Boolean);
  if (sources.length > 1) {
    throw new Error(`Slide “${input.title}” has multiple sources. Choose source_slide_id, template_layout_id, or layout.`);
  }

  let slide: Slide;
  if (input.sourceSlideId) {
    slide = cloneSourceSlide(getSlide(deck, input.sourceSlideId), input.title);
  } else if (input.templateLayoutId) {
    const layout = deck.importedTemplate?.layouts.find((candidate) => candidate.id === input.templateLayoutId);
    if (!layout) {
      throw new Error(`Imported layout “${input.templateLayoutId}” was not found. Inspect design_grammar for valid IDs.`);
    }
    slide = createSlideFromTemplateLayout(deck, layout, input.title);
  } else {
    slide = createBlankSlide(deck, input.title, input.layout ?? 'blank');
  }

  slide = {
    ...slide,
    title: input.title,
    background: input.background ?? slide.background,
    notes: input.notes ?? slide.notes,
    elements: slide.elements.map((element) => ({ ...element, style: { ...element.style } })),
  };

  const warnings: string[] = [];
  const titleElements = slide.elements.filter((element) => element.role === 'title').sort(readingOrder);
  if (titleElements[0]) {
    const nextTitle = replaceElementContent(titleElements[0], input.title);
    Object.assign(titleElements[0], nextTitle);
  }

  for (const slot of input.slots ?? []) {
    const matches = slide.elements.filter((element) => element.role === slot.role).sort(readingOrder);
    slot.values.forEach((value, index) => {
      if (matches[index]) Object.assign(matches[index], replaceElementContent(matches[index], value));
      else warnings.push(`“${input.title}”: no ${slot.role} slot ${index + 1}; add it explicitly if needed.`);
    });
  }

  const existingIds = new Set(slide.elements.map((element) => element.id));
  for (const addition of input.additions ?? []) {
    const requestedId = addition.id?.trim();
    const id = requestedId && !existingIds.has(requestedId) ? requestedId : createId(addition.type);
    existingIds.add(id);
    slide.elements.push(elementFromInput(deck, {
      ...addition,
      id,
      x: clamp(addition.x, -20, 120),
      y: clamp(addition.y, -20, 120),
      width: clamp(addition.width, 1, 120),
      height: clamp(addition.height, 1, 120),
    }));
  }

  return { slide, warnings };
};

export const composeSlides = (
  deck: Deck,
  inputs: SlideCompositionInput[],
  options: { mode: 'append' | 'replace'; afterSlideId?: string; deckTitle?: string },
): SlideCompositionResult => {
  if (!inputs.length) throw new Error('At least one slide composition is required.');
  const built = inputs.map((input) => materializeComposition(deck, input));
  const created = built.map((item) => item.slide);
  let slides: Slide[];

  if (options.mode === 'replace') {
    slides = created;
  } else if (!options.afterSlideId) {
    slides = [...deck.slides, ...created];
  } else {
    const index = deck.slides.findIndex((slide) => slide.id === options.afterSlideId);
    if (index < 0) throw new Error(`Slide “${options.afterSlideId}” was not found. Inspect the deck for valid IDs.`);
    slides = [...deck.slides];
    slides.splice(index + 1, 0, ...created);
  }

  return {
    slideIds: created.map((slide) => slide.id),
    warnings: built.flatMap((item) => item.warnings),
    deck: {
      ...deck,
      title: options.deckTitle?.trim() || deck.title,
      slides,
      version: deck.version + 1,
      updatedAt: new Date().toISOString(),
    },
  };
};

export const addSlideToDeck = (deck: Deck, slide: Slide, afterSlideId?: string): Deck => {
  const slides = [...deck.slides];
  if (!afterSlideId) slides.push(slide);
  else {
    const index = slides.findIndex((candidate) => candidate.id === afterSlideId);
    if (index === -1) throw new Error(`Slide "${afterSlideId}" was not found. Inspect the deck for valid IDs.`);
    slides.splice(index + 1, 0, slide);
  }
  return { ...deck, slides, version: deck.version + 1, updatedAt: new Date().toISOString() };
};

export const moveSlideAfter = (deck: Deck, slideId: string, afterSlideId?: string): Deck => {
  if (slideId === afterSlideId) throw new Error('A slide cannot be moved after itself.');
  const source = getSlide(deck, slideId);
  const rest = deck.slides.filter((slide) => slide.id !== slideId);
  if (!afterSlideId) rest.unshift(source);
  else {
    const index = rest.findIndex((slide) => slide.id === afterSlideId);
    if (index === -1) throw new Error(`Target slide "${afterSlideId}" was not found.`);
    rest.splice(index + 1, 0, source);
  }
  return { ...deck, slides: rest, version: deck.version + 1, updatedAt: new Date().toISOString() };
};
