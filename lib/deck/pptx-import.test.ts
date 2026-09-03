import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import { buildDeckFromPptxImport, parsePptxTemplate } from './pptx-import';

const relationships = (items: string) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items}</Relationships>`;

const shape = (
  id: number,
  name: string,
  text: string,
  placeholder: string,
  x: number,
  y: number,
  width: number,
  height: number,
  size = 3200,
) => `<p:sp>
  <p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr/><p:nvPr><p:ph type="${placeholder}" idx="${id}"/></p:nvPr></p:nvSpPr>
  <p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${width}" cy="${height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>
  <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="${size}" b="1"><a:solidFill><a:schemeClr val="dk1"/></a:solidFill><a:latin typeface="+mj-lt"/></a:rPr><a:t>${text}</a:t></a:r><a:endParaRPr lang="en-US" sz="${size}"/></a:p></p:txBody>
</p:sp>`;

async function makeFixture() {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
  zip.file('ppt/presentation.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
      <p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/></p:presentation>`);
  zip.file('ppt/_rels/presentation.xml.rels', relationships(
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>',
  ));
  zip.file('ppt/theme/theme1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Fixture">
      <a:themeElements>
        <a:clrScheme name="Fixture"><a:dk1><a:srgbClr val="141510"/></a:dk1><a:lt1><a:srgbClr val="F5F4ED"/></a:lt1><a:dk2><a:srgbClr val="6A6D65"/></a:dk2><a:accent1><a:srgbClr val="6757E8"/></a:accent1><a:accent2><a:srgbClr val="D8FF4F"/></a:accent2><a:accent3><a:srgbClr val="FF786D"/></a:accent3></a:clrScheme>
        <a:fontScheme name="Fixture"><a:majorFont><a:latin typeface="Aptos Display"/></a:majorFont><a:minorFont><a:latin typeface="Aptos"/></a:minorFont></a:fontScheme>
        <a:fmtScheme name="Fixture"/>
      </a:themeElements>
    </a:theme>`);
  zip.file('ppt/slideMasters/slideMaster1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
      <p:cSld><p:bg><p:bgPr><a:solidFill><a:schemeClr val="lt1"/></a:solidFill></p:bgPr></p:bg><p:spTree>${shape(9, 'Footer', 'ACME / TEMPLATE', 'ftr', 600000, 6400000, 3000000, 220000, 900)}</p:spTree></p:cSld>
    </p:sldMaster>`);
  zip.file('ppt/slideMasters/_rels/slideMaster1.xml.rels', relationships(
    '<Relationship Id="rIdTheme" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>',
  ));
  zip.file('ppt/slideLayouts/slideLayout1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="titleAndContent">
      <p:cSld name="Title and Content"><p:spTree>
        ${shape(1, 'Title', 'Click to edit Master title style', 'title', 850000, 700000, 9000000, 1200000, 4200)}
        ${shape(2, 'Content', 'Click to edit Master text styles', 'body', 850000, 2300000, 9000000, 3000000, 2200)}
      </p:spTree></p:cSld>
    </p:sldLayout>`);
  zip.file('ppt/slideLayouts/_rels/slideLayout1.xml.rels', relationships(
    '<Relationship Id="rIdMaster" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>',
  ));
  zip.file('ppt/slides/slide1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
      <p:cSld><p:spTree>
        ${shape(1, 'Title', 'Imported strategy', 'title', 850000, 700000, 9000000, 1200000, 4200)}
        ${shape(2, 'Content', 'Keep the visual language editable.', 'body', 850000, 2300000, 9000000, 3000000, 2200)}
        <p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="5" name="Chart 1"/></p:nvGraphicFramePr><p:xfrm><a:off x="8500000" y="3800000"/><a:ext cx="2500000" cy="1800000"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rIdChart"/></a:graphicData></a:graphic></p:graphicFrame>
      </p:spTree></p:cSld>
    </p:sld>`);
  zip.file('ppt/slides/_rels/slide1.xml.rels', relationships(
    '<Relationship Id="rIdLayout" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>',
  ));
  return zip.generateAsync({ type: 'arraybuffer' });
}

