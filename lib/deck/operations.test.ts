import { describe, expect, it } from 'vitest';

import { createDemoDeck } from './demo-deck';
import {
  addElementsToSlide,
  addSlideToDeck,
  arrangeSlideElements,
  composeSlides,
  createBlankSlide,
  getSlide,
  moveSlideAfter,
  removeElementsFromSlide,
  updateSlideElements,
} from './operations';

describe('deck operations', () => {
  it('patches an element without mutating the source deck', () => {
    const source = createDemoDeck();
    const result = updateSlideElements(source, 'slide-01', [
      { elementId: 's1-title', patch: { y: 12, style: { fontSize: 72 } } },
    ]);

    expect(getSlide(source, 'slide-01').elements.find((item) => item.id === 's1-title')?.y).toBe(20);
    const changed = getSlide(result, 'slide-01').elements.find((item) => item.id === 's1-title');
    expect(changed?.y).toBe(12);
    expect(changed?.style.fontSize).toBe(72);
    expect(result.version).toBe(source.version + 1);
  });

  it('rejects unknown semantic IDs with a recoverable error', () => {
    const source = createDemoDeck();
    expect(() => updateSlideElements(source, 'slide-01', [
      { elementId: 'missing-title', patch: { y: 10 } },
    ])).toThrow(/Unknown element IDs: missing-title/);
  });

  it('batches additions and clamps unsafe geometry', () => {
    const source = createDemoDeck();
    const result = addElementsToSlide(source, 'slide-01', [{
      id: 'agent-card', type: 'card', role: 'visual', content: 'Signal',
      x: -80, y: 140, width: 0, height: 180,
    }]);

    const added = getSlide(result.deck, 'slide-01').elements.find((item) => item.id === 'agent-card');
    expect(result.elementIds).toEqual(['agent-card']);
    expect(added).toMatchObject({ x: -20, y: 120, width: 1, height: 120 });
  });

  it('aligns a semantic group in one operation', () => {
    const source = createDemoDeck();
    const result = arrangeSlideElements(
      source,
      'slide-02',
      ['s2-card-1', 's2-card-2', 's2-card-3'],
      'align_left',
    );
    const cards = getSlide(result, 'slide-02').elements.filter((item) => item.id.startsWith('s2-card'));
    expect(new Set(cards.map((item) => item.x))).toEqual(new Set([7]));
  });

  it('creates, inserts, and reorders narrative slides', () => {
    const source = createDemoDeck();
    const created = createBlankSlide(source, 'A new proof point', 'two_column');
    const inserted = addSlideToDeck(source, created, 'slide-02');
    expect(inserted.slides[2].id).toBe(created.id);
    expect(created.elements).toHaveLength(3);

    const moved = moveSlideAfter(inserted, created.id);
    expect(moved.slides[0].id).toBe(created.id);
  });

  it('removes only the requested elements', () => {
    const source = createDemoDeck();
    const beforeCount = getSlide(source, 'slide-01').elements.length;
    const result = removeElementsFromSlide(source, 'slide-01', ['s1-core', 's1-ui']);
    expect(getSlide(result, 'slide-01').elements).toHaveLength(beforeCount - 2);
    expect(getSlide(result, 'slide-01').elements.some((item) => item.id === 's1-title')).toBe(true);
  });

  it('composes a template-aware deck in one versioned operation', () => {
    const source = createDemoDeck();
    const result = composeSlides(source, [
      {
        title: 'A reused visual system',
        sourceSlideId: 'slide-02',
        slots: [
          { role: 'body', values: ['The source composition is preserved while its semantic slots change.'] },
          { role: 'visual', values: ['Inspect', 'Compose', 'Review'] },
        ],
        additions: [{
          id: 'flow-arrow', type: 'shape', role: 'accent', shapePreset: 'rightArrow', content: '',
          x: 46, y: 70, width: 8, height: 6, style: { fill: '#6676ef' },
        }],
      },
    ], { mode: 'replace', deckTitle: 'Composed deck' });

    expect(result.deck.version).toBe(source.version + 1);
    expect(result.deck.title).toBe('Composed deck');
    expect(result.deck.slides).toHaveLength(1);
    expect(result.deck.slides[0].background).toBe(source.slides[1].background);
    expect(result.deck.slides[0].elements.some((element) => element.shapePreset === 'rightArrow')).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it('returns a recoverable warning for missing semantic slots', () => {
    const source = createDemoDeck();
    const result = composeSlides(source, [{
      title: 'Sparse slide', layout: 'statement', slots: [{ role: 'data', values: ['42'] }],
    }], { mode: 'append' });
    expect(result.warnings[0]).toMatch(/no data slot 1/);
  });

  it('preserves paragraph and run styling when semantic content changes', () => {
    const source = createDemoDeck();
    source.slides[0].elements[0].richText = [{
      bullet: '●',
      marginLeft: 12,
      runs: [{ text: 'Old copy', style: { fontFamily: 'Noto Sans JP', fontSize: 18, fontWeight: 700 } }],
    }];
    source.slides[0].elements[0].content = 'Old copy';
    const result = updateSlideElements(source, 'slide-01', [
      { elementId: 's1-kicker', patch: { content: 'New copy' } },
    ]);
    const changed = getSlide(result, 'slide-01').elements[0];
    expect(changed.richText?.[0]).toMatchObject({ bullet: '●', marginLeft: 12 });
    expect(changed.richText?.[0].runs[0]).toMatchObject({ text: 'New copy', style: { fontSize: 18, fontWeight: 700 } });
  });

  it('keeps the slide name in sync when its title element changes', () => {
    const source = createDemoDeck();
    const result = updateSlideElements(source, 'slide-01', [
      { elementId: 's1-title', patch: { content: 'A clearer audience-facing title' } },
    ]);

    expect(result.slides[0].title).toBe('A clearer audience-facing title');
  });
});
