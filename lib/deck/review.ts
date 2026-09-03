import type { Deck, Slide, SlideElement } from './types';

export type ReviewSeverity = 'error' | 'warning' | 'info';

export interface SlideReviewIssue {
  code:
    | 'outside_canvas'
    | 'possible_text_overflow'
    | 'possible_collision'
    | 'title_off_grammar'
    | 'low_visual_variety'
    | 'missing_content'
    | 'placeholder_content'
    | 'title_wrap_risk'
    | 'excessive_copy';
  severity: ReviewSeverity;
  message: string;
  elementIds: string[];
}

export interface SlideReview {
  slideId: string;
  index: number;
  title: string;
  score: number;
  composition: ReturnType<typeof summarizeSlideComposition>;
  issues: SlideReviewIssue[];
  issueCount: number;
  omittedIssueCount: number;
}

const countBy = (values: string[]) => values.reduce<Record<string, number>>((counts, value) => {
  counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}, {});

export const summarizeSlideComposition = (slide: Slide) => {
  const semanticVisuals = slide.elements.filter((element) =>
    element.type === 'image'
      || element.type === 'line'
      || element.type === 'code'
      || element.type === 'stat'
      || (element.type === 'shape' && Boolean(element.shapePreset) && !['rect', 'roundRect'].includes(element.shapePreset ?? '')),
  );
  return {
    elementCount: slide.elements.length,
    types: countBy(slide.elements.map((element) => element.type)),
    roles: countBy(slide.elements.map((element) => element.role)),
    semanticVisualCount: semanticVisuals.length,
  };
};

const contentLength = (content: string) => Array.from(content).reduce((total, char) =>
  total + ((char.codePointAt(0) ?? 0) > 255 ? 1 : 0.56), 0);

const mayOverflow = (element: SlideElement) => {
  if (!element.content.trim() || element.type === 'line' || element.type === 'shape' || element.type === 'image') return false;
  const fontSize = Math.max(8, element.style.fontSize ?? 20);
  const horizontalPadding = (element.style.paddingLeft ?? element.style.padding ?? 0)
    + (element.style.paddingRight ?? element.style.padding ?? 0);
  const verticalPadding = (element.style.paddingTop ?? element.style.padding ?? 0)
    + (element.style.paddingBottom ?? element.style.padding ?? 0);
  const usableWidth = Math.max(12, element.width / 100 * 1280 - horizontalPadding);
  const usableHeight = Math.max(8, element.height / 100 * 720 - verticalPadding);
  const charsPerLine = Math.max(1, usableWidth / (fontSize * 0.72));
  const explicitLines = element.content.split('\n');
  const estimatedLines = explicitLines.reduce((total, line) =>
    total + Math.max(1, Math.ceil(contentLength(line) / charsPerLine)), 0);
  const availableLines = usableHeight / (fontSize * (element.style.lineHeight ?? 1.2));
  return estimatedLines > availableLines * 1.18;
};

const intersectionRatio = (left: SlideElement, right: SlideElement) => {
  const width = Math.max(0, Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x));
  const height = Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y));
  const overlap = width * height;
  return overlap / Math.max(0.001, Math.min(left.width * left.height, right.width * right.height));
};

const isCollisionCandidate = (element: SlideElement) =>
  !['line', 'shape', 'image'].includes(element.type)
  && !['accent', 'footer'].includes(element.role)
  && Boolean(element.content.trim());

