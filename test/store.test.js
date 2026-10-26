'use strict';
/**
 * Tests für die Datenschicht (Store) mit isoliertem Datenverzeichnis.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Datenverzeichnis vor dem Laden des Stores umbiegen
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'werkzeugausleihe-test-'));
process.env.DATEN_DIR = tempDir;

const store = require('../src/store');

test.after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
});

test('store: Mitarbeiterliste speichern und laden', () => {
    store.mitarbeiterSpeichern([
        { barcode: '1001', name: 'Max Mustermann' },
        { barcode: '1002', name: 'Erika Musterfrau' },
    ]);

    const geladen = store.mitarbeiterLaden();
    assert.strictEqual(geladen.length, 2);
    assert.deepStrictEqual(geladen[0], { barcode: '1001', name: 'Max Mustermann' });
    assert.deepStrictEqual(store.mitarbeiterSuchen('1002'), {
        barcode: '1002',
        name: 'Erika Musterfrau',
    });
});

test('store: unbekannter Mitarbeiter liefert null', () => {
    assert.strictEqual(store.mitarbeiterSuchen('9999'), null);
    assert.strictEqual(store.mitarbeiterSuchen(''), null);
});

test('store: Ausleihe anlegen erzeugt offenen Datensatz mit Zeitstempel', () => {
    store.ausleihenSpeichern([]);
    const eintrag = store.ausleihenHinzufuegen({
        mitarbeiterCode: '1001',
        mitarbeiterName: 'Max Mustermann',
        werkzeugCode: 'W500',
        werkzeugName: 'Akkubohrschrauber',
    });

    assert.strictEqual(eintrag.status, store.STATUS_OFFEN);
    assert.strictEqual(eintrag.zeitstempelRueckgabe, '');
    assert.ok(eintrag.zeitstempelAusleihe.length > 0);

    const offen = store.offeneAusleihenLaden();
    assert.strictEqual(offen.length, 1);
    assert.strictEqual(offen[0].werkzeugCode, 'W500');
    assert.strictEqual(offen[0].mitarbeiterName, 'Max Mustermann');
});

test('store: Rueckgabe setzt Status und Zeitstempel', () => {
    const eintrag = store.offeneAusleiheSuchen('W500');
    assert.ok(eintrag);

    const zurueck = store.ausleihenZurueckgeben(eintrag.id);
    assert.strictEqual(zurueck.status, store.STATUS_ZURUECK);
    assert.ok(zurueck.zeitstempelRueckgabe.length > 0);

    assert.strictEqual(store.offeneAusleiheSuchen('W500'), null);
    assert.strictEqual(store.offeneAusleihenLaden().length, 0);
});

test('store: zweites Ausleihen desselben Mitarbeiters erhaelt eigene ID', () => {
    const zweiter = store.ausleihenHinzufuegen({
        mitarbeiterCode: '1001',
        mitarbeiterName: 'Max Mustermann',
        werkzeugCode: 'W501',
        werkzeugName: 'Zollstock',
    });
    const erster = store.ausleihenLaden().find((a) => a.werkzeugCode === 'W500');

    assert.notStrictEqual(String(zweiter.id), String(erster.id));
    assert.strictEqual(store.offeneAusleihenLaden().length, 1);
});

test('store: Datensätze bleiben über einen Neustart hinweg erhalten', () => {
    // simulates a reload: same files, fresh read
    const geladen = store.ausleihenLaden();
    assert.strictEqual(geladen.length, 2);
    assert.ok(geladen.some((a) => a.werkzeugCode === 'W501' && a.status === store.STATUS_OFFEN));
});

test('store: Barcodes werden getrimmt und Groß-/Kleinschreibung bleibt erhalten', () => {
    store.mitarbeiterSpeichern([{ barcode: '  ab12 ', name: ' Test Person ' }]);
    const treffer = store.mitarbeiterSuchen('ab12');
    assert.ok(treffer);
    assert.strictEqual(treffer.barcode, 'ab12');
    assert.strictEqual(treffer.name, 'Test Person');
});
