export type Actor = 'human' | 'agent' | 'system';

export type ElementKind =
  | 'text'
  | 'image'
  | 'shape'
  | 'card'
  | 'stat'
  | 'line'
  | 'code'
  | 'pill';

export type ElementRole =
  | 'kicker'
  | 'title'
  | 'subtitle'
  | 'body'
  | 'visual'
  | 'label'
  | 'data'
  | 'footer'
  | 'accent';

export type TextAlign = 'left' | 'center' | 'right';

export interface ElementStyle {
  fontFamily?: string;
  color?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  fontSize?: number;
  fontWeight?: number;
  fontStyle?: 'normal' | 'italic';
  textDecoration?: 'none' | 'underline';
  backgroundColor?: string;
  lineHeight?: number;
  letterSpacing?: number;
  textAlign?: TextAlign;
  radius?: number;
  opacity?: number;
  padding?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  verticalAlign?: 'top' | 'middle' | 'bottom';
  shadow?: string;
  textTransform?: 'none' | 'uppercase';
}

export interface TextRun {
  text: string;
  style?: Pick<ElementStyle, 'fontFamily' | 'color' | 'fontSize' | 'fontWeight' | 'fontStyle' | 'textDecoration' | 'backgroundColor'>;
}

export interface TextParagraph {
  runs: TextRun[];
  bullet?: string;
  bulletFontSize?: number;
  bulletScale?: number;
  bulletFontFamily?: string;
  bulletColor?: string;
  level?: number;
  lineHeight?: number;
  spaceBefore?: number;
  spaceAfter?: number;
  marginLeft?: number;
  indent?: number;
  textAlign?: TextAlign;
}

export interface SlideElement {
  id: string;
  type: ElementKind;
  role: ElementRole;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  zIndex?: number;
  content: string;
  label?: string;
  assetId?: string;
  imageCrop?: { top: number; right: number; bottom: number; left: number };
  shapePreset?: string;
  shapeAdjustments?: Record<string, number>;
  richText?: TextParagraph[];
  style: ElementStyle;
  locked?: boolean;
}

export type SlidePurpose =
  | 'cover'
  | 'section'
  | 'claim'
  | 'split'
  | 'comparison'
  | 'three_points'
  | 'process'
  | 'timeline'
  | 'metrics'
  | 'matrix'
  | 'closing';

export type GeneratedLayoutRecipeId =
  | 'cover_minimal'
  | 'section_divider'
  | 'claim_focus'
  | 'split_editorial'
  | 'comparison_balanced'
  | 'three_points_flat'
  | 'process_flow'
  | 'timeline_horizontal'
  | 'metrics_editorial'
  | 'matrix_quadrants'
  | 'closing_action';

export type ArtDirection = 'editorial' | 'bold' | 'calm' | 'technical';

export interface SlideBriefColumn {
  heading: string;
  body: string;
}

export interface SlideBriefMetric {
  value: string;
  label: string;
}

export interface SlideBriefStep {
  label: string;
  detail?: string;
}

export interface SlideBrief {
  purpose: SlidePurpose;
  takeaway: string;
  eyebrow?: string;
  body?: string;
  points?: string[];
  columns?: SlideBriefColumn[];
  metrics?: SlideBriefMetric[];
  steps?: SlideBriefStep[];
  layoutRecipeId?: GeneratedLayoutRecipeId;
  sourceSlideId?: string;
  templateLayoutId?: string;
  notes?: string;
}

export interface DeckPlan {
  id: string;
  title: string;
  audience: string;
  objective: string;
  artDirection: ArtDirection;
  designSource: 'generated' | 'imported_template';
  slides: Array<SlideBrief & { layoutRecipeId: GeneratedLayoutRecipeId }>;
  warnings: string[];
}

export interface DeckDesignSystem {
  source: 'generated' | 'imported_template';
  name: string;
  artDirection?: ArtDirection;
  headingFont: string;
  bodyFont: string;
  recipeCount: number;
}

export interface SlideProvenance {
  source: 'generated' | 'template_slide' | 'template_layout';
  sourceId?: string;
  recipeId?: GeneratedLayoutRecipeId;
  purpose?: SlidePurpose;
  brief?: SlideBrief;
}

