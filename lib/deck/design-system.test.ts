import { describe, expect, it } from 'vitest';

import { createDeckPlan, composeDeckFromPlan, GENERATED_LAYOUT_RECIPES, reviseSlideFromBrief } from './design-system';
import { createDemoDeck } from './demo-deck';

describe('semantic deck composer', () => {
  it('plans and composes a varied template-free deck', () => {
    const source = createDemoDeck();
    source.importedTemplate = {
      id: 'template-old',
      name: 'Old imported template',
      fileName: 'old.pptx',
      format: 'pptx',
      importedAt: new Date(0).toISOString(),
      sourceSlideCount: 1,
      sourceLayoutCount: 0,
      headingFont: 'Arial',
      bodyFont: 'Arial',
      palette: ['#000000'],
      fidelityScore: 100,
      warnings: [],
      layouts: [],
    };
    const plan = createDeckPlan(source, {
      title: 'Agent-native slides',
      audience: 'Hackathon judges',
      objective: 'Understand the product and believe it produces polished editable slides.',
      designMode: 'generated',
      artDirection: 'technical',
      slides: [
        { purpose: 'cover', takeaway: 'Humans and agents can finally share one slide canvas', body: 'A semantic editor with visible, reversible collaboration.' },
        { purpose: 'comparison', takeaway: 'Generation becomes collaboration instead of a handoff', columns: [
          { heading: 'Before', body: 'Opaque output that must be rebuilt.' },
          { heading: 'Deckhand', body: 'Editable structure shared with the agent.' },
        ] },
        { purpose: 'process', takeaway: 'One quality loop replaces repeated prompting', steps: [
          { label: 'Plan', detail: 'Agree on the narrative.' },
          { label: 'Compose', detail: 'Use constrained recipes.' },
          { label: 'Validate', detail: 'Measure the rendered result.' },
        ] },
        { purpose: 'closing', takeaway: 'The result stays useful after the AI is done', points: ['Export an editable deck'] },
      ],
    });
    const result = composeDeckFromPlan(source, plan, { mode: 'replace' });

    expect(result.slides).toHaveLength(4);
    expect(result.designSystem).toMatchObject({ source: 'generated', artDirection: 'technical' });
    expect(result.importedTemplate).toBeUndefined();
    expect(new Set(result.slides.map((slide) => slide.provenance?.recipeId)).size).toBe(4);
    expect(result.slides.every((slide) => slide.elements.length >= 4)).toBe(true);
  });

  it('recomposes a slide while preserving its stable slide ID', () => {
    const source = createDemoDeck();
    const revised = reviseSlideFromBrief(source, 'slide-02', {
      purpose: 'metrics',
      takeaway: 'Three measures prove the workflow is improving',
      metrics: [
        { value: '2×', label: 'Faster first draft' },
        { value: '0', label: 'Unintended overflows' },
        { value: '100%', label: 'Editable elements' },
      ],
    });

    expect(revised.slides[1].id).toBe('slide-02');
    expect(revised.slides[1].provenance?.recipeId).toBe('metrics_editorial');
    expect(revised.slides[1].elements.some((element) => element.content === '2×')).toBe(true);
  });

  it('publishes a bounded, non-overlapping recipe catalog', () => {
    expect(GENERATED_LAYOUT_RECIPES).toHaveLength(11);
    expect(new Set(GENERATED_LAYOUT_RECIPES.map((recipe) => recipe.purpose)).size).toBe(11);
  });
});
