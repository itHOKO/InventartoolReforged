'use strict';
/**
 * Leichtgewichtiger HTTP-Server ohne externe Abhängigkeiten.
 * Liefert das statische Frontend aus /public aus und stellt die JSON-API bereit.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const store = require('./store');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

function jsonAntwort(res, status, daten) {
  const body = JSON.stringify(daten);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function liesBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let groesse = 0;
    req.on('data', (chunk) => {
      groesse += chunk.length;
      if (groesse > 5 * 1024 * 1024) {
        reject(new Error('Anfrage zu groß'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function leseJson(req) {
  const text = await liesBody(req);
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error('Ungültiges JSON im Request-Body');
  }
}

function statischeDatei(res, urlPfad) {
  const relativ = urlPfad === '/' ? 'index.html' : decodeURIComponent(urlPfad).replace(/^\/+/, '');
  const basis = path.resolve(config.publicDir);
  const ziel = path.join(basis, relativ);
  // Pfad-Traversal verhindern
  if (!ziel.startsWith(basis)) {
    jsonAntwort(res, 403, { fehler: 'Zugriff verweigert' });
    return;
  }
  fs.stat(ziel, (err, stat) => {
    if (err || !stat.isFile()) {
      jsonAntwort(res, 404, { fehler: 'Nicht gefunden' });
      return;
    }
    const typ = MIME[path.extname(ziel).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': typ, 'Cache-Control': 'no-cache' });
    fs.createReadStream(ziel).pipe(res);
  });
}

// ------------------------------------------------------------------
// API-Handler
// ------------------------------------------------------------------

function apiFehler(text, status) {
  const fehler = new Error(text);
  fehler.status = status || 400;
  return fehler;
}

const api = {
  'GET /api/status': async () => ({
    ok: true,
    mitarbeiterDatei: config.mitarbeiterDatei,
    ausleiheDatei: config.ausleiheDatei,
    mitarbeiterAnzahl: store.mitarbeiterLaden().length,
    ausleiheAnzahl: store.ausleihenLaden().length,
    offeneAnzahl: store.offeneAusleihenLaden().length,
  }),

  'GET /api/mitarbeiter': async () => ({ mitarbeiter: store.mitarbeiterLaden() }),

  'POST /api/mitarbeiter/suchen': async (req) => {
    const { barcode } = await leseJson(req);
    const treffer = store.mitarbeiterSuchen(barcode);
    if (!treffer) {
      throw apiFehler(`Mitarbeiter mit Barcode "${barcode}" wurde nicht gefunden.`, 404);
    }
    return treffer;
  },

  'POST /api/mitarbeiter/speichern': async (req) => {
    const { mitarbeiter } = await leseJson(req);
    if (!Array.isArray(mitarbeiter)) {
      throw apiFehler('Es wurde keine gültige Mitarbeiterliste übergeben.', 400);
    }
    const sauber = [];
    const gesehen = new Set();
    for (const eintrag of mitarbeiter) {
      const barcode = store.normiereCode(eintrag.barcode);
      const name = String(eintrag.name || '').trim();
      if (!barcode || !name) continue;
      if (gesehen.has(barcode)) continue;
      gesehen.add(barcode);
      sauber.push({ barcode, name });
    }
    store.mitarbeiterSpeichern(sauber);
    return { anzahl: sauber.length };
  },

  'POST /api/mitarbeiter/hinzufuegen': async (req) => {
    const daten = await leseJson(req);
    const barcode = store.normiereCode(daten.barcode);
    const name = String(daten.name || '').trim();
    if (!name) throw apiFehler('Bitte den Namen des Mitarbeiters eingeben (Pflichtfeld).', 400);
    if (!barcode) throw apiFehler('Es wurde keine Mitarbeiterkarte gescannt.', 400);
    const vorhanden = store.mitarbeiterSuchen(barcode);
    if (vorhanden) {
      throw apiFehler(
        `Mitarbeiterkarte "${barcode}" ist bereits ${vorhanden.name} zugeordnet.`,
        409
      );
    }
    const mitarbeiter = store.mitarbeiterHinzufuegen({ barcode, name });
    if (!mitarbeiter) {
      throw apiFehler(`Mitarbeiterkarte "${barcode}" ist bereits zugeordnet.`, 409);
    }
    return { mitarbeiter };
  },
  // Alias-Routen
  'POST /api/mitarbeiter/hinzufügen': async (req) => api['POST /api/mitarbeiter/hinzufuegen'](req),
  'POST /api/mitarbeiter/neu': async (req) => api['POST /api/mitarbeiter/hinzufuegen'](req),
  'POST /api/mitarbeiter/add': async (req) => api['POST /api/mitarbeiter/hinzufuegen'](req),

  'POST /api/ausleihen': async (req) => {
    const daten = await leseJson(req);
    const werkzeugCode = store.normiereCode(daten.werkzeugCode);
    const werkzeugName = String(daten.werkzeugName || '').trim();
    const mitarbeiterCode = store.normiereCode(daten.mitarbeiterCode);

    if (!mitarbeiterCode) throw apiFehler('Es wurde kein Mitarbeiter erfasst.', 400);
    if (!werkzeugCode) throw apiFehler('Es wurde kein Werkzeug-Barcodes erfasst.', 400);
    if (!werkzeugName) throw apiFehler('Bitte das Werkzeug beschreiben (Pflichtfeld).', 400);

    const mitarbeiter = store.mitarbeiterSuchen(mitarbeiterCode);
    if (!mitarbeiter) {
      throw apiFehler(`Mitarbeiter mit Barcode "${mitarbeiterCode}" wurde nicht gefunden.`, 404);
    }

    const bereitsOffen = store.offeneAusleiheSuchen(werkzeugCode);
    if (bereitsOffen) {
      throw apiFehler(
        `Werkzeug "${werkzeugCode}" ist bereits an ${bereitsOffen.mitarbeiterName} ausgeliehen.`,
        409
      );
    }

    const eintrag = store.ausleihenHinzufuegen({
      mitarbeiterCode,
      mitarbeiterName: mitarbeiter.name,
      werkzeugCode,
      werkzeugName,
    });
    return { eintrag };
  },

  'GET /api/ausleihen/offen': async () => ({ ausleihen: store.offeneAusleihenLaden() }),

  'GET /api/ausleihen': async () => ({ ausleihen: store.ausleihenLaden() }),

  'POST /api/ausleihen/rueckgabe': async (req) => {
    const { werkzeugCode } = await leseJson(req);
    const offen = store.offeneAusleiheSuchen(werkzeugCode);
    if (!offen) {
      throw apiFehler(
        `Für den Barcode "${store.normiereCode(werkzeugCode)}" wurde keine offene Ausleihe gefunden.`,
        404
      );
    }
    return { eintrag: offen };
  },

  'POST /api/ausleihen/rueckgabe/bestaetigen': async (req) => {
    const { id } = await leseJson(req);
    const eintrag = store.ausleihenZurueckgeben(id);
    if (!eintrag) throw apiFehler('Der Datensatz konnte nicht gefunden werden.', 404);
    return { eintrag };
  },
};

function erstelleServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const schluessel = `${req.method} ${url.pathname}`;

    if (api[schluessel]) {
      try {
        const daten = await api[schluessel](req, url);
        jsonAntwort(res, 200, { ok: true, ...daten });
      } catch (err) {
        const status = err.status || 500;
        if (status >= 500) console.error('Serverfehler:', err);
        jsonAntwort(res, status, { ok: false, fehler: err.message || 'Unbekannter Fehler' });
      }
      return;
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      statischeDatei(res, url.pathname);
      return;
    }

    jsonAntwort(res, 405, { ok: false, fehler: 'Methode nicht erlaubt' });
  });
}

if (require.main === module) {
  const server = erstelleServer();
  server.listen(config.port, config.host, () => {
    console.log('Werkzeugausleihe läuft auf http://' + config.host + ':' + config.port);
    console.log('Mitarbeiter-Datei: ' + config.mitarbeiterDatei);
    console.log('Ausleihen-Datei:   ' + config.ausleiheDatei);
  });
}

module.exports = { erstelleServer };
