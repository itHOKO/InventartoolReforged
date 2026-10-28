'use strict';
/**
 * Datenzugriff: liest/schreibt die beiden Excel-Dateien.
 * - Mitarbeiter.xlsx  -> Blatt "Mitarbeiter": Barcode | Name
 * - Ausleihen.xlsx    -> Blatt "Ausleihen":   ID | Mitarbeiter-Code | Mitarbeiter-Name |
 *                                       Werkzeug-Code | Werkzeug-Beschreibung |
 *                                       Ausleihe-Zeitstempel | Rueckgabe-Zeitstempel | Status
 */
const fs = require('fs');
const path = require('path');
const { xlsxSchreiben, xlsxLesen } = require('./lib/xlsx');
const config = require('./config');

const KOPF_MITARBEITER = ['Barcode', 'Name'];
const KOPF_AUSLEIHEN = [
  'ID',
  'Mitarbeiter-Code',
  'Mitarbeiter-Name',
  'Werkzeug-Code',
  'Werkzeug-Beschreibung',
  'Ausleihe-Zeitstempel',
  'Rueckgabe-Zeitstempel',
  'Status',
];

const STATUS_OFFEN = 'offen';
const STATUS_ZURUECK = 'zurueckgegeben';

function normiereCode(code) {
  return String(code == null ? '' : code).trim();
}

function sicherMkdir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

/** Wandelt Excel-Zellenwert in Text (ohne .0-Erweiterung bei Ganzzahlen). */
function zellText(wert) {
  if (wert === null || wert === undefined) return '';
  if (typeof wert === 'number' && Number.isInteger(wert)) return String(wert);
  return String(wert).trim();
}

/** Wandelt Excel-Zellenwert in Datum (ISO), falls möglich. */
function zellDatum(wert) {
  if (wert instanceof Date) return wert.toISOString();
  const text = zellText(wert);
  if (!text) return '';
  const zahl = Number(text);
  if (!Number.isNaN(zahl) && /^(\d{5})(\.\d+)?$/.test(text)) {
    // Excel-Seriennummer
    const ms = Math.round((zahl - 25569) * 86400000);
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? text : d.toISOString();
  }
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? text : d.toISOString();
}

function findeBlatt(blaetter, name) {
  const treffer = blaetter.find((b) => b.name.trim().toLowerCase() === name.toLowerCase());
  return treffer || blaetter[0] || null;
}

// ------------------------------------------------------------------
// Mitarbeiter
// ------------------------------------------------------------------

function mitarbeiterLaden() {
  if (!fs.existsSync(config.mitarbeiterDatei)) return [];
  const blaetter = xlsxLesen(fs.readFileSync(config.mitarbeiterDatei));
  const blatt = findeBlatt(blaetter, config.blattMitarbeiter);
  if (!blatt) return [];

  const zeilen = blatt.zeilen || [];
  const start = istKopfzeile(zeilen[0], KOPF_MITARBEITER) ? 1 : 0;
  const liste = [];
  for (let i = start; i < zeilen.length; i++) {
    const zeile = zeilen[i] || [];
    const barcode = zellText(zeile[0]);
    const name = zellText(zeile[1]);
    if (!barcode && !name) continue;
    liste.push({ barcode, name });
  }
  return liste;
}

function istKopfzeile(zeile, kopf) {
  if (!zeile || !zeile.length) return false;
  const erst = zellText(zeile[0]).toLowerCase();
  return kopf.some((k) => k.toLowerCase() === erst);
}

function mitarbeiterSpeichern(liste) {
  sicherMkdir(config.datenDir);
  const zeilen = [KOPF_MITARBEITER.slice()];
  for (const eintrag of liste) {
    zeilen.push([normiereCode(eintrag.barcode), String(eintrag.name || '').trim()]);
  }
  const buffer = xlsxSchreiben([
    { name: config.blattMitarbeiter, zeilen, spaltenBreiten: [20, 32] },
  ]);
  fs.writeFileSync(config.mitarbeiterDatei, buffer);
  return liste.length;
}

function mitarbeiterHinzufuegen(eintrag) {
  const code = normiereCode(eintrag && eintrag.barcode);
  const name = String((eintrag && eintrag.name) || '').trim();
  if (!code || !name) return null;
  const liste = mitarbeiterLaden();
  if (liste.some((m) => m.barcode === code)) return null; // Duplikat
  liste.push({ barcode: code, name });
  mitarbeiterSpeichern(liste);
  return { barcode: code, name };
}

// Alias fuer alternative Benennung
const mitarbeiterAnlegen = mitarbeiterHinzufuegen;
const mitarbeiterAdd = mitarbeiterHinzufuegen;

function mitarbeiterSuchen(barcode) {
  const code = normiereCode(barcode);
  if (!code) return null;
  const treffer = mitarbeiterLaden().find((m) => m.barcode === code);
  return treffer || null;
}

