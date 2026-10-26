'use strict';
/**
 * Erzeugt die Start-Excel-Dateien:
 *   daten/Mitarbeiter.xlsx  – Beispieldaten zum Testen
 *   daten/Ausleihen.xlsx    – leere Ausleih-Liste
 *
 * Aufruf:  node scripts/init-data.js
 */
const fs = require('fs');
const path = require('path');
const config = require('../src/config');
const store = require('../src/store');

const BEISPIEL_MITARBEITER = [
    { barcode: '1001', name: 'Max Mustermann' },
    { barcode: '1002', name: 'Erika Musterfrau' },
    { barcode: '1003', name: 'Thomas Schmidt' },
    { barcode: '1004', name: 'Julia Weber' },
    { barcode: '1005', name: 'Andreas Becker' },
];

function main() {
    fs.mkdirSync(config.datenDir, { recursive: true });

    const anzahlMitarbeiter = store.mitarbeiterSpeichern(BEISPIEL_MITARBEITER);
    console.log('Mitarbeiter.xlsx geschrieben (' + anzahlMitarbeiter + ' Mitarbeiter): ' + config.mitarbeiterDatei);

    if (!fs.existsSync(config.ausleiheDatei)) {
        store.ausleihenSpeichern([]);
        console.log('Ausleihen.xlsx geschrieben (leer): ' + config.ausleiheDatei);
    } else {
        console.log('Ausleihen.xlsx existiert bereits – nicht überschrieben.');
    }

    // CSV-Kopien für den Import in andere Systeme bereitstellen
    const csvDir = path.join(config.wurzel, 'daten', 'csv');
    fs.mkdirSync(csvDir, { recursive: true });
    const csv = BEISPIEL_MITARBEITER.map((m) => m.barcode + ',' + m.name).join('\n');
    fs.writeFileSync(path.join(csvDir, 'Mitarbeiter.csv'), 'barcode,name\n' + csv + '\n', 'utf8');
    console.log('CSV-Beispiel geschrieben: ' + path.join(csvDir, 'Mitarbeiter.csv'));
}

main();
