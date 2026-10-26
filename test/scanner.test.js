'use strict';
/**
 * Tests der Scanner-Erkennung (Tastatur-Emulation eines HID-Scanners).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { baueDom } = require('./helper/dom');

/** Lädt nur scanner.js in eine Sandbox. */
function ladeScanner() {
    const dokument = baueDom();
    const kontext = { document: dokument, window: {}, console, Date, Math, String, Number, Error, JSON };
    kontext.globalThis = kontext;
    kontext.window = kontext;
    vm.createContext(kontext);
    const code = fs.readFileSync(path.join(__dirname, '..', 'public', 'scanner.js'), 'utf8');
    vm.runInContext(code, kontext, { filename: 'scanner.js' });
    return kontext;
}

/** Simuliert einen Scan: Zeichen schnell nacheinander, dann Enter. */
function scanEmulieren(scanner, code) {
    for (const zeichen of code) {
        scanner.onKeyDown({ key: zeichen, target: { tagName: 'BODY', dataset: {} }, preventDefault() {} });
    }
    scanner.onKeyDown({ key: 'Enter', target: { tagName: 'BODY', dataset: {} }, preventDefault() {} });
}

/** Erzeugt ein KeyboardEvent-Objekt für den Test. */
function keyEvent(key, ziel) {
    return { key, target: ziel || { tagName: 'BODY', dataset: {} }, preventDefault() {} };
}

test('Scanner: schnelle Tastenfolge + Enter liefert den Code', () => {
    const kontext = ladeScanner();
    const scanner = kontext.scanner;
    let erkannt = null;
    scanner.setzeHandler((code) => { erkannt = code; });

    scanEmulieren(scanner, '1001');
    assert.strictEqual(erkannt, '1001');
});

test('Scanner: mehrere Scans hintereinander werden einzeln erkannt', () => {
    const kontext = ladeScanner();
    const scanner = kontext.scanner;
    const codes = [];
    scanner.setzeHandler((code) => codes.push(code));

    scanEmulieren(scanner, '1001');
    scanEmulieren(scanner, 'W500');
    assert.deepEqual(codes, ['1001', 'W500']);
});

test('Scanner: langsame Eingabe (langsamer als maxPause) wird verworfen', () => {
    const kontext = ladeScanner();
    const scanner = kontext.scanner;
    let erkannt = null;
    scanner.setzeHandler((code) => { erkannt = code; });

    // Erster Zeichen
    scanner.onKeyDown(keyEvent('1'));
    // Längerer Zeitabstand als maxPause -> Puffer wird verworfen
    scanner.zeitpunkt = Date.now() - (scanner.maxPause + 50);
    scanner.onKeyDown(keyEvent('0'));
    scanner.onKeyDown(keyEvent('Enter'));

    // Der Puffer enthielt nur "0" (zu kurz) -> kein gültiger Code
    assert.strictEqual(erkannt, null);
});

test('Scanner: Freitextfeld wird nicht abgefangen', () => {
    const kontext = ladeScanner();
    const scanner = kontext.scanner;
    let erkannt = null;
    scanner.setzeHandler((code) => { erkannt = code; });

    const freitext = { tagName: 'INPUT', dataset: { keinScanner: 'true' }, value: '' };
    for (const zeichen of 'ABC') {
        scanner.onKeyDown(keyEvent(zeichen, freitext));
    }
    scanner.onKeyDown(keyEvent('Enter', freitext));

    assert.strictEqual(erkannt, null);
});

test('Scanner: Enter im Code-Feld nutzt den manuellen Feldwert', () => {
    const kontext = ladeScanner();
    const scanner = kontext.scanner;
    let erkannt = null;
    scanner.setzeHandler((code) => { erkannt = code; });

    scanner.onKeyDown(keyEvent('Enter', { tagName: 'INPUT', dataset: {}, value: '7777' }));
    assert.strictEqual(erkannt, '7777');
});

test('Scanner: Code wird getrimmt', () => {
    const kontext = ladeScanner();
    const scanner = kontext.scanner;
    let erkannt = null;
    scanner.setzeHandler((code) => { erkannt = code; });

    scanner.onKeyDown(keyEvent('Enter', { tagName: 'INPUT', dataset: {}, value: '  W500  ' }));
    assert.strictEqual(erkannt, 'W500');
});
