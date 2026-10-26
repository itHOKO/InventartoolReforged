'use strict';
/**
 * Tests für die XLSX-Bibliothek (Rundreise: schreiben → lesen).
 */
const test = require('node:test');
const assert = require('node:assert');
const { xlsxSchreiben, xlsxLesen } = require('../src/lib/xlsx');
const { zipSchreiben, zipLesen } = require('../src/lib/zip');

test('zip: schreiben und lesen liefert denselben Inhalt', () => {
    const dateien = [
        { name: 'a.txt', data: Buffer.from('Hallo Welt', 'utf8') },
        { name: 'ordner/b.txt', data: Buffer.from('Zweite Datei', 'utf8') },
    ];
    const buffer = zipSchreiben(dateien);
    const gelesen = zipLesen(buffer);
    assert.strictEqual(gelesen.length, 2);
    assert.strictEqual(gelesen[0].name, 'a.txt');
    assert.strictEqual(gelesen[0].data.toString('utf8'), 'Hallo Welt');
    assert.strictEqual(gelesen[1].name, 'ordner/b.txt');
    assert.strictEqual(gelesen[1].data.toString('utf8'), 'Zweite Datei');
});

test('xlsx: rundreise mit Texten, Zahlen und mehreren Blaettern', () => {
    const blaetter = [
        {
            name: 'Mitarbeiter',
            zeilen: [['Barcode', 'Name'], ['1001', 'Max Mustermann'], ['1002', 'Erika Musterfrau']],
        },
        {
            name: 'Ausleihen',
            zeilen: [['ID', 'Werkzeug', 'Anzahl'], ['1', 'Akkubohrschrauber', 3]],
        },
    ];

    const gelesen = xlsxLesen(xlsxSchreiben(blaetter));

    assert.strictEqual(gelesen.length, 2);
    assert.strictEqual(gelesen[0].name, 'Mitarbeiter');
    assert.deepStrictEqual(gelesen[0].zeilen[0], ['Barcode', 'Name']);
    assert.deepStrictEqual(gelesen[0].zeilen[1], ['1001', 'Max Mustermann']);
    assert.deepStrictEqual(gelesen[0].zeilen[2], ['1002', 'Erika Musterfrau']);

    assert.strictEqual(gelesen[1].name, 'Ausleihen');
    assert.strictEqual(gelesen[1].zeilen[1][1], 'Akkubohrschrauber');
    assert.strictEqual(gelesen[1].zeilen[1][2], 3);
});

test('xlsx: Sonderzeichen werden korrekt escaped und wiederhergestellt', () => {
    const zeilen = [['Text'], ['Wert & <später> "Anführungszeichen"']];
    const gelesen = xlsxLesen(xlsxSchreiben([{ name: 'Test', zeilen }]));
    assert.strictEqual(gelesen[0].zeilen[1][0], 'Wert & <später> "Anführungszeichen"');
});

test('xlsx: leere Zellen bleiben beim Lesen leer', () => {
    const zeilen = [['A', 'B', 'C'], ['nur-a', '', 'nur-c']];
    const gelesen = xlsxLesen(xlsxSchreiben([{ name: 'Test', zeilen }]));
    assert.strictEqual(gelesen[0].zeilen[1][0], 'nur-a');
    assert.strictEqual(gelesen[0].zeilen[1][1], '');
    assert.strictEqual(gelesen[0].zeilen[1][2], 'nur-c');
});