export interface Slide {
  id: string;
  title: string;
  background: string;
  elements: SlideElement[];
  notes?: string;
  provenance?: SlideProvenance;
}

export interface DesignGrammar {
  density: 'airy' | 'balanced' | 'dense';
  titleTop: number;
  titleLeft: number;
  titleMaxWidth: number;
  bodyMaxLines: number;
  visualRatio: number;
  cornerRadius: number;
  narrative: string;
}

export interface DeckTheme {
  canvas: string;
  ink: string;
  muted: string;
  accent: string;
  accentAlt: string;
  signal: string;
}

export interface DeckAsset {
  id: string;
  name: string;
  mimeType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
  dataUrl: string;
  sizeBytes: number;
}

export interface TemplateLayout {
  id: string;
  name: string;
  sourcePart: string;
  background: string;
  elements: SlideElement[];
  purposeHint?: SlidePurpose;
  editableElementIds?: string[];
}

export interface ImportWarning {
  code:
    | 'external_links_skipped'
    | 'unsupported_charts'
    | 'unsupported_groups'
    | 'unsupported_smartart'
    | 'images_skipped'
    | 'content_truncated';
  count: number;
}

export interface ImportedTemplate {
  id: string;
  name: string;
  fileName: string;
  format: 'pptx' | 'potx';
  importedAt: string;
  sourceSlideCount: number;
  sourceLayoutCount: number;
  headingFont: string;
  bodyFont: string;
  palette: string[];
  fidelityScore: number;
  warnings: ImportWarning[];
  layouts: TemplateLayout[];
}

export interface Deck {
  id: string;
  title: string;
  version: number;
  updatedAt: string;
  theme: DeckTheme;
  grammar: DesignGrammar;
  slides: Slide[];
  assets?: Record<string, DeckAsset>;
  importedTemplate?: ImportedTemplate;
  designSystem?: DeckDesignSystem;
}

export interface Selection {
  slideId: string;
  elementIds: string[];
}

export type EditCategory =
  | 'position'
  | 'size'
  | 'typography'
  | 'content'
  | 'style'
  | 'structure';

export interface EditDelta {
  id: string;
  actor: Actor;
  slideId: string;
  elementId?: string;
  elementRole?: ElementRole;
  category: EditCategory;
  field: string;
  before?: unknown;
  after?: unknown;
  timestamp: number;
}

export interface ActivityItem {
  id: string;
  actor: Actor;
  action: string;
  summary: string;
  timestamp: number;
  toolName?: string;
}

export interface ElementPatch {
  content?: string;
  label?: string;
  role?: ElementRole;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  zIndex?: number;
  shapePreset?: string;
  style?: Partial<ElementStyle>;
}

export interface AgentElementInput {
  id?: string;
  type: Exclude<ElementKind, 'image'>;
  role: ElementRole;
  content: string;
  label?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  zIndex?: number;
  shapePreset?: string;
  style?: Partial<ElementStyle>;
}

export type BuiltInSlideLayout = 'title' | 'statement' | 'two_column' | 'blank';

export interface SlideSlotContent {
  role: ElementRole;
  values: string[];
}

export interface SlideCompositionInput {
  title: string;
  sourceSlideId?: string;
  templateLayoutId?: string;
  layout?: BuiltInSlideLayout;
  slots?: SlideSlotContent[];
  additions?: AgentElementInput[];
  background?: string;
  notes?: string;
}

export interface SlideCompositionResult {
  deck: Deck;
  slideIds: string[];
  warnings: string[];
}

export type ArrangeOperation =
  | 'align_left'
  | 'align_center'
  | 'align_right'
  | 'align_top'
  | 'align_middle'
  | 'align_bottom'
  | 'distribute_horizontal'
  | 'distribute_vertical';

export interface SlideEditInput {
  slideTitle?: string;
  background?: string;
  notes?: string;
  additions?: AgentElementInput[];
  updates?: Array<{ elementId: string; patch: ElementPatch }>;
  removeElementIds?: string[];
  arrangements?: Array<{ elementIds: string[]; operation: ArrangeOperation }>;
}

export interface EditorSnapshot {
  deck: Deck;
  selection: Selection;
}
