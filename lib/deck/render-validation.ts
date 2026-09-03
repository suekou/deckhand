import type { Deck } from './types';

export interface RenderValidationIssue {
  code: 'rendered_text_overflow' | 'rendered_outside_canvas' | 'font_unavailable';
  slideId: string;
  elementId?: string;
  message: string;
}

const visibleArea = (element: HTMLElement) => {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 ? rect.width * rect.height : 0;
};

export const validateRenderedDeck = (deck: Deck) => {
  const frames = [...document.querySelectorAll<HTMLElement>('.slide-frame[data-slide-id]')];
  const bestFrame = new Map<string, HTMLElement>();
  frames.forEach((frame) => {
    const slideId = frame.dataset.slideId;
    if (!slideId || !visibleArea(frame)) return;
    const current = bestFrame.get(slideId);
    if (!current || visibleArea(frame) > visibleArea(current)) bestFrame.set(slideId, frame);
  });

  const issues: RenderValidationIssue[] = [];
  deck.slides.forEach((slide) => {
    const frame = bestFrame.get(slide.id);
    if (!frame) return;
    const frameRect = frame.getBoundingClientRect();
    frame.querySelectorAll<HTMLElement>('.slide-element[data-element-id]').forEach((element) => {
      const elementId = element.dataset.elementId;
      const rect = element.getBoundingClientRect();
      const content = element.querySelector<HTMLElement>('.element-editable-copy, .element-rich-text, code, .element-card-title, .element-stat-value');
      const style = getComputedStyle(element);
      const font = style.fontFamily.split(',')[0]?.replaceAll('"', '').trim();

      if (
        rect.left < frameRect.left - 1
        || rect.top < frameRect.top - 1
        || rect.right > frameRect.right + 1
        || rect.bottom > frameRect.bottom + 1
      ) {
        issues.push({
          code: 'rendered_outside_canvas', slideId: slide.id, elementId,
          message: `${elementId ?? 'An element'} renders outside the visible slide canvas.`,
        });
      }

      if (content && element.textContent?.trim()) {
        const contentRect = content.getBoundingClientRect();
        const verticalOverflow = contentRect.height > rect.height + 2 || content.scrollHeight > element.clientHeight + 2;
        const horizontalOverflow = contentRect.width > rect.width + 2 || content.scrollWidth > element.clientWidth + 2;
        if (verticalOverflow || horizontalOverflow) {
          issues.push({
            code: 'rendered_text_overflow', slideId: slide.id, elementId,
            message: `${elementId ?? 'Text'} does not fit its rendered frame at the loaded font size.`,
          });
        }
      }

      if (font && 'fonts' in document && !document.fonts.check(`12px "${font}"`)) {
        issues.push({
          code: 'font_unavailable', slideId: slide.id, elementId,
          message: `${font} is not loaded; the slide is rendering with a fallback font.`,
        });
      }
    });
  });

  return {
    measuredSlideCount: bestFrame.size,
    issueCount: issues.length,
    status: issues.length ? 'needs_attention' as const : 'ready' as const,
    issues,
  };
};
