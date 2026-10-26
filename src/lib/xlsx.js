'use strict';
/**
 * Minimaler XLSX-Leser/-Schreiber auf Basis von src/lib/zip.js.
 * Unterstützt mehrere Arbeitsblätter, Texte, Zahlen und Datumswerte.
 */
const { zipSchreiben, zipLesen } = require('./zip');

const XML_ESCAPE = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };

function esc(text) {
  return String(text == null ? '' : text).replace(/[&<>"']/g, (c) => XML_ESCAPE[c]);
}

function spaltenName(index) {
  let name = '';
  let n = index;
  while (n >= 0) {
    name = String.fromCharCode((n % 26) + 65) + name;
    n = Math.floor(n / 26) - 1;
  }
  return name;
}

function istZahl(wert) {
  return typeof wert === 'number' && Number.isFinite(wert);
}

function excelDatum(jsDatum) {
  return Math.round((jsDatum.getTime() / 86400000) + 25569);
}

/** Wandelt eine Zell-Referenz (z. B. "B7") in Spaltenindex + Zeilenindex. */
function refZerlegen(ref) {
  const match = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!match) return null;
  let spalte = 0;
  for (const zeichen of match[1]) spalte = spalte * 26 + (zeichen.charCodeAt(0) - 64);
  return { spalte: spalte - 1, zeile: parseInt(match[2], 10) - 1 };
}

/**
 * @param {{name:string, zeilen:(string|number|Date|null)[][]}[]} blaetter
 * @returns {Buffer}
 */
function xlsxSchreiben(blaetter) {
  const dateien = [];
  const shared = [];
  const sharedIndex = new Map();

  function sharedId(text) {
    if (sharedIndex.has(text)) return sharedIndex.get(text);
    const id = shared.length;
    shared.push(text);
    sharedIndex.set(text, id);
    return id;
  }

  const sheetXmls = blaetter.map((blatt) => {
    const spaltenMax = blatt.zeilen.reduce((max, zeile) => Math.max(max, zeile.length), 0);
    const zeilenXml = blatt.zeilen.map((zeile, zeilenIndex) => {
      const zellenXml = zeile.map((wert, spaltenIndex) => {
        const ref = `${spaltenName(spaltenIndex)}${zeilenIndex + 1}`;
        if (wert === null || wert === undefined || wert === '') return `<c r="${ref}"/>`;
        if (istZahl(wert)) return `<c r="${ref}"><v>${wert}</v></c>`;
        if (wert instanceof Date) return `<c r="${ref}" s="1"><v>${excelDatum(wert)}</v></c>`;
        return `<c r="${ref}" t="s"><v>${sharedId(String(wert))}</v></c>`;
      }).join('');
      return `<row r="${zeilenIndex + 1}">${zellenXml}</row>`;
    }).join('');

    const spaltenBreiten = Array.from({ length: spaltenMax }, (_, i) => {
      const breite = blatt.spaltenBreiten && blatt.spaltenBreiten[i] ? blatt.spaltenBreiten[i] : 18;
      return `<col min="${i + 1}" max="${i + 1}" width="${breite}" customWidth="1"/>`;
    }).join('');

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${spaltenBreiten}</cols><sheetData>${zeilenXml}</sheetData></worksheet>`;
  });

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${blaetter.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${blaetter.map((blatt, i) => `<sheet name="${esc(blatt.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${blaetter.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${blaetter.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId${blaetter.length + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`;

  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDCE6F1"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/></styleSheet>`;

  const sharedStrings = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${shared.length}" uniqueCount="${shared.length}">${shared.map((t) => `<si><t xml:space="preserve">${esc(t)}</t></si>`).join('')}</sst>`;

  dateien.push({ name: '[Content_Types].xml', data: Buffer.from(contentTypes, 'utf8') });
  dateien.push({ name: '_rels/.rels', data: Buffer.from(rootRels, 'utf8') });
  dateien.push({ name: 'xl/workbook.xml', data: Buffer.from(workbook, 'utf8') });
  dateien.push({ name: 'xl/_rels/workbook.xml.rels', data: Buffer.from(workbookRels, 'utf8') });
  dateien.push({ name: 'xl/styles.xml', data: Buffer.from(styles, 'utf8') });
  dateien.push({ name: 'xl/sharedStrings.xml', data: Buffer.from(sharedStrings, 'utf8') });
  sheetXmls.forEach((xml, i) => {
    dateien.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: Buffer.from(xml, 'utf8') });
  });

  return zipSchreiben(dateien);
}

function dekodiereXml(text) {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, '&');
}

