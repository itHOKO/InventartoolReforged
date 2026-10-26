'use strict';
/**
 * Tests für die HTTP-API (echter Server auf einem freien Port).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'werkzeugausleihe-api-'));
process.env.DATEN_DIR = tempDir;

const store = require('../src/store');
const { erstelleServer } = require('../src/server');

let server;
let basisUrl;

test.before(async () => {
    store.mitarbeiterSpeichern([
        { barcode: '1001', name: 'Max Mustermann' },
        { barcode: '1002', name: 'Erika Musterfrau' },
    ]);
    store.ausleihenSpeichern([]);

    server = erstelleServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    basisUrl = 'http://127.0.0.1:' + server.address().port;
});

test.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(tempDir, { recursive: true, force: true });
});

async function get(pfad) {
    const antwort = await fetch(basisUrl + pfad);
    return { status: antwort.status, daten: await antwort.json() };
}

async function post(pfad, body) {
    const antwort = await fetch(basisUrl + pfad, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
    });
    return { status: antwort.status, daten: await antwort.json() };
}

test('API: Status liefert die Kennzahlen', async () => {
    const { status, daten } = await get('/api/status');
    assert.strictEqual(status, 200);
    assert.strictEqual(daten.ok, true);
    assert.strictEqual(daten.mitarbeiterAnzahl, 2);
    assert.strictEqual(daten.offeneAnzahl, 0);
});

test('API: unbekannter Mitarbeiter liefert 404 mit Fehlermeldung', async () => {
    const { status, daten } = await post('/api/mitarbeiter/suchen', { barcode: '9999' });
    assert.strictEqual(status, 404);
    assert.strictEqual(daten.ok, false);
    assert.ok(daten.fehler.includes('9999'));
});

test('API: bekannter Mitarbeiter wird gefunden', async () => {
    const { status, daten } = await post('/api/mitarbeiter/suchen', { barcode: '1001' });
    assert.strictEqual(status, 200);
    assert.strictEqual(daten.name, 'Max Mustermann');
});

test('API: Ausleihe ohne Beschreibung wird abgelehnt', async () => {
    const { status, daten } = await post('/api/ausleihen', {
        mitarbeiterCode: '1001',
        werkzeugCode: 'W900',
        werkzeugName: '   ',
    });
    assert.strictEqual(status, 400);
    assert.ok(daten.fehler.toLowerCase().includes('beschreiben'));
});

test('API: Ausleihe ohne Mitarbeiter wird abgelehnt', async () => {
    const { status } = await post('/api/ausleihen', {
        mitarbeiterCode: '',
        werkzeugCode: 'W900',
        werkzeugName: 'Bohrhammer',
    });
    assert.strictEqual(status, 400);
});

test('API: Ausleihe wird angelegt und landet in der Excel-Datei', async () => {
    const { status, daten } = await post('/api/ausleihen', {
        mitarbeiterCode: '1001',
        werkzeugCode: 'W900',
        werkzeugName: 'Bohrhammer',
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(daten.eintrag.status, 'offen');
    assert.strictEqual(daten.eintrag.mitarbeiterName, 'Max Mustermann');

    const offen = await get('/api/ausleihen/offen');
    assert.strictEqual(offen.daten.ausleihen.length, 1);
    assert.strictEqual(offen.daten.ausleihen[0].werkzeugCode, 'W900');
});

test('API: dasselbe Werkzeug doppelt ausleihen wird mit 409 abgelehnt', async () => {
    const { status, daten } = await post('/api/ausleihen', {
        mitarbeiterCode: '1002',
        werkzeugCode: 'W900',
        werkzeugName: 'Bohrhammer',
    });
    assert.strictEqual(status, 409);
    assert.ok(daten.fehler.includes('Max Mustermann'));
});

test('API: Rueckgabe eines unbekannten Codes liefert 404', async () => {
    const { status } = await post('/api/ausleihen/rueckgabe', { werkzeugCode: 'UNBEKANNT' });
    assert.strictEqual(status, 404);
});

test('API: Rueckgabe wird bestaetigt und schliesst die Ausleihe', async () => {
    const suche = await post('/api/ausleihen/rueckgabe', { werkzeugCode: 'W900' });
    assert.strictEqual(suche.status, 200);

    const id = suche.daten.eintrag.id;
    const bestaetigung = await post('/api/ausleihen/rueckgabe/bestaetigen', { id });
    assert.strictEqual(bestaetigung.status, 200);
    assert.strictEqual(bestaetigung.daten.eintrag.status, 'zurueckgegeben');
    assert.ok(bestaetigung.daten.eintrag.zeitstempelRueckgabe.length > 0);

    const offen = await get('/api/ausleihen/offen');
    assert.strictEqual(offen.daten.ausleihen.length, 0);
});

test('API: Mitarbeiterliste speichern dedupliziert Barcodes', async () => {
    const { status, daten } = await post('/api/mitarbeiter/speichern', {
        mitarbeiter: [
            { barcode: '2000', name: 'Anna' },
            { barcode: '2000', name: 'Anna doppelt' },
            { barcode: '', name: 'ohne Code' },
            { barcode: '2001', name: 'Bernd' },
        ],
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(daten.anzahl, 2);

    const liste = await get('/api/mitarbeiter');
    assert.strictEqual(liste.daten.mitarbeiter.length, 2);
});

test('API: statisches Frontend wird ausgeliefert', async () => {
    const antwort = await fetch(basisUrl + '/');
    assert.strictEqual(antwort.status, 200);
    const html = await antwort.text();
    assert.ok(html.includes('Werkzeugausleihe'));
});
