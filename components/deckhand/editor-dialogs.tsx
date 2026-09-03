'use client';

import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Braces,
  Check,
  Copy,
  FileText,
  LayoutTemplate,
  Presentation,
  Sparkles,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { DeckEditorController } from '@/hooks/use-deck-editor';
import { createDeckFromTemplate, type DeckTemplateId } from '@/lib/deck/templates';
import type { Deck } from '@/lib/deck/types';
import { WEBMCP_TOOL_MANIFEST } from '@/lib/deck/webmcp-manifest';
import { useI18n } from './i18n-provider';
import { PptxImportPanel } from './pptx-import-panel';
import { SlideFrame } from './slide-frame';

interface StartDialogProps {
  editor: DeckEditorController;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const templateCards = [
  { id: 'blank', title: 'start.blankTitle', body: 'start.blankBody', icon: FileText, tone: 'blank' },
  { id: 'pitch', title: 'start.pitchTitle', body: 'start.pitchBody', icon: Sparkles, tone: 'pitch' },
  { id: 'project_update', title: 'start.updateTitle', body: 'start.updateBody', icon: LayoutTemplate, tone: 'update' },
  { id: 'showcase', title: 'start.showcaseTitle', body: 'start.showcaseBody', icon: Presentation, tone: 'showcase' },
] as const;

export function StartDialog({ editor, open, onOpenChange }: StartDialogProps) {
  const { locale, t } = useI18n();

  const chooseTemplate = (templateId: DeckTemplateId) => {
    const contentLocale = templateId === 'showcase' ? 'en' : locale;
    editor.replaceDeck(
      createDeckFromTemplate(templateId, contentLocale),
      locale === 'ja' ? 'テンプレートからデッキを作成' : 'Started from a deck template',
    );
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="start-dialog" showCloseButton>
        <DialogHeader>
          <div className="dialog-eyebrow"><LayoutTemplate /> {t('start.eyebrow')}</div>
          <DialogTitle>{t('start.title')}</DialogTitle>
          <DialogDescription>{t('start.body')}</DialogDescription>
        </DialogHeader>
        <PptxImportPanel editor={editor} onComplete={() => onOpenChange(false)} />
        <div className="starter-divider"><span>{t('start.builtIn')}</span></div>
        <div className="template-grid">
          {templateCards.map((template) => {
            const Icon = template.icon;
            const contentLocale = template.id === 'showcase' ? 'en' : locale;
            return (
              <button
                key={template.id}
                type="button"
                className="template-card"
                aria-label={`${t('start.useTemplate')}: ${t(template.title)}`}
                onClick={() => chooseTemplate(template.id)}
              >
                <span className={`template-preview template-preview-${template.tone}`} aria-hidden="true">
                  <span className="template-preview-kicker" />
                  <span className="template-preview-title" />
                  <span className="template-preview-body" />
                  <span className="template-preview-accent" />
                </span>
                <span className="template-card-copy">
                  <span className="template-card-heading"><Icon /> <strong>{t(template.title)}</strong></span>
                  <span className="template-card-body">{t(template.body)}</span>
                  <span className="template-card-meta">
                    {t('start.localized')}: {contentLocale === 'ja' ? t('start.japaneseContent') : t('start.englishContent')}
                    <ArrowRight />
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface ToolsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: 'checking' | 'ready' | 'unavailable' | 'error';
}

export function ToolsDialog({ open, onOpenChange, status }: ToolsDialogProps) {
  const { locale, t } = useI18n();
  const [copied, setCopied] = useState(false);
  const prompt = locale === 'ja'
    ? 'このデッキを調べ、最も弱いスライドを特定し、正確で取り消し可能な変更によって改善してください。デザイン文法を保ち、変更したオブジェクトを選択状態で見せてください。'
    : 'Inspect this deck, identify the weakest slide, and improve it with precise, reversible changes. Preserve the design grammar and show me the selected objects you changed.';
  const statusLabel = {
    checking: t('status.checking'),
    ready: t('status.ready'),
    unavailable: t('status.unavailable'),
    error: t('status.error'),
  } as const;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="tools-dialog" showCloseButton>
        <DialogHeader>
          <div className="dialog-eyebrow"><Braces /> {t('dialog.toolsEyebrow')} <Badge variant={status === 'ready' ? 'default' : 'secondary'}>{statusLabel[status]}</Badge></div>
          <DialogTitle>{t('dialog.toolsTitle')}</DialogTitle>
          <DialogDescription>{t('dialog.toolsBody')}</DialogDescription>
        </DialogHeader>
        <div className="tools-dialog-grid">
          {WEBMCP_TOOL_MANIFEST.map((tool, index) => (
            <article key={tool.name} className="tool-detail-card">
              <span className="tool-detail-index">{String(index + 1).padStart(2, '0')}</span>
              <div><code>{tool.name}</code><p>{tool.description}</p></div>
              <Badge variant={tool.mode === 'READ' ? 'outline' : 'secondary'}>{tool.mode}</Badge>
            </article>
          ))}
        </div>
        <div className="prompt-copy-card">
          <Sparkles />
          <div><strong>{t('dialog.promptTitle')}</strong><p>{prompt}</p></div>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              await navigator.clipboard.writeText(prompt);
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            }}
          >
            {copied ? <Check /> : <Copy />} {copied ? t('dialog.copied') : t('dialog.copy')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface PresentDialogProps {
  deck: Deck;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSlideId: string;
}

export function PresentDialog({ deck, open, onOpenChange, initialSlideId }: PresentDialogProps) {
  const { t } = useI18n();
  const initialIndex = Math.max(0, deck.slides.findIndex((slide) => slide.id === initialSlideId));
  const [index, setIndex] = useState(initialIndex);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight' || event.key === ' ') setIndex((value) => Math.min(deck.slides.length - 1, value + 1));
      if (event.key === 'ArrowLeft') setIndex((value) => Math.max(0, value - 1));
      if (event.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [deck.slides.length, onOpenChange, open]);

  const slide = deck.slides[index] ?? deck.slides[0];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="present-dialog" showCloseButton>
        <div className="present-frame-wrap"><SlideFrame slide={slide} assets={deck.assets} className="present-slide" /></div>
        <div className="present-controls">
          <Button variant="secondary" size="icon" disabled={index === 0} onClick={() => setIndex((value) => value - 1)}><ArrowLeft /><span className="sr-only">{t('dialog.previous')}</span></Button>
          <span><strong>{String(index + 1).padStart(2, '0')}</strong> / {String(deck.slides.length).padStart(2, '0')} · {slide.title}</span>
          <Button variant="secondary" size="icon" disabled={index === deck.slides.length - 1} onClick={() => setIndex((value) => value + 1)}><ArrowRight /><span className="sr-only">{t('dialog.next')}</span></Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