async function makeGoogleExportFixture() {
  const zip = new JSZip();
  const unindexedMaster = `<p:sp>
    <p:nvSpPr><p:cNvPr id="10" name="Master body"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>
    <p:spPr><a:xfrm><a:off x="400000" y="1500000"/><a:ext cx="11000000" cy="4000000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
    <p:txBody><a:bodyPr/><a:lstStyle><a:lvl1pPr lvl="0"><a:defRPr sz="2500"><a:ea typeface="Noto Sans JP"/><a:latin typeface="Noto Sans JP"/></a:defRPr></a:lvl1pPr></a:lstStyle><a:p/></p:txBody>
  </p:sp>`;
  const unindexedSlide = `<p:sp>
    <p:nvSpPr><p:cNvPr id="8" name="Unindexed body"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="4294967295"/></p:nvPr></p:nvSpPr>
    <p:spPr><a:xfrm><a:off x="1000000" y="5000000"/><a:ext cx="6000000" cy="700000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
    <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="ja-JP"/><a:t>25 pt inherited body</a:t></a:r></a:p></p:txBody>
  </p:sp>`;
  const inherited = (text: string, includeStyle: boolean) => `<p:sp>
    <p:nvSpPr><p:cNvPr id="1" name="Title"/><p:cNvSpPr/><p:nvPr><p:ph type="title" idx="1"/></p:nvPr></p:nvSpPr>
    <p:spPr><a:xfrm><a:off x="850000" y="700000"/><a:ext cx="9000000" cy="1200000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
    <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:pPr>${includeStyle ? '<a:defRPr sz="2800"><a:solidFill><a:srgbClr val="262626"/></a:solidFill><a:ea typeface="Noto Sans JP"/><a:latin typeface="Noto Sans JP"/></a:defRPr>' : ''}</a:pPr><a:r><a:rPr lang="ja-JP"/><a:t>${text}</a:t></a:r></a:p></p:txBody>
  </p:sp>`;
  const contact = `<p:sp>
    <p:nvSpPr><p:cNvPr id="2" name="Contact"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
    <p:spPr><a:xfrm><a:off x="500000" y="1900000"/><a:ext cx="4000000" cy="3000000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>
    <p:txBody><a:bodyPr><a:normAutofit fontScale="50000" lnSpcReduction="10000"/></a:bodyPr><a:lstStyle/>
      <a:p><a:pPr><a:lnSpc><a:spcPct val="150000"/></a:lnSpc><a:buSzPts val="1200"/><a:buFont typeface="Arial"/><a:buChar char="●"/></a:pPr><a:r><a:rPr sz="2000"/><a:t>担当営業</a:t></a:r></a:p>
      <a:p><a:pPr><a:lnSpc><a:spcPct val="150000"/></a:lnSpc></a:pPr><a:r><a:t></a:t></a:r><a:endParaRPr sz="2000"/></a:p>
      <a:p><a:pPr><a:lnSpc><a:spcPct val="150000"/></a:lnSpc></a:pPr><a:r><a:t></a:t></a:r><a:endParaRPr sz="2000"/></a:p>
      <a:p><a:pPr><a:lnSpc><a:spcPct val="150000"/></a:lnSpc></a:pPr><a:r><a:rPr sz="1400" b="1"/><a:t>暮州 めそ夫</a:t></a:r></a:p>
    </p:txBody>
  </p:sp>`;
  const paragraphMarkStyle = `<p:sp>
    <p:nvSpPr><p:cNvPr id="11" name="Paragraph mark style"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
    <p:spPr><a:xfrm><a:off x="7000000" y="5000000"/><a:ext cx="3000000" cy="600000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>
    <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr sz="1600" b="0"/><a:t>Regular run</a:t></a:r><a:endParaRPr sz="3200" b="1"><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill></a:endParaRPr></a:p></p:txBody>
  </p:sp>`;
  const explicitBreak = `<p:sp>
    <p:nvSpPr><p:cNvPr id="12" name="Explicit break"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
    <p:spPr><a:xfrm><a:off x="7000000" y="5700000"/><a:ext cx="3000000" cy="600000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>
    <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>First</a:t></a:r><a:br><a:rPr sz="1400"/></a:br><a:r><a:t>Second</a:t></a:r><a:r><a:t>Tail</a:t></a:r></a:p></p:txBody>
  </p:sp>`;
  const connector = `<p:cxnSp>
    <p:nvCxnSpPr><p:cNvPr id="7" name="Vertical divider"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr>
    <p:spPr><a:xfrm><a:off x="6000000" y="1500000"/><a:ext cx="0" cy="4000000"/></a:xfrm><a:prstGeom prst="line"><a:avLst/></a:prstGeom><a:ln w="12700"><a:solidFill><a:srgbClr val="595959"/></a:solidFill></a:ln></p:spPr>
  </p:cxnSp>`;

  zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
  zip.file('ppt/presentation.xml', `<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/></p:presentation>`);
  zip.file('ppt/_rels/presentation.xml.rels', relationships('<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>'));
  zip.file('ppt/theme/theme1.xml', `<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:themeElements><a:clrScheme name="Google"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="434343"/></a:lt1><a:accent1><a:srgbClr val="B7B7B7"/></a:accent1></a:clrScheme><a:fontScheme name="Office"><a:majorFont><a:latin typeface="Arial"/></a:majorFont><a:minorFont><a:latin typeface="Arial"/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"/></a:themeElements></a:theme>`);
  zip.file('ppt/slideMasters/slideMaster1.xml', `<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:bg><p:bgPr><a:noFill/></p:bgPr></p:bg><p:spTree>${unindexedMaster}</p:spTree></p:cSld></p:sldMaster>`);
  zip.file('ppt/slideMasters/_rels/slideMaster1.xml.rels', relationships('<Relationship Id="rIdTheme" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>'));
  zip.file('ppt/slideLayouts/slideLayout1.xml', `<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree>${inherited('Title', true)}<p:sp><p:nvSpPr><p:cNvPr id="3" name="Divider"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="782742"/><a:ext cx="12192000" cy="9600"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="595959"/></a:solidFill></p:spPr></p:sp></p:spTree></p:cSld></p:sldLayout>`);
  zip.file('ppt/slideLayouts/_rels/slideLayout1.xml.rels', relationships('<Relationship Id="rIdMaster" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>'));
  zip.file('ppt/slides/slide1.xml', `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree>${inherited('正しいタイトル', false)}${contact}${connector}${unindexedSlide}${paragraphMarkStyle}${explicitBreak}</p:spTree></p:cSld></p:sld>`);
  zip.file('ppt/slides/_rels/slide1.xml.rels', relationships('<Relationship Id="rIdLayout" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>'));
  return zip.generateAsync({ type: 'arraybuffer' });
}

