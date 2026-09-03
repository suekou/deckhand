'use client';

import { useEffect, useState } from 'react';

import { useDeckEditor } from '@/hooks/use-deck-editor';
import { useWebMcpTools } from '@/hooks/use-webmcp-tools';
import { CanvasStage } from './canvas-stage';
import { PresentDialog, StartDialog, ToolsDialog } from './editor-dialogs';
import { I18nProvider, useI18n } from './i18n-provider';
import { InspectorRail } from './inspector-rail';
import { SlideRail } from './slide-rail';
import { SlideFrame } from './slide-frame';
import { Topbar } from './topbar';

export function DeckhandEditor() {
  return <I18nProvider><LocalizedDeckhandEditor /></I18nProvider>;
}

function LocalizedDeckhandEditor() {
  const editor = useDeckEditor();
  const { t } = useI18n();
  const [toolsOpen, setToolsOpen] = useState(false);
  const [presentOpen, setPresentOpen] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  useWebMcpTools(editor);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('__cf_access_message')) return;
    url.searchParams.delete('__cf_access_message');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }, []);

  return (
    <main className="app-shell">
      <Topbar editor={editor} onPresent={() => setPresentOpen(true)} onOpenTools={() => setToolsOpen(true)} onOpenStart={() => setStartOpen(true)} />
      <section className="workspace" aria-label={t('workspace.label')}>
        <SlideRail editor={editor} />
        <CanvasStage editor={editor} />
        <InspectorRail editor={editor} onOpenTools={() => setToolsOpen(true)} />
      </section>
      <ToolsDialog open={toolsOpen} onOpenChange={setToolsOpen} status={editor.webMcpStatus} />
      <StartDialog editor={editor} open={startOpen} onOpenChange={setStartOpen} />
      <PresentDialog key={`${presentOpen}:${editor.currentSlideId}`} deck={editor.deck} open={presentOpen} onOpenChange={setPresentOpen} initialSlideId={editor.currentSlideId} />
      <div className="print-deck" aria-hidden="true">
        {editor.deck.slides.map((slide) => <SlideFrame key={slide.id} slide={slide} assets={editor.deck.assets} />)}
      </div>
      <div className="mobile-blocker">
        <BrandedMobileMessage />
      </div>
    </main>
  );
}

function BrandedMobileMessage() {
  const { t } = useI18n();
  return (
    <div>
      <span className="mobile-mark">D</span>
      <h1>{t('mobile.title')}</h1>
      <p>{t('mobile.body')}</p>
    </div>
  );
}
