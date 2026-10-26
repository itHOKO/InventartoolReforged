'use strict';
/**
 * Tests der Frontend-Logik (Scan-Ablauf, Pflichtfeld-Validierung).
 * Läuft ohne Browser über einen minimalen DOM-Stub.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { baueDom } = require('./helper/dom');

// Server-Verhalten simulieren (kein echter HTTP-Server nötig)
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'werkzeugausleihe-front-'));
process.env.DATEN_DIR = tempDir;

const store = require('../src/store');

store.mitarbeiterSpeichern([
    { barcode: '1001', name: 'Max Mustermann' },
    { barcode: '1002', name: 'Erika Musterfrau' },
]);
store.ausleihenSpeichern([]);

/** Lädt die Frontend-Skripte in einen Sandbox-Kontext mit DOM-Stub. */
function ladeFrontend() {
    const dokument = baueDom();
    const kontext = {
        document: dokument,
        window: {},
        console,
        setTimeout,
        clearTimeout,
        Date,
        Math,
        JSON,
        Number,
        String,
        Error,
        Promise,
        fetch: async () => { throw new Error('kein Netzwerk im Test'); },
    };
    kontext.globalThis = kontext;
    vm.createContext(kontext);
    // Im Browser ist window === globalThis – im Sandbox muss das nachgebildet werden
    kontext.window = kontext;

    const basis = path.join(__dirname, '..', 'public');
    for (const datei of ['api.js', 'scanner.js', 'ui.js', 'app.js']) {
        const code = fs.readFileSync(path.join(basis, datei), 'utf8');
        vm.runInContext(code, kontext, { filename: datei });
    }
    return { kontext, dokument };
}

/** Ersetzt die API-Methoden durch Attrappen. */
function stubApi(kontext, verhalten) {
    kontext.api.anfrage = async (methode, pfad, body) => {
        const schluessel = methode + ' ' + pfad;
        if (verhalten[schluessel]) return verhalten[schluessel](body);
        throw new Error('Unerwarteter Aufruf: ' + schluessel);
    };
}

/** Setzt den Wert eines Eingabefeldes im Stub-DOM. */
function setzeFeld(kontext, id, wert) {
    kontext.document.getElementById(id).value = wert;
}

test.after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
});

test('Frontend: Mitarbeiter-Scan füllt die Anzeige und aktiviert den Weiter-Button', async () => {
    const { kontext, dokument } = ladeFrontend();
    stubApi(kontext, {
        'GET /api/status': () => ({ mitarbeiterAnzahl: 2 }),
        'POST /api/mitarbeiter/suchen': (body) => {
            assert.strictEqual(body.barcode, '1001');
            return { barcode: '1001', name: 'Max Mustermann' };
        },
    });

    const app = kontext.app;
    app.schritt = 'ausleihen-mitarbeiter';
    await app.onScan('1001');

    assert.strictEqual(dokument.getElementById('anzeige-mitarbeiter-name').textContent, 'Max Mustermann');
    assert.strictEqual(dokument.getElementById('anzeige-mitarbeiter-barcode').textContent, '1001');
    assert.strictEqual(dokument.getElementById('btn-zu-schritt2').disabled, false);
    assert.strictEqual(app.mitarbeiter.name, 'Max Mustermann');
});

test('Frontend: unbekannter Mitarbeiter löst einen Fehler aus und blockiert', async () => {
    const { kontext, dokument } = ladeFrontend();
    stubApi(kontext, {
        'GET /api/status': () => ({ mitarbeiterAnzahl: 2 }),
        'POST /api/mitarbeiter/suchen': () => {
            throw new Error('Mitarbeiter mit Barcode "9999" wurde nicht gefunden.');
        },
    });

    const app = kontext.app;
    app.schritt = 'ausleihen-mitarbeiter';
    await app.onScan('9999');

    assert.strictEqual(app.mitarbeiter, null);
    assert.strictEqual(dokument.getElementById('btn-zu-schritt2').disabled, true);
    assert.ok(kontext.ui.aktuelleMeldungText.includes('9999'));
});

test('Frontend: Ausleihe ohne Beschreibung wird blockiert', async () => {
    const { kontext } = ladeFrontend();
    let aufgerufen = false;
    stubApi(kontext, {
        'GET /api/status': () => ({ mitarbeiterAnzahl: 2 }),
        'POST /api/ausleihen': () => { aufgerufen = true; return {}; },
    });

    const app = kontext.app;
    app.schritt = 'ausleihen-werkzeug';
    app.mitarbeiter = { barcode: '1001', name: 'Max Mustermann' };
    app.werkzeugCode = 'W500';
    setzeFeld(kontext, 'input-werkzeug-name', '   ');

    await app.bestaetigeAusleihe();
    assert.strictEqual(aufgerufen, false);
    assert.ok(kontext.ui.aktuelleMeldungText.includes('beschreiben'));
});

