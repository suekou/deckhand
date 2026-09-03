import { describe, expect, it } from 'vitest';

import { createDeckFromTemplate } from './templates';

describe('deck templates', () => {
  it('creates a five-slide English pitch narrative', () => {
    const deck = createDeckFromTemplate('pitch', 'en');

    expect(deck.slides).toHaveLength(5);
    expect(deck.title).toBe('A better way to solve the problem');
    expect(deck.slides.map((slide) => slide.title)).toEqual([
      'A better way to solve the problem',
      'The current workflow creates avoidable friction',
      'The solution removes the three largest barriers',
      'Evidence turns the promise into a decision',
      'Make the next step specific and easy to approve',
    ]);
    expect(new Set(deck.slides.map((slide) => slide.provenance?.recipeId)).size).toBe(5);
  });

  it('localizes editable template content into Japanese', () => {
    const deck = createDeckFromTemplate('project_update', 'ja');
    expect(deck.slides).toHaveLength(5);
    expect(deck.title).toBe('プロジェクト進捗');
    expect(deck.grammar.narrative).toContain('進捗を理解');
    expect(deck.designSystem).toMatchObject({ source: 'generated', artDirection: 'calm' });
    expect(deck.slides[3].provenance?.purpose).toBe('comparison');
  });

  it('preserves the original English showcase for judging', () => {
    const deck = createDeckFromTemplate('showcase', 'ja');

    expect(deck.slides).toHaveLength(5);
    expect(deck.title).toBe('The agent-native web');
    expect(deck.slides[0].title).toBe('The agent-native canvas');
  });
});
