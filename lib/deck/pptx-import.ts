import { XMLParser } from 'fast-xml-parser';
import JSZip, { type JSZipObject } from 'jszip';

import {
  clamp,
  createId,
  createSlideFromTemplateLayout,
} from './operations';
import type {
  Deck,
  DeckAsset,
  DeckTheme,
  DesignGrammar,
  ElementRole,
  ElementStyle,
  ImportedTemplate,
  ImportWarning,
  Slide,
  SlideElement,
  SlidePurpose,
  TemplateLayout,
  TextParagraph,
  TextRun,
} from './types';

const MAX_FILE_BYTES = 24 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 3000;
const MAX_SOURCE_SLIDES = 60;
const MAX_LAYOUTS = 60;
const MAX_IMAGE_BYTES = 1_500_000;
const MAX_TOTAL_IMAGE_BYTES = 2_500_000;
const DEFAULT_SLIDE_BACKGROUND = '#FFFFFF';

type XmlNode = Record<string, unknown>;
type PartLayer = 'master' | 'layout' | 'slide';

interface Relationship {
  id: string;
  target: string;
  type: string;
  external: boolean;
}

interface ThemeEvidence {
  colors: Record<string, string>;
  headingFont: string;
  bodyFont: string;
}

interface RawElement {
  id: string;
  type: SlideElement['type'];
  role: ElementRole;
  content?: string;
  label?: string;
  assetId?: string;
  imageCrop?: { top: number; right: number; bottom: number; left: number };
  shapePreset?: string;
  shapeAdjustments?: Record<string, number>;
  richText?: TextParagraph[];
  paragraphDefaults?: ParagraphDefaults[];
  autofitFontScale?: number;
  autofitLineScale?: number;
  placeholderKey?: string;
  placeholderType?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  zIndex: number;
  style: ElementStyle;
  locked?: boolean;
}

interface ParagraphDefaults extends Omit<Partial<TextParagraph>, 'runs'> {
  runStyle?: TextRun['style'];
}

interface ParsedPart {
  name: string;
  partPath: string;
  background?: string;
  elements: RawElement[];
  masterPath?: string;
  layoutPath?: string;
}

export interface PptxImportStats {
  slides: number;
  layouts: number;
  editableElements: number;
  images: number;
  charts: number;
}

export interface PptxImportResult {
  fileName: string;
  format: 'pptx' | 'potx';
  title: string;
  theme: DeckTheme;
  grammar: DesignGrammar;
  template: ImportedTemplate;
  sourceSlides: Slide[];
  assets: Record<string, DeckAsset>;
  stats: PptxImportStats;
}

export type PptxImportMode = 'slides' | 'layouts';

interface ImportContext {
  zip: JSZip;
  slideWidth: number;
  slideHeight: number;
  theme: ThemeEvidence;
  assets: Record<string, DeckAsset>;
  mediaCache: Map<string, string | null>;
  imageBytes: number;
  warningCounts: Map<ImportWarning['code'], number>;
  stats: PptxImportStats;
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: false,
});

const asNode = (value: unknown): XmlNode =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as XmlNode : {};