test('Frontend: Ausleihe ohne Werkzeugcode wird blockiert', async () => {
    const { kontext } = ladeFrontend();
    let aufgerufen = false;
    stubApi(kontext, {
        'GET /api/status': () => ({ mitarbeiterAnzahl: 2 }),
        'POST /api/ausleihen': () => { aufgerufen = true; return {}; },
    });

    const app = kontext.app;
    app.schritt = 'ausleihen-werkzeug';
    app.mitarbeiter = { barcode: '1001', name: 'Max Mustermann' };
    app.werkzeugCode = '';

    await app.bestaetigeAusleihe();
    assert.strictEqual(aufgerufen, false);
    assert.ok(kontext.ui.aktuelleMeldungText.includes('Werkzeug-Barcode'));
});

test('Frontend: gueltige Ausleihe wird an den Server gesendet', async () => {
    const { kontext } = ladeFrontend();
    let gesendet = null;
    stubApi(kontext, {
        'GET /api/status': () => ({ mitarbeiterAnzahl: 2 }),
        'POST /api/ausleihen': (body) => {
            gesendet = body;
            return {
                eintrag: {
                    id: '1', mitarbeiterCode: body.mitarbeiterCode,
                    mitarbeiterName: 'Max Mustermann', werkzeugCode: body.werkzeugCode,
                    werkzeugName: body.werkzeugName, status: 'offen',
                },
            };
        },
    });

    const app = kontext.app;
    app.schritt = 'ausleihen-werkzeug';
    app.mitarbeiter = { barcode: '1001', name: 'Max Mustermann' };
    app.werkzeugCode = 'W500';
    setzeFeld(kontext, 'input-werkzeug-name', 'Akkubohrschrauber');

    await app.bestaetigeAusleihe();
    // Das Objekt stammt aus der VM-Sandbox (anderer Prototyp) -> strukturell vergleichen
    assert.deepEqual(Object.assign({}, gesendet), {
        mitarbeiterCode: '1001',
        werkzeugCode: 'W500',
        werkzeugName: 'Akkubohrschrauber',
    });
});

test('Frontend: Rueckgabe-Scan ohne offene Ausleihe blockiert die Bestaetigung', async () => {
    const { kontext, dokument } = ladeFrontend();
    stubApi(kontext, {
        'GET /api/status': () => ({ mitarbeiterAnzahl: 2 }),
        'POST /api/ausleihen/rueckgabe': () => {
            throw new Error('Für den Barcode "XYZ" wurde keine offene Ausleihe gefunden.');
        },
    });

    const app = kontext.app;
    app.schritt = 'zurueckgeben';
    await app.onScan('XYZ');

    assert.strictEqual(app.rueckgabeEintrag, null);
    assert.strictEqual(dokument.getElementById('btn-bestaetigen-rueckgabe').disabled, true);
});

test('Frontend: Rueckgabe-Scan fuellt die Anzeige und aktiviert die Bestaetigung', async () => {
    const { kontext, dokument } = ladeFrontend();
    stubApi(kontext, {
        'GET /api/status': () => ({ mitarbeiterAnzahl: 2 }),
        'POST /api/ausleihen/rueckgabe': () => ({
            eintrag: {
                id: '7', mitarbeiterCode: '1001', mitarbeiterName: 'Max Mustermann',
                werkzeugCode: 'W500', werkzeugName: 'Akkubohrschrauber',
                zeitstempelAusleihe: '2026-01-05T08:12:00.000Z', status: 'offen',
            },
        }),
    });

    const app = kontext.app;
    app.schritt = 'zurueckgeben';
    await app.onScan('W500');

    assert.strictEqual(dokument.getElementById('anzeige-rueckgabe-mitarbeiter').textContent, 'Max Mustermann');
    assert.strictEqual(dokument.getElementById('anzeige-rueckgabe-werkzeug').textContent, 'Akkubohrschrauber');
    assert.strictEqual(dokument.getElementById('btn-bestaetigen-rueckgabe').disabled, false);
    assert.strictEqual(app.rueckgabeEintrag.id, '7');
});

test('Frontend: Dauer- und Zeitpunktformatierung', () => {
    const { kontext } = ladeFrontend();
    const ui = kontext.ui;
    assert.strictEqual(ui.dauer(''), '');
    assert.ok(ui.dauer(new Date(Date.now() - 3600000).toISOString()).includes('Std.'));
    assert.ok(ui.zeitpunkt('2026-01-05T08:12:00.000Z').includes('2026'));
});