export const reviewSlide = (deck: Deck, slide: Slide, index: number): SlideReview => {
  const issues: SlideReviewIssue[] = [];
  const canvasTolerance = 0.5;

  slide.elements.forEach((element) => {
    if (
      element.x < -canvasTolerance
      || element.y < -canvasTolerance
      || element.x + element.width > 100 + canvasTolerance
      || element.y + element.height > 100 + canvasTolerance
    ) {
      issues.push({
        code: 'outside_canvas', severity: 'error', elementIds: [element.id],
        message: `${element.id} extends beyond the 0–100 slide canvas.`,
      });
    }
    if (mayOverflow(element)) {
      issues.push({
        code: 'possible_text_overflow', severity: 'warning', elementIds: [element.id],
        message: `${element.id} may not have enough height for its text at the current font size.`,
      });
    }
  });

  const collisionCandidates = slide.elements.filter(isCollisionCandidate);
  for (let leftIndex = 0; leftIndex < collisionCandidates.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < collisionCandidates.length; rightIndex += 1) {
      const left = collisionCandidates[leftIndex];
      const right = collisionCandidates[rightIndex];
      if (intersectionRatio(left, right) > 0.28) {
        issues.push({
          code: 'possible_collision', severity: 'warning', elementIds: [left.id, right.id],
          message: `${left.id} and ${right.id} overlap substantially.`,
        });
      }
    }
  }

  const title = slide.elements.filter((element) => element.role === 'title').sort((a, b) => a.y - b.y)[0];
  if (!title?.content.trim()) {
    issues.push({
      code: 'missing_content', severity: 'error', elementIds: title ? [title.id] : [],
      message: 'The slide needs one clear, audience-facing takeaway title.',
    });
  } else if (contentLength(title.content) > 74 && title.height < 20) {
    issues.push({
      code: 'title_wrap_risk', severity: 'warning', elementIds: [title.id],
      message: `${title.id} is likely to wrap; shorten the takeaway or use a taller title recipe.`,
    });
  }
  if (title && (
    Math.abs(title.x - deck.grammar.titleLeft) > 10
    || Math.abs(title.y - deck.grammar.titleTop) > 13
    || title.width > deck.grammar.titleMaxWidth + 18
  )) {
    issues.push({
      code: 'title_off_grammar', severity: 'info', elementIds: [title.id],
      message: `${title.id} differs noticeably from the deck title anchor; verify that the deviation is intentional.`,
    });
  }

  const composition = summarizeSlideComposition(slide);
  const visualOptionalPurposes = new Set(['cover', 'section', 'claim', 'closing']);
  if (
    composition.elementCount > 2
    && composition.semanticVisualCount === 0
    && !visualOptionalPurposes.has(slide.provenance?.purpose ?? '')
  ) {
    issues.push({
      code: 'low_visual_variety', severity: 'info', elementIds: [],
      message: 'This slide uses no image, connector, code, stat, or non-rectangular shape; consider a visual relationship instead of another text/card layout.',
    });
  }

  const meaningful = slide.elements.filter((element) =>
    !['title', 'footer', 'kicker', 'accent'].includes(element.role)
    && Boolean(element.content.trim()),
  );
  if (slide.provenance?.source === 'generated' && !meaningful.length && !['section'].includes(slide.provenance.purpose ?? '')) {
    issues.push({
      code: 'missing_content', severity: 'error', elementIds: [],
      message: 'This generated slide has a title but no supporting evidence, explanation, or action.',
    });
  }

  slide.elements.forEach((element) => {
    if (/^(—|Add |Replace |Option \d|Point \d|Step \d|Quadrant \d|.*(?:記載|入力|置き換え).*)$/i.test(element.content.trim())) {
      issues.push({
        code: 'placeholder_content', severity: 'info', elementIds: [element.id],
        message: `${element.id} still contains drafting placeholder content.`,
      });
    }
    if (['body', 'label'].includes(element.role) && contentLength(element.content) > 300) {
      issues.push({
        code: 'excessive_copy', severity: 'warning', elementIds: [element.id],
        message: `${element.id} carries too much visible copy for a presentation slide.`,
      });
    }
  });

  const penalty = issues.reduce((total, issue) => total + (issue.severity === 'error' ? 24 : issue.severity === 'warning' ? 10 : 3), 0);
  const severityOrder: Record<ReviewSeverity, number> = { error: 0, warning: 1, info: 2 };
  const prioritized = [...issues].sort((left, right) => severityOrder[left.severity] - severityOrder[right.severity]);
  const visibleIssues = prioritized.slice(0, 12);
  return {
    slideId: slide.id,
    index,
    title: slide.title,
    score: Math.max(0, 100 - penalty),
    composition,
    issues: visibleIssues,
    issueCount: issues.length,
    omittedIssueCount: issues.length - visibleIssues.length,
  };
};

export const reviewDeckPage = (deck: Deck, offset: number, limit: number) => {
  const slides = deck.slides.slice(offset, offset + limit).map((slide, pageIndex) =>
    reviewSlide(deck, slide, offset + pageIndex + 1));
  return {
    deckId: deck.id,
    version: deck.version,
    slides,
    page: {
      offset,
      limit,
      total: deck.slides.length,
      nextOffset: offset + limit < deck.slides.length ? offset + limit : null,
    },
  };
};

export const summarizeDeckQuality = (deck: Deck) => {
  const slides = deck.slides.map((slide, index) => reviewSlide(deck, slide, index + 1));
  const issueCounts = slides.flatMap((slide) => slide.issues).reduce<Record<string, number>>((counts, issue) => {
    counts[issue.code] = (counts[issue.code] ?? 0) + 1;
    return counts;
  }, {});
  const averageScore = slides.length
    ? Math.round(slides.reduce((total, slide) => total + slide.score, 0) / slides.length)
    : 0;
  return {
    averageScore,
    status: slides.some((slide) => slide.issues.some((issue) => issue.severity === 'error'))
      ? 'needs_attention' as const
      : slides.some((slide) => slide.issues.some((issue) => issue.severity === 'warning'))
        ? 'review' as const
        : 'ready' as const,
    slidesWithFindings: slides.filter((slide) => slide.issueCount).length,
    issueCounts,
  };
};
