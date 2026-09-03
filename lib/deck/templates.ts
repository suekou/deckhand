import type { Locale } from '@/lib/i18n';
import { composeDeckFromPlan, createDeckPlan } from './design-system';
import { createDemoDeck } from './demo-deck';
import { createId } from './operations';
import type { ArtDirection, Deck, SlideBrief } from './types';

export type DeckTemplateId = 'blank' | 'pitch' | 'project_update' | 'showcase';

const copy = {
  en: {
    untitled: 'Untitled presentation',
    blankBody: 'Ask your browser agent to turn a goal and source material into a complete, editable deck.',
    pitchTitle: 'A better way to solve the problem',
    pitchAudience: 'Decision-makers evaluating a new product',
    pitchObjective: 'Understand the opportunity, believe the solution, and agree on the next step.',
    pitchSlides: [
      { purpose: 'cover', takeaway: 'A better way to solve the problem', eyebrow: 'PRODUCT STORY', body: 'Replace this line with the promise your audience should remember.' },
      { purpose: 'claim', takeaway: 'The current workflow creates avoidable friction', eyebrow: 'THE PROBLEM', body: 'Describe the costly behavior, who experiences it, and why existing alternatives fall short.' },
      { purpose: 'three_points', takeaway: 'The solution removes the three largest barriers', eyebrow: 'THE SOLUTION', columns: [
        { heading: 'Faster start', body: 'Show the first advantage in one concrete sentence.' },
        { heading: 'Better control', body: 'Explain how users stay in charge of the outcome.' },
        { heading: 'Durable output', body: 'Show why the result remains useful after generation.' },
      ] },
      { purpose: 'metrics', takeaway: 'Evidence turns the promise into a decision', eyebrow: 'PROOF', metrics: [
        { value: '—', label: 'Verified outcome or customer signal' },
        { value: '—', label: 'Verified efficiency or quality measure' },
        { value: '—', label: 'Verified adoption or business measure' },
      ] },
      { purpose: 'closing', takeaway: 'Make the next step specific and easy to approve', eyebrow: 'NEXT STEP', body: 'Name the decision, owner, and expected outcome.', points: ['Replace with one concrete action'] },
    ] satisfies SlideBrief[],
    projectTitle: 'Project update',
    projectAudience: 'Sponsors and delivery stakeholders',
    projectObjective: 'Understand progress, resolve the important decisions, and align on the next milestone.',
    projectSlides: [
      { purpose: 'cover', takeaway: 'Project update', eyebrow: 'STATUS REVIEW', body: 'What changed, what matters now, and what the team needs next.' },
      { purpose: 'claim', takeaway: 'Lead with the one development that changes the outlook', eyebrow: 'EXECUTIVE SUMMARY', body: 'State the current status and its implication for the audience.' },
      { purpose: 'metrics', takeaway: 'Progress is clearest when outcomes lead', eyebrow: 'OUTCOMES', metrics: [
        { value: '—', label: 'Outcome achieved' },
        { value: '—', label: 'Milestone completed' },
        { value: '—', label: 'Quality or delivery signal' },
      ] },
      { purpose: 'comparison', takeaway: 'Separate manageable risks from decisions that need help', eyebrow: 'RISKS & DECISIONS', columns: [
        { heading: 'Team can resolve', body: 'List the highest-impact risk already owned by the team.' },
        { heading: 'Sponsor decision', body: 'State the decision, deadline, and consequence of waiting.' },
      ] },
      { purpose: 'timeline', takeaway: 'The next milestones move from output to outcome', eyebrow: 'NEXT', steps: [
        { label: 'Now', detail: 'Current focus' },
        { label: 'Next', detail: 'Immediate milestone' },
        { label: 'Then', detail: 'Outcome checkpoint' },
      ] },
    ] satisfies SlideBrief[],
  },
  ja: {
    untitled: '無題のプレゼンテーション',
    blankBody: '目的と素材をブラウザエージェントに伝えると、編集可能な完成デッキへ構成します。',
    pitchTitle: '課題を解決する、より良い方法',
    pitchAudience: '新しいプロダクトを評価する意思決定者',
    pitchObjective: '機会を理解し、解決策に納得し、次のアクションを決められる状態にする。',
    pitchSlides: [
      { purpose: 'cover', takeaway: '課題を解決する、より良い方法', eyebrow: 'プロダクトストーリー', body: '相手に覚えてほしい約束を、一文で記載してください。' },
      { purpose: 'claim', takeaway: '現在のやり方には、避けられる摩擦が残っている', eyebrow: '解決すべき課題', body: '誰が、どの場面で、どのような損失を感じているかを具体的に記載します。' },
      { purpose: 'three_points', takeaway: '解決策は、3つの大きな障壁を取り除く', eyebrow: '私たちの解決策', columns: [
        { heading: 'すぐ始められる', body: '最初の価値を具体的な一文で説明します。' },
        { heading: '人が制御できる', body: '利用者が結果を調整できる理由を示します。' },
        { heading: '成果が残る', body: '生成後も使い続けられる価値を示します。' },
      ] },
      { purpose: 'metrics', takeaway: '根拠が、期待を意思決定へ変える', eyebrow: '成果を示す根拠', metrics: [
        { value: '—', label: '検証済みの成果や顧客シグナル' },
        { value: '—', label: '検証済みの効率・品質指標' },
        { value: '—', label: '検証済みの利用・事業指標' },
      ] },
      { purpose: 'closing', takeaway: '次の一手を、具体的で承認しやすい形にする', eyebrow: '次のアクション', body: '意思決定の内容、担当者、期待する成果を明記します。', points: ['具体的なアクションに置き換える'] },
    ] satisfies SlideBrief[],
    projectTitle: 'プロジェクト進捗',
    projectAudience: 'プロジェクト責任者と関係者',
    projectObjective: '進捗を理解し、重要な意思決定を行い、次のマイルストーンを揃える。',
    projectSlides: [
      { purpose: 'cover', takeaway: 'プロジェクト進捗', eyebrow: 'ステータスレビュー', body: '変わったこと、いま重要なこと、次に必要なこと。' },
      { purpose: 'claim', takeaway: '今後の見通しを変える、最も重要な変化から伝える', eyebrow: 'エグゼクティブサマリー', body: '現在の状態と、その意味を一文ずつ記載します。' },
      { purpose: 'metrics', takeaway: '作業量ではなく、成果で進捗を示す', eyebrow: '進捗と成果', metrics: [
        { value: '—', label: '達成した成果' },
        { value: '—', label: '完了したマイルストーン' },
        { value: '—', label: '品質またはデリバリー指標' },
      ] },
      { purpose: 'comparison', takeaway: 'チーム内で解決するリスクと、支援が必要な判断を分ける', eyebrow: 'リスクと意思決定', columns: [
        { heading: 'チームで解決', body: '担当と対策が決まっている重要リスクを記載します。' },
        { heading: '意思決定が必要', body: '判断内容、期限、待つ場合の影響を記載します。' },
      ] },
      { purpose: 'timeline', takeaway: '次のマイルストーンを、成果までつなげる', eyebrow: '次のマイルストーン', steps: [
        { label: '現在', detail: 'いまの焦点' },
        { label: '次', detail: '直近の節目' },
        { label: 'その後', detail: '成果の確認' },
      ] },
    ] satisfies SlideBrief[],
  },
} as const;