describe('PowerPoint template import', () => {
  it('extracts theme, hierarchy, editable objects, and reusable layouts', async () => {
    const result = await parsePptxTemplate(await makeFixture(), 'acme-template.pptx');

    expect(result.theme.accent).toBe('#6757E8');
    expect(result.template.headingFont).toBe('Aptos Display');
    expect(result.sourceSlides).toHaveLength(1);
    expect(result.template.layouts).toHaveLength(1);
    expect(result.sourceSlides[0].title).toBe('Imported strategy');
    expect(result.sourceSlides[0].elements.some((element) => element.content === 'ACME / TEMPLATE')).toBe(true);
    expect(result.template.warnings).toContainEqual({ code: 'unsupported_charts', count: 1 });
  });

  it('creates a deck whose imported layouts remain reusable', async () => {
    const result = await parsePptxTemplate(await makeFixture(), 'acme-template.potx');
    const layoutId = result.template.layouts[0].id;
    const openedDeck = buildDeckFromPptxImport(result, 'slides');
    const deck = buildDeckFromPptxImport(result, 'layouts', [layoutId]);

    expect(openedDeck.slides).toHaveLength(1);
    expect(openedDeck.slides[0].title).toBe('Imported strategy');
    expect(openedDeck.importedTemplate?.layouts[0].id).toBe(layoutId);
    expect(deck.importedTemplate?.format).toBe('potx');
    expect(deck.importedTemplate?.layouts[0].id).toBe(layoutId);
    expect(deck.slides).toHaveLength(1);
    expect(deck.slides[0].elements.some((element) => element.role === 'title')).toBe(true);
  });

  it('keeps Google Slides exports white and preserves inherited Japanese typography', async () => {
    const result = await parsePptxTemplate(await makeGoogleExportFixture(), 'google-export.pptx');
    const title = result.sourceSlides[0].elements.find((element) => element.role === 'title');
    const divider = result.sourceSlides[0].elements.find((element) => element.label === 'Divider');
    const contact = result.sourceSlides[0].elements.find((element) => element.label === 'Contact');
    const verticalDivider = result.sourceSlides[0].elements.find((element) => element.label === 'Vertical divider');
    const unindexedBody = result.sourceSlides[0].elements.find((element) => element.label === 'Unindexed body');
    const paragraphMark = result.sourceSlides[0].elements.find((element) => element.label === 'Paragraph mark style');
    const explicitBreak = result.sourceSlides[0].elements.find((element) => element.label === 'Explicit break');

    expect(result.sourceSlides[0].background).toBe('#FFFFFF');
    expect(title?.style.color).toBe('#262626');
    expect(title?.style.fontFamily).toBe('Noto Sans JP');
    expect(title?.style.fontSize).toBeCloseTo(37.33, 2);
    expect(divider?.height).toBeCloseTo(0.14, 2);
    expect(divider?.style.padding).toBe(0);
    expect(contact?.richText).toHaveLength(4);
    expect(contact?.richText?.slice(1, 3).every((paragraph) => paragraph.runs.every((run) => run.text === ''))).toBe(true);
    expect(contact?.richText?.[0].runs[0].style?.fontSize).toBeCloseTo(13.33, 2);
    expect(contact?.richText?.[0].lineHeight).toBeCloseTo(1.35, 2);
    expect(contact?.richText?.[0].bulletFontSize).toBeCloseTo(8, 2);
    expect(contact?.richText?.[0].bulletFontFamily).toBe('Arial');
    expect(verticalDivider?.type).toBe('line');
    expect(verticalDivider?.style.strokeWidth).toBeCloseTo(1.33, 2);
    expect(verticalDivider?.width).toBeCloseTo(0.1, 2);
    expect(verticalDivider?.x).toBeCloseTo(49.16, 2);
    expect(verticalDivider?.height).toBeGreaterThan(50);
    expect(unindexedBody?.style.fontSize).toBeCloseTo(33.33, 2);
    expect(unindexedBody?.richText?.[0].runs[0].style?.fontSize).toBeCloseTo(33.33, 2);
    expect(paragraphMark?.richText?.[0].runs[0].style?.fontSize).toBeCloseTo(21.33, 2);
    expect(paragraphMark?.richText?.[0].runs[0].style?.fontWeight).toBe(400);
    expect(paragraphMark?.richText?.[0].runs[0].style?.color).toBeUndefined();
    expect(explicitBreak?.richText?.[0].runs.map((run) => run.text)).toEqual(['First', '\n', 'Second', 'Tail']);
    expect(result.template.headingFont).toBe('Noto Sans JP');
  });

  it('rejects non-PowerPoint uploads before parsing', async () => {
    await expect(parsePptxTemplate(new TextEncoder().encode('not a zip').buffer, 'notes.pdf')).rejects.toThrow(/pptx or .potx/i);
  });
});
