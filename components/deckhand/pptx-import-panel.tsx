'use client';

import { useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  FileUp,
  LayoutTemplate,
  LoaderCircle,
  LockKeyhole,
  Palette,
  RefreshCw,
  Sparkles,
  TriangleAlert,
  Type,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress, ProgressLabel } from '@/components/ui/progress';
import type { DeckEditorController } from '@/hooks/use-deck-editor';
import type { PptxImportResult } from '@/lib/deck/pptx-import';
import type { ImportWarning } from '@/lib/deck/types';
import { useI18n } from './i18n-provider';
import { SlideFrame } from './slide-frame';

interface PptxImportPanelProps {
  editor: DeckEditorController;
  onComplete: () => void;
}

type ImportState = 'idle' | 'analyzing' | 'ready' | 'error';

const warningMessageKey = (code: ImportWarning['code']) => `import.warning.${code}` as const;

export function PptxImportPanel({ editor, onComplete }: PptxImportPanelProps) {
  const { locale, t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<ImportState>('idle');
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<PptxImportResult | null>(null);
  const [selectedLayouts, setSelectedLayouts] = useState<string[]>([]);
  const [showLayoutMode, setShowLayoutMode] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setState('idle');
    setProgress(0);
    setResult(null);
    setSelectedLayouts([]);
    setShowLayoutMode(false);
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  };

  const analyze = async (file: File) => {
    setState('analyzing');
    setError('');
    setProgress(4);
    try {
      const { parsePptxTemplate } = await import('@/lib/deck/pptx-import');
      const analysis = await parsePptxTemplate(await file.arrayBuffer(), file.name, setProgress);
      setResult(analysis);
      setSelectedLayouts(analysis.template.layouts.slice(0, 4).map((layout) => layout.id));
      setShowLayoutMode(!analysis.sourceSlides.length);
      setState('ready');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'PowerPoint analysis failed.');
      setState('error');
    }
  };

  const applyImport = async (mode: 'slides' | 'layouts') => {
    if (!result) return;
    try {
      const { buildDeckFromPptxImport } = await import('@/lib/deck/pptx-import');
      const next = buildDeckFromPptxImport(result, mode, selectedLayouts);
      editor.replaceDeck(
        next,
        locale === 'ja'
          ? `「${result.template.name}」から編集可能なデッキを作成`
          : `Created an editable deck from “${result.template.name}”.`,
      );
      onComplete();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Template conversion failed.');
      setState('error');
    }
  };

  if (state === 'analyzing') {
    return (
      <section className="pptx-import-panel is-analyzing" aria-live="polite">
        <span className="import-loader"><LoaderCircle /></span>
        <div>
          <strong>{t('import.analyzing')}</strong>
          <p>{t('import.localOnly')}</p>
        </div>
        <Progress value={progress} className="import-progress">
          <ProgressLabel>{t('import.analysis')}</ProgressLabel>
          <span className="import-progress-value">{progress}%</span>
        </Progress>
      </section>
    );
  }

  if (state === 'error') {
    return (
      <section className="pptx-import-panel import-error" role="alert">
        <TriangleAlert />
        <div><strong>{t('import.errorTitle')}</strong><p>{error}</p></div>
        <Button variant="outline" size="sm" onClick={reset}><RefreshCw /> {t('import.chooseAnother')}</Button>
      </section>
    );
  }

  if (state === 'ready' && result) {
    const canStartFromLayouts = Boolean(result.template.layouts.length && selectedLayouts.length);
    return (
      <section className="pptx-analysis-panel">
        <header className="import-result-header">
          <div className="import-file-icon"><FileUp /></div>
          <div><span>{t('import.analysis')}</span><strong>{result.fileName}</strong></div>
          <div className="fidelity-score" aria-label={`${t('import.fidelity')}: ${result.template.fidelityScore}%`}>
            <strong>{result.template.fidelityScore}</strong><span>{t('import.fidelity')}</span>
          </div>
        </header>

        <div className="import-stat-grid">
          <div><strong>{result.stats.slides}</strong><span>{t('import.slides')}</span></div>
          <div><strong>{result.stats.layouts}</strong><span>{t('import.layouts')}</span></div>
          <div><strong>{result.stats.editableElements}</strong><span>{t('import.elements')}</span></div>
          <div><strong>{result.stats.images}</strong><span>{t('import.images')}</span></div>
        </div>

        {result.sourceSlides.length ? (
          <div className="import-decision-grid">
            <article className="import-decision-card is-primary">
              <div className="import-decision-icon"><FileUp /></div>
              <div className="import-decision-copy">
                <span><Badge>{t('import.recommended')}</Badge>{t('import.openSlidesLabel')}</span>
                <strong>{t('import.openSlides')}</strong>
                <p>{t('import.openSlidesBody').replace('{count}', String(result.sourceSlides.length))}</p>
              </div>
              <Button size="sm" onClick={() => applyImport('slides')}>
                {t('import.openSlidesAction').replace('{count}', String(result.sourceSlides.length))} <ArrowRight />
              </Button>
            </article>

            {result.template.layouts.length ? (
              <button
                type="button"
                className={`import-decision-card is-secondary ${showLayoutMode ? 'is-open' : ''}`}
                aria-expanded={showLayoutMode}
                onClick={() => setShowLayoutMode((current) => !current)}
              >
                <div className="import-decision-icon"><LayoutTemplate /></div>
                <div className="import-decision-copy">
                  <span>{t('import.templateModeLabel')}</span>
                  <strong>{t('import.templateMode')}</strong>
                  <p>{t('import.templateModeBody').replace('{count}', String(result.sourceSlides.length))}</p>
                </div>
                {showLayoutMode ? <ChevronUp /> : <ChevronDown />}
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="import-evidence-grid">
          <div className="import-evidence-card">
            <span><Type /> {t('import.fonts')}</span>
            <strong>{result.template.headingFont}</strong>
            <p>{result.template.bodyFont}</p>
          </div>
          <div className="import-evidence-card">
            <span><Palette /> {t('import.palette')}</span>
            <div className="import-palette">
              {result.template.palette.slice(0, 8).map((color) => <i key={color} style={{ background: color }} title={color} />)}
            </div>
          </div>
        </div>

        {showLayoutMode && result.template.layouts.length ? (
          <div className="import-layout-section">
            <div className="import-layout-heading">
              <div><strong>{t('import.chooseLayouts')}</strong><p>{t('import.chooseLayoutsBody')}</p></div>
              <Badge variant="secondary">{selectedLayouts.length} {t('import.selected')}</Badge>
            </div>
            <div className="import-layout-grid">
              {result.template.layouts.map((layout) => {
                const selected = selectedLayouts.includes(layout.id);
                return (
                  <button
                    key={layout.id}
                    type="button"
                    className={`import-layout-card ${selected ? 'is-selected' : ''}`}
                    aria-pressed={selected}
                    onClick={() => setSelectedLayouts((current) => selected ? current.filter((id) => id !== layout.id) : [...current, layout.id])}
                  >
                    <span className="import-layout-preview"><SlideFrame slide={{ id: layout.id, title: layout.name, background: layout.background, elements: layout.elements }} assets={result.assets} /></span>
                    <span className="import-layout-name">{layout.name}</span>
                    <span className="import-layout-check">{selected && <Check />}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : !result.template.layouts.length ? <p className="import-no-layouts">{t('import.noLayouts')}</p> : null}

        {result.template.warnings.length ? (
          <div className="import-warning-list">
            <strong><TriangleAlert /> {t('import.warningTitle')}</strong>
            <ul>{result.template.warnings.map((warning) => <li key={warning.code}>{t(warningMessageKey(warning.code))} <b>×{warning.count}</b></li>)}</ul>
          </div>
        ) : null}

        <footer className="import-actions">
          <Button variant="ghost" size="sm" onClick={reset}><RefreshCw /> {t('import.chooseAnother')}</Button>
          <span />
          {!result.sourceSlides.length ? (
            <Button size="sm" disabled={!canStartFromLayouts} onClick={() => applyImport('layouts')}><Sparkles /> {t('import.createFromLayouts')}</Button>
          ) : showLayoutMode ? (
            <Button size="sm" disabled={!canStartFromLayouts} onClick={() => applyImport('layouts')}><Sparkles /> {t('import.createFromLayouts')}</Button>
          ) : null}
        </footer>
      </section>
    );
  }

  return (
    <section className="pptx-import-panel">
      <div className="import-copy">
        <span className="dialog-eyebrow"><Sparkles /> {t('import.eyebrow')}</span>
        <h3>{t('import.title')}</h3>
        <p>{t('import.body')}</p>
      </div>
      <div
        className={`pptx-dropzone ${dragging ? 'is-dragging' : ''}`}
        onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => { event.preventDefault(); if (event.currentTarget === event.target) setDragging(false); }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files[0];
          if (file) void analyze(file);
        }}
      >
        <FileUp />
        <div><strong>{t('import.drop')}</strong><span>{t('import.support')}</span></div>
        <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>{t('import.browse')}</Button>
      </div>
      <p className="import-privacy"><LockKeyhole /> {t('import.localOnly')}</p>
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        accept=".pptx,.potx,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.presentationml.template"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void analyze(file);
        }}
      />
    </section>
  );
}