const asArray = <T>(value: T | T[] | undefined): T[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

const child = (value: unknown, key: string) => asNode(value)[key];

const attribute = (value: unknown, key: string) => {
  const candidate = asNode(value)[`@_${key}`];
  return typeof candidate === 'string' || typeof candidate === 'number' ? String(candidate) : undefined;
};

const numberAttribute = (value: unknown, key: string) => {
  const candidate = Number(attribute(value, key));
  return Number.isFinite(candidate) ? candidate : undefined;
};

const normalizeHex = (value: string | undefined, fallback: string) => {
  if (!value) return fallback;
  const clean = value.replace(/^#/, '').trim();
  return /^[0-9a-f]{6}$/i.test(clean) ? `#${clean.toUpperCase()}` : fallback;
};

const unique = <T>(values: T[]) => [...new Set(values)];

const median = (values: number[], fallback: number) => {
  if (!values.length) return fallback;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const normalizePartPath = (basePart: string, target: string) => {
  const segments = target.startsWith('/')
    ? []
    : basePart.split('/').slice(0, -1);
  target.replace(/^\//, '').split('/').forEach((segment) => {
    if (!segment || segment === '.') return;
    if (segment === '..') segments.pop();
    else segments.push(segment);
  });
  return segments.join('/');
};

const relationshipPartPath = (partPath: string) => {
  const segments = partPath.split('/');
  const fileName = segments.pop();
  return [...segments, '_rels', `${fileName}.rels`].join('/');
};

const naturalPartSort = (left: string, right: string) => {
  const leftNumber = Number(left.match(/(\d+)(?=\.xml$)/)?.[1] ?? 0);
  const rightNumber = Number(right.match(/(\d+)(?=\.xml$)/)?.[1] ?? 0);
  return leftNumber - rightNumber || left.localeCompare(right);
};

const readXml = async (zip: JSZip, partPath: string): Promise<XmlNode | undefined> => {
  const file = zip.file(partPath);
  if (!file) return undefined;
  const xml = await file.async('text');
  // fast-xml-parser's object representation groups siblings by tag name, which
  // loses the position of DrawingML line breaks between text runs. Normalize
  // each break into an ordinary run before parsing so the original run order is
  // retained without switching the entire importer to preserveOrder mode.
  const orderedTextXml = xml
    .replace(/<a:br(?:\s[^>]*)?\/>/g, '<a:r><a:t>\n</a:t></a:r>')
    .replace(/<a:br(?:\s[^>]*)?>([\s\S]*?)<\/a:br>/g, '<a:r>$1<a:t>\n</a:t></a:r>');
  return asNode(xmlParser.parse(orderedTextXml));
};

const readRelationships = async (zip: JSZip, partPath: string): Promise<Map<string, Relationship>> => {
  const document = await readXml(zip, relationshipPartPath(partPath));
  const relationships = asArray(child(child(document, 'Relationships'), 'Relationship'));
  const result = new Map<string, Relationship>();
  relationships.forEach((item) => {
    const id = attribute(item, 'Id') ?? '';
    if (!id) return;
    result.set(id, {
      id,
      target: normalizePartPath(partPath, attribute(item, 'Target') ?? ''),
      type: attribute(item, 'Type') ?? '',
      external: attribute(item, 'TargetMode') === 'External',
    });
  });
  return result;
};

const addWarning = (context: ImportContext, code: ImportWarning['code'], count = 1) => {
  context.warningCounts.set(code, (context.warningCounts.get(code) ?? 0) + count);
};

const collectText = (value: unknown): string[] => {
  if (typeof value === 'string' || typeof value === 'number') return [String(value)];
  if (Array.isArray(value)) return value.flatMap(collectText);
  const record = asNode(value);
  return Object.entries(record).flatMap(([key, item]) => key.startsWith('@_') ? [] : collectText(item));
};

const paragraphText = (paragraph: unknown) => {
  const record = asNode(paragraph);
  const fragments: string[] = [];
  const runs = asArray(record['a:r']);
  runs.forEach((run) => {
    const text = child(run, 'a:t');
    if (typeof text === 'string' || typeof text === 'number') {
      fragments.push(String(text));
    }
  });
  asArray(record['a:fld']).forEach((field) => {
    const text = child(field, 'a:t');
    if (typeof text === 'string' || typeof text === 'number') fragments.push(String(text));
  });
  if (!fragments.length) {
    const text = record['a:t'];
    if (typeof text === 'string' || typeof text === 'number') fragments.push(String(text));
  }
  const content = fragments.join('');
  const paragraphProperties = child(record, 'a:pPr');
  const bullet = child(paragraphProperties, 'a:buNone')
    ? undefined
    : attribute(child(paragraphProperties, 'a:buChar'), 'char');
  return bullet && content ? `${bullet} ${content}` : content;
};

const textBodyContent = (textBody: unknown) => asArray(child(textBody, 'a:p'))
  .reduce<{ lines: string[]; autoNumber: number }>((state, paragraph) => {
    const text = paragraphText(paragraph);
    if (!text.trim()) return state;
    const auto = child(child(paragraph, 'a:pPr'), 'a:buAutoNum');
    if (Object.keys(asNode(auto)).length) {
      const startAt = numberAttribute(auto, 'startAt');
      state.autoNumber = startAt ?? state.autoNumber + 1;
      state.lines.push(`${state.autoNumber}. ${text}`);
    } else {
      state.lines.push(text);
    }
    return state;
  }, { lines: [], autoNumber: 0 }).lines.join('\n').trim();

const fillColor = (fill: unknown, theme: ThemeEvidence, fallback?: string) => {
  const srgb = attribute(child(fill, 'a:srgbClr'), 'val');
  if (srgb) return normalizeHex(srgb, fallback ?? '#000000');
  const system = attribute(child(fill, 'a:sysClr'), 'lastClr');
  if (system) return normalizeHex(system, fallback ?? '#000000');
  const scheme = attribute(child(fill, 'a:schemeClr'), 'val');
  if (!scheme) return fallback;
  const aliases: Record<string, string> = { tx1: 'dk1', tx2: 'dk2', bg1: 'lt1', bg2: 'lt2' };
  return theme.colors[aliases[scheme] ?? scheme] ?? fallback;
};

const pointsToCanvasPixels = (points: number) => points * 4 / 3;
const emuToCanvasPixels = (emu: number) => emu / 914400 * 96;
const canvasPixelsToEmu = (pixels: number) => pixels / 96 * 914400;

const textBodyAutofit = (textBody: unknown) => {
  const normal = child(child(textBody, 'a:bodyPr'), 'a:normAutofit');
  const fontScale = numberAttribute(normal, 'fontScale');
  const lineSpacingReduction = numberAttribute(normal, 'lnSpcReduction');
  return {
    fontScale: fontScale === undefined ? 1 : fontScale / 100000,
    lineScale: lineSpacingReduction === undefined ? 1 : 1 - lineSpacingReduction / 100000,
  };
};

const paragraphLineHeight = (paragraphProperties: unknown) => {
  const percentage = numberAttribute(child(child(paragraphProperties, 'a:lnSpc'), 'a:spcPct'), 'val');
  return percentage === undefined ? undefined : percentage / 100000;
};

const paragraphSpacing = (paragraphProperties: unknown, key: 'a:spcBef' | 'a:spcAft') => {
  const points = numberAttribute(child(child(paragraphProperties, key), 'a:spcPts'), 'val');
  return points === undefined ? undefined : pointsToCanvasPixels(points / 100);
};

const runStyle = (
  properties: unknown,
  role: ElementRole,
  theme: ThemeEvidence,
  fontScale = 1,
): TextRun['style'] => {
  const size = numberAttribute(properties, 'sz');
  const bold = attribute(properties, 'b');
  const italic = attribute(properties, 'i');
  const underline = attribute(properties, 'u');
  const color = fillColor(child(properties, 'a:solidFill'), theme, undefined);
  const highlight = fillColor(child(properties, 'a:highlight'), theme, undefined);
  const typeface = attribute(child(properties, 'a:ea'), 'typeface')
    || attribute(child(properties, 'a:latin'), 'typeface');
  const style: NonNullable<TextRun['style']> = {};
  if (size !== undefined) style.fontSize = pointsToCanvasPixels(size / 100) * fontScale;
  if (bold !== undefined) style.fontWeight = bold === '1' ? 700 : 400;
  if (italic !== undefined) style.fontStyle = italic === '1' ? 'italic' : 'normal';
  if (underline !== undefined) style.textDecoration = underline === 'none' ? 'none' : 'underline';
  if (color) style.color = color;
  if (highlight) style.backgroundColor = highlight;
  if (typeface) style.fontFamily = resolveTypeface(typeface, role, theme);
  return Object.keys(style).length ? style : undefined;
};

const textBodyParagraphs = (textBody: unknown, role: ElementRole, theme: ThemeEvidence): TextParagraph[] => {
  const listStyle = child(textBody, 'a:lstStyle');
  const autofit = textBodyAutofit(textBody);
  let autoNumber = 0;
  return asArray(child(textBody, 'a:p')).map((paragraph) => {
    const record = asNode(paragraph);
    const paragraphProperties = child(record, 'a:pPr');
    const level = numberAttribute(paragraphProperties, 'lvl') ?? 0;
    const listLevel = child(listStyle, `a:lvl${level + 1}pPr`);
    const runNodes = asArray(record['a:r']);
    const paragraphRunStyle = runStyle(child(paragraphProperties, 'a:defRPr'), role, theme, autofit.fontScale);
    const endRunStyle = runStyle(child(record, 'a:endParaRPr'), role, theme, autofit.fontScale);
    const runs: TextRun[] = runNodes.flatMap((run) => {
      const text = child(run, 'a:t');
      if (typeof text !== 'string' && typeof text !== 'number') return [];
      const directStyle = runStyle(child(run, 'a:rPr'), role, theme, autofit.fontScale);
      return [{
        text: String(text),
        style: paragraphRunStyle || directStyle
          ? { ...paragraphRunStyle, ...directStyle }
          : undefined,
      }];
    });
    asArray(record['a:fld']).forEach((field) => {
      const text = child(field, 'a:t');
      if (typeof text === 'string' || typeof text === 'number') {
        const directStyle = runStyle(child(field, 'a:rPr'), role, theme, autofit.fontScale);
        runs.push({
          text: String(text),
          style: paragraphRunStyle || directStyle
            ? { ...paragraphRunStyle, ...directStyle }
            : undefined,
        });
      }
    });
    if (!runs.length) {
      const text = record['a:t'];
      if (typeof text === 'string' || typeof text === 'number') runs.push({ text: String(text) });
      else runs.push({ text: '', style: endRunStyle ?? paragraphRunStyle });
    }
    const auto = child(paragraphProperties, 'a:buAutoNum');
    const bulletSource = child(paragraphProperties, 'a:buNone')
      ? undefined
      : child(paragraphProperties, 'a:buChar') || child(listLevel, 'a:buChar');
    const bulletSizePoints = child(paragraphProperties, 'a:buSzPts') || child(listLevel, 'a:buSzPts');
    const bulletSizePercentage = child(paragraphProperties, 'a:buSzPct') || child(listLevel, 'a:buSzPct');
    const bulletFont = child(paragraphProperties, 'a:buFont') || child(listLevel, 'a:buFont');
    const bulletColor = fillColor(
      child(paragraphProperties, 'a:buClr') || child(listLevel, 'a:buClr'),
      theme,
      undefined,
    );
    if (Object.keys(asNode(auto)).length) autoNumber = numberAttribute(auto, 'startAt') ?? autoNumber + 1;
    const align = attribute(paragraphProperties, 'algn') || attribute(listLevel, 'algn');
    const textAlign: TextParagraph['textAlign'] = align === 'ctr' ? 'center' : align === 'r' ? 'right' : align ? 'left' : undefined;
    return {
      runs,
      bullet: Object.keys(asNode(auto)).length ? `${autoNumber}.` : attribute(bulletSource, 'char'),
      bulletFontSize: numberAttribute(bulletSizePoints, 'val') === undefined
        ? undefined
        : pointsToCanvasPixels((numberAttribute(bulletSizePoints, 'val') ?? 0) / 100) * autofit.fontScale,
      bulletScale: numberAttribute(bulletSizePercentage, 'val') === undefined
        ? undefined
        : (numberAttribute(bulletSizePercentage, 'val') ?? 100000) / 100000,
      bulletFontFamily: attribute(bulletFont, 'typeface'),
      bulletColor,
      level,
      lineHeight: (paragraphLineHeight(paragraphProperties) ?? paragraphLineHeight(listLevel)) === undefined
        ? undefined
        : (paragraphLineHeight(paragraphProperties) ?? paragraphLineHeight(listLevel))! * autofit.lineScale,
      spaceBefore: (paragraphSpacing(paragraphProperties, 'a:spcBef') ?? paragraphSpacing(listLevel, 'a:spcBef')) === undefined
        ? undefined
        : (paragraphSpacing(paragraphProperties, 'a:spcBef') ?? paragraphSpacing(listLevel, 'a:spcBef'))! * autofit.fontScale,
      spaceAfter: (paragraphSpacing(paragraphProperties, 'a:spcAft') ?? paragraphSpacing(listLevel, 'a:spcAft')) === undefined
        ? undefined
        : (paragraphSpacing(paragraphProperties, 'a:spcAft') ?? paragraphSpacing(listLevel, 'a:spcAft'))! * autofit.fontScale,
      marginLeft: numberAttribute(paragraphProperties, 'marL') === undefined
        ? numberAttribute(listLevel, 'marL') === undefined ? undefined : emuToCanvasPixels(numberAttribute(listLevel, 'marL') ?? 0)
        : emuToCanvasPixels(numberAttribute(paragraphProperties, 'marL') ?? 0),
      indent: numberAttribute(paragraphProperties, 'indent') === undefined
        ? numberAttribute(listLevel, 'indent') === undefined ? undefined : emuToCanvasPixels(numberAttribute(listLevel, 'indent') ?? 0)
        : emuToCanvasPixels(numberAttribute(paragraphProperties, 'indent') ?? 0),
      textAlign,
    };
  });
};

const textBodyParagraphDefaults = (textBody: unknown, role: ElementRole, theme: ThemeEvidence): ParagraphDefaults[] => {
  const listStyle = child(textBody, 'a:lstStyle');
  const autofit = textBodyAutofit(textBody);
  return Array.from({ length: 9 }, (_, level) => {
    const properties = child(listStyle, `a:lvl${level + 1}pPr`);
    const align = attribute(properties, 'algn');
    const marginLeft = numberAttribute(properties, 'marL');
    const indent = numberAttribute(properties, 'indent');
    return {
      level,
      runStyle: runStyle(child(properties, 'a:defRPr'), role, theme, autofit.fontScale),
      lineHeight: paragraphLineHeight(properties) === undefined
        ? undefined
        : paragraphLineHeight(properties)! * autofit.lineScale,
      spaceBefore: paragraphSpacing(properties, 'a:spcBef') === undefined
        ? undefined
        : paragraphSpacing(properties, 'a:spcBef')! * autofit.fontScale,
      spaceAfter: paragraphSpacing(properties, 'a:spcAft') === undefined
        ? undefined
        : paragraphSpacing(properties, 'a:spcAft')! * autofit.fontScale,
      marginLeft: marginLeft === undefined ? undefined : emuToCanvasPixels(marginLeft),
      indent: indent === undefined ? undefined : emuToCanvasPixels(indent),
      textAlign: align === 'ctr' ? 'center' : align === 'r' ? 'right' : align ? 'left' : undefined,
    } satisfies ParagraphDefaults;
  });
};

const applyParagraphDefaults = (
  paragraphs: TextParagraph[] | undefined,
  defaults: ParagraphDefaults[] | undefined,
) => paragraphs?.map((paragraph) => {
  const fallback = defaults?.[paragraph.level ?? 0];
  return {
    ...fallback,
    ...paragraph,
    runs: paragraph.runs.map((run) => ({
      ...run,
      style: fallback?.runStyle || run.style ? { ...fallback?.runStyle, ...run.style } : undefined,
    })),
  } satisfies TextParagraph;
});

const extractTheme = async (zip: JSZip): Promise<ThemeEvidence> => {
  const themePart = Object.keys(zip.files)
    .filter((path) => /^ppt\/theme\/theme\d+\.xml$/i.test(path))
    .sort(naturalPartSort)[0];
  const document = themePart ? await readXml(zip, themePart) : undefined;
  const root = child(document, 'a:theme');
  const elements = child(root, 'a:themeElements');
  const scheme = asNode(child(elements, 'a:clrScheme'));
  const colors: Record<string, string> = {};
  Object.entries(scheme).forEach(([key, value]) => {
    if (key.startsWith('@_')) return;
    const srgb = attribute(child(value, 'a:srgbClr'), 'val');
    const system = attribute(child(value, 'a:sysClr'), 'lastClr');
    const color = srgb ?? system;
    if (color) colors[key.replace(/^a:/, '')] = normalizeHex(color, '#000000');
  });
  const fontScheme = child(elements, 'a:fontScheme');
  const headingFont = attribute(child(child(fontScheme, 'a:majorFont'), 'a:latin'), 'typeface') || 'Aptos Display';
  const bodyFont = attribute(child(child(fontScheme, 'a:minorFont'), 'a:latin'), 'typeface') || 'Aptos';
  return { colors, headingFont, bodyFont };
};

const resolveTypeface = (value: string | undefined, role: ElementRole, theme: ThemeEvidence) => {
  if (!value || value === '+mn-lt') return role === 'title' ? theme.headingFont : theme.bodyFont;
  if (value === '+mj-lt') return theme.headingFont;
  return value;
};

const roleFromPlaceholder = (placeholderType: string | undefined, content: string): ElementRole => {
  if (placeholderType === 'title' || placeholderType === 'ctrTitle') return 'title';
  if (placeholderType === 'subTitle') return 'subtitle';
  if (['dt', 'ftr', 'sldNum'].includes(placeholderType ?? '')) return 'footer';
  if (['body', 'obj'].includes(placeholderType ?? '')) return 'body';
  if (/^\s*(title|headline)/i.test(content)) return 'title';
  return content ? 'body' : 'visual';
};

const placeholderCopy = (placeholderType: string | undefined) => {
  if (placeholderType === 'title' || placeholderType === 'ctrTitle') return 'Title';
  if (placeholderType === 'subTitle') return 'Subtitle';
  if (placeholderType === 'body' || placeholderType === 'obj') return 'Add supporting content';
  if (placeholderType === 'sldNum') return '01';
  if (placeholderType === 'dt') return 'Date';
  if (placeholderType === 'ftr') return 'Footer';
  return '';
};

const cleanLayerText = (content: string, placeholderType: string | undefined, layer: PartLayer, isPlaceholder: boolean) => {
  if (layer === 'slide') return content;
  if (isPlaceholder && (
    !content
    || /click to edit|クリックして|master (title|text)|マスター/i.test(content)
    || (placeholderType === 'sldNum' && /[‹›<>#]/.test(content))
  )) {
    return placeholderCopy(placeholderType);
  }
  return content || placeholderCopy(placeholderType);
};

const geometryFromTransform = (transform: unknown, context: ImportContext) => {
  const offset = child(transform, 'a:off');
  const extent = child(transform, 'a:ext');
  const x = numberAttribute(offset, 'x');
  const y = numberAttribute(offset, 'y');
  const width = numberAttribute(extent, 'cx');
  const height = numberAttribute(extent, 'cy');
  return {
    x: x === undefined ? undefined : clamp(x / context.slideWidth * 100, -20, 120),
    y: y === undefined ? undefined : clamp(y / context.slideHeight * 100, -20, 120),
    width: width === undefined ? undefined : clamp(width / context.slideWidth * 100, 0.01, 120),
    height: height === undefined ? undefined : clamp(height / context.slideHeight * 100, 0.01, 120),
    rotation: numberAttribute(transform, 'rot') === undefined ? undefined : Number(numberAttribute(transform, 'rot')) / 60000,
  };
};

const textStyleProperties = (textBody: unknown) => {
  const paragraph = asArray(child(textBody, 'a:p'))[0];
  const run = asArray(child(paragraph, 'a:r'))[0];
  const paragraphProperties = child(paragraph, 'a:pPr');
  const level = numberAttribute(paragraphProperties, 'lvl') ?? 0;
  const listLevel = child(child(textBody, 'a:lstStyle'), `a:lvl${level + 1}pPr`);
  return [
    child(run, 'a:rPr'),
    child(paragraphProperties, 'a:defRPr'),
    child(listLevel, 'a:defRPr'),
  ].filter((value) => Object.keys(asNode(value)).length);
};

const firstStyleAttribute = (properties: unknown[], key: string) =>
  properties.map((item) => attribute(item, key)).find((value) => value !== undefined);

const firstStyleChild = (properties: unknown[], key: string) =>
  properties.map((item) => child(item, key)).find((value) => Object.keys(asNode(value)).length);

const shapeStyle = (
  shapeProperties: unknown,
  textBody: unknown,
  role: ElementRole,
  theme: ThemeEvidence,
): ElementStyle => {
  const runProperties = textStyleProperties(textBody);
  const paragraphProperties = child(asArray(child(textBody, 'a:p'))[0], 'a:pPr');
  const level = numberAttribute(paragraphProperties, 'lvl') ?? 0;
  const listLevel = child(child(textBody, 'a:lstStyle'), `a:lvl${level + 1}pPr`);
  const bodyProperties = child(textBody, 'a:bodyPr');
  const autofit = textBodyAutofit(textBody);
  const preset = attribute(child(shapeProperties, 'a:prstGeom'), 'prst');
  const fill = child(shapeProperties, 'a:solidFill');
  const line = child(shapeProperties, 'a:ln');
  const lineFill = child(line, 'a:solidFill');
  const fontSizeValue = firstStyleAttribute(runProperties, 'sz');
  const fontSize = fontSizeValue === undefined ? undefined : Number(fontSizeValue);
  const typeface = attribute(firstStyleChild(runProperties, 'a:ea'), 'typeface')
    || attribute(firstStyleChild(runProperties, 'a:latin'), 'typeface');
  const align = attribute(paragraphProperties, 'algn') || attribute(listLevel, 'algn');
  const style: ElementStyle = {};
  const textColor = fillColor(firstStyleChild(runProperties, 'a:solidFill'), theme, undefined);
  const shapeFill = fillColor(fill, theme, undefined);
  const stroke = fillColor(lineFill, theme, undefined);
  const strokeWidth = numberAttribute(line, 'w');
  const textRuns = asArray(child(textBody, 'a:p')).flatMap((paragraph) => [
    ...asArray(child(paragraph, 'a:r')).map((run) => child(run, 'a:rPr')),
    ...asArray(child(paragraph, 'a:fld')).map((field) => child(field, 'a:rPr')),
  ]);
  const boldValues = textRuns.map((properties) => attribute(properties, 'b'));
  const verticalAnchor = attribute(bodyProperties, 'anchor');
  const isTextBox = role !== 'visual' || Boolean(textBodyContent(textBody).trim());
  const inset = (key: 'tIns' | 'rIns' | 'bIns' | 'lIns') => {
    const value = numberAttribute(bodyProperties, key);
    return value === undefined ? undefined : emuToCanvasPixels(value);
  };

  if (textColor) style.color = textColor;
  if (child(shapeProperties, 'a:noFill')) style.fill = 'transparent';
  else if (shapeFill) style.fill = shapeFill;
  if (stroke) style.stroke = stroke;
  if (stroke && /line|connector/i.test(preset ?? '')) style.color = stroke;
  if (strokeWidth) style.strokeWidth = Math.max(1, emuToCanvasPixels(strokeWidth));
  if (fontSize) style.fontSize = clamp(pointsToCanvasPixels(fontSize / 100) * autofit.fontScale, 8, 160);
  if (boldValues.length && boldValues.every((value) => value === '1')) style.fontWeight = 700;
  else if (boldValues.length && boldValues.every((value) => value === '0')) style.fontWeight = 400;
  if (align) style.textAlign = align === 'ctr' ? 'center' : align === 'r' ? 'right' : 'left';
  const lineHeight = (paragraphLineHeight(paragraphProperties) ?? paragraphLineHeight(listLevel)) === undefined
    ? undefined
    : (paragraphLineHeight(paragraphProperties) ?? paragraphLineHeight(listLevel))! * autofit.lineScale;
  if (lineHeight) style.lineHeight = lineHeight;
  if (isTextBox && verticalAnchor) style.verticalAlign = verticalAnchor === 'b' ? 'bottom' : verticalAnchor === 'ctr' ? 'middle' : 'top';
  const paddingTop = inset('tIns');
  const paddingRight = inset('rIns');
  const paddingBottom = inset('bIns');
  const paddingLeft = inset('lIns');
  if (isTextBox && paddingTop !== undefined) style.paddingTop = paddingTop;
  if (isTextBox && paddingRight !== undefined) style.paddingRight = paddingRight;
  if (isTextBox && paddingBottom !== undefined) style.paddingBottom = paddingBottom;
  if (isTextBox && paddingLeft !== undefined) style.paddingLeft = paddingLeft;
  if (preset) style.radius = preset === 'ellipse' ? 999 : preset === 'roundRect' ? 14 : 0;
  if (typeface) style.fontFamily = resolveTypeface(typeface, role, theme);
  return style;
};

const parseShape = (
  shape: unknown,
  partPath: string,
  index: number,
  layer: PartLayer,
  context: ImportContext,
): RawElement => {
  const nonVisual = child(shape, 'p:nvSpPr');
  const properties = child(nonVisual, 'p:cNvPr');
  const placeholder = child(child(nonVisual, 'p:nvPr'), 'p:ph');
  const placeholderType = attribute(placeholder, 'type') ?? (placeholder ? 'obj' : undefined);
  const placeholderIndex = attribute(placeholder, 'idx');
  const placeholderKey = placeholder && placeholderIndex !== '4294967295'
    ? `${placeholderType ?? 'obj'}:${placeholderIndex ?? '0'}`
    : undefined;
  const textBody = child(shape, 'p:txBody');
  const rawContent = textBodyContent(textBody);
  const content = cleanLayerText(rawContent, placeholderType, layer, Boolean(placeholder));
  const role = roleFromPlaceholder(placeholderType, content);
  const shapeProperties = child(shape, 'p:spPr');
  const geometry = geometryFromTransform(child(shapeProperties, 'a:xfrm'), context);
  const preset = attribute(child(shapeProperties, 'a:prstGeom'), 'prst');
  const shapeAdjustments = Object.fromEntries(
    asArray(child(child(child(shapeProperties, 'a:prstGeom'), 'a:avLst'), 'a:gd')).flatMap((guide) => {
      const name = attribute(guide, 'name');
      const value = Number(attribute(guide, 'fmla')?.match(/-?\d+(?:\.\d+)?/)?.[0]);
      return name && Number.isFinite(value) ? [[name, value]] : [];
    }),
  );
  const name = attribute(properties, 'name') ?? `Shape ${index + 1}`;
  const paragraphDefaults = textBodyParagraphDefaults(textBody, role, context.theme);
  const autofit = textBodyAutofit(textBody);
  return {
    id: `${partPath.replace(/\W+/g, '-')}-${attribute(properties, 'id') ?? index + 1}`,
    type: /line|connector/i.test(preset ?? '')
      ? 'line'
      : preset && !['rect', 'roundRect', 'ellipse'].includes(preset)
        ? 'shape'
        : content || placeholder ? 'text' : 'shape',
    role,
    content,
    label: name,
    shapePreset: preset,
    shapeAdjustments: Object.keys(shapeAdjustments).length ? shapeAdjustments : undefined,
    richText: rawContent === content
      ? applyParagraphDefaults(textBodyParagraphs(textBody, role, context.theme), paragraphDefaults)
      : undefined,
    paragraphDefaults,
    autofitFontScale: autofit.fontScale,
    autofitLineScale: autofit.lineScale,
    placeholderKey,
    placeholderType,
    ...geometry,
    zIndex: Number(attribute(properties, 'id')) || index + 1,
    style: shapeStyle(shapeProperties, textBody, role, context.theme),
  };
};

const mimeTypeForPart = (partPath: string): DeckAsset['mimeType'] | undefined => {
  const extension = partPath.split('.').pop()?.toLowerCase();
  if (extension === 'png') return 'image/png';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'gif') return 'image/gif';
  if (extension === 'webp') return 'image/webp';
  return undefined;
};

const loadImageAsset = async (context: ImportContext, mediaPath: string): Promise<string | undefined> => {
  if (context.mediaCache.has(mediaPath)) return context.mediaCache.get(mediaPath) ?? undefined;
  const file = context.zip.file(mediaPath);
  const mimeType = mimeTypeForPart(mediaPath);
  if (!file || !mimeType) {
    context.mediaCache.set(mediaPath, null);
    addWarning(context, 'images_skipped');
    return undefined;
  }
  const bytes = await file.async('uint8array');
  if (bytes.byteLength > MAX_IMAGE_BYTES || context.imageBytes + bytes.byteLength > MAX_TOTAL_IMAGE_BYTES) {
    context.mediaCache.set(mediaPath, null);
    addWarning(context, 'images_skipped');
    return undefined;
  }
  const base64 = await file.async('base64');
  const id = `asset-${mediaPath.replace(/\W+/g, '-').replace(/-+$/, '')}`;
  context.assets[id] = {
    id,
    name: mediaPath.split('/').pop() ?? id,
    mimeType,
    dataUrl: `data:${mimeType};base64,${base64}`,
    sizeBytes: bytes.byteLength,
  };
  context.mediaCache.set(mediaPath, id);
  context.imageBytes += bytes.byteLength;
  context.stats.images += 1;
  return id;
};

const parsePicture = async (
  picture: unknown,
  partPath: string,
  index: number,
  relationships: Map<string, Relationship>,
  context: ImportContext,
): Promise<RawElement | undefined> => {
  const nonVisual = child(picture, 'p:nvPicPr');
  const properties = child(nonVisual, 'p:cNvPr');
  const imageReference = child(child(picture, 'p:blipFill'), 'a:blip');
  const alpha = numberAttribute(child(imageReference, 'a:alphaModFix'), 'amt');
  const crop = child(child(picture, 'p:blipFill'), 'a:srcRect');
  const relationshipId = attribute(imageReference, 'r:embed') ?? attribute(imageReference, 'r:link');
  const relationship = relationshipId ? relationships.get(relationshipId) : undefined;
  if (!relationship || relationship.external) {
    if (relationship?.external) addWarning(context, 'external_links_skipped');
    else addWarning(context, 'images_skipped');
    return undefined;
  }
  const assetId = await loadImageAsset(context, relationship.target);
  if (!assetId) return undefined;
  const shapeProperties = child(picture, 'p:spPr');
  return {
    id: `${partPath.replace(/\W+/g, '-')}-picture-${attribute(properties, 'id') ?? index + 1}`,
    type: 'image',
    role: 'visual',
    content: attribute(properties, 'descr') || attribute(properties, 'name') || 'Imported image',
    label: attribute(properties, 'name') ?? 'Image',
    assetId,
    imageCrop: Object.keys(asNode(crop)).length ? {
      top: (numberAttribute(crop, 't') ?? 0) / 100000,
      right: (numberAttribute(crop, 'r') ?? 0) / 100000,
      bottom: (numberAttribute(crop, 'b') ?? 0) / 100000,
      left: (numberAttribute(crop, 'l') ?? 0) / 100000,
    } : undefined,
    ...geometryFromTransform(child(shapeProperties, 'a:xfrm'), context),
    zIndex: Number(attribute(properties, 'id')) || index + 1,
    style: { fill: 'transparent', radius: 0, opacity: alpha === undefined ? 1 : alpha / 100000 },
  };
};

const parseGraphicFrame = (
  frame: unknown,
  partPath: string,
  index: number,
  context: ImportContext,
): RawElement[] => {
  const nonVisual = child(frame, 'p:nvGraphicFramePr');
  const properties = child(nonVisual, 'p:cNvPr');
  const graphicData = child(child(frame, 'a:graphic'), 'a:graphicData');
  const uri = attribute(graphicData, 'uri') ?? '';
  const isChart = /chart/i.test(uri) || Boolean(child(graphicData, 'c:chart'));
  const isSmartArt = /diagram/i.test(uri) || Boolean(child(graphicData, 'dgm:relIds'));
  const table = child(graphicData, 'a:tbl');
  const geometry = geometryFromTransform(child(frame, 'p:xfrm'), context);
  const frameId = Number(attribute(properties, 'id')) || index + 1;
  if (Object.keys(asNode(table)).length) {
    const gridWidths = asArray(child(child(table, 'a:tblGrid'), 'a:gridCol')).map((column) => numberAttribute(column, 'w') ?? 1);
    const rows = asArray(child(table, 'a:tr'));
    // `a:tr/@h` is a minimum height. PowerPoint expands a row when its
    // one-line text plus the cell's top/bottom margins is taller. Google Slides
    // exports several compact table patterns that rely on that behavior.
    const rowHeights = rows.map((row) => numberAttribute(row, 'h') ?? 1);
    rows.forEach((row, rowIndex) => {
      asArray(child(row, 'a:tc')).forEach((cell) => {
        if (attribute(cell, 'hMerge') === '1' || attribute(cell, 'vMerge') === '1') return;
        const rowSpan = Math.max(1, numberAttribute(cell, 'rowSpan') ?? 1);
        if (rowSpan !== 1) return;
        const cellProperties = child(cell, 'a:tcPr');
        const textBody = child(cell, 'a:txBody');
        const paragraphDefaults = textBodyParagraphDefaults(textBody, 'data', context.theme);
        const paragraphs = applyParagraphDefaults(
          textBodyParagraphs(textBody, 'data', context.theme),
          paragraphDefaults,
        ) ?? [];
        const cellStyle = shapeStyle(cellProperties, textBody, 'data', context.theme);
        const textHeight = paragraphs.reduce((height, paragraph, paragraphIndex) => {
          const fontSize = Math.max(
            cellStyle.fontSize ?? 0,
            ...paragraph.runs.map((run) => run.style?.fontSize ?? 0),
          );
          if (!fontSize) return height;
          const explicitLineCount = Math.max(
            1,
            ...paragraph.runs.map((run) => run.text.split('\n').length),
          );
          return height
            + fontSize * (paragraph.lineHeight ?? cellStyle.lineHeight ?? 1.2) * explicitLineCount
            + (paragraphIndex === 0 ? 0 : paragraph.spaceBefore ?? 0)
            + (paragraphIndex === paragraphs.length - 1 ? 0 : paragraph.spaceAfter ?? 0);
        }, 0);
        const paddingTop = emuToCanvasPixels(numberAttribute(cellProperties, 'marT') ?? 0);
        const paddingBottom = emuToCanvasPixels(numberAttribute(cellProperties, 'marB') ?? 0);
        const minimumHeight = canvasPixelsToEmu(textHeight + paddingTop + paddingBottom);
        rowHeights[rowIndex] = Math.max(rowHeights[rowIndex], minimumHeight);
      });
    });
    const totalWidth = gridWidths.reduce((sum, value) => sum + value, 0) || 1;
    const totalHeight = rowHeights.reduce((sum, value) => sum + value, 0) || 1;
    const tableWidth = totalWidth / context.slideWidth * 100;
    const tableHeight = totalHeight / context.slideHeight * 100;
    let rowOffset = 0;
    return rows.flatMap((row, rowIndex) => {
      let columnIndex = 0;
      const rowElements = asArray(child(row, 'a:tc')).map((cell, cellIndex) => {
        const cellProperties = child(cell, 'a:tcPr');
        const span = Math.max(1, numberAttribute(cell, 'gridSpan') ?? 1);
        const rowSpan = Math.max(1, numberAttribute(cell, 'rowSpan') ?? 1);
        const horizontalMerge = attribute(cell, 'hMerge') === '1';
        const verticalMerge = attribute(cell, 'vMerge') === '1';
        if (horizontalMerge) return undefined;
        if (verticalMerge) {
          columnIndex += span;
          return undefined;
        }
        const columnOffset = gridWidths.slice(0, columnIndex).reduce((sum, value) => sum + value, 0);
        const cellWidth = gridWidths.slice(columnIndex, columnIndex + span).reduce((sum, value) => sum + value, 0) || gridWidths[columnIndex] || 1;
        const cellHeight = rowHeights.slice(rowIndex, rowIndex + rowSpan).reduce((sum, value) => sum + value, 0)
          || rowHeights[rowIndex];
        const textBody = child(cell, 'a:txBody');
        const content = textBodyContent(textBody);
        const paragraphDefaults = textBodyParagraphDefaults(textBody, 'data', context.theme);
        const style = shapeStyle(cellProperties, textBody, 'data', context.theme);
        const cellInset = (key: 'marT' | 'marR' | 'marB' | 'marL') => {
          const value = numberAttribute(cellProperties, key);
          return value === undefined ? undefined : emuToCanvasPixels(value);
        };
        const verticalAnchor = attribute(cellProperties, 'anchor');
        const paddingTop = cellInset('marT');
        const paddingRight = cellInset('marR');
        const paddingBottom = cellInset('marB');
        const paddingLeft = cellInset('marL');
        if (paddingTop !== undefined) style.paddingTop = paddingTop;
        if (paddingRight !== undefined) style.paddingRight = paddingRight;
        if (paddingBottom !== undefined) style.paddingBottom = paddingBottom;
        if (paddingLeft !== undefined) style.paddingLeft = paddingLeft;
        if (verticalAnchor) {
          style.verticalAlign = verticalAnchor === 'b' ? 'bottom' : verticalAnchor === 'ctr' ? 'middle' : 'top';
        }
        const border = child(cellProperties, 'a:lnL') || child(cellProperties, 'a:lnT')
          || child(cellProperties, 'a:lnR') || child(cellProperties, 'a:lnB');
        const borderColor = fillColor(child(border, 'a:solidFill'), context.theme, undefined);
        const borderWidth = numberAttribute(border, 'w');
        if (borderColor) style.stroke = borderColor;
        if (borderWidth) style.strokeWidth = Math.max(1, borderWidth / 12700);
        const result: RawElement = {
          id: `${partPath.replace(/\W+/g, '-')}-table-${frameId}-r${rowIndex + 1}c${cellIndex + 1}`,
          type: 'text',
          role: 'data',
          content,
          label: `Table cell ${rowIndex + 1}:${cellIndex + 1}`,
          richText: applyParagraphDefaults(textBodyParagraphs(textBody, 'data', context.theme), paragraphDefaults),
          paragraphDefaults,
          x: (geometry.x ?? 0) + columnOffset / totalWidth * tableWidth,
          y: (geometry.y ?? 0) + rowOffset / totalHeight * tableHeight,
          width: cellWidth / totalWidth * tableWidth,
          height: cellHeight / totalHeight * tableHeight,
          zIndex: frameId + (rowIndex * Math.max(1, gridWidths.length) + cellIndex) / 1000,
          style,
        };
        columnIndex += span;
        return result;
      });
      rowOffset += rowHeights[rowIndex];
      return rowElements.filter(Boolean) as RawElement[];
    });
  }
  if (isChart) {
    addWarning(context, 'unsupported_charts');
    context.stats.charts += 1;
  }
  if (isSmartArt) addWarning(context, 'unsupported_smartart');
  const text = unique(collectText(graphicData).map((item) => item.trim()).filter(Boolean)).slice(0, 12).join(' · ');
  return [{
    id: `${partPath.replace(/\W+/g, '-')}-graphic-${attribute(properties, 'id') ?? index + 1}`,
    type: 'card',
    role: isChart ? 'data' : 'visual',
    content: text || (isChart ? 'Chart' : isSmartArt ? 'Diagram' : 'Table'),
    label: isChart ? 'Imported chart · editable placeholder' : isSmartArt ? 'Imported diagram · editable placeholder' : 'Imported table',
    ...geometryFromTransform(child(frame, 'p:xfrm'), context),
    zIndex: frameId,
    style: {
      color: context.theme.colors.dk1 ?? '#171815',
      fill: context.theme.colors.lt1 ?? '#FFFFFF',
      stroke: context.theme.colors.dk2 ?? '#D1D1CC',
      strokeWidth: 1,
      fontSize: 18,
      fontWeight: 600,
      radius: 10,
      padding: 14,
    },
  }];
};

const parseConnector = (
  connector: unknown,
  partPath: string,
  index: number,
  context: ImportContext,
): RawElement => {
  const nonVisual = child(connector, 'p:nvCxnSpPr');
  const properties = child(nonVisual, 'p:cNvPr');
  const shapeProperties = child(connector, 'p:spPr');
  const line = child(shapeProperties, 'a:ln');
  const color = fillColor(child(line, 'a:solidFill'), context.theme, context.theme.colors.dk1 ?? '#171815');
  const width = numberAttribute(line, 'w');
  return {
    id: `${partPath.replace(/\W+/g, '-')}-connector-${attribute(properties, 'id') ?? index + 1}`,
    type: 'line',
    role: 'accent',
    content: '',
    label: attribute(properties, 'name') ?? 'Connector',
    ...geometryFromTransform(child(shapeProperties, 'a:xfrm'), context),
    zIndex: Number(attribute(properties, 'id')) || index + 1,
    style: {
      color,
      fill: color,
      stroke: color,
      strokeWidth: width ? Math.max(1, emuToCanvasPixels(width)) : 1,
      opacity: 1,
    },
  };
};

const transformGroupElement = (element: RawElement, transform: unknown, context: ImportContext): RawElement => {
  const groupGeometry = geometryFromTransform(transform, context);
  const childOffset = child(transform, 'a:chOff');
  const childExtent = child(transform, 'a:chExt');
  const childX = (numberAttribute(childOffset, 'x') ?? 0) / context.slideWidth * 100;
  const childY = (numberAttribute(childOffset, 'y') ?? 0) / context.slideHeight * 100;
  const childWidth = (numberAttribute(childExtent, 'cx') ?? context.slideWidth) / context.slideWidth * 100;
  const childHeight = (numberAttribute(childExtent, 'cy') ?? context.slideHeight) / context.slideHeight * 100;
  const scaleX = (groupGeometry.width ?? childWidth) / Math.max(0.0001, childWidth);
  const scaleY = (groupGeometry.height ?? childHeight) / Math.max(0.0001, childHeight);
  return {
    ...element,
    x: (groupGeometry.x ?? 0) + ((element.x ?? childX) - childX) * scaleX,
    y: (groupGeometry.y ?? 0) + ((element.y ?? childY) - childY) * scaleY,
    width: (element.width ?? 0) * scaleX,
    height: (element.height ?? 0) * scaleY,
    rotation: (element.rotation ?? 0) + ((numberAttribute(transform, 'rot') ?? 0) / 60000),
  };
};

const parseGroup = async (
  group: unknown,
  partPath: string,
  index: number,
  layer: PartLayer,
  relationships: Map<string, Relationship>,
  context: ImportContext,
): Promise<RawElement[]> => {
  const properties = child(child(group, 'p:nvGrpSpPr'), 'p:cNvPr');
  const groupId = attribute(properties, 'id') ?? String(index + 1);
  const childPartPath = `${partPath}-group-${groupId}`;
  const shapes = asArray(child(group, 'p:sp')).map((shape, childIndex) =>
    parseShape(shape, childPartPath, childIndex, layer, context));
  const pictures = (await Promise.all(asArray(child(group, 'p:pic')).map((picture, childIndex) =>
    parsePicture(picture, childPartPath, shapes.length + childIndex, relationships, context)))).filter(Boolean) as RawElement[];
  const graphics = asArray(child(group, 'p:graphicFrame')).flatMap((frame, childIndex) =>
    parseGraphicFrame(frame, childPartPath, shapes.length + pictures.length + childIndex, context));
  const connectors = asArray(child(group, 'p:cxnSp')).map((connector, childIndex) =>
    parseConnector(connector, childPartPath, shapes.length + pictures.length + graphics.length + childIndex, context));
  const nestedGroups = (await Promise.all(asArray(child(group, 'p:grpSp')).map((nested, childIndex) =>
    parseGroup(nested, childPartPath, childIndex, layer, relationships, context)))).flat();
  const transform = child(child(group, 'p:grpSpPr'), 'a:xfrm');
  return [...shapes, ...pictures, ...graphics, ...connectors, ...nestedGroups]
    .sort((left, right) => left.zIndex - right.zIndex)
    .map((element) => transformGroupElement(element, transform, context));
};

const backgroundFromRoot = (root: unknown, context: ImportContext) => {
  const background = child(root, 'p:cSld');
  const definition = child(background, 'p:bg');
  const direct = fillColor(child(child(definition, 'p:bgPr'), 'a:solidFill'), context.theme, undefined);
  if (direct) return direct;
  return fillColor(child(definition, 'p:bgRef'), context.theme, undefined);
};

const parsePart = async (
  context: ImportContext,
  partPath: string,
  layer: PartLayer,
): Promise<ParsedPart | undefined> => {
  const document = await readXml(context.zip, partPath);
  if (!document) return undefined;
  const rootKey = layer === 'slide' ? 'p:sld' : layer === 'layout' ? 'p:sldLayout' : 'p:sldMaster';
  const root = child(document, rootKey);
  const common = child(root, 'p:cSld');
  const shapeTree = child(common, 'p:spTree');
  const relationships = await readRelationships(context.zip, partPath);
  relationships.forEach((relationship) => {
    if (relationship.external) addWarning(context, 'external_links_skipped');
  });

  const shapes = asArray(child(shapeTree, 'p:sp')).map((shape, index) =>
    parseShape(shape, partPath, index, layer, context));
  const pictures = (await Promise.all(asArray(child(shapeTree, 'p:pic')).map((picture, index) =>
    parsePicture(picture, partPath, shapes.length + index, relationships, context)))).filter(Boolean) as RawElement[];
  const graphics = asArray(child(shapeTree, 'p:graphicFrame')).flatMap((frame, index) =>
    parseGraphicFrame(frame, partPath, shapes.length + pictures.length + index, context));
  const connectors = asArray(child(shapeTree, 'p:cxnSp')).map((connector, index) =>
    parseConnector(connector, partPath, shapes.length + pictures.length + graphics.length + index, context));
  const groups = asArray(child(shapeTree, 'p:grpSp'));
  const groupElements = (await Promise.all(groups.map((group, index) =>
    parseGroup(group, partPath, index, layer, relationships, context)))).flat();

  const name = attribute(common, 'name')
    || attribute(root, 'type')
    || partPath.split('/').pop()?.replace(/\.xml$/i, '')
    || 'Imported layout';
  const masterPath = [...relationships.values()].find((relationship) => /slideMaster$/i.test(relationship.type))?.target;
  const layoutPath = [...relationships.values()].find((relationship) => /slideLayout$/i.test(relationship.type))?.target;
  return {
    name,
    partPath,
    background: backgroundFromRoot(root, context),
    elements: [...shapes, ...pictures, ...graphics, ...connectors, ...groupElements].sort((a, b) => a.zIndex - b.zIndex),
    masterPath,
    layoutPath,
  };
};

const definedProperties = <T extends object>(value: T) =>
  Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));

const scaleParagraphDefaults = (
  defaults: ParagraphDefaults[] | undefined,
  fontScale: number,
  lineScale: number,
) => defaults?.map((value) => ({
  ...value,
  runStyle: value.runStyle?.fontSize === undefined
    ? value.runStyle
    : { ...value.runStyle, fontSize: value.runStyle.fontSize * fontScale },
  lineHeight: value.lineHeight === undefined ? undefined : value.lineHeight * lineScale,
  spaceBefore: value.spaceBefore === undefined ? undefined : value.spaceBefore * fontScale,
  spaceAfter: value.spaceAfter === undefined ? undefined : value.spaceAfter * fontScale,
}));

const mergeRawElement = (base: RawElement, overlay: RawElement): RawElement => {
  const fontScale = overlay.autofitFontScale ?? 1;
  const lineScale = overlay.autofitLineScale ?? 1;
  const baseDefaults = scaleParagraphDefaults(base.paragraphDefaults, fontScale, lineScale);
  const paragraphDefaults = Array.from({ length: 9 }, (_, level) => ({
    ...baseDefaults?.[level],
    ...definedProperties(overlay.paragraphDefaults?.[level] ?? {}),
  }));
  const richText = applyParagraphDefaults(overlay.richText ?? base.richText, paragraphDefaults);
  const inheritedStyle = { ...base.style };
  if (overlay.style.fontSize === undefined && inheritedStyle.fontSize !== undefined) {
    inheritedStyle.fontSize *= fontScale;
  }
  if (overlay.style.lineHeight === undefined && inheritedStyle.lineHeight !== undefined) {
    inheritedStyle.lineHeight *= lineScale;
  }
  return {
    ...base,
    ...definedProperties(overlay),
    id: overlay.id,
    content: overlay.content || base.content,
    richText,
    paragraphDefaults,
    style: { ...inheritedStyle, ...overlay.style },
  };
};

const samePlaceholderGeometry = (left: RawElement, right: RawElement) => {
  const difference = (key: 'x' | 'y' | 'width' | 'height') =>
    Math.abs((left[key] ?? Number.POSITIVE_INFINITY) - (right[key] ?? Number.NEGATIVE_INFINITY));
  return difference('x') < 0.75
    && difference('y') < 0.75
    && difference('width') < 0.75
    && difference('height') < 0.75;
};

const mergePartElements = (...layers: Array<RawElement[] | undefined>) => {
  const result: RawElement[] = [];
  layers.filter(Boolean).forEach((elements) => {
    elements?.forEach((element) => {
      const existingIndex = element.placeholderKey
        ? result.findIndex((candidate) => candidate.placeholderKey === element.placeholderKey)
        : element.placeholderType
          ? result.findIndex((candidate) =>
            candidate.placeholderType === element.placeholderType && samePlaceholderGeometry(candidate, element))
          : -1;
      if (existingIndex >= 0) result[existingIndex] = mergeRawElement(result[existingIndex], element);
      else result.push(element);
    });
  });
  return result;
};

const masterElementsForLayout = (master: ParsedPart | undefined, layout: ParsedPart | undefined) => {
  if (!master) return undefined;
  const layoutKeys = new Set(layout?.elements.map((element) => element.placeholderKey).filter(Boolean));
  return master.elements.filter((element) => {
    if (!element.placeholderKey) return true;
    const placeholderType = element.placeholderKey.split(':')[0];
    return ['dt', 'ftr', 'sldNum'].includes(placeholderType) || layoutKeys.has(element.placeholderKey);
  });
};

const baseElementsForSlide = (
  master: ParsedPart | undefined,
  layout: ParsedPart | undefined,
  slide: ParsedPart,
) => {
  const base = mergePartElements(masterElementsForLayout(master, layout), layout?.elements);
  return base.filter((element) => {
    if (!element.placeholderType) return true;
    if (['dt', 'ftr'].includes(element.placeholderType)) return true;
    return slide.elements.some((candidate) =>
      candidate.placeholderType === element.placeholderType
      && (
        Boolean(candidate.placeholderKey && candidate.placeholderKey === element.placeholderKey)
        || samePlaceholderGeometry(candidate, element)
      ));
  });
};

const inheritUnindexedPlaceholders = (
  master: ParsedPart | undefined,
  layout: ParsedPart | undefined,
  elements: RawElement[],
) => elements.map((element) => {
  if (!element.placeholderType || element.placeholderKey) return element;
  // Google Slides uses idx=4294967295 for unindexed placeholders. They still
  // inherit the matching layout/master placeholder's text style even though
  // their geometry is unique. This is how a slide can mix inherited 25 pt body
  // text with explicitly sized 16 pt runs.
  const base = layout?.elements.find((candidate) => candidate.placeholderType === element.placeholderType)
    ?? master?.elements.find((candidate) => candidate.placeholderType === element.placeholderType);
  return base ? { ...mergeRawElement(base, element), placeholderKey: undefined } : element;
});

const finalizeElement = (element: RawElement, index: number, theme: ThemeEvidence): SlideElement => {
  const strokeWidth = element.style.strokeWidth ?? 1;
  const isVerticalLine = element.type === 'line' && (element.width ?? 0) <= 0.02;
  const isHorizontalLine = element.type === 'line' && (element.height ?? 0) <= 0.02;
  return ({
  id: element.id,
  type: element.type,
  role: element.role,
  content: element.content ?? '',
  label: element.label,
  assetId: element.assetId,
  imageCrop: element.imageCrop,
  shapePreset: element.shapePreset,
  shapeAdjustments: element.shapeAdjustments,
  richText: element.richText,
  x: (element.x ?? (element.role === 'title' ? 7 : 10))
    - (isVerticalLine ? strokeWidth / 2 / 1280 * 100 : 0),
  y: (element.y ?? (element.role === 'title' ? 12 : 30 + (index % 4) * 13))
    - (isHorizontalLine ? strokeWidth / 2 / 720 * 100 : 0),
  width: isVerticalLine
    ? strokeWidth / 1280 * 100
    : element.width ?? (element.role === 'title' ? 78 : 80),
  height: isHorizontalLine
    ? strokeWidth / 720 * 100
    : element.height ?? (element.role === 'title' ? 15 : 10),
  rotation: element.rotation,
  zIndex: index + 1,
  style: {
    color: theme.colors.dk1 ?? '#171815',
    fill: 'transparent',
    fontSize: element.role === 'title' ? 46 : 22,
    fontWeight: 400,
    lineHeight: 1.12,
    textAlign: 'left',
    radius: 0,
    opacity: 1,
    padding: ['card', 'stat', 'code', 'pill'].includes(element.type) ? 12 : 0,
    letterSpacing: 0,
    fontFamily: element.role === 'title' ? theme.headingFont : theme.bodyFont,
    ...element.style,
  },
  locked: element.locked,
  });
};

const getPresentationOrder = async (zip: JSZip) => {
  const document = await readXml(zip, 'ppt/presentation.xml');
  const root = child(document, 'p:presentation');
  const relationships = await readRelationships(zip, 'ppt/presentation.xml');
  const slideIds = asArray(child(child(root, 'p:sldIdLst'), 'p:sldId'));
  const ordered = slideIds.map((item) => relationships.get(attribute(item, 'r:id') ?? '')?.target).filter(Boolean) as string[];
  const size = child(root, 'p:sldSz');
  return {
    slidePaths: ordered,
    width: numberAttribute(size, 'cx') ?? 12_192_000,
    height: numberAttribute(size, 'cy') ?? 6_858_000,
  };
};

const inferPurposeHint = (name: string, elements: SlideElement[]): SlidePurpose => {
  if (/表紙|cover|title slide/i.test(name)) return 'cover';
  if (/中扉|section|divider/i.test(name)) return 'section';
  if (/timeline|タイム|schedule|roadmap/i.test(name)) return 'timeline';
  if (/compare|comparison|比較|対比/i.test(name)) return 'comparison';
  if (/process|flow|手順|プロセス/i.test(name)) return 'process';
  if (/matrix|マトリクス|quadrant/i.test(name)) return 'matrix';
  if (/contact|closing|summary|まとめ|問い合わせ/i.test(name)) return 'closing';
  if (elements.filter((element) => element.role === 'data' || element.type === 'stat').length >= 2) return 'metrics';
  const contentColumns = elements.filter((element) => ['body', 'label', 'visual'].includes(element.role) && element.content.trim()).length;
  if (contentColumns === 3) return 'three_points';
  if (contentColumns >= 2) return 'split';
  return 'claim';
};

const makeLayout = (part: ParsedPart, elements: RawElement[], background: string, theme: ThemeEvidence): TemplateLayout => {
  const finalized = elements.map((element, index) => finalizeElement(element, index, theme));
  const name = part.name.replace(/([a-z])([A-Z])/g, '$1 $2');
  return {
    id: `layout-${part.partPath.replace(/\W+/g, '-')}`,
    name,
    sourcePart: part.partPath,
    background,
    elements: finalized,
    purposeHint: inferPurposeHint(name, finalized),
    editableElementIds: finalized.filter((element) => !element.locked && !['accent', 'footer'].includes(element.role)).map((element) => element.id),
  };
};

const makeSlide = (part: ParsedPart, elements: RawElement[], background: string, index: number, theme: ThemeEvidence): Slide => {
  const finalized = elements.map((element, elementIndex) => {
    const result = finalizeElement(element, elementIndex, theme);
    if (element.placeholderKey?.startsWith('sldNum:')) result.content = String(index + 1);
    return result;
  });
  const titleElement = finalized.find((element) => element.role === 'title' && element.content.trim());
  return {
    id: `imported-slide-${index + 1}-${createId('src').slice(-5)}`,
    title: titleElement?.content.replace(/\n/g, ' ').slice(0, 90) || `Imported slide ${index + 1}`,
    background,
    elements: finalized,
    notes: `Imported from ${part.partPath}`,
    provenance: { source: 'template_slide', sourceId: part.partPath, purpose: inferPurposeHint(part.name, finalized) },
  };
};

const mostCommonFont = (elements: SlideElement[], fallback: string) => {
  const counts = new Map<string, number>();
  elements.forEach((element) => {
    const family = element.style.fontFamily?.trim();
    if (family) counts.set(family, (counts.get(family) ?? 0) + 1);
  });
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? fallback;
};

const inferGrammar = (slides: Slide[], layouts: TemplateLayout[]): DesignGrammar => {
  const surfaces = slides.length ? slides : layouts.map((layout) => ({ ...layout, title: layout.name, id: layout.id }));
  const elements = surfaces.flatMap((surface) => surface.elements);
  const titles = elements.filter((element) => element.role === 'title');
  const visualArea = elements
    .filter((element) => ['visual', 'data', 'accent'].includes(element.role))
    .reduce((total, element) => total + element.width * element.height, 0) / Math.max(1, surfaces.length * 100);
  const averageElements = elements.length / Math.max(1, surfaces.length);
  return {
    density: averageElements > 10 ? 'dense' : averageElements < 5 ? 'airy' : 'balanced',
    titleTop: Math.round(median(titles.map((element) => element.y), 12)),
    titleLeft: Math.round(median(titles.map((element) => element.x), 7)),
    titleMaxWidth: Math.round(median(titles.map((element) => element.width), 72)),
    bodyMaxLines: 7,
    visualRatio: Math.round(clamp(visualArea, 18, 72)),
    cornerRadius: Math.round(median(elements.map((element) => element.style.radius ?? 0).filter(Boolean), 8)),
    narrative: 'Preserve the imported hierarchy, typography, palette, and layout rhythm. Reuse a detected layout before inventing new geometry.',
  };
};

const fidelityScore = (warnings: ImportWarning[]) => {
  const penalties: Record<ImportWarning['code'], number> = {
    external_links_skipped: 2,
    unsupported_charts: 6,
    unsupported_groups: 4,
    unsupported_smartart: 7,
    images_skipped: 5,
    content_truncated: 3,
  };
  return Math.max(45, 100 - warnings.reduce((total, warning) => total + Math.min(18, warning.count * penalties[warning.code]), 0));
};

const assertSupportedInput = (buffer: ArrayBuffer, fileName: string) => {
  const extension = fileName.split('.').pop()?.toLowerCase();
  if (extension !== 'pptx' && extension !== 'potx') throw new Error('Choose a .pptx or .potx PowerPoint file.');
  if (buffer.byteLength > MAX_FILE_BYTES) throw new Error('This template is larger than 24 MB. Remove embedded video or oversized media and try again.');
  if (buffer.byteLength < 4 || new Uint8Array(buffer, 0, 2).join(',') !== '80,75') throw new Error('This file is not a valid Open XML PowerPoint package.');
  return extension;
};

export async function parsePptxTemplate(
  buffer: ArrayBuffer,
  fileName: string,
  onProgress?: (progress: number) => void,
): Promise<PptxImportResult> {
  const format = assertSupportedInput(buffer, fileName);
  onProgress?.(8);
  const zip = await JSZip.loadAsync(buffer, { checkCRC32: true });
  const entries = Object.values(zip.files).filter((entry: JSZipObject) => !entry.dir);
  if (entries.length > MAX_ZIP_ENTRIES) throw new Error('This PowerPoint package contains too many internal parts to process safely.');
  if (!zip.file('ppt/presentation.xml')) throw new Error('The PowerPoint presentation part is missing.');

  const order = await getPresentationOrder(zip);
  const themeEvidence = await extractTheme(zip);
  const context: ImportContext = {
    zip,
    slideWidth: order.width,
    slideHeight: order.height,
    theme: themeEvidence,
    assets: {},
    mediaCache: new Map(),
    imageBytes: 0,
    warningCounts: new Map(),
    stats: { slides: 0, layouts: 0, editableElements: 0, images: 0, charts: 0 },
  };
  onProgress?.(22);

  const masterCache = new Map<string, ParsedPart>();
  const layoutCache = new Map<string, ParsedPart>();
  const getMaster = async (path: string | undefined) => {
    if (!path) return undefined;
    if (!masterCache.has(path)) {
      const parsed = await parsePart(context, path, 'master');
      if (parsed) masterCache.set(path, parsed);
    }
    return masterCache.get(path);
  };
  const getLayout = async (path: string | undefined) => {
    if (!path) return undefined;
    if (!layoutCache.has(path)) {
      const parsed = await parsePart(context, path, 'layout');
      if (parsed) layoutCache.set(path, parsed);
    }
    return layoutCache.get(path);
  };

  const layoutPaths = Object.keys(zip.files)
    .filter((path) => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/i.test(path))
    .sort(naturalPartSort)
    .slice(0, MAX_LAYOUTS);
  const layouts: TemplateLayout[] = [];
  for (let index = 0; index < layoutPaths.length; index += 1) {
    const layout = await getLayout(layoutPaths[index]);
    if (!layout) continue;
    const master = await getMaster(layout.masterPath);
    const background = layout.background || master?.background || DEFAULT_SLIDE_BACKGROUND;
    layouts.push(makeLayout(layout, mergePartElements(masterElementsForLayout(master, layout), layout.elements), background, themeEvidence));
    onProgress?.(22 + Math.round((index + 1) / Math.max(1, layoutPaths.length) * 28));
  }
  if (Object.keys(zip.files).filter((path) => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/i.test(path)).length > MAX_LAYOUTS) {
    addWarning(context, 'content_truncated');
  }

  const sourceSlides: Slide[] = [];
  const slidePaths = order.slidePaths.slice(0, MAX_SOURCE_SLIDES);
  for (let index = 0; index < slidePaths.length; index += 1) {
    const slide = await parsePart(context, slidePaths[index], 'slide');
    if (!slide) continue;
    const layout = await getLayout(slide.layoutPath);
    const master = await getMaster(layout?.masterPath);
    const background = slide.background || layout?.background || master?.background || DEFAULT_SLIDE_BACKGROUND;
    sourceSlides.push(makeSlide(
      slide,
      mergePartElements(
        baseElementsForSlide(master, layout, slide),
        inheritUnindexedPlaceholders(master, layout, slide.elements),
      ),
      background,
      index,
      themeEvidence,
    ));
    onProgress?.(52 + Math.round((index + 1) / Math.max(1, slidePaths.length) * 35));
  }
  if (order.slidePaths.length > MAX_SOURCE_SLIDES) addWarning(context, 'content_truncated');

  const palette = unique([
    themeEvidence.colors.accent1,
    themeEvidence.colors.accent2,
    themeEvidence.colors.accent3,
    themeEvidence.colors.accent4,
    themeEvidence.colors.accent5,
    themeEvidence.colors.accent6,
    themeEvidence.colors.dk1,
    themeEvidence.colors.lt1,
  ].filter(Boolean) as string[]);
  const fontElements = [...sourceSlides, ...layouts].flatMap((item) => item.elements);
  const headingFont = mostCommonFont(
    fontElements.filter((element) => element.role === 'title'),
    themeEvidence.headingFont,
  );
  const bodyFont = mostCommonFont(
    fontElements.filter((element) =>
      ['text', 'card', 'stat', 'code', 'pill'].includes(element.type)
      && !['title', 'footer'].includes(element.role)),
    themeEvidence.bodyFont,
  );
  const theme: DeckTheme = {
    canvas: sourceSlides[0]?.background || layouts[0]?.background || DEFAULT_SLIDE_BACKGROUND,
    ink: themeEvidence.colors.dk1 || '#171815',
    muted: themeEvidence.colors.dk2 || '#6E7168',
    accent: themeEvidence.colors.accent1 || '#6676EF',
    accentAlt: themeEvidence.colors.accent2 || '#D8FF4F',
    signal: themeEvidence.colors.accent3 || '#FF786D',
  };
  const grammar = inferGrammar(sourceSlides, layouts);
  const warnings = [...context.warningCounts.entries()].map(([code, count]) => ({ code, count }));
  const title = fileName.replace(/\.(pptx|potx)$/i, '').trim() || 'Imported PowerPoint template';
  context.stats = {
    ...context.stats,
    slides: sourceSlides.length,
    layouts: layouts.length,
    editableElements: [...sourceSlides, ...layouts].reduce((total, item) => total + item.elements.length, 0),
  };
  const template: ImportedTemplate = {
    id: createId('template'),
    name: title,
    fileName,
    format,
    importedAt: new Date().toISOString(),
    sourceSlideCount: sourceSlides.length,
    sourceLayoutCount: layouts.length,
    headingFont,
    bodyFont,
    palette: palette.length ? palette : [theme.accent, theme.accentAlt, theme.ink, theme.canvas],
    fidelityScore: fidelityScore(warnings),
    warnings,
    layouts,
  };
  onProgress?.(100);
  return { fileName, format, title, theme, grammar, template, sourceSlides, assets: context.assets, stats: context.stats };
}

export function buildDeckFromPptxImport(
  result: PptxImportResult,
  mode: PptxImportMode,
  selectedLayoutIds: string[] = [],
): Deck {
  const base: Deck = {
    id: createId('deck'),
    title: result.title,
    version: 1,
    updatedAt: new Date().toISOString(),
    theme: { ...result.theme },
    grammar: { ...result.grammar },
    slides: [],
    assets: { ...result.assets },
    importedTemplate: {
      ...result.template,
      layouts: result.template.layouts.map((layout) => ({
        ...layout,
        elements: layout.elements.map((element) => ({ ...element, style: { ...element.style } })),
      })),
    },
    designSystem: {
      source: 'imported_template',
      name: result.template.name,
      headingFont: result.template.headingFont,
      bodyFont: result.template.bodyFont,
      recipeCount: result.template.layouts.length,
    },
  };
  if (mode === 'slides' && result.sourceSlides.length) {
    return {
      ...base,
      slides: result.sourceSlides.map((slide) => ({
        ...slide,
        elements: slide.elements.map((element) => ({ ...element, style: { ...element.style } })),
      })),
    };
  }
  const selected = result.template.layouts.filter((layout) =>
    selectedLayoutIds.length ? selectedLayoutIds.includes(layout.id) : true).slice(0, 8);
  const layouts = selected.length ? selected : result.template.layouts.slice(0, 1);
  const slides = layouts.map((layout) => createSlideFromTemplateLayout(base, layout, layout.name));
  if (!slides.length) {
    throw new Error('No reusable slide layouts were found. Import the existing slides instead.');
  }
  return { ...base, slides };
}
