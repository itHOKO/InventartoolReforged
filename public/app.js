'use strict';
/**
 * Hauptlogik der Werkzeugausleihe.
 *
 * Zustandsmaschine:
 *   start  →  ausleihen-mitarbeiter  →  ausleihen-werkzeug
 *   start  →  zurueckgeben
 *   start  →  offene
 */
const app = {
    schritt: 'start',
    mitarbeiter: null,      // { barcode, name }
    werkzeugCode: '',       // gescannter Werkzeug-Barcodes
    rueckgabeEintrag: null, // gefundene offene Ausleihe

    init() {
        document.addEventListener('click', (event) => {
            const knopf = event.target.closest('[data-aktion]');
            if (!knopf) return;
            this.aktion(knopf.dataset.aktion);
        });

        scanner.setzeHandler((code) => this.onScan(code));

        // Enter im Werkzeug-Beschreibungsfeld bestätigt direkt
        document.getElementById('input-werkzeug-name').addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                this.bestaetigeAusleihe();
            }
        });

        this.zeigeStartmenü();
        this.ladeStatus();
    },

    /** Zentrale Aktionsverteilung. */
    async aktion(aktion) {
        switch (aktion) {
            case 'start': this.zeigeStartmenü(); break;
            case 'ausleihen': await this.startAusleihen(); break;
            case 'zurueckgeben': this.startRueckgabe(); break;
            case 'offene': await this.zeigeOffeneAusleihen(); break;
            case 'status': await this.zeigeStatus(); break;
            case 'mitarbeiterliste': await this.zeigeMitarbeiterliste(); break;
            case 'mitarbeiter-laden': await this.mitarbeiterlisteLaden(); break;
            case 'mitarbeiter-speichern': await this.mitarbeiterlisteSpeichern(); break;
            case 'reset-mitarbeiter': this.resetMitarbeiter(); break;
            case 'weiter-werkzeug': this.weiterZuWerkzeug(); break;
            case 'reset-werkzeug': this.resetWerkzeug(); break;
            case 'zurueck-mitarbeiter': this.zurueckZuMitarbeiter(); break;
            case 'bestaetigen-ausleihe': await this.bestaetigeAusleihe(); break;
            case 'reset-rueckgabe': this.resetRueckgabe(); break;
            case 'bestaetigen-rueckgabe': await this.bestaetigeRueckgabe(); break;
            default: break;
        }
    },

    // ---------------------------------------------------------------
    // Navigation
    // ---------------------------------------------------------------

    zeigeStartmenü() {
        this.schritt = 'start';
        this.mitarbeiter = null;
        this.werkzeugCode = '';
        this.rueckgabeEintrag = null;
        ui.verbergeMeldung();
        ui.zeigeSeite('seite-start');
        this.ladeStatus();
    },

    async startAusleihen() {
        this.mitarbeiter = null;
        this.werkzeugCode = '';
        ui.zeigeSeite('seite-ausleihen-mitarbeiter');
        ui.zeigeVersteckt('mitarbeiter-info', true);
        ui.markiereFehler('input-mitarbeiter-barcode', false);
        document.getElementById('btn-zu-schritt2').disabled = true;
        this.schritt = 'ausleihen-mitarbeiter';

        try {
            const status = await api.status();
            if (status.mitarbeiterAnzahl === 0) {
                ui.melde(
                    'Es ist keine Mitarbeiterliste vorhanden. Bitte unter "Mitarbeiterliste verwalten" anlegen.',
                    'warnung',
                    { autoCloseMs: 6000 }
                );
            }
        } catch (err) {
            ui.melde(err.message, 'fehler', { autoCloseMs: 6000 });
        }
        scanner.fokus('input-mitarbeiter-barcode');
    },

    weiterZuWerkzeug() {
        if (!this.mitarbeiter) {
            ui.melde('Bitte zuerst die Mitarbeiterkarte scannen.', 'fehler');
            return;
        }
        ui.setzeText('anzeige-mitarbeiter-schritt2', this.mitarbeiter.name);
        ui.setzeText('anzeige-mitarbeiter-barcode-schritt2', this.mitarbeiter.barcode);
        this.werkzeugCode = '';
        document.getElementById('input-werkzeug-barcode').value = '';
        document.getElementById('input-werkzeug-name').value = '';
        ui.markiereFehler('input-werkzeug-barcode', false);
        ui.markiereFehler('input-werkzeug-name', false);
        ui.zeigeSeite('seite-ausleihen-werkzeug');
        this.schritt = 'ausleihen-werkzeug';
        scanner.fokus('input-werkzeug-barcode');
    },

    zurueckZuMitarbeiter() {
        this.werkzeugCode = '';
        document.getElementById('input-werkzeug-barcode').value = '';
        document.getElementById('input-werkzeug-name').value = '';
        ui.zeigeSeite('seite-ausleihen-mitarbeiter');
        this.schritt = 'ausleihen-mitarbeiter';
        scanner.fokus('input-mitarbeiter-barcode');
    },

    resetMitarbeiter() {
        this.mitarbeiter = null;
        ui.zeigeVersteckt('mitarbeiter-info', true);
        ui.markiereFehler('input-mitarbeiter-barcode', false);
        document.getElementById('btn-zu-schritt2').disabled = true;
        scanner.fokus('input-mitarbeiter-barcode');
    },

    resetWerkzeug() {
        this.werkzeugCode = '';
        document.getElementById('input-werkzeug-barcode').value = '';
        document.getElementById('input-werkzeug-name').value = '';
        ui.markiereFehler('input-werkzeug-barcode', false);
        ui.markiereFehler('input-werkzeug-name', false);
        scanner.fokus('input-werkzeug-barcode');
    },

    startRueckgabe() {
        this.rueckgabeEintrag = null;
        ui.zeigeVersteckt('rueckgabe-info', true);
        ui.markiereFehler('input-rueckgabe-barcode', false);
        document.getElementById('btn-bestaetigen-rueckgabe').disabled = true;
        ui.zeigeSeite('seite-zurueckgeben');
        this.schritt = 'zurueckgeben';
        scanner.fokus('input-rueckgabe-barcode');
    },

    resetRueckgabe() {
        this.rueckgabeEintrag = null;
        ui.zeigeVersteckt('rueckgabe-info', true);
        ui.markiereFehler('input-rueckgabe-barcode', false);
        document.getElementById('btn-bestaetigen-rueckgabe').disabled = true;
        scanner.fokus('input-rueckgabe-barcode');
    },

    // ---------------------------------------------------------------
    // Scan-Verarbeitung
    // ---------------------------------------------------------------

    /**
     * Empfängt einen gescannten Barcode und verarbeitet ihn
     * abhängig vom aktuellen Schritt.
     */
    async onScan(code) {
        const bereinigt = String(code || '').trim();
        if (!bereinigt) return;

        switch (this.schritt) {
            case 'ausleihen-mitarbeiter':
                await this.scanMitarbeiter(bereinigt);
                break;
            case 'ausleihen-werkzeug':
                this.scanWerkzeug(bereinigt);
                break;
            case 'zurueckgeben':
                await this.scanRueckgabe(bereinigt);
                break;
            default:
                ui.melde(
                    'Bitte zuerst eine Funktion im Startmenü wählen.',
                    'info',
                    { autoCloseMs: 3000 }
                );
                break;
        }
    },

    async scanMitarbeiter(barcode) {
        const feld = document.getElementById('input-mitarbeiter-barcode');
        feld.value = barcode;
        ui.markiereFehler('input-mitarbeiter-barcode', false);

        try {
            const mitarbeiter = await api.mitarbeiterSuchen(barcode);
            this.mitarbeiter = mitarbeiter;
            ui.setzeText('anzeige-mitarbeiter-barcode', mitarbeiter.barcode);
            ui.setzeText('anzeige-mitarbeiter-name', mitarbeiter.name);
            ui.zeigeVersteckt('mitarbeiter-info', false);
            document.getElementById('btn-zu-schritt2').disabled = false;
            ui.melde('Mitarbeiter erkannt: ' + mitarbeiter.name, 'erfolg', { autoCloseMs: 2500 });
        } catch (err) {
            this.mitarbeiter = null;
            ui.zeigeVersteckt('mitarbeiter-info', true);
            document.getElementById('btn-zu-schritt2').disabled = true;
            ui.markiereFehler('input-mitarbeiter-barcode', true);
            ui.melde(err.message, 'fehler', {
                autoCloseMs: 5000,
                buttonLabel: 'Zum Startmenü',
                onButton: () => this.zeigeStartmenü(),
            });
        }
    },

    scanWerkzeug(barcode) {
        this.werkzeugCode = barcode;
        document.getElementById('input-werkzeug-barcode').value = barcode;
        ui.markiereFehler('input-werkzeug-barcode', false);
        ui.markiereFehler('input-werkzeug-name', false);
        // Fokus auf das Pflichtfeld für die Beschreibung setzen
        const nameFeld = document.getElementById('input-werkzeug-name');
        nameFeld.focus();
        ui.melde('Werkzeugcode erkannt. Bitte das Werkzeug beschreiben.', 'info', { autoCloseMs: 3000 });
    },

    async scanRueckgabe(barcode) {
        const feld = document.getElementById('input-rueckgabe-barcode');
        feld.value = barcode;
        ui.markiereFehler('input-rueckgabe-barcode', false);

        try {
            const antwort = await api.rueckgabeSuchen(barcode);
            const eintrag = antwort.eintrag;
            this.rueckgabeEintrag = eintrag;
            ui.setzeText('anzeige-rueckgabe-mitarbeiter', eintrag.mitarbeiterName);
            ui.setzeText('anzeige-rueckgabe-werkzeug', eintrag.werkzeugName);
            ui.setzeText('anzeige-rueckgabe-barcode', eintrag.werkzeugCode);
            ui.setzeText('anzeige-rueckgabe-zeitstempel', ui.zeitpunkt(eintrag.zeitstempelAusleihe));
            ui.zeigeVersteckt('rueckgabe-info', false);
            document.getElementById('btn-bestaetigen-rueckgabe').disabled = false;
            ui.melde('Ausleihe gefunden. Bitte die Rückgabe bestätigen.', 'erfolg', { autoCloseMs: 4000 });
        } catch (err) {
            this.rueckgabeEintrag = null;
            ui.zeigeVersteckt('rueckgabe-info', true);
            document.getElementById('btn-bestaetigen-rueckgabe').disabled = true;
            ui.markiereFehler('input-rueckgabe-barcode', true);
            ui.melde(err.message, 'fehler', {
                autoCloseMs: 5000,
                buttonLabel: 'Zum Startmenü',
                onButton: () => this.zeigeStartmenü(),
            });
        }
    },

    // ---------------------------------------------------------------
    // Bestätigungen
    // ---------------------------------------------------------------

    async bestaetigeAusleihe() {
        if (!this.mitarbeiter) {
            ui.melde('Es wurde kein Mitarbeiter erfasst.', 'fehler');
            return;
        }

        const werkzeugCode = this.werkzeugCode.trim();
        const werkzeugName = document.getElementById('input-werkzeug-name').value.trim();

        if (!werkzeugCode) {
            ui.markiereFehler('input-werkzeug-barcode', true);
            ui.melde('Bitte zuerst den Werkzeug-Barcode scannen.', 'fehler', { autoCloseMs: 4000 });
            scanner.fokus('input-werkzeug-barcode');
            return;
        }
        if (!werkzeugName) {
            ui.markiereFehler('input-werkzeug-name', true);
            ui.melde('Bitte das Werkzeug beschreiben (Pflichtfeld).', 'fehler', { autoCloseMs: 4000 });
            return;
        }

        try {
            const antwort = await api.ausleiheAnlegen({
                mitarbeiterCode: this.mitarbeiter.barcode,
                werkzeugCode,
                werkzeugName,
            });
            const eintrag = antwort.eintrag;
            ui.melde(
                'Ausleihe gespeichert: ' + eintrag.werkzeugName + ' an ' + eintrag.mitarbeiterName,
                'erfolg',
                {
                    autoCloseMs: 3500,
                    buttonLabel: 'Zum Startmenü',
                    onButton: () => this.zeigeStartmenü(),
                }
            );
            // Nach Erfolg automatisch zum Startmenü
            window.setTimeout(() => {
                if (ui.aktuelleMeldungText && ui.aktuelleMeldungText.indexOf('Ausleihe gespeichert') === 0) {
                    this.zeigeStartmenü();
                }
            }, 3500);
        } catch (err) {
            ui.melde(err.message, 'fehler', {
                autoCloseMs: 6000,
                buttonLabel: 'Zum Startmenü',
                onButton: () => this.zeigeStartmenü(),
            });
        }
    },

    async bestaetigeRueckgabe() {
        if (!this.rueckgabeEintrag) {
            ui.melde('Es wurde keine Ausleihe gefunden.', 'fehler');
            return;
        }
        try {
            const antwort = await api.rueckgabeBestaetigen(this.rueckgabeEintrag.id);
            const eintrag = antwort.eintrag;
            ui.melde(
                'Rückgabe erfasst: ' + eintrag.werkzeugName + ' von ' + eintrag.mitarbeiterName,
                'erfolg',
                {
                    autoCloseMs: 3500,
                    buttonLabel: 'Zum Startmenü',
                    onButton: () => this.zeigeStartmenü(),
                }
            );
            window.setTimeout(() => {
                if (ui.aktuelleMeldungText && ui.aktuelleMeldungText.indexOf('Rückgabe erfasst') === 0) {
                    this.zeigeStartmenü();
                }
            }, 3500);
        } catch (err) {
            ui.melde(err.message, 'fehler', {
                autoCloseMs: 6000,
                buttonLabel: 'Zum Startmenü',
                onButton: () => this.zeigeStartmenü(),
            });
        }
    },

    // ---------------------------------------------------------------
    // Listen & Status
    // ---------------------------------------------------------------

    async zeigeOffeneAusleihen() {
        ui.zeigeSeite('seite-offene-ausleihen');
        const tbody = document.getElementById('tbody-offene-ausleihen');
        tbody.innerHTML = '<tr><td colspan="6" class="leerzeile">Lade…</td></tr>';
        try {
            const antwort = await api.ausleihenOffen();
            ui.zeichneTabelle(
                antwort.ausleihen,
                [
                    { key: 'mitarbeiterCode' },
                    { key: 'mitarbeiterName' },
                    { key: 'werkzeugCode' },
                    { key: 'werkzeugName' },
                    { key: 'zeitstempelAusleihe', format: (w) => ui.zeitpunkt(w) },
                    { key: 'zeitstempelAusleihe', format: (w) => ui.dauer(w) },
                ],
                tbody
            );
            if (antwort.ausleihen.length === 0) {
                ui.melde('Aktuell sind keine Werkzeuge ausgeliehen.', 'info', { autoCloseMs: 3000 });
            }
        } catch (err) {
            tbody.innerHTML = '';
            ui.melde(err.message, 'fehler', { autoCloseMs: 6000 });
        }
    },

    async zeigeStatus() {
        ui.zeigeSeite('seite-status');
        try {
            const status = await api.status();
            ui.setzeText('status-mitarbeiter-datei', status.mitarbeiterDatei);
            ui.setzeText('status-ausleihe-datei', status.ausleiheDatei);
            ui.setzeText('status-mitarbeiter-anzahl', status.mitarbeiterAnzahl);
            ui.setzeText('status-ausleihen-anzahl', status.ausleiheAnzahl);
            ui.setzeText('status-offen-anzahl', status.offeneAnzahl);
        } catch (err) {
            ui.melde(err.message, 'fehler', { autoCloseMs: 6000 });
        }
    },

    async ladeStatus() {
        try {
            const status = await api.status();
            ui.setzeText(
                'start-status',
                'Mitarbeiter: ' + status.mitarbeiterAnzahl +
                ' | Ausleihen gesamt: ' + status.ausleiheAnzahl +
                ' | Offen: ' + status.offeneAnzahl
            );
        } catch (err) {
            ui.setzeText('start-status', 'Server nicht erreichbar: ' + err.message);
        }
    },

    // ---------------------------------------------------------------
    // Mitarbeiterliste
    // ---------------------------------------------------------------

    async zeigeMitarbeiterliste() {
        ui.zeigeSeite('seite-mitarbeiter');
        await this.mitarbeiterlisteLaden();
    },

    async mitarbeiterlisteLaden() {
        try {
            const antwort = await api.mitarbeiterLaden();
            const mitarbeiter = antwort.mitarbeiter || [];
            const text = mitarbeiter.map((m) => m.barcode + ',' + m.name).join('\n');
            document.getElementById('textarea-mitarbeiter').value = text;
            ui.setzeText('mitarbeiter-status', mitarbeiter.length + ' Mitarbeiter geladen.');
        } catch (err) {
            ui.setzeText('mitarbeiter-status', 'Fehler: ' + err.message);
        }
    },

    async mitarbeiterlisteSpeichern() {
        const rohtext = document.getElementById('textarea-mitarbeiter').value;
        const mitarbeiter = [];
        const zeilen = rohtext.split(/\r?\n/);

        for (const zeile of zeilen) {
            const getrimmt = zeile.trim();
            if (!getrimmt) continue;
            // Trenner: Komma, Semikolon oder Tab
            const teile = getrimmt.split(/[,;\t]/);
            if (teile.length < 2) continue;
            const barcode = teile[0].trim();
            const name = teile.slice(1).join(' ').trim();
            if (!barcode || !name) continue;
            mitarbeiter.push({ barcode, name });
        }

        if (mitarbeiter.length === 0) {
            ui.setzeText('mitarbeiter-status', 'Keine gültigen Zeilen gefunden. Format: Barcode,Name');
            ui.melde('Keine gültigen Mitarbeiterzeilen gefunden.', 'fehler', { autoCloseMs: 5000 });
            return;
        }

        try {
            const antwort = await api.mitarbeiterSpeichern(mitarbeiter);
            ui.setzeText('mitarbeiter-status', antwort.anzahl + ' Mitarbeiter gespeichert.');
            ui.melde(antwort.anzahl + ' Mitarbeiter gespeichert.', 'erfolg', { autoCloseMs: 3000 });
            this.ladeStatus();
        } catch (err) {
            ui.setzeText('mitarbeiter-status', 'Fehler: ' + err.message);
            ui.melde(err.message, 'fehler', { autoCloseMs: 6000 });
        }
    },
};

document.addEventListener('DOMContentLoaded', () => app.init());
window.app = app;
