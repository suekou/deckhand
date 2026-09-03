'use client';

import { useRef, useState } from 'react';
import {
  ChevronDown,
  Command,
  Download,
  FilePlus2,
  FileJson,
  Languages,
  Play,
  Redo2,
  RotateCcw,
  Undo2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { DeckEditorController } from '@/hooks/use-deck-editor';
import { useI18n } from './i18n-provider';

interface TopbarProps {
  editor: DeckEditorController;
  onPresent: () => void;
  onOpenTools: () => void;
  onOpenStart: () => void;
}

export function Topbar({ editor, onPresent, onOpenTools, onOpenStart }: TopbarProps) {
  const { locale, setLocale, t } = useI18n();
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(editor.deck.title);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const commitTitle = () => {
    editor.renameDeck(title);
    setRenaming(false);
  };

  const statusLabel = {
    checking: t('status.checking'),
    ready: t('status.ready'),
    unavailable: t('status.unavailable'),
    error: t('status.error'),
  } as const;

  return (
    <header className="topbar">
      <div className="brand-lockup" aria-label={t('topbar.home')}>
        <span className="brand-mark"><Command aria-hidden="true" /></span>
        <span className="brand-name">Deckhand</span>
        <button className={`webmcp-badge status-${editor.webMcpStatus}`} type="button" onClick={onOpenTools}>
          <span /> {statusLabel[editor.webMcpStatus]}
        </button>
      </div>

      <div className="deck-title-wrap">
        {renaming ? (
          <input
            className="deck-title-input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={commitTitle}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitTitle();
              if (event.key === 'Escape') {
                setTitle(editor.deck.title);
                setRenaming(false);
              }
            }}
          />
        ) : (
          <button className="deck-title" type="button" onClick={() => { setTitle(editor.deck.title); setRenaming(true); }}>
            {editor.deck.title} <ChevronDown aria-hidden="true" />
          </button>
        )}
        <span className="autosave-label">{t('topbar.saved')}</span>
      </div>

      <div className="topbar-actions">
        <Button className="new-deck-button" variant="ghost" size="sm" aria-label={t('topbar.new')} onClick={onOpenStart}>
          <FilePlus2 data-icon="inline-start" /> <span>{t('topbar.new')}</span>
        </Button>
        <button
          className="locale-toggle"
          type="button"
          aria-label={`${t('language.label')}: ${locale === 'en' ? t('language.english') : t('language.japanese')}`}
          onClick={() => setLocale(locale === 'en' ? 'ja' : 'en')}
        >
          <Languages aria-hidden="true" /><span>{locale.toUpperCase()}</span>
        </button>
        <div className="history-controls" aria-label={t('topbar.history')}>
          <Button aria-label={t('topbar.undo')} variant="ghost" size="icon-sm" onClick={() => editor.undo()} disabled={!editor.canUndo}><Undo2 /></Button>
          <Button aria-label={t('topbar.redo')} variant="ghost" size="icon-sm" onClick={editor.redo} disabled={!editor.canRedo}><Redo2 /></Button>
        </div>
        <Button variant="outline" size="sm" onClick={onPresent}><Play data-icon="inline-start" /> {t('topbar.present')}</Button>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button size="sm" className="export-button" />}>
            <Download data-icon="inline-start" /> {t('topbar.export')} <ChevronDown />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-48">
            <DropdownMenuItem onClick={editor.exportDeck}><FileJson /> {t('topbar.exportJson')}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => window.print()}><Download /> {t('topbar.printPdf')}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>{t('topbar.importJson')}</DropdownMenuItem>
            <DropdownMenuItem onClick={editor.resetDemo}><RotateCcw /> {t('topbar.restoreShowcase')}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <input
          ref={fileInputRef}
          className="sr-only"
          type="file"
          accept="application/json,.json"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            editor.importDeck(JSON.parse(await file.text()));
            event.target.value = '';
          }}
        />
      </div>
    </header>
  );
}
