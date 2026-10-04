// Report downloads: Excel (.xlsx), PDF and Word (.docx) built by hand, with no
// library. The project has no spreadsheet, PDF or Word package and installs
// none, and a report here is one small table, so each format is written
// directly: .xlsx and .docx are zip files of XML (zipped "stored", no
// compression, which every reader accepts) and the PDF is a few plain
// objects in the standard Helvetica font. This file has no imports and no
// DOM, so the self-check at the bottom runs under plain Node. The browser
// side (making the file and clicking a link) is report-download-menu.tsx.
//
// A report can carry one picture (the heatmap's map). It arrives as finished
// JPEG bytes, so no format here has to decode or compress an image: the PDF
// embeds the JPEG as is (DCTDecode), and .xlsx and .docx store it as a media
// file next to the XML.

/** A finished JPEG and its size in pixels. */
export interface ReportImage {
  jpeg: Uint8Array;
  width: number;
  height: number;
  /** Alternative text for the picture, read out by screen readers. */
  alt?: string;
}

export interface ReportTable {
  title: string;
  /** Lines under the title: the filter in effect, when it was made. */
  details: string[];
  columns: string[];
  /** Strings, or numbers (kept as real numbers in Excel, right aligned). */
  rows: (string | number)[][];
  /** An optional bold last row, e.g. a total. */
  footer?: (string | number)[];
  /** Plain lines under the table. */
  notes: string[];
  /** An optional picture: under the details in PDF and Word, beside the table in Excel. */
  image?: ReportImage;
}

export type ReportFormat = "xlsx" | "pdf" | "docx";