function parseSheet(xml, shared) {
  const zeilen = [];
  const zeilenRegex = /<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  let zeilenMatch;
  while ((zeilenMatch = zeilenRegex.exec(xml)) !== null) {
    const zeilenIndex = parseInt(zeilenMatch[1], 10) - 1;
    const zeile = [];
    const zellenRegex = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let zellenMatch;
    while ((zellenMatch = zellenRegex.exec(zeilenMatch[2])) !== null) {
      const attrs = zellenMatch[1];
      const inhalt = zellenMatch[2] || '';
      const refMatch = /r="([A-Z]+\d+)"/.exec(attrs);
      const spaltenIndex = refMatch ? refZerlegen(refMatch[1]).spalte : zeile.length;
      const typMatch = /t="([^"]+)"/.exec(attrs);
      const typ = typMatch ? typMatch[1] : 'n';

      let wert = '';
      if (typ === 'inlineStr') {
        const textRegex = /<t[^>]*>([\s\S]*?)<\/t>/g;
        let textMatch;
        while ((textMatch = textRegex.exec(inhalt)) !== null) wert += dekodiereXml(textMatch[1]);
      } else {
        const vMatch = /<v>([\s\S]*?)<\/v>/.exec(inhalt);
        const roh = vMatch ? dekodiereXml(vMatch[1]) : '';
        if (typ === 's') {
          const idx = parseInt(roh, 10);
          wert = shared[idx] !== undefined ? shared[idx] : '';
        } else if (typ === 'str') {
          wert = roh;
        } else if (typ === 'b') {
          wert = roh === '1';
        } else if (roh !== '') {
          const num = Number(roh);
          wert = Number.isNaN(num) ? roh : num;
        }
      }
      zeile[spaltenIndex] = wert;
    }
    zeilen[zeilenIndex] = zeile;
  }
  return zeilen;
}

/**
 * @param {Buffer} buffer
 * @returns {{name:string, zeilen:(string|number|boolean)[][]}[]}
 */
function xlsxLesen(buffer) {
  const eintraege = zipLesen(buffer);
  const dateiMap = new Map(eintraege.map((e) => [e.name, e.data]));

  const shared = [];
  if (dateiMap.has('xl/sharedStrings.xml')) {
    const xml = dateiMap.get('xl/sharedStrings.xml').toString('utf8');
    const siRegex = /<si>([\s\S]*?)<\/si>/g;
    let siMatch;
    while ((siMatch = siRegex.exec(xml)) !== null) {
      let wert = '';
      const tRegex = /<t[^>]*>([\s\S]*?)<\/t>/g;
      let tMatch;
      while ((tMatch = tRegex.exec(siMatch[1])) !== null) wert += dekodiereXml(tMatch[1]);
      shared.push(wert);
    }
  }

  const workbookXml = dateiMap.has('xl/workbook.xml') ? dateiMap.get('xl/workbook.xml').toString('utf8') : '';
  const sheetNamen = [];
  const sheetRegex = /<sheet[^>]*name="([^"]*)"[^>]*r:id="([^"]*)"/g;
  let sheetMatch;
  while ((sheetMatch = sheetRegex.exec(workbookXml)) !== null) {
    sheetNamen.push({ name: dekodiereXml(sheetMatch[1]), rid: sheetMatch[2] });
  }

  const relsXml = dateiMap.has('xl/_rels/workbook.xml.rels') ? dateiMap.get('xl/_rels/workbook.xml.rels').toString('utf8') : '';
  const relZiel = new Map();
  const relRegex = /<Relationship[^>]*Id="([^"]*)"[^>]*Target="([^"]*)"/g;
  let relMatch;
  while ((relMatch = relRegex.exec(relsXml)) !== null) {
    relZiel.set(relMatch[1], relMatch[2].replace(/^\/?xl\//, '').replace(/^\//, ''));
  }

  const blaetter = [];
  sheetNamen.forEach((blatt, index) => {
    let pfad = relZiel.get(blatt.rid) || `worksheets/sheet${index + 1}.xml`;
    if (!pfad.startsWith('worksheets/')) pfad = `worksheets/${pfad.replace(/^.*worksheets\//, '')}`;
    const key = `xl/${pfad}`;
    if (!dateiMap.has(key)) return;
    blaetter.push({ name: blatt.name, zeilen: parseSheet(dateiMap.get(key).toString('utf8'), shared) });
  });

  if (blaetter.length === 0) {
    for (const eintrag of eintraege) {
      if (/^xl\/worksheets\/sheet\d+\.xml$/.test(eintrag.name)) {
        blaetter.push({ name: eintrag.name, zeilen: parseSheet(eintrag.data.toString('utf8'), shared) });
      }
    }
  }

  return blaetter;
}

module.exports = { xlsxSchreiben, xlsxLesen, refZerlegen, spaltenName };
