import { describe, expect, it } from 'vitest';

import { createDemoDeck } from './demo-deck';
import { reviewDeckPage, reviewSlide } from './review';

describe('deck review', () => {
  it('returns stable pagination without truncating the payload', () => {
    const deck = createDemoDeck();
    const result = reviewDeckPage(deck, 0, 2);
    expect(result.slides).toHaveLength(2);
    expect(result.page).toEqual({ offset: 0, limit: 2, total: 5, nextOffset: 2 });
  });

  it('flags elements outside the canvas and text-only compositions', () => {
    const deck = createDemoDeck();
    const slide = structuredClone(deck.slides[0]);
    slide.elements = [{
      id: 'outside', type: 'text', role: 'body', content: 'Only text',
      x: 95, y: 95, width: 20, height: 12, style: { fontSize: 22 },
    }];
    const result = reviewSlide(deck, slide, 1);
    expect(result.issues.some((issue) => issue.code === 'outside_canvas')).toBe(true);
  });
});