const createBaseDeck = (title: string): Deck => {
  const showcase = createDemoDeck();
  return {
    ...showcase,
    id: createId('deck'),
    title,
    version: 1,
    updatedAt: new Date().toISOString(),
    slides: [],
    importedTemplate: undefined,
  };
};

const buildGeneratedDeck = (
  title: string,
  audience: string,
  objective: string,
  slides: SlideBrief[],
  artDirection: ArtDirection,
) => {
  const base = createBaseDeck(title);
  const plan = createDeckPlan(base, {
    title,
    audience,
    objective,
    artDirection,
    designMode: 'generated',
    slides,
  });
  return composeDeckFromPlan(base, plan, { mode: 'replace' });
};

export const createDeckFromTemplate = (templateId: DeckTemplateId, locale: Locale): Deck => {
  if (templateId === 'showcase') return createDemoDeck();
  const value = copy[locale];
  if (templateId === 'pitch') {
    return buildGeneratedDeck(value.pitchTitle, value.pitchAudience, value.pitchObjective, [...value.pitchSlides], 'bold');
  }
  if (templateId === 'project_update') {
    return buildGeneratedDeck(value.projectTitle, value.projectAudience, value.projectObjective, [...value.projectSlides], 'calm');
  }
  return buildGeneratedDeck(
    value.untitled,
    locale === 'ja' ? 'これから定義する対象者' : 'Audience to be defined',
    locale === 'ja' ? '目的と素材から、伝わるスライドを共同制作する。' : 'Co-create a clear presentation from the goal and source material.',
    [{ purpose: 'cover', takeaway: value.untitled, eyebrow: 'DECKHAND', body: value.blankBody }],
    'editorial',
  );
};
