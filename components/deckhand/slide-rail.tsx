'use client';

import { ArrowDown, ArrowUp, CirclePlus, Copy, LayoutTemplate, MoreHorizontal, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { DeckEditorController } from '@/hooks/use-deck-editor';
import { useI18n } from './i18n-provider';
import { SlideFrame } from './slide-frame';

interface SlideRailProps {
  editor: DeckEditorController;
}

export function SlideRail({ editor }: SlideRailProps) {
  const { t } = useI18n();
  return (
    <aside className="slide-rail" aria-label={t('rail.slides')}>
      <div className="rail-heading">
        <span>{t('rail.slides')} <b>{editor.deck.slides.length}</b></span>
        <DropdownMenu>
          <DropdownMenuTrigger render={<button aria-label={t('rail.addSlide')} type="button" />}><CirclePlus /></DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-44">
            <DropdownMenuItem onClick={() => editor.createSlide(t('rail.newTitle'), 'title', editor.currentSlideId)}>{t('rail.title')}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => editor.createSlide(t('rail.newStatement'), 'statement', editor.currentSlideId)}>{t('rail.statement')}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => editor.createSlide(t('rail.newComparison'), 'two_column', editor.currentSlideId)}>{t('rail.twoColumns')}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => editor.createSlide(t('rail.untitled'), 'blank', editor.currentSlideId)}>{t('rail.blank')}</DropdownMenuItem>
            {editor.deck.importedTemplate?.layouts.length ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>{t('rail.importedLayouts')}</DropdownMenuLabel>
                {editor.deck.importedTemplate.layouts.slice(0, 8).map((layout) => (
                  <DropdownMenuItem key={layout.id} onClick={() => editor.createSlideFromImportedLayout(layout.id, layout.name, editor.currentSlideId)}>
                    <LayoutTemplate /> {layout.name}
                  </DropdownMenuItem>
                ))}
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <ol className="thumbnail-list">
        {editor.deck.slides.map((slide, index) => {
          const active = slide.id === editor.currentSlideId;
          const previous = editor.deck.slides[index - 1];
          const next = editor.deck.slides[index + 1];
          return (
            <li key={slide.id} className={active ? 'is-active' : ''}>
              <button className="thumbnail-row" type="button" onClick={() => editor.setCurrentSlide(slide.id)}>
                <span className="slide-number">{String(index + 1).padStart(2, '0')}</span>
                <span className="mini-slide-wrap" aria-hidden="true"><SlideFrame slide={slide} assets={editor.deck.assets} className="thumbnail-canvas" /></span>
                <span className="sr-only">{t('rail.open')} {slide.title}</span>
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" className="thumbnail-menu" />}><MoreHorizontal /><span className="sr-only">{t('rail.actions')}</span></DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-44">
                  <DropdownMenuItem onClick={() => editor.duplicateSlide(slide.id)}><Copy /> {t('rail.duplicate')}</DropdownMenuItem>
                  <DropdownMenuItem disabled={!previous} onClick={() => editor.reorderSlide(slide.id, index > 1 ? editor.deck.slides[index - 2].id : undefined, 'human')}><ArrowUp /> {t('rail.moveUp')}</DropdownMenuItem>
                  <DropdownMenuItem disabled={!next} onClick={() => editor.reorderSlide(slide.id, next?.id, 'human')}><ArrowDown /> {t('rail.moveDown')}</DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" disabled={editor.deck.slides.length === 1} onClick={() => editor.deleteSlide(slide.id)}><Trash2 /> {t('rail.delete')}</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
