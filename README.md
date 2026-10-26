# Werkzeugausleihe

Lokale Werkzeugausleihe mit Barcode-Scanner. Das Frontend läuft im Browser,
ein schlanker Node-Server schreibt direkt in die Excel-Dateien.

```
Browser (Scanner)  ──HTTP/JSON──▶  Node-Server  ──▶  daten/Mitarbeiter.xlsx
                                                  └──▶  daten/Ausleihen.xlsx
```

## Schnellstart

```bash
npm run init-data   # Start-Excel-Dateien mit Beispieldaten anlegen
npm start           # Server auf http://127.0.0.1:3000 starten
```

Anschließend `http://127.0.0.1:3000` im Browser öffnen.
Der Server bindet nur an `127.0.0.1` – er ist damit ausschließlich lokal nutzbar.

## Bedienung

| Schritt | Aktion |
|---|---|
| **Ausleihen** | Mitarbeiterkarte scannen → Name wird angezeigt → Werkzeug scannen → Beschreibung eintippen → *Bestätigen* |
| **Zurückgeben** | Barcode des Werkzeugs scennen → Angaben zur offenen Ausleihe werden angezeigt → *Rückgabe bestätigen* |
| **Nicht zurückgegebene Werkzeuge** | Liste aller offenen Ausleihen mit Mitarbeiter, Werkzeug und Dauer |
| **Mitarbeiterliste verwalten** | Liste als CSV/Tab-getrennt pflegen, wird nach `Mitarbeiter.xlsx` geschrieben |

Jede Ausleihe betrifft **ein** Werkzeug. Ein Mitarbeiter kann beliebig oft
nacheinander ausleihen und damit mehrere Werkzeuge gleichzeitig offen haben.

Barcodes brauchen **kein Präfix** – der Kontext (Mitarbeiter oder Werkzeug)
ergibt sich aus dem aktuellen Schritt. Die Oberfläche zeigt deshalb an,
welcher Barcode gerade erwartet wird.

## Datenformat

### `daten/Mitarbeiter.xlsx` – Blatt „Mitarbeiter"

| Barcode | Name |
|---|---|
| 1001 | Max Mustermann |

### `daten/Ausleihen.xlsx` – Blatt „Ausleihen"

| ID | Mitarbeiter-Code | Mitarbeiter-Name | Werkzeug-Code | Werkzeug-Beschreibung | Ausleihe-Zeitstempel | Rueckgabe-Zeitstempel | Status |
|---|---|---|---|---|---|---|---|
| 1 | 1001 | Max Mustermann | W500 | Akkubohrschrauber 18V | 2026-01-05T08:12:00.000Z | | offen |

- `Status`: `offen` oder `zurueckgegeben`
- Zeitstempel: ISO-8601 (UTC). Beim Zurückgeben wird der bestehende Datensatz
  **ergänzt**, nicht überschrieben – die Historie bleibt erhalten.
- Der Mitarbeitername wird beim Ausleihen aus der Mitarbeiterliste **aufgelöst**
  und mitgeschrieben. Danach wird der Code nur noch angezeigt.

## Projektstruktur

```
werkzeugausleihe/
├── package.json
├── public/                  Frontend (Vanilla HTML/CSS/JS)
│   ├── index.html
│   ├── style.css
│   ├── api.js               JSON-API-Kapselung
│   ├── scanner.js           Barcode-Erkennung (HID-Scanner)
│   ├── ui.js                Navigation, Meldungen, Formatierung
│   └── app.js               Ablaufsteuerung
├── src/                     Backend (Node, ohne Abhängigkeiten)
│   ├── server.js            HTTP-Server + JSON-API
│   ├── store.js             Lesen/Schreiben der Excel-Dateien
│   ├── config.js            Pfade und Konfiguration
│   └── lib/
│       ├── zip.js           Minimaler ZIP-Leser/-Schreiber
│       └── xlsx.js          Minimaler XLSX-Leser/-Schreiber
├── scripts/init-data.js     Start-Dateien erzeugen
├── test/                    Tests (Node Test Runner)
│   ├── xlsx.test.js
│   ├── store.test.js
│   ├── api.test.js
│   ├── frontend.test.js
│   ├── scanner.test.js
│   └── helper/dom.js        Minimaler DOM-Stub für Frontend-Tests
└── daten/                   Excel-Dateien (werden zur Laufzeit erzeugt)
```

## Technische Entscheidungen

- **Keine externen Abhängigkeiten.** ZIP- und XLSX-Verarbeitung sind als kleine
  Module selbst implementiert (`src/lib/`). Dadurch `npm install` nicht nötig
  und keine Aktualisierungs-Risiken.
- **Echte `.xlsx`-Dateien.** Kein CSV-Umweg, keine Umbenennung. Die Dateien
  sind direkt mit Excel/LibreOffice zu öffnen.
- **Eigener XLSX-Writer.** Excel akzeptiert die erzeugten Dateien ohne
  Reparaturhinweis (geprüft mit `openpyxl` und XML-Validierung).
- **Frontend ohne Framework.** Vanilla JS hält die App wartbar und startet
  ohne Build-Schritt.

## Scanner-Anbindung

Unterstützt werden alle **USB/HID-Barcode-Scanner**, die sich wie eine
Tastatur verhalten (Standardfall). Erkannt wird ein Scan anhand des
Tasten-Takts: die Zeichen kommen schnell hintereinander und werden mit
`Enter` (oder `Tab`) abgeschlossen.

Der Scanner funktioniert unabhängig vom Fokus, solange die App im Vordergrund
ist. In den Freitextfeldern (Werkzeugbeschreibung, Mitarbeiterliste) wird die
Eingabe **nicht** abgefangen – dort kann normal getippt werden.

Konfiguration nötig? Einige Scanner senden ein Prefix (z. B. `TAB`).
Ein separater Testlauf zeigt, ob der gescannte Code korrekt ankommt.

## Tests

```bash
npm test
```

Abgedeckt sind:

- **ZIP/XLSX** – Rundreise Schreiben→Lesen, Sonderzeichen, leere Zellen
- **Store** – Anlegen, Suchen, Zurückgeben, Dedup, Persistenz über Neustart
- **API** – Status, unbekannter Mitarbeiter (404), fehlende Pflichtfelder (400),
  Doppel-Ausleihe (409), Rückgabe, Mitarbeiterliste, Frontend-Auslieferung
- **Frontend** – Scan-Ablauf (Mitarbeiter/Werkzeug/Rückgabe), Pflichtfeld-Validierung,
  Fehlerpfade, Zeit-/Dauerformatierung
- **Scanner** – Tastenpuffer, Enter/Tab-Abschluss, Verwerfen langsamer Eingaben,
  Freitextfelder, manuelle Eingabe

Aktuell: **37 Tests, alle grün.**

## Konfiguration

| Variable | Standard | Zweck |
|---|---|---|
| `PORT` | `3000` | HTTP-Port |
| `HOST` | `127.0.0.1` | Bind-Adresse (nur lokal) |
| `DATEN_DIR` | `./daten` | Verzeichnis der Excel-Dateien |