export const REPORT_FORMATS: Record<ReportFormat, { label: string; extension: string; mime: string }> = {
  xlsx: {
    label: "Excel",
    extension: "xlsx",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
  pdf: { label: "PDF", extension: "pdf", mime: "application/pdf" },
  docx: {
    label: "Word",
    extension: "docx",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
};

export function buildReportFile(format: ReportFormat, table: ReportTable): Uint8Array {
  if (format === "xlsx") return buildXlsx(table);
  if (format === "docx") return buildDocx(table);
  return buildPdf(table);
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const textEncoder = new TextEncoder();

// Characters XML 1.0 cannot carry are dropped, the five reserved ones escaped.
function xmlEscape(value: string): string {
  return value
    .replaceAll(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// A column is numeric when every body cell and the footer cell in it is a number.
function numericColumns(table: ReportTable): boolean[] {
  return table.columns.map((_, i) => {
    const cells = table.rows.map((r) => r[i]);
    if (table.footer) cells.push(table.footer[i]);
    return cells.length > 0 && cells.every((c) => typeof c === "number");
  });
}

// ---------------------------------------------------------------------------
// Zip (stored). Local headers, file data, central directory, end record.
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of data) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// The largest size that fits inside maxW x maxH with the picture's own
// proportions. Units are the caller's (pixels, points or EMU).
function fitInside(image: ReportImage, maxW: number, maxH: number): { w: number; h: number } {
  const scale = Math.min(maxW / image.width, maxH / image.height);
  return { w: Math.round(image.width * scale), h: Math.round(image.height * scale) };
}

// An entry is XML text, or raw bytes for a picture. Both are stored, not compressed.
function zip(files: { name: string; text?: string; data?: Uint8Array }[]): Uint8Array {
  const entries = files.map((f) => {
    const name = textEncoder.encode(f.name);
    const data = f.data ?? textEncoder.encode(f.text ?? "");
    return { name, data, crc: crc32(data) };
  });
  const localSize = entries.reduce((n, e) => n + 30 + e.name.length + e.data.length, 0);
  const centralSize = entries.reduce((n, e) => n + 46 + e.name.length, 0);
  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);
  const offsets: number[] = [];
  let p = 0;

  // 1980-01-01 00:00, since a report file's timestamp inside the zip means nothing.
  const DOS_TIME = 0;
  const DOS_DATE = (0 << 9) | (1 << 5) | 1;
  const UTF8_FLAG = 0x0800;

  for (const e of entries) {
    offsets.push(p);
    view.setUint32(p, 0x04034b50, true);
    view.setUint16(p + 4, 20, true);
    view.setUint16(p + 6, UTF8_FLAG, true);
    view.setUint16(p + 8, 0, true); // stored
    view.setUint16(p + 10, DOS_TIME, true);
    view.setUint16(p + 12, DOS_DATE, true);
    view.setUint32(p + 14, e.crc, true);
    view.setUint32(p + 18, e.data.length, true);
    view.setUint32(p + 22, e.data.length, true);
    view.setUint16(p + 26, e.name.length, true);
    view.setUint16(p + 28, 0, true);
    out.set(e.name, p + 30);
    out.set(e.data, p + 30 + e.name.length);
    p += 30 + e.name.length + e.data.length;
  }

  const centralStart = p;
  entries.forEach((e, i) => {
    view.setUint32(p, 0x02014b50, true);
    view.setUint16(p + 4, 20, true);
    view.setUint16(p + 6, 20, true);
    view.setUint16(p + 8, UTF8_FLAG, true);
    view.setUint16(p + 10, 0, true);
    view.setUint16(p + 12, DOS_TIME, true);
    view.setUint16(p + 14, DOS_DATE, true);
    view.setUint32(p + 16, e.crc, true);
    view.setUint32(p + 20, e.data.length, true);
    view.setUint32(p + 24, e.data.length, true);
    view.setUint16(p + 28, e.name.length, true);
    view.setUint16(p + 30, 0, true);
    view.setUint16(p + 32, 0, true);
    view.setUint16(p + 34, 0, true);
    view.setUint16(p + 36, 0, true);
    view.setUint32(p + 38, 0, true);
    view.setUint32(p + 42, offsets[i], true);
    out.set(e.name, p + 46);
    p += 46 + e.name.length;
  });

  view.setUint32(p, 0x06054b50, true);
  view.setUint16(p + 8, entries.length, true);
  view.setUint16(p + 10, entries.length, true);
  view.setUint32(p + 12, p - centralStart, true);
  view.setUint32(p + 16, centralStart, true);
  return out;
}

// ---------------------------------------------------------------------------
// Excel (.xlsx)
// ---------------------------------------------------------------------------

function columnLetter(index: number): string {
  let n = index;
  let s = "";
  do {
    s = String.fromCodePoint(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

// Cell styles (see styles.xml below): 0 plain, 1 header, 2 title, 3 bold.
function xlsxCell(ref: string, value: string | number, style: number): string {
  const s = style ? ` s="${style}"` : "";
  if (typeof value === "number" && Number.isFinite(value)) return `<c r="${ref}"${s}><v>${value}</v></c>`;
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(String(value))}</t></is></c>`;
}

function buildXlsx(table: ReportTable): Uint8Array {
  const rows: string[] = [];
  let r = 1;
  const pushRow = (cells: [string | number, number][]) => {
    rows.push(
      `<row r="${r}">${cells.map(([v, s], i) => xlsxCell(columnLetter(i) + r, v, s)).join("")}</row>`,
    );
    r += 1;
  };
  const blank = () => {
    r += 1;
  };

  pushRow([[table.title, 2]]);
  for (const line of table.details) pushRow([[line, 0]]);
  blank();
  pushRow(table.columns.map((c) => [c, 1] as [string, number]));
  for (const row of table.rows) pushRow(row.map((c) => [c, 0] as [string | number, number]));
  if (table.footer) pushRow(table.footer.map((c) => [c, 3] as [string | number, number]));
  if (table.notes.length > 0) blank();
  for (const note of table.notes) pushRow([[note, 0]]);

  // Widths from the table itself, not from the title or notes, which run over
  // the empty cells beside them.
  const widths = table.columns.map((c, i) => {
    const cells = [c, ...table.rows.map((row) => String(row[i])), ...(table.footer ? [String(table.footer[i])] : [])];
    return Math.min(60, Math.max(12, ...cells.map((t) => t.length + 3)));
  });
  const cols = widths
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join("");

  const image = table.image;
  const drawing = image ? '<drawing r:id="rId1"/>' : "";
  const sheet =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<cols>${cols}</cols><sheetData>${rows.join("")}</sheetData>${drawing}</worksheet>`;

  const styles =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<fonts count="3">` +
    `<font><sz val="11"/><name val="Calibri"/></font>` +
    `<font><b/><sz val="11"/><name val="Calibri"/></font>` +
    `<font><b/><sz val="14"/><name val="Calibri"/></font>` +
    `</fonts>` +
    `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>` +
    `<fill><patternFill patternType="solid"><fgColor rgb="FFD9D9D9"/><bgColor indexed="64"/></patternFill></fill></fills>` +
    `<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>` +
    `<border><left/><right/><top/><bottom style="thin"><color auto="1"/></bottom><diagonal/></border></borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="4">` +
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
    `<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>` +
    `<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
    `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
    `</cellXfs>` +
    `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
    `</styleSheet>`;

  // The picture sits beside the table, one empty column to its right, starting
  // at the top, so it is in view the moment the file opens.
  const picture: { name: string; text?: string; data?: Uint8Array }[] = [];
  if (image) {
    const EMU_PER_PX = 9525;
    const size = fitInside(image, 720, 520);
    const cx = size.w * EMU_PER_PX;
    const cy = size.h * EMU_PER_PX;
    picture.push(
      {
        name: "xl/worksheets/_rels/sheet1.xml.rels",
        text:
          `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>` +
          `</Relationships>`,
      },
      {
        name: "xl/drawings/drawing1.xml",
        text:
          `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
          `<xdr:oneCellAnchor>` +
          `<xdr:from><xdr:col>${table.columns.length + 1}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>` +
          `<xdr:ext cx="${cx}" cy="${cy}"/>` +
          `<xdr:pic>` +
          `<xdr:nvPicPr><xdr:cNvPr id="2" name="Picture 1" descr="${xmlEscape(image.alt ?? "Report picture")}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>` +
          `<xdr:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>` +
          `<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>` +
          `</xdr:pic><xdr:clientData/>` +
          `</xdr:oneCellAnchor></xdr:wsDr>`,
      },
      {
        name: "xl/drawings/_rels/drawing1.xml.rels",
        text:
          `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.jpeg"/>` +
          `</Relationships>`,
      },
      { name: "xl/media/image1.jpeg", data: image.jpeg },
    );
  }

  return zip([
    {
      name: "[Content_Types].xml",
      text:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        (image ? `<Default Extension="jpeg" ContentType="image/jpeg"/>` : "") +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
        `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
        (image ? `<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>` : "") +
        `</Types>`,
    },
    {
      name: "_rels/.rels",
      text:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
        `</Relationships>`,
    },
    {
      name: "xl/workbook.xml",
      text:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        `<sheets><sheet name="Report" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      text:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
        `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        `</Relationships>`,
    },
    { name: "xl/styles.xml", text: styles },
    { name: "xl/worksheets/sheet1.xml", text: sheet },
    ...picture,
  ]);
}

// ---------------------------------------------------------------------------
// Word (.docx)
// ---------------------------------------------------------------------------

function docxParagraph(text: string, opts: { bold?: boolean; size?: number; after?: number; right?: boolean } = {}): string {
  const bold = opts.bold ? "<w:b/>" : "";
  const size = opts.size ? `<w:sz w:val="${opts.size}"/>` : "";
  const rPr = bold || size ? `<w:rPr>${bold}${size}</w:rPr>` : "";
  const align = opts.right ? '<w:jc w:val="right"/>' : "";
  const pPr = `<w:pPr><w:spacing w:after="${opts.after ?? 0}"/>${align}</w:pPr>`;
  return `<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p>`;
}

function buildDocx(table: ReportTable): Uint8Array {
  const numeric = numericColumns(table);
  const TOTAL = 10080; // letter page, 0.75" margins, in twips
  const first = table.columns.length >= 3 ? Math.round(TOTAL * 0.4) : Math.round(TOTAL * 0.5);
  const rest = Math.floor((TOTAL - first) / Math.max(1, table.columns.length - 1));
  const widthOf = (i: number) => (i === 0 ? first : rest);

  const cell = (value: string | number, i: number, opts: { bold?: boolean; shade?: boolean }) =>
    `<w:tc><w:tcPr><w:tcW w:w="${widthOf(i)}" w:type="dxa"/>` +
    (opts.shade ? `<w:shd w:val="clear" w:color="auto" w:fill="D9D9D9"/>` : "") +
    `</w:tcPr>${docxParagraph(String(value), { bold: opts.bold, right: numeric[i], after: 0 })}</w:tc>`;

  const rowXml = (cells: (string | number)[], opts: { bold?: boolean; shade?: boolean; header?: boolean }) =>
    `<w:tr>${opts.header ? "<w:trPr><w:tblHeader/></w:trPr>" : ""}${cells.map((c, i) => cell(c, i, opts)).join("")}</w:tr>`;

  const gridCols = table.columns.map((_, i) => `<w:gridCol w:w="${widthOf(i)}"/>`).join("");
  const border = (side: string) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>`;
  const tbl =
    `<w:tbl><w:tblPr><w:tblW w:w="${TOTAL}" w:type="dxa"/><w:tblBorders>` +
    ["top", "left", "bottom", "right", "insideH", "insideV"].map(border).join("") +
    `</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr>` +
    `<w:tblGrid>${gridCols}</w:tblGrid>` +
    rowXml(table.columns, { bold: true, shade: true, header: true }) +
    table.rows.map((r) => rowXml(r, {})).join("") +
    (table.footer ? rowXml(table.footer, { bold: true }) : "") +
    `</w:tbl>`;

  // The picture is one inline paragraph, as wide as the text area allows but
  // no taller than 4.5 inches, so the table still starts on the first page.
  const image = table.image;
  let picture = "";
  if (image) {
    const size = fitInside(image, 6400800, 4114800); // 7 in x 4.5 in, in EMU
    picture =
      `<w:p><w:pPr><w:spacing w:after="160"/></w:pPr><w:r><w:drawing>` +
      `<wp:inline distT="0" distB="0" distL="0" distR="0">` +
      `<wp:extent cx="${size.w}" cy="${size.h}"/>` +
      `<wp:docPr id="1" name="Picture 1" descr="${xmlEscape(image.alt ?? "Report picture")}"/>` +
      `<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
      `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
      `<pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="image1.jpeg"/><pic:cNvPicPr/></pic:nvPicPr>` +
      `<pic:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
      `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${size.w}" cy="${size.h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
      `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
  }

  const body =
    docxParagraph(table.title, { bold: true, size: 32, after: 120 }) +
    table.details.map((d) => docxParagraph(d, { after: 40 })).join("") +
    docxParagraph("", { after: 120 }) +
    picture +
    tbl +
    docxParagraph("", { after: 120 }) +
    table.notes.map((n) => docxParagraph(n, { size: 18, after: 60 })).join("");

  const document =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ` +
    `xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ` +
    `xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${body}` +
    `<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>` +
    `</w:body></w:document>`;

  return zip([
    {
      name: "[Content_Types].xml",
      text:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        (image ? `<Default Extension="jpeg" ContentType="image/jpeg"/>` : "") +
        `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
        `</Types>`,
    },
    {
      name: "_rels/.rels",
      text:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
        `</Relationships>`,
    },
    { name: "word/document.xml", text: document },
    ...(image
      ? [
          {
            name: "word/_rels/document.xml.rels",
            text:
              `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
              `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
              `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.jpeg"/>` +
              `</Relationships>`,
          },
          { name: "word/media/image1.jpeg", data: image.jpeg },
        ]
      : []),
  ]);
}

// ---------------------------------------------------------------------------
// PDF. Letter size, standard Helvetica and Helvetica-Bold (WinAnsi), so no
// font is embedded. Text is Latin-1 only: anything outside it becomes "?".
// ---------------------------------------------------------------------------

// Helvetica advance widths per 1000 units for ASCII 32..126, used to right
// align numbers, cut long cells with "..." and wrap the notes.
const HELVETICA_WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833,
  722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556,
  556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334,
  260, 334, 584,
];

// Typographic punctuation to its ASCII lookalike, then anything past Latin-1 to "?".
function toLatin1(value: string): string {
  return value
    .replaceAll(/[\u2013\u2014]/g, "-")
    .replaceAll(/[\u2018\u2019]/g, "'")
    .replaceAll(/[\u201C\u201D]/g, '"')
    .replaceAll("\u2026", "...")
    .replaceAll(/[\u0000-\u001F]/g, " ")
    .replaceAll(/[^\u0020-\u007E\u00A0-\u00FF]/g, "?");
}

function textWidth(text: string, size: number, bold: boolean): number {
  let units = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    units += code >= 32 && code <= 126 ? HELVETICA_WIDTHS[code - 32] : 556;
  }
  return (units * size * (bold ? 1.06 : 1)) / 1000;
}

function fitText(text: string, maxWidth: number, size: number, bold: boolean): string {
  if (textWidth(text, size, bold) <= maxWidth) return text;
  let cut = text;
  while (cut.length > 0 && textWidth(`${cut}...`, size, bold) > maxWidth) cut = cut.slice(0, -1);
  return `${cut}...`;
}

function wrapText(text: string, maxWidth: number, size: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && textWidth(next, size, false) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length > 0 ? lines : [""];
}

function pdfEscape(text: string): string {
  return text.replaceAll("\\", String.raw`\\`).replaceAll("(", String.raw`\(`).replaceAll(")", String.raw`\)`);
}

// Bytes as a string with one character per byte, in chunks so a large picture
// does not overflow the argument limit of fromCodePoint.
function bytesToLatin1(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 8192) out += String.fromCodePoint(...bytes.subarray(i, i + 8192));
  return out;
}

function buildPdf(table: ReportTable): Uint8Array {
  const PAGE_W = 612;
  const PAGE_H = 792;
  const MARGIN = 54;
  const CONTENT_W = PAGE_W - MARGIN * 2;
  const BOTTOM = 60;
  const ROW_H = 18;
  const numeric = numericColumns(table);

  const first = table.columns.length >= 3 ? CONTENT_W * 0.4 : CONTENT_W * 0.5;
  const rest = (CONTENT_W - first) / Math.max(1, table.columns.length - 1);
  const colLeft = table.columns.map((_, i) => MARGIN + (i === 0 ? 0 : first + rest * (i - 1)));
  const colWidth = table.columns.map((_, i) => (i === 0 ? first : rest));

  const pages: string[][] = [[]];
  let y = PAGE_H - MARGIN;
  const ops = (): string[] => pages.at(-1) as string[]; // pages always holds at least one

  const text = (value: string, x: number, baseline: number, size: number, bold: boolean) => {
    ops().push(`BT /${bold ? "F2" : "F1"} ${size} Tf ${x.toFixed(2)} ${baseline.toFixed(2)} Td (${pdfEscape(toLatin1(value))}) Tj ET`);
  };
  const newPage = () => {
    pages.push([]);
    y = PAGE_H - MARGIN;
  };
  const ensure = (height: number, redrawHeader: boolean) => {
    if (y - height >= BOTTOM) return;
    newPage();
    if (redrawHeader) drawRow(table.columns, { header: true });
  };

  function drawRow(cells: (string | number)[], opts: { header?: boolean; bold?: boolean }) {
    ensure(ROW_H, !opts.header);
    const bottom = y - ROW_H;
    if (opts.header) ops().push(`0.85 g ${MARGIN} ${bottom} ${CONTENT_W} ${ROW_H} re f 0 g`);
    const bold = Boolean(opts.header || opts.bold);
    cells.forEach((cell, i) => {
      const fitted = fitText(toLatin1(String(cell)), colWidth[i] - 12, 10, bold);
      const x = numeric[i] ? colLeft[i] + colWidth[i] - 6 - textWidth(fitted, 10, bold) : colLeft[i] + 6;
      text(fitted, x, bottom + 5.5, 10, bold);
    });
    ops().push(`0.75 G 0.5 w ${MARGIN} ${bottom} m ${MARGIN + CONTENT_W} ${bottom} l S 0 G`);
    y = bottom;
  }

  text(fitText(toLatin1(table.title), CONTENT_W, 16, true), MARGIN, y - 16, 16, true);
  y -= 26;
  for (const detail of table.details) {
    for (const line of wrapText(toLatin1(detail), CONTENT_W, 10)) {
      ensure(14, false);
      text(line, MARGIN, y - 10, 10, false);
      y -= 14;
    }
  }
  y -= 10;

  // The picture goes under the details, as wide as the page allows but no
  // taller than 330 points, so the table's first rows still fit on page 1.
  const image = table.image;
  if (image) {
    const size = fitInside(image, CONTENT_W, 330);
    ensure(size.h, false);
    ops().push(`q ${size.w} 0 0 ${size.h} ${MARGIN} ${(y - size.h).toFixed(2)} cm /Im1 Do Q`);
    y -= size.h + 14;
  }

  drawRow(table.columns, { header: true });
  for (const row of table.rows) drawRow(row, {});
  if (table.footer) drawRow(table.footer, { bold: true });

  y -= 8;
  for (const note of table.notes) {
    for (const line of wrapText(toLatin1(note), CONTENT_W, 9)) {
      ensure(13, false);
      text(line, MARGIN, y - 9, 9, false);
      y -= 13;
    }
    y -= 3;
  }

  // Footer on every page, once the page count is known.
  pages.forEach((page, i) => {
    page.push(
      `BT /F1 8 Tf ${(PAGE_W / 2 - 24).toFixed(2)} 30 Td (Page ${i + 1} of ${pages.length}) Tj ET`,
    );
  });

  // Objects: 1 catalog, 2 page tree, 3 and 4 fonts, then a page and its
  // content stream per page, then the picture (if any) as the last object.
  const objects: string[] = [];
  const pageNumbers = pages.map((_, i) => 5 + i * 2);
  const imageNumber = 5 + pages.length * 2;
  const xObjects = image ? ` /XObject << /Im1 ${imageNumber} 0 R >>` : "";
  const kids = pageNumbers.map((n) => n + " 0 R").join(" ");
  objects.push(
    `<< /Type /Catalog /Pages 2 0 R >>`,
    `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`,
  );
  pages.forEach((page, i) => {
    const stream = page.join("\n");
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xObjects} >> /Contents ${pageNumbers[i] + 1} 0 R >>`,
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    );
  });
  if (image) {
    // The JPEG bytes ride along as a Latin-1 string (one character per byte),
    // which the byte conversion at the end turns back into the same bytes.
    const data = bytesToLatin1(image.jpeg);
    objects.push(
      `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${data.length} >>\nstream\n${data}\nendstream`,
    );
  }

  // Every character is Latin-1 (toLatin1 above, ASCII everywhere else), so a
  // string's length is its byte length and offsets can be counted in characters.
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefAt = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) body += `${String(off).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;

  const bytes = new Uint8Array(body.length);
  for (let i = 0; i < body.length; i++) bytes[i] = (body.codePointAt(i) ?? 0) & 0xff;
  return bytes;
}

// Ponytail's non-trivial-logic rule: the smallest runnable check. Run with:
// npx tsx src/lib/report-files.ts
// Structure only (signatures, crc, xref); opening the files in Excel, Word and
// a PDF reader is the real test.
function demo() {
  const assertEqual = (actual: unknown, expected: unknown, label: string) => {
    if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
  };
  const sample: ReportTable = {
    title: "Sample (test) & more",
    details: ["Filter: All"],
    columns: ["Barangay", "Published", "Draft"],
    rows: [["Buting", 1, 0], ["San Joaquin", 0, 2]],
    footer: ["Total", 1, 2],
    notes: ["A note."],
  };
  assertEqual(crc32(textEncoder.encode("123456789")), 0xcbf43926, "crc32 of the standard test string");
  assertEqual(String.fromCodePoint(...buildReportFile("xlsx", sample).slice(0, 2)), "PK", "xlsx is a zip");
  assertEqual(String.fromCodePoint(...buildReportFile("docx", sample).slice(0, 2)), "PK", "docx is a zip");
  const pdf = String.fromCodePoint(...buildReportFile("pdf", sample));
  assertEqual(pdf.startsWith("%PDF-1.4"), true, "pdf header");
  assertEqual(pdf.trimEnd().endsWith("%%EOF"), true, "pdf trailer");
  const xref = Number(/startxref\n(\d+)/.exec(pdf)?.[1]);
  assertEqual(pdf.slice(xref, xref + 4), "xref", "startxref points at the xref table");
  assertEqual(columnLetter(0) + columnLetter(25) + columnLetter(26), "AZAA", "column letters");
  const withImage: ReportTable = { ...sample, image: { jpeg: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), width: 4, height: 3 } };
  assertEqual(String.fromCodePoint(...buildReportFile("xlsx", withImage).slice(0, 2)), "PK", "xlsx with a picture is a zip");
  assertEqual(String.fromCodePoint(...buildReportFile("docx", withImage).slice(0, 2)), "PK", "docx with a picture is a zip");
  assertEqual(String.fromCodePoint(...buildReportFile("pdf", withImage)).includes("/DCTDecode"), true, "pdf carries the picture");
  console.log("report-files.ts demo: all checks passed");
}

if (typeof process !== "undefined" && import.meta.url === `file://${process.argv[1]}`) {
  demo();
}
