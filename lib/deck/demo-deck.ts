import type { Deck, ElementStyle, SlideElement } from './types';

const ink = '#171914';
const paper = '#f1efe6';
const violet = '#6676ef';
const lime = '#d8ff4f';
const coral = '#ff786d';

const element = (
  id: string,
  type: SlideElement['type'],
  role: SlideElement['role'],
  x: number,
  y: number,
  width: number,
  height: number,
  content: string,
  style: ElementStyle = {},
  label?: string,
): SlideElement => ({ id, type, role, x, y, width, height, content, style, label });

export const createDemoDeck = (): Deck => ({
  id: 'deck-agent-native-web',
  title: 'The agent-native web',
  version: 1,
  updatedAt: new Date().toISOString(),
  theme: {
    canvas: paper,
    ink,
    muted: '#66695f',
    accent: violet,
    accentAlt: lime,
    signal: coral,
  },
  grammar: {
    density: 'airy',
    titleTop: 18,
    titleLeft: 7,
    titleMaxWidth: 70,
    bodyMaxLines: 5,
    visualRatio: 48,
    cornerRadius: 18,
    narrative: 'One message per slide. Evidence before claims. Visuals carry half the story.',
  },
  designSystem: {
    source: 'generated',
    name: 'Deckhand showcase system',
    artDirection: 'editorial',
    headingFont: 'Noto Sans JP',
    bodyFont: 'Noto Sans JP',
    recipeCount: 11,
  },
  slides: [
    {
      id: 'slide-01',
      title: 'The agent-native canvas',
      background: paper,
      notes: 'Open with the difference between visual UI and semantic tools.',
      provenance: {
        source: 'generated', recipeId: 'cover_minimal', purpose: 'cover',
        brief: { purpose: 'cover', takeaway: 'The agent-native canvas', eyebrow: 'THE AGENT-NATIVE WEB', body: 'Deckhand gives humans a visual canvas and agents a semantic one—both editing the same live presentation.' },
      },
      elements: [
        element('s1-kicker', 'pill', 'kicker', 7, 9, 23, 5, 'THE AGENT-NATIVE WEB', {
          color: ink, fill: 'transparent', fontSize: 14, fontWeight: 720, letterSpacing: 1.4, textTransform: 'uppercase',
        }),
        element('s1-title', 'text', 'title', 7, 20, 63, 24, 'Interfaces people can see.\nTools agents can trust.', {
          color: ink, fontSize: 66, fontWeight: 690, lineHeight: 0.98, letterSpacing: -3.5,
        }),
        element('s1-summary', 'text', 'body', 7.3, 69, 43, 14, 'Deckhand gives humans a visual canvas and agents a semantic one—both editing the same live presentation.', {
          color: '#4d5049', fontSize: 21, fontWeight: 430, lineHeight: 1.4, letterSpacing: -0.4,
        }),
        element('s1-ring-outer', 'shape', 'visual', 64, 41, 31, 55, '', {
          fill: 'transparent', stroke: '#74786f', strokeWidth: 2, radius: 999,
        }),
        element('s1-ring-inner', 'shape', 'visual', 69, 50, 21, 37, '', {
          fill: 'transparent', stroke: violet, strokeWidth: 3, radius: 999,
        }),
        element('s1-core', 'shape', 'accent', 76.2, 62.8, 7, 12.5, '✦', {
          color: ink, fill: lime, fontSize: 28, fontWeight: 700, textAlign: 'center', radius: 999, shadow: '0 14px 35px #65721f38',
        }),
        element('s1-ui', 'pill', 'label', 58.5, 63, 12, 5.8, 'Human UI', {
          color: ink, fill: paper, stroke: '#a5a79f', strokeWidth: 1, fontSize: 14, fontWeight: 650, radius: 999, textAlign: 'center', shadow: '0 7px 18px #24251f17',
        }),
        element('s1-state', 'pill', 'label', 82.5, 48, 12, 5.8, 'Live state', {
          color: ink, fill: paper, stroke: '#a5a79f', strokeWidth: 1, fontSize: 14, fontWeight: 650, radius: 999, textAlign: 'center', shadow: '0 7px 18px #24251f17',
        }),
        element('s1-webmcp', 'pill', 'label', 85, 78, 11, 5.8, 'WebMCP', {
          color: '#ffffff', fill: violet, stroke: violet, strokeWidth: 1, fontSize: 14, fontWeight: 680, radius: 999, textAlign: 'center', shadow: '0 7px 18px #3541a938',
        }),
        element('s1-footer', 'text', 'footer', 7, 92, 88, 3, 'DECKHAND / 2026                                                         01', {
          color: '#777a72', fontSize: 12, fontWeight: 650, letterSpacing: 1.2,
        }),
      ],
    },
    {
      id: 'slide-02',
      title: 'Where generation breaks',
      background: '#ebe9df',
      notes: 'Show the broken handoff after AI generation.',
      provenance: {
        source: 'generated', recipeId: 'process_flow', purpose: 'process',
        brief: { purpose: 'process', takeaway: 'The handoff is the bug.', eyebrow: 'THE BROKEN HANDOFF', body: 'Today’s AI slide tools stop collaborating the moment a human starts refining the work.', steps: [{ label: 'Prompt' }, { label: 'Generate' }, { label: 'Rebuild' }] },
      },
      elements: [
        element('s2-kicker', 'pill', 'kicker', 7, 8, 20, 5, 'THE BROKEN HANDOFF', { color: violet, fontSize: 14, fontWeight: 720, letterSpacing: 1.4 }),
        element('s2-title', 'text', 'title', 7, 18, 55, 16, 'The handoff is the bug.', { color: ink, fontSize: 61, fontWeight: 690, lineHeight: 1, letterSpacing: -3 }),
        element('s2-body', 'text', 'body', 7.2, 37, 38, 14, 'Today’s AI slide tools stop collaborating the moment a human starts refining the work.', { color: '#565950', fontSize: 21, lineHeight: 1.42 }),
        element('s2-stat', 'stat', 'data', 73, 13, 20, 20, '1st', { color: ink, fill: lime, fontSize: 54, fontWeight: 720, radius: 18, textAlign: 'center', shadow: '0 16px 40px #727c3129' }, 'draft is where collaboration stops'),
        element('s2-card-1', 'card', 'visual', 7, 62, 24, 24, 'Prompt', { color: ink, fill: '#f7f5ed', stroke: '#d1cfc5', strokeWidth: 1, fontSize: 26, fontWeight: 660, radius: 16, padding: 20 }, 'Describe every decision'),
        element('s2-line-1', 'line', 'visual', 31, 74, 6, 1, '', { stroke: '#9b9d95', strokeWidth: 2 }),
        element('s2-card-2', 'card', 'visual', 37, 62, 24, 24, 'Generate', { color: '#ffffff', fill: violet, fontSize: 26, fontWeight: 660, radius: 16, padding: 20 }, 'Accept a black box'),
        element('s2-line-2', 'line', 'visual', 61, 74, 6, 1, '', { stroke: '#9b9d95', strokeWidth: 2 }),
        element('s2-card-3', 'card', 'visual', 67, 62, 26, 24, 'Rebuild', { color: ink, fill: '#f7f5ed', stroke: coral, strokeWidth: 2, fontSize: 26, fontWeight: 660, radius: 16, padding: 20 }, 'Lose the AI context'),
        element('s2-footer', 'text', 'footer', 7, 92, 88, 3, 'THE PROBLEM                                                           02', { color: '#777a72', fontSize: 12, fontWeight: 650, letterSpacing: 1.2 }),
      ],
    },
    {
      id: 'slide-03',
      title: 'A semantic scene graph',
      background: '#171815',
      notes: 'Explain why WebMCP creates a domain-semantic interface.',
      provenance: {
        source: 'generated', recipeId: 'split_editorial', purpose: 'split',
        brief: { purpose: 'split', takeaway: 'A scene graph agents can reason about.', eyebrow: 'SEMANTICS, NOT COORDINATES', body: 'Typed domain operations expose narrative, layout, elements, and live human intent.' },
      },
      elements: [
        element('s3-kicker', 'pill', 'kicker', 7, 8, 26, 5, 'SEMANTICS, NOT COORDINATES', { color: lime, fontSize: 14, fontWeight: 720, letterSpacing: 1.4 }),
        element('s3-title', 'text', 'title', 7, 18, 60, 17, 'A scene graph agents can reason about.', { color: '#f3f1e8', fontSize: 58, fontWeight: 680, lineHeight: 1.02, letterSpacing: -2.8 }),
        element('s3-code', 'code', 'visual', 7, 45, 43, 36, 'inspect_project({ scope: "summary" })\n\nplan_deck({\n  audience, objective, slides\n})\n\ncompose_deck({ plan_id })\nvalidate_deck({})', { color: '#d7d9cf', fill: '#22231f', stroke: '#3d3f38', strokeWidth: 1, fontSize: 16, lineHeight: 1.45, radius: 16, padding: 22 }),
        element('s3-node-1', 'card', 'visual', 60, 44, 31, 12, 'Slide', { color: '#f3f1e8', fill: '#22231f', stroke: '#454740', strokeWidth: 1, fontSize: 21, fontWeight: 650, radius: 14, padding: 17 }, 'Narrative + layout'),
        element('s3-node-2', 'card', 'visual', 60, 61, 31, 12, 'Element', { color: '#171815', fill: lime, fontSize: 21, fontWeight: 680, radius: 14, padding: 17 }, 'Role + geometry + style'),
        element('s3-node-3', 'card', 'visual', 60, 78, 31, 12, 'Selection', { color: '#ffffff', fill: violet, fontSize: 21, fontWeight: 680, radius: 14, padding: 17 }, 'The human’s live intent'),
        element('s3-footer', 'text', 'footer', 7, 94, 88, 3, 'THE INTERFACE                                                          03', { color: '#777a72', fontSize: 12, fontWeight: 650, letterSpacing: 1.2 }),
      ],
    },
    {
      id: 'slide-04',
      title: 'Show, don’t prompt',
      background: paper,
      notes: 'Demonstrate that a human edit becomes useful context for the agent.',
      provenance: {
        source: 'generated', recipeId: 'comparison_balanced', purpose: 'comparison',
        brief: { purpose: 'comparison', takeaway: 'Show, don’t prompt.', eyebrow: 'DIRECT MANIPULATION', body: 'One deliberate edit can teach the agent more than a paragraph of instructions.', columns: [{ heading: 'Before', body: 'Long copy and low contrast.' }, { heading: 'After', body: 'One signal made visible.' }] },
      },
      elements: [
        element('s4-kicker', 'pill', 'kicker', 7, 8, 21, 5, 'DIRECT MANIPULATION', { color: violet, fontSize: 14, fontWeight: 720, letterSpacing: 1.4 }),
        element('s4-title', 'text', 'title', 7, 17, 61, 15, 'Show, don’t prompt.', { color: ink, fontSize: 62, fontWeight: 690, letterSpacing: -3 }),
        element('s4-body', 'text', 'body', 7.2, 35, 44, 10, 'One deliberate edit can teach the agent more than a paragraph of instructions.', { color: '#55584f', fontSize: 21, lineHeight: 1.4 }),
        element('s4-before-label', 'pill', 'label', 7, 54, 11, 5, 'BEFORE', { color: '#777a71', fill: '#e3e1d8', fontSize: 12, fontWeight: 700, radius: 999, textAlign: 'center' }),
        element('s4-before', 'card', 'visual', 7, 61, 34, 25, 'Everything we know about the market', { color: ink, fill: '#f9f7ef', stroke: '#d0cec5', strokeWidth: 1, fontSize: 22, fontWeight: 630, radius: 14, padding: 18 }, 'Long copy · tight spacing · low contrast'),
        element('s4-arrow', 'text', 'accent', 46, 68, 8, 10, '→', { color: violet, fontSize: 58, fontWeight: 450, textAlign: 'center' }),
        element('s4-after-label', 'pill', 'label', 59, 54, 10, 5, 'AFTER', { color: '#171815', fill: lime, fontSize: 12, fontWeight: 750, radius: 999, textAlign: 'center' }),
        element('s4-after', 'card', 'visual', 59, 61, 34, 25, 'One signal.\nMade visible.', { color: '#ffffff', fill: violet, fontSize: 31, fontWeight: 680, lineHeight: 1.03, radius: 14, padding: 18 }, '–46% copy · +32% whitespace'),
        element('s4-footer', 'text', 'footer', 7, 93, 88, 3, 'THE COLLABORATION                                                     04', { color: '#777a72', fontSize: 12, fontWeight: 650, letterSpacing: 1.2 }),
      ],
    },
    {
      id: 'slide-05',
      title: 'The agent-native slide editor',
      background: '#d8ff4f',
      notes: 'Land the product vision and the four judging dimensions.',
      provenance: {
        source: 'generated', recipeId: 'closing_action', purpose: 'closing',
        brief: { purpose: 'closing', takeaway: 'A slide editor agents can actually operate.', eyebrow: 'DECKHAND', body: 'Humans shape the story by sight. Agents shape it through a precise, inspectable tool surface.', points: ['Build with the shared canvas'] },
      },
      elements: [
        element('s5-kicker', 'pill', 'kicker', 7, 8, 14, 5, 'DECKHAND', { color: ink, fontSize: 14, fontWeight: 760, letterSpacing: 1.5 }),
        element('s5-title', 'text', 'title', 7, 18, 70, 23, 'A slide editor agents can actually operate.', { color: ink, fontSize: 66, fontWeight: 710, lineHeight: 0.98, letterSpacing: -3.5 }),
        element('s5-body', 'text', 'body', 7, 44, 50, 10, 'Humans shape the story by sight. Agents shape it through a precise, inspectable tool surface.', { color: '#363a2a', fontSize: 21, lineHeight: 1.42 }),
        element('s5-card-1', 'card', 'visual', 7, 66, 20, 18, 'Visual', { color: '#ffffff', fill: '#171815', fontSize: 22, fontWeight: 690, radius: 14, padding: 17 }, 'Direct editing'),
        element('s5-card-2', 'card', 'visual', 29, 66, 20, 18, 'Focused', { color: '#ffffff', fill: '#171815', fontSize: 22, fontWeight: 690, radius: 14, padding: 17 }, '8 typed tools'),
        element('s5-card-3', 'card', 'visual', 51, 66, 20, 18, 'Reversible', { color: '#ffffff', fill: '#171815', fontSize: 22, fontWeight: 690, radius: 14, padding: 17 }, 'Shared history'),
        element('s5-card-4', 'card', 'visual', 73, 66, 20, 18, 'Extensible', { color: '#ffffff', fill: violet, fontSize: 22, fontWeight: 690, radius: 14, padding: 17 }, 'Open JSON'),
        element('s5-footer', 'text', 'footer', 7, 93, 88, 3, 'THE PRODUCT                                                           05', { color: '#4f5536', fontSize: 12, fontWeight: 680, letterSpacing: 1.2 }),
      ],
    },
  ],
});

export const DEMO_DECK = createDemoDeck();
