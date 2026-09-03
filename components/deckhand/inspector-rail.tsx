'use client';

import { useMemo, useState } from 'react';
import {
  Activity,
  Braces,
  Check,
  Copy,
  MousePointerClick,
  Palette,
  Play,
  Sparkles,
  WandSparkles,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { DeckEditorController } from '@/hooks/use-deck-editor';
import { summarizeDeckQuality } from '@/lib/deck/review';
import type { ElementPatch } from '@/lib/deck/types';
import { WEBMCP_TOOL_MANIFEST } from '@/lib/deck/webmcp-manifest';
import { useI18n } from './i18n-provider';

interface InspectorRailProps {
  editor: DeckEditorController;
  onOpenTools: () => void;
}

const palette = ['#6676ef', '#ff786d', '#7de3c3', '#d8ff4f', '#f2c14e', '#161815'];

export function InspectorRail({ editor, onOpenTools }: InspectorRailProps) {
  const { locale, t } = useI18n();
  const [runningDemo, setRunningDemo] = useState(false);
  const [copied, setCopied] = useState(false);
  const slide = editor.deck.slides.find((item) => item.id === editor.currentSlideId) ?? editor.deck.slides[0];
  const selectedElements = useMemo(
    () => slide.elements.filter((element) => editor.selection.elementIds.includes(element.id)),
    [editor.selection.elementIds, slide.elements],
  );
  const selected = selectedElements.length === 1 ? selectedElements[0] : null;
  const quality = useMemo(() => summarizeDeckQuality(editor.deck), [editor.deck]);

  const runDemo = async () => {
    if (runningDemo) return;
    setRunningDemo(true);
    await new Promise((resolve) => setTimeout(resolve, 420));
    editor.addActivity({ actor: 'agent', action: 'inspect_project', toolName: 'inspect_project', summary: 'Read the live narrative, design system, and rendered scene.' });
    await new Promise((resolve) => setTimeout(resolve, 520));
    const brief = slide.provenance?.brief;
    if (brief) editor.reviseSlide(slide.id, { ...brief, takeaway: slide.title }, 'agent');
    else editor.addActivity({ actor: 'agent', action: 'validate_deck', toolName: 'validate_deck', summary: `Quality gate: ${quality.averageScore}/100 · ${quality.status}.` });
    setRunningDemo(false);
  };

  const updateSelected = (patch: ElementPatch) => {
    if (!selectedElements.length) return;
    editor.updateElements(slide.id, selectedElements.map((element) => ({ elementId: element.id, patch })));
  };

  const statusCopy = {
    checking: [t('inspector.connectingTitle'), t('inspector.connectingBody')],
    ready: [t('inspector.readyTitle'), t('inspector.readyBody')],
    unavailable: [t('inspector.fallbackTitle'), t('inspector.fallbackBody')],
    error: [t('inspector.errorTitle'), t('inspector.errorBody')],
  } as const;
  const [statusTitle, statusDescription] = statusCopy[editor.webMcpStatus];
  const densityLabel = {
    airy: t('density.airy'),
    balanced: t('density.balanced'),
    dense: t('density.dense'),
  };

  return (
    <aside className="inspector-rail" aria-label={t('inspector.label')}>
      <Tabs defaultValue="agent" className="inspector-tabs">
        <TabsList variant="line" className="inspector-tab-list">
          <TabsTrigger value="agent"><Sparkles /> {t('inspector.agent')}</TabsTrigger>
          <TabsTrigger value="design"><Palette /> {t('inspector.design')}</TabsTrigger>
        </TabsList>

        <TabsContent value="agent" className="inspector-panel">
          <section className={`bridge-status bridge-${editor.webMcpStatus}`}>
            <span className="bridge-status-icon"><Braces /></span>
            <div><strong>{statusTitle}</strong><p>{statusDescription}</p></div>
            <span className="connection-dot" />
          </section>

          <section className="context-card">
            <div className="context-label"><MousePointerClick /> {t('inspector.sharedContext')}</div>
            <dl>
              <div><dt>{t('inspector.openSlide')}</dt><dd>{slide.id}</dd></div>
              <div><dt>{t('inspector.selection')}</dt><dd>{editor.selection.elementIds.length || t('inspector.none')}</dd></div>
              <div><dt>{t('inspector.sceneObjects')}</dt><dd>{slide.elements.length}</dd></div>
              <div><dt>{t('inspector.humanEdits')}</dt><dd>{editor.recentHumanEdits.length}</dd></div>
              {editor.deck.importedTemplate && <div><dt>{t('inspector.sourceTemplate')}</dt><dd>{editor.deck.importedTemplate.name}</dd></div>}
              <div><dt>{t('inspector.designSource')}</dt><dd>{editor.deck.designSystem?.name ?? t('inspector.legacyDesign')}</dd></div>
              <div><dt>{t('inspector.layoutRecipe')}</dt><dd>{slide.provenance?.recipeId ?? slide.provenance?.source ?? t('inspector.customLayout')}</dd></div>
              <div><dt>{t('inspector.qualityGate')}</dt><dd>{quality.averageScore}/100 · {quality.status}</dd></div>
            </dl>
          </section>

          <section className="tool-section">
            <div className="section-heading"><span>{t('inspector.agentSurface')}</span><Badge variant="secondary">{WEBMCP_TOOL_MANIFEST.length}</Badge></div>
            <ul className="tool-list">
              {WEBMCP_TOOL_MANIFEST.slice(0, 5).map((tool, index) => (
                <li key={tool.name}>
                  <span className="tool-icon">{index + 1}</span>
                  <code>{tool.name}</code>
                  {tool.mode === 'READ' && <Badge variant="outline">READ</Badge>}
                </li>
              ))}
            </ul>
            <button className="view-all-tools" type="button" onClick={onOpenTools}>{t('inspector.inspectAll')} <span>→</span></button>
          </section>

          <section className="try-agent-card">
            <div className="try-agent-heading"><WandSparkles /><strong>{t('inspector.semanticEditing')}</strong></div>
            <p>{t('inspector.semanticEditingBody')}</p>
            <Button size="sm" onClick={runDemo} disabled={runningDemo} className="w-full">
              {runningDemo ? <Activity className="animate-pulse" /> : <Play />}
              {runningDemo ? t('inspector.agentEditing') : t('inspector.runPreview')}
            </Button>
          </section>

          <section className="activity-section">
            <div className="section-heading"><span>{t('inspector.liveActivity')}</span><span className="live-label"><i /> LIVE</span></div>
            <ol className="activity-list">
              {editor.activity.slice(0, 5).map((item) => (
                <li key={item.id} className={`actor-${item.actor}`}>
                  <span className="activity-avatar">{item.actor === 'agent' ? 'A' : item.actor === 'human' ? 'H' : '•'}</span>
                  <div>
                    <div className="activity-meta"><strong>{item.toolName ?? item.action}</strong><time>{item.timestamp ? new Date(item.timestamp).toISOString().slice(11, 16) : t('inspector.ready')}</time></div>
                    <p>{item.summary}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <button
            className="agent-prompt"
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(locale === 'ja'
                ? 'テンプレートを使わず、「AIと人が一緒に完成度の高いスライドを作る」というテーマで、審査員向けの5枚のデッキを作ってください。まずinspect_projectで状態を確認し、plan_deckで構成を作り、compose_deckで反映し、最後にvalidate_deckで品質を確認してください。'
                : 'Without using a template, create a five-slide judge-facing deck about humans and AI making polished presentations together. Inspect the project, plan the narrative, compose it, then validate the rendered quality.');
              setCopied(true);
              setTimeout(() => setCopied(false), 1400);
            }}
          >
            {copied ? <Check /> : <Copy />}
            <div><strong>{copied ? t('inspector.promptCopied') : t('inspector.tryAgent')}</strong><p>{locale === 'ja' ? '「テンプレートなしで5枚を計画・作成・検査して…」' : '“Plan, compose, and validate five slides without a template…”'}</p></div>
          </button>
        </TabsContent>

        <TabsContent value="design" className="inspector-panel design-panel">
          {selected ? (
            <>
              <section className="selection-inspector-heading">
                <span className="selection-kind">{selected.type}</span>
                <h3>{selected.role}</h3>
                <code>{selected.id}</code>
              </section>
              <section className="property-section">
                <div className="section-heading"><span>{t('inspector.positionSize')}</span></div>
                <div className="property-grid">
                  {(['x', 'y', 'width', 'height'] as const).map((field) => (
                    <label key={field}><span>{field === 'width' ? 'W' : field === 'height' ? 'H' : field.toUpperCase()}</span>
                      <Input
                        type="number"
                        value={Math.round(selected[field] * 10) / 10}
                        onChange={(event) => updateSelected({ [field]: Number(event.target.value) })}
                      />
                    </label>
                  ))}
                </div>
              </section>
              <section className="property-section">
                <div className="section-heading"><span>{t('inspector.typography')}</span></div>
                <label className="property-row" htmlFor="selected-font-size"><span>{t('inspector.size')}</span><Input id="selected-font-size" type="number" value={selected.style.fontSize ?? 20} onChange={(event) => updateSelected({ style: { fontSize: Number(event.target.value) } })} /></label>
                <label className="property-row" htmlFor="selected-font-weight"><span>{t('inspector.weight')}</span><Input id="selected-font-weight" type="number" step="50" min="300" max="800" value={selected.style.fontWeight ?? 500} onChange={(event) => updateSelected({ style: { fontWeight: Number(event.target.value) } })} /></label>
              </section>
              <section className="property-section">
                <div className="section-heading"><span>{t('inspector.color')}</span></div>
                <div className="color-swatches">
                  {palette.map((color) => (
                    <button
                      key={color}
                      type="button"
                      aria-label={`Apply ${color}`}
                      style={{ background: color }}
                      onClick={() => updateSelected({ style: selected.type === 'text' ? { color } : { fill: color } })}
                    />
                  ))}
                </div>
              </section>
              {selectedElements.length > 1 && <p className="multi-selection-note">Editing {selectedElements.length} selected elements together.</p>}
            </>
          ) : (
            <>
              {editor.deck.importedTemplate && (
                <section className="imported-template-inspector">
                  <div className="imported-template-inspector-head">
                    <span className="grammar-icon"><Palette /></span>
                    <div><span>{t('inspector.sourceTemplate')}</span><strong>{editor.deck.importedTemplate.name}</strong></div>
                    <b>{editor.deck.importedTemplate.fidelityScore}</b>
                  </div>
                  <dl>
                    <div><dt>{t('import.layouts')}</dt><dd>{editor.deck.importedTemplate.layouts.length}</dd></div>
                    <div><dt>{t('import.fonts')}</dt><dd>{editor.deck.importedTemplate.headingFont} / {editor.deck.importedTemplate.bodyFont}</dd></div>
                  </dl>
                  <div className="imported-template-palette">
                    {editor.deck.importedTemplate.palette.slice(0, 7).map((color) => <i key={color} style={{ background: color }} />)}
                  </div>
                </section>
              )}
              <section className="grammar-hero">
                <span className="grammar-icon"><Palette /></span>
                <div>
                  <span className="eyebrow">{t('inspector.deckGrammar')}</span>
                  <h3>{locale === 'ja' ? `${densityLabel[editor.deck.grammar.density]}・エディトリアル` : `${densityLabel[editor.deck.grammar.density]} editorial`}</h3>
                </div>
                <p>{editor.deck.grammar.narrative}</p>
              </section>
              <section className="context-card grammar-card">
                <div className="context-label">{t('inspector.inferred')}</div>
                <dl>
                  <div><dt>{t('inspector.titleAnchor')}</dt><dd>{editor.deck.grammar.titleLeft}% / {editor.deck.grammar.titleTop}%</dd></div>
                  <div><dt>{t('inspector.titleWidth')}</dt><dd>≤ {editor.deck.grammar.titleMaxWidth}%</dd></div>
                  <div><dt>{t('inspector.bodyLines')}</dt><dd>≤ {editor.deck.grammar.bodyMaxLines}</dd></div>
                  <div><dt>{t('inspector.visualArea')}</dt><dd>{editor.deck.grammar.visualRatio}%</dd></div>
                </dl>
              </section>
              <section className="property-section">
                <div className="section-heading"><span>{t('inspector.deckAccent')}</span></div>
                <div className="color-swatches">
                  {palette.slice(0, 5).map((color) => <button key={color} type="button" aria-label={`Apply ${color} to deck`} style={{ background: color }} onClick={() => editor.applyTheme({ accent: color, target: 'deck' }, 'human')} />)}
                </div>
              </section>
              <section className="property-section">
                <div className="section-heading"><span>{t('inspector.density')}</span></div>
                <div className="density-buttons">
                  {(['airy', 'balanced', 'dense'] as const).map((density) => (
                    <Button key={density} size="sm" variant={editor.deck.grammar.density === density ? 'secondary' : 'ghost'} onClick={() => editor.applyTheme({ density, target: 'deck' }, 'human')}>{densityLabel[density]}</Button>
                  ))}
                </div>
              </section>
              <div className="empty-selection-tip"><MousePointerClick /><p>{t('inspector.selectTip')}</p></div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </aside>
  );
}