// ------------------------------------------------------------------
// Ausleihen
// ------------------------------------------------------------------

function ausleihenLaden() {
  if (!fs.existsSync(config.ausleiheDatei)) return [];
  const blaetter = xlsxLesen(fs.readFileSync(config.ausleiheDatei));
  const blatt = findeBlatt(blaetter, config.blattAusleihen);
  if (!blatt) return [];

  const zeilen = blatt.zeilen || [];
  const start = istKopfzeile(zeilen[0], KOPF_AUSLEIHEN) ? 1 : 0;
  const liste = [];
  for (let i = start; i < zeilen.length; i++) {
    const zeile = zeilen[i] || [];
    if (!zeile.length) continue;
    const werkzeugCode = zellText(zeile[3]);
    if (!werkzeugCode) continue;
    liste.push({
      id: zellText(zeile[0]),
      mitarbeiterCode: zellText(zeile[1]),
      mitarbeiterName: zellText(zeile[2]),
      werkzeugCode,
      werkzeugName: zellText(zeile[4]),
      zeitstempelAusleihe: zellDatum(zeile[5]),
      zeitstempelRueckgabe: zellDatum(zeile[6]),
      status: zellText(zeile[7]) || STATUS_OFFEN,
    });
  }
  return liste;
}

function ausleihenSpeichern(liste) {
  sicherMkdir(config.datenDir);
  const zeilen = [KOPF_AUSLEIHEN.slice()];
  for (const eintrag of liste) {
    zeilen.push([
      zellText(eintrag.id),
      zellText(eintrag.mitarbeiterCode),
      zellText(eintrag.mitarbeiterName),
      zellText(eintrag.werkzeugCode),
      zellText(eintrag.werkzeugName),
      zellText(eintrag.zeitstempelAusleihe),
      zellText(eintrag.zeitstempelRueckgabe),
      zellText(eintrag.status),
    ]);
  }
  const buffer = xlsxSchreiben([
    { name: config.blattAusleihen, zeilen, spaltenBreiten: [8, 18, 24, 18, 32, 24, 24, 16] },
  ]);
  fs.writeFileSync(config.ausleiheDatei, buffer);
  return liste.length;
}

function ausleihenHinzufuegen(eintrag) {
  const liste = ausleihenLaden();
  const id = String(naechsteId(liste));
  const neu = {
    id,
    mitarbeiterCode: normiereCode(eintrag.mitarbeiterCode),
    mitarbeiterName: String(eintrag.mitarbeiterName || '').trim(),
    werkzeugCode: normiereCode(eintrag.werkzeugCode),
    werkzeugName: String(eintrag.werkzeugName || '').trim(),
    zeitstempelAusleihe: eintrag.zeitstempelAusleihe || new Date().toISOString(),
    zeitstempelRueckgabe: '',
    status: STATUS_OFFEN,
  };
  liste.push(neu);
  ausleihenSpeichern(liste);
  return neu;
}

/**
 * Findet eine offene Ausleihe anhand des Werkzeug-Barcodes.
 * @returns {object|null}
 */
function offeneAusleiheSuchen(werkzeugCode) {
  const code = normiereCode(werkzeugCode);
  if (!code) return null;
  const treffer = ausleihenLaden().filter(
    (a) => a.werkzeugCode === code && String(a.status).toLowerCase() === STATUS_OFFEN
  );
  // Bei mehrfachem Vorkommen: die älteste offene zuerst
  return treffer.length ? treffer[0] : null;
}

function ausleihenZurueckgeben(id, zeitstempel) {
  const liste = ausleihenLaden();
  const treffer = liste.find((a) => String(a.id) === String(id));
  if (!treffer) return null;
  treffer.status = STATUS_ZURUECK;
  treffer.zeitstempelRueckgabe = zeitstempel || new Date().toISOString();
  ausleihenSpeichern(liste);
  return treffer;
}

function offeneAusleihenLaden() {
  return ausleihenLaden().filter((a) => String(a.status).toLowerCase() === STATUS_OFFEN);
}

function naechsteId(liste) {
  let max = 0;
  for (const a of liste) {
    const n = parseInt(a.id, 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return max + 1;
}

module.exports = {
  KOPF_MITARBEITER,
  KOPF_AUSLEIHEN,
  STATUS_OFFEN,
  STATUS_ZURUECK,
  normiereCode,
  zellText,
  zellDatum,
  mitarbeiterLaden,
  mitarbeiterSpeichern,
  mitarbeiterSuchen,
  mitarbeiterHinzufuegen,
  mitarbeiterAnlegen,
  mitarbeiterAdd,
  ausleihenLaden,
  ausleihenSpeichern,
  ausleihenHinzufuegen,
  ausleihenZurueckgeben,
  offeneAusleiheSuchen,
  offeneAusleihenLaden,
  naechsteId,
};
