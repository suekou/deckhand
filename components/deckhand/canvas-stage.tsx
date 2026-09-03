'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AlignCenterHorizontal,
  AlignHorizontalDistributeCenter,
  Check,
  Circle,
  Columns3,
  MousePointer2,
  Square,
  Type,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { DeckEditorController } from '@/hooks/use-deck-editor';
import type { AgentElementInput, ElementPatch, SlideElement } from '@/lib/deck/types';
import { useI18n } from './i18n-provider';
import { SlideFrame } from './slide-frame';

interface CanvasStageProps {
  editor: DeckEditorController;
}

interface PointerInteraction {
  mode: 'move' | 'resize';
  pointerId: number;
  startX: number;
  startY: number;
  canvasWidth: number;
  canvasHeight: number;
  elements: Array<{ element: SlideElement; patch: ElementPatch }>;
}

export function CanvasStage({ editor }: CanvasStageProps) {
  const { t } = useI18n();
  const slide = editor.deck.slides.find((item) => item.id === editor.currentSlideId) ?? editor.deck.slides[0];
  const [zoom, setZoom] = useState(86);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previewPatches, setPreviewPatches] = useState<Record<string, ElementPatch>>({});
  const interactionRef = useRef<PointerInteraction | null>(null);
  const frameWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return;
      if ((event.key === 'Backspace' || event.key === 'Delete') && editor.selection.elementIds.length) {
        event.preventDefault();
        editor.deleteElements(editor.selection.slideId, editor.selection.elementIds);
      }
      if (event.key === 'Escape') {
        setEditingId(null);
        editor.clearSelection();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) editor.redo(); else editor.undo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editor]);

  const commitInteraction = (patches: Record<string, ElementPatch>) => {
    const changes = Object.entries(patches).map(([elementId, patch]) => ({ elementId, patch }));
    if (changes.length) {
      const noun = interactionRef.current?.mode === 'resize' ? 'Resized' : 'Moved';
      editor.updateElements(slide.id, changes, { actor: 'human', action: interactionRef.current?.mode ?? 'transform', summary: `${noun} ${changes.length} element${changes.length === 1 ? '' : 's'} directly on the canvas.` });
    }
    setPreviewPatches({});
    interactionRef.current = null;
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const interaction = interactionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    const dx = ((event.clientX - interaction.startX) / interaction.canvasWidth) * 100;
    const dy = ((event.clientY - interaction.startY) / interaction.canvasHeight) * 100;
    const patches: Record<string, ElementPatch> = {};
    interaction.elements.forEach(({ element }) => {
      patches[element.id] = interaction.mode === 'move'
        ? { x: element.x + dx, y: element.y + dy }
        : { width: Math.max(2, element.width + dx), height: Math.max(2, element.height + dy) };
    });
    setPreviewPatches(patches);
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (interactionRef.current?.pointerId !== event.pointerId) return;
    commitInteraction(previewPatches);
  };

  const startInteraction = (
    element: SlideElement,
    event: React.PointerEvent<HTMLElement>,
    mode: PointerInteraction['mode'],
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (element.locked || editingId === element.id) return;

    const additive = event.shiftKey || event.metaKey || event.ctrlKey;
    const isAlreadySelected = editor.selection.slideId === slide.id && editor.selection.elementIds.includes(element.id);
    if (additive && mode === 'move') editor.toggleSelection(slide.id, element.id);
    else if (!isAlreadySelected || mode === 'resize') editor.setSelection(slide.id, [element.id]);

    const ids = mode === 'move' && isAlreadySelected && !additive
      ? editor.selection.elementIds
      : [element.id];
    const elements = slide.elements.filter((item) => ids.includes(item.id));
    const rect = frameWrapRef.current?.querySelector<HTMLElement>('.slide-frame')?.getBoundingClientRect();
    if (!rect) return;
    interactionRef.current = {
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      canvasWidth: rect.width,
      canvasHeight: rect.height,
      elements: elements.map((item) => ({ element: item, patch: {} })),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const addElement = (type: 'text' | 'card' | 'shape') => {
    const base: Record<typeof type, AgentElementInput> = {
      text: { type: 'text', role: 'body', content: t('canvas.newText'), x: 34, y: 44, width: 32, height: 10, style: { fontSize: 34, fontWeight: 600 } },
      card: { type: 'card', role: 'visual', content: t('canvas.newIdea'), label: t('canvas.supportingDetail'), x: 35, y: 36, width: 30, height: 24, style: { fill: '#ffffff', stroke: '#d3d1c8', strokeWidth: 1, padding: 18 } },
      shape: { type: 'shape', role: 'accent', content: '', x: 41, y: 36, width: 18, height: 32, style: { fill: editor.deck.theme.accent, radius: 999 } },
    };
    editor.addElements(slide.id, [base[type]]);
  };

  return (
    <section className="canvas-stage" aria-label={t('canvas.label')}>
      <div className="canvas-toolbar" aria-label={t('canvas.tools')}>
        <Button variant="secondary" size="sm"><MousePointer2 data-icon="inline-start" /> {t('canvas.select')}</Button>
        <Button variant="ghost" size="sm" onClick={() => addElement('text')}><Type data-icon="inline-start" /> {t('canvas.text')}</Button>
        <Button variant="ghost" size="sm" onClick={() => addElement('card')}><Square data-icon="inline-start" /> {t('canvas.card')}</Button>
        <Button variant="ghost" size="sm" onClick={() => addElement('shape')}><Circle data-icon="inline-start" /> {t('canvas.shape')}</Button>
        {editor.selection.elementIds.length > 1 && (
          <>
            <span className="toolbar-divider" />
            <Button variant="ghost" size="icon-sm" aria-label={t('canvas.alignCenters')} onClick={() => editor.arrangeElements(slide.id, editor.selection.elementIds, 'align_center')}><AlignCenterHorizontal /></Button>
            <Button variant="ghost" size="icon-sm" aria-label={t('canvas.distribute')} onClick={() => editor.arrangeElements(slide.id, editor.selection.elementIds, 'distribute_horizontal')}><AlignHorizontalDistributeCenter /></Button>
            <Button variant="ghost" size="icon-sm" aria-label={t('canvas.alignTops')} onClick={() => editor.arrangeElements(slide.id, editor.selection.elementIds, 'align_top')}><Columns3 /></Button>
          </>
        )}
        <span className="toolbar-spacer" />
        <Button variant="ghost" size="icon-sm" aria-label={t('canvas.zoomOut')} onClick={() => setZoom((value) => Math.max(54, value - 8))}><ZoomOut /></Button>
        <button className="zoom-control" type="button" onClick={() => setZoom(86)}>{zoom}%</button>
        <Button variant="ghost" size="icon-sm" aria-label={t('canvas.zoomIn')} onClick={() => setZoom((value) => Math.min(110, value + 8))}><ZoomIn /></Button>
      </div>

      <div
        className="canvas-viewport"
        ref={frameWrapRef}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="canvas-zoom-wrap" style={{ width: `${zoom}%` }}>
          <SlideFrame
            slide={slide}
            assets={editor.deck.assets}
            selectedIds={editor.selection.slideId === slide.id ? editor.selection.elementIds : []}
            previewPatches={previewPatches}
            interactive
            editingId={editingId}
            onCanvasPointerDown={(event) => {
              if (event.target === event.currentTarget) {
                setEditingId(null);
                editor.clearSelection();
              }
            }}
            onElementPointerDown={(element, event) => startInteraction(element, event, 'move')}
            onResizePointerDown={(element, event) => startInteraction(element, event, 'resize')}
            onElementDoubleClick={(element) => {
              if (!['image', 'line'].includes(element.type)) {
                editor.setSelection(slide.id, [element.id]);
                setEditingId(element.id);
              }
            }}
            onElementContentCommit={(element, content) => {
              setEditingId(null);
              if (content !== element.content) editor.updateElements(slide.id, [{ elementId: element.id, patch: { content } }]);
            }}
          />
        </div>
      </div>

      <footer className="canvas-status">
        <span><Check /> {t('canvas.saved')}</span>
        <span>{editor.selection.elementIds.length ? `${editor.selection.elementIds.length} ${t('canvas.selected')} · ` : ''}16:9 · 1280 × 720</span>
      </footer>
    </section>
  );
}
