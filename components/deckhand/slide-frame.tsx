'use client';

import { memo, useEffect, useMemo, useRef } from 'react';

import type { DeckAsset, ElementPatch, Slide, SlideElement } from '@/lib/deck/types';
import { useI18n } from './i18n-provider';

interface SlideFrameProps {
  slide: Slide;
  assets?: Record<string, DeckAsset>;
  selectedIds?: string[];
  previewPatches?: Record<string, ElementPatch>;
  interactive?: boolean;
  editingId?: string | null;
  onElementPointerDown?: (element: SlideElement, event: React.PointerEvent<HTMLDivElement>) => void;
  onElementDoubleClick?: (element: SlideElement) => void;
  onElementContentCommit?: (element: SlideElement, content: string) => void;
  onResizePointerDown?: (element: SlideElement, event: React.PointerEvent<HTMLButtonElement>) => void;
  onCanvasPointerDown?: (event: React.PointerEvent<HTMLElement>) => void;
  className?: string;
}

const unit = (value: number | undefined, fallback = 0) =>
  `calc(${value ?? fallback} / 1280 * 100cqw)`;

const fontStack = (family: string | undefined) => {
  if (!family) return undefined;
  const safeFamily = family.replace(/["\\]/g, '');
  const primary = safeFamily === 'Noto Sans JP'
    ? '"Noto Sans JP Variable", "Noto Sans JP"'
    : `"${safeFamily}"`;
  return `${primary}, "Hiragino Sans", "Yu Gothic", sans-serif`;
};

const mergePatch = (element: SlideElement, patch?: ElementPatch): SlideElement => ({
  ...element,
  ...patch,
  style: { ...element.style, ...patch?.style },
});

const elementStyle = (element: SlideElement): React.CSSProperties => {
  const vectorShape = element.type === 'shape'
    && Boolean(element.shapePreset)
    && !['rect', 'roundRect', 'ellipse'].includes(element.shapePreset ?? '');
  const isLine = element.type === 'line';
  return {
    left: `${element.x}%`,
    top: `${element.y}%`,
    width: `${element.width}%`,
    height: `${element.height}%`,
    zIndex: element.zIndex ?? 1,
    transform: `rotate(${element.rotation ?? 0}deg)`,
    color: element.style.color,
    background: vectorShape ? 'transparent' : isLine ? element.style.color ?? element.style.stroke : element.style.fill,
    borderColor: vectorShape || isLine ? undefined : element.style.stroke,
    borderWidth: !vectorShape && !isLine && element.style.strokeWidth ? unit(element.style.strokeWidth) : undefined,
    borderStyle: !vectorShape && !isLine && element.style.strokeWidth ? 'solid' : undefined,
    borderRadius: element.style.radius === 999 ? '999px' : unit(element.style.radius),
    fontFamily: fontStack(element.style.fontFamily),
    fontSize: unit(element.style.fontSize, 20),
    fontWeight: element.style.fontWeight,
    fontStyle: element.style.fontStyle,
    textDecoration: element.style.textDecoration,
    lineHeight: element.style.lineHeight,
    letterSpacing: unit(element.style.letterSpacing),
    textAlign: element.style.textAlign,
    opacity: element.style.opacity,
    padding: element.style.padding ? unit(element.style.padding) : undefined,
    paddingTop: element.style.paddingTop === undefined ? undefined : unit(element.style.paddingTop),
    paddingRight: element.style.paddingRight === undefined ? undefined : unit(element.style.paddingRight),
    paddingBottom: element.style.paddingBottom === undefined ? undefined : unit(element.style.paddingBottom),
    paddingLeft: element.style.paddingLeft === undefined ? undefined : unit(element.style.paddingLeft),
    justifyContent: element.type === 'text'
      ? element.style.verticalAlign === 'bottom'
        ? 'flex-end'
        : element.style.verticalAlign === 'middle'
          ? 'center'
          : 'flex-start'
      : undefined,
    boxShadow: element.style.shadow,
    textTransform: element.style.textTransform,
  };
};

const richTextContent = (element: SlideElement) => element.richText?.flatMap((paragraph) => {
  const text = paragraph.runs.map((run) => run.text).join('');
  return text.trim() || paragraph.bullet
    ? [`${paragraph.bullet ? `${paragraph.bullet} ` : ''}${text}`]
    : [];
}).join('\n') ?? '';

function RichTextContent({ element }: { element: SlideElement }) {
  return (
    <span className="element-rich-text">
      {element.richText?.map((paragraph, paragraphIndex, paragraphs) => {
        const isEmpty = paragraph.runs.every((run) => run.text.length === 0);
        const isCircleBullet = /^[●○◦]$/.test(paragraph.bullet ?? '');
        const bulletGlyphScale = isCircleBullet ? 0.5 : 1;
        const sourceLineHeight = paragraph.lineHeight ?? element.style.lineHeight;
        const paragraphLineHeight = sourceLineHeight === undefined
          ? undefined
          : sourceLineHeight * (paragraph.lineHeight === undefined && sourceLineHeight >= 1.5 ? 1 : 1.2);
        const paragraphFontSize = Math.max(
          element.style.fontSize ?? 0,
          ...paragraph.runs.map((run) => run.style?.fontSize ?? 0),
        );
        const paragraphLeadingOffset = paragraphLineHeight === undefined || sourceLineHeight === undefined || !paragraphFontSize
          ? 0
          : Math.max(
            0,
            paragraphLineHeight - (paragraph.lineHeight === undefined ? sourceLineHeight : 1),
          ) * paragraphFontSize / 2;
        return (
          <span
            className="element-rich-paragraph"
            key={`${element.id}-paragraph-${paragraphIndex}`}
            style={{
              // DrawingML line spacing is based on the font's natural line box
              // (roughly 1.2 em for these embedded Noto fonts). CSS unitless
              // line-height uses the em square and splits extra leading above
              // the first line, so compensate both differences.
              lineHeight: paragraphLineHeight,
              top: paragraphIndex === 0 && paragraphLeadingOffset
                ? unit(-paragraphLeadingOffset * (element.style.verticalAlign === 'middle' ? 0.25 : 1))
                : undefined,
              // DrawingML paragraph spacing separates adjacent paragraphs. It
              // does not move the first/last line away from the text box edge.
              // CSS block margins would otherwise shift single-paragraph labels
              // (notably table headings and timeline captions) downward.
              marginTop: paragraphIndex === 0 || paragraph.spaceBefore === undefined
                ? undefined
                : unit(paragraph.spaceBefore),
              marginBottom: paragraphIndex === paragraphs.length - 1 || paragraph.spaceAfter === undefined
                ? undefined
                : unit(paragraph.spaceAfter),
              paddingLeft: paragraph.marginLeft === undefined ? undefined : unit(paragraph.marginLeft),
              textIndent: !paragraph.bullet && paragraph.indent !== undefined ? unit(paragraph.indent) : undefined,
              textAlign: paragraph.textAlign,
            }}
          >
            {paragraph.bullet && (
              <span
              className={`element-rich-bullet ${/^\d+\.$/.test(paragraph.bullet) ? 'is-number' : ''}`}
              style={{
                left: unit((paragraph.marginLeft ?? 0) + (paragraph.indent ?? 0)),
                color: paragraph.bulletColor,
                fontFamily: fontStack(paragraph.bulletFontFamily),
                fontSize: paragraph.bulletFontSize === undefined
                  ? `${(paragraph.bulletScale ?? 1) * bulletGlyphScale}em`
                  : unit(paragraph.bulletFontSize * bulletGlyphScale),
                // PowerPoint aligns bullets to the run baseline. An absolutely
                // positioned reduced circle otherwise hugs the top of the CSS
                // line box, which is especially visible on mixed font sizes.
                top: isCircleBullet ? '1.15em' : undefined,
                marginLeft: isCircleBullet ? '-0.18em' : undefined,
              }}
              >
                {paragraph.bullet}
              </span>
            )}
            <span>
              {paragraph.runs.map((run, runIndex) => (
                <span
                  key={`${element.id}-paragraph-${paragraphIndex}-run-${runIndex}`}
                  style={{
                    color: run.style?.color,
                    fontFamily: fontStack(run.style?.fontFamily),
                    fontSize: run.style?.fontSize === undefined ? undefined : unit(run.style.fontSize),
                    fontWeight: run.style?.fontWeight,
                    fontStyle: run.style?.fontStyle,
                    textDecoration: run.style?.textDecoration,
                    backgroundColor: run.style?.backgroundColor,
                  }}
                >
                  {run.text}
                </span>
              ))}
              {isEmpty && '\u200B'}
            </span>
          </span>
        );
      })}
    </span>
  );
}

const shapePoints = (element: SlideElement) => {
  const preset = element.shapePreset;
  const canvasWidth = Math.max(0.001, element.width / 100 * 1280);
  const canvasHeight = Math.max(0.001, element.height / 100 * 720);
  const adjustment = (element.shapeAdjustments?.adj ?? element.shapeAdjustments?.adj2 ?? 50000) / 50000;
  const head = Math.min(50, Math.max(0.5, canvasHeight / canvasWidth * 50 * adjustment));
  if (preset === 'triangle') return '50,0 100,100 0,100';
  if (preset === 'rtTriangle') return '0,0 100,100 0,100';
  if (preset === 'diamond') return '50,0 100,50 50,100 0,50';
  if (preset === 'pentagon') return '50,0 100,38 80,100 20,100 0,38';
  if (preset === 'hexagon') return '25,0 75,0 100,50 75,100 25,100 0,50';
  if (preset === 'parallelogram') return '22,0 100,0 78,100 0,100';
  if (preset === 'chevron') return `${head},0 ${100 - head},0 100,50 ${100 - head},100 ${head},100 0,50`;
  if (preset === 'rightArrow') return `0,25 ${100 - head},25 ${100 - head},0 100,50 ${100 - head},100 ${100 - head},75 0,75`;
  if (preset === 'homePlate') return `0,0 ${100 - head},0 100,50 ${100 - head},100 0,100`;
  return '0,0 100,0 100,100 0,100';
};

function VectorShapeContent({ element }: { element: SlideElement }) {
  return (
    <svg className="element-vector-shape" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <polygon
        points={shapePoints(element)}
        fill={element.style.fill ?? 'transparent'}
        stroke={element.style.stroke ?? element.style.fill ?? 'currentColor'}
        strokeWidth={unit(element.style.strokeWidth, 1)}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface ContentProps {
  element: SlideElement;
  assets?: Record<string, DeckAsset>;
  editing: boolean;
  onCommit?: (content: string) => void;
}

function EditingTextarea({ element, onCommit }: { element: SlideElement; onCommit?: (content: string) => void }) {
  const { t } = useI18n();
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <textarea
      ref={ref}
      className="element-editable-copy element-textarea"
      defaultValue={element.content}
      aria-label={`${t('frame.edit')}: ${element.role}`}
      onBlur={(event) => onCommit?.(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') event.currentTarget.blur();
        if (event.key === 'Enter' && !event.shiftKey && element.type === 'pill') {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function ElementContent({ element, assets, editing, onCommit }: ContentProps) {
  if (element.type === 'image') {
    const asset = element.assetId ? assets?.[element.assetId] : undefined;
    const crop = element.imageCrop;
    const visibleWidth = 1 - (crop?.left ?? 0) - (crop?.right ?? 0);
    const visibleHeight = 1 - (crop?.top ?? 0) - (crop?.bottom ?? 0);
    return asset
      ? (
        <svg className="element-image-content" viewBox="0 0 100 100" preserveAspectRatio="none">
          <title>{element.content}</title>
          <image
            href={asset.dataUrl}
            x={crop ? -crop.left / Math.max(0.001, visibleWidth) * 100 : 0}
            y={crop ? -crop.top / Math.max(0.001, visibleHeight) * 100 : 0}
            width={crop ? 100 / Math.max(0.001, visibleWidth) : 100}
            height={crop ? 100 / Math.max(0.001, visibleHeight) : 100}
            preserveAspectRatio="none"
          />
        </svg>
      )
      : <span className="element-image-missing">{element.content}</span>;
  }
  if (editing && element.type !== 'line') return <EditingTextarea element={element} onCommit={onCommit} />;
  if (element.type === 'card') {
    return (
      <>
        <span className="element-card-title">{element.content}</span>
        {element.label && <span className="element-card-label">{element.label}</span>}
      </>
    );
  }
  if (element.type === 'stat') {
    return (
      <>
        <span className="element-stat-value">{element.content}</span>
        {element.label && <span className="element-stat-label">{element.label}</span>}
      </>
    );
  }
  if (element.type === 'code') return <code>{element.content}</code>;
  if (element.type === 'line') return null;
  if (element.type === 'shape' && element.shapePreset && !['rect', 'roundRect', 'ellipse'].includes(element.shapePreset)) {
    return (
      <>
        <VectorShapeContent element={element} />
        {element.content && (
          <span className="element-vector-label">
            {element.richText?.length && richTextContent(element) === element.content
              ? <RichTextContent element={element} />
              : element.content}
          </span>
        )}
      </>
    );
  }
  if (element.richText?.length && richTextContent(element) === element.content) {
    return <RichTextContent element={element} />;
  }
  return (
    <span className="element-editable-copy">{element.content}</span>
  );
}

function SlideFrameComponent({
  slide,
  assets,
  selectedIds = [],
  previewPatches = {},
  interactive = false,
  editingId,
  onElementPointerDown,
  onElementDoubleClick,
  onElementContentCommit,
  onResizePointerDown,
  onCanvasPointerDown,
  className = '',
}: SlideFrameProps) {
  const { t } = useI18n();
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

  return (
    <article
      className={`slide-frame ${interactive ? 'is-interactive' : 'is-readonly'} ${className}`}
      style={{ background: slide.background }}
      aria-label={`${t('frame.slide')}: ${slide.title}`}
      onPointerDown={onCanvasPointerDown}
      data-slide-id={slide.id}
    >
      <div className="slide-safe-grid" aria-hidden="true" />
      {slide.elements.map((original) => {
        const element = mergePatch(original, previewPatches[original.id]);
        const isSelected = selected.has(element.id);
        const isEditing = editingId === element.id;
        return (
          <div
            key={element.id}
            className={`slide-element element-${element.type} ${isSelected ? 'is-selected' : ''} ${isEditing ? 'is-editing' : ''}`}
            style={elementStyle(element)}
            data-element-id={element.id}
            data-element-role={element.role}
            role={interactive ? 'option' : 'presentation'}
            aria-selected={interactive ? isSelected : undefined}
            aria-label={interactive ? `${element.role}: ${element.content || element.type}` : undefined}
            onPointerDown={interactive ? (event) => onElementPointerDown?.(original, event) : undefined}
            onDoubleClick={interactive ? () => onElementDoubleClick?.(original) : undefined}
          >
            <ElementContent
              element={element}
              assets={assets}
              editing={isEditing}
              onCommit={interactive ? (content) => onElementContentCommit?.(original, content) : undefined}
            />
            {isSelected && interactive && !element.locked && (
              <>
                <span className="selection-label">{element.role} · {element.id}</span>
                <span className="selection-handle handle-nw" />
                <span className="selection-handle handle-ne" />
                <span className="selection-handle handle-sw" />
                <button
                  className="selection-handle handle-se is-resize-handle"
                  aria-label={`${t('frame.resize')}: ${element.id}`}
                  type="button"
                  onPointerDown={(event) => onResizePointerDown?.(original, event)}
                />
              </>
            )}
          </div>
        );
      })}
    </article>
  );
}

export const SlideFrame = memo(SlideFrameComponent);
