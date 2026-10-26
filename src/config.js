'use strict';
const path = require('path');

const wurzel = path.resolve(__dirname, '..');

module.exports = {
  wurzel,
  port: Number(process.env.PORT) || 3000,
  host: process.env.HOST || '127.0.0.1',
  // Datenverzeichnis (Excel-Dateien)
  datenDir: process.env.DATEN_DIR || path.join(wurzel, 'daten'),
  // Statische Dateien des Frontends
  publicDir: path.join(wurzel, 'public'),
  get mitarbeiterDatei() {
    return path.join(this.datenDir, 'Mitarbeiter.xlsx');
  },
  get ausleiheDatei() {
    return path.join(this.datenDir, 'Ausleihen.xlsx');
  },
  blattMitarbeiter: 'Mitarbeiter',
  blattAusleihen: 'Ausleihen',
};
