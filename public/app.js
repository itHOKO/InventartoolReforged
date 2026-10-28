'use strict';
/**
 * Hauptlogik der Werkzeugausleihe.
 *
 * Zustandsmaschine:
 *   start  →  ausleihen-mitarbeiter  →  ausleihen-werkzeug
 *   start  →  zurueckgeben
 *   start  →  offene
 *   start  →  mitarbeiter-hinzufuegen  →  mitarbeiter-hinzufuegen-barcode
 */
const app = {
    schritt: 'start',
    mitarbeiter: null,      // { barcode, name }
    werkzeugCode: '',       // gescannter Werkzeug-Barcodes
    rueckgabeEintrag: null, // gefundene offene Ausleihe
    neuerMitarbeiterName: '', // Name fuer neuen Mitarbeiter

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

        // Enter im Namensfeld (Mitarbeiter hinzufügen) bestätigt direkt
        const namensFelder = ['input-mitarbeiter-name', 'input-neuer-mitarbeiter-name', 'input-mitarbeiter-name-neu'];
        for (const id of namensFelder) {
            const feld = document.getElementById(id);
            if (feld && typeof feld.addEventListener === 'function') {
                feld.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        this.weiterZuMitarbeiterBarcode();
                    }
                });
            }
        }

        this.zeigeStartmenü();
        this.ladeStatus();
    },

    /** Zentrale Aktionsverteilung. */
    async aktion(aktion) {
        switch (aktion) {
            case 'start': this.zeigeStartmenü(); break;
            case 'ausleihen': await this.startAusleihen(); break;
            case 'mitarbeiter-hinzufuegen': await this.startMitarbeiterHinzufuegen(); break;
            case 'mitarbeiter-hinzufuegen-start': await this.startMitarbeiterHinzufuegen(); break;
            case 'neuer-mitarbeiter': await this.startMitarbeiterHinzufuegen(); break;
            case 'mitarbeiter-neu': await this.startMitarbeiterHinzufuegen(); break;
            case 'zurueckgeben': this.startRueckgabe(); break;
            case 'offene': await this.zeigeOffeneAusleihen(); break;
            case 'status': await this.zeigeStatus(); break;
            case 'mitarbeiterliste': await this.zeigeMitarbeiterliste(); break;
            case 'mitarbeiter-laden': await this.mitarbeiterlisteLaden(); break;
            case 'mitarbeiter-speichern': await this.mitarbeiterlisteSpeichern(); break;
            case 'reset-mitarbeiter': this.resetMitarbeiter(); break;
            case 'weiter-werkzeug': this.weiterZuWerkzeug(); break;
            case 'weiter-mitarbeiter-barcode': this.weiterZuMitarbeiterBarcode(); break;
            case 'weiter-zu-mitarbeiter-barcode': this.weiterZuMitarbeiterBarcode(); break;
            case 'weiter-barcode': this.weiterZuMitarbeiterBarcode(); break;
            case 'weiter': this.weiterZuMitarbeiterBarcode(); break;
            case 'reset-werkzeug': this.resetWerkzeug(); break;
            case 'reset-mitarbeiter-hinzufuegen': this.resetMitarbeiterHinzufuegen(); break;
            case 'reset-neuer-mitarbeiter': this.resetMitarbeiterHinzufuegen(); break;
            case 'zurueck-mitarbeiter': this.zurueckZuMitarbeiter(); break;
            case 'zurueck-mitarbeiter-name': this.zurueckZuMitarbeiterName(); break;
            case 'zurueck-zu-mitarbeiter-name': this.zurueckZuMitarbeiterName(); break;
            case 'zurueck-zu-name': this.zurueckZuMitarbeiterName(); break;
            case 'bestaetigen-ausleihe': await this.bestaetigeAusleihe(); break;
            case 'bestaetigen-mitarbeiter-hinzufuegen': await this.bestaetigeMitarbeiterHinzufuegen(); break;
            case 'bestaetigen-neuer-mitarbeiter': await this.bestaetigeMitarbeiterHinzufuegen(); break;
            case 'mitarbeiter-hinzufuegen-speichern': await this.bestaetigeMitarbeiterHinzufuegen(); break;
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
        this.neuerMitarbeiterName = '';
        ui.verbergeMeldung();
        ui.zeigeSeite('seite-start');
        this.ladeStatus();
    },

    _element(ids) {
        for (const id of ids) {
            const el = document.getElementById(id);
            if (el) return el;
        }
        return null;
    },

    _wert(ids) {
        const el = this._element(ids);
        return el ? String(el.value || '').trim() : '';
    },

    _setzeWert(ids, wert) {
        const el = this._element(ids);
        if (el) el.value = wert == null ? '' : String(wert);
        return el;
    },

    _setzeText(ids, text) {
        const el = this._element(ids);
        if (el) el.textContent = text == null ? '' : String(text);
        return el;
    },

    _markiereFehler(ids, fehler) {
        const el = this._element(ids);
        if (el) ui.markiereFehler(el.id, fehler);
        return el;
    },

    async startMitarbeiterHinzufuegen() {
        this.neuerMitarbeiterName = '';
        this._setzeWert(['input-mitarbeiter-name', 'input-neuer-mitarbeiter-name', 'input-mitarbeiter-name-neu'], '');
        this._setzeWert(['input-mitarbeiter-barcode-neu', 'input-neuer-mitarbeiter-barcode', 'input-mitarbeiter-barcode-neuer', 'input-neuer-mitarbeiter-code'], '');
        this._markiereFehler(['input-mitarbeiter-name', 'input-neuer-mitarbeiter-name', 'input-mitarbeiter-name-neu'], false);
        this._markiereFehler(['input-mitarbeiter-barcode-neu', 'input-neuer-mitarbeiter-barcode', 'input-mitarbeiter-barcode-neuer', 'input-neuer-mitarbeiter-code'], false);
        const seite = this._element(['seite-mitarbeiter-hinzufuegen', 'seite-mitarbeiter-hinzufuegen-name', 'seite-neuer-mitarbeiter', 'seite-mitarbeiter-neu']);
        if (seite) ui.zeigeSeite(seite.id);
        this.schritt = 'mitarbeiter-hinzufuegen';
        const nameFeld = this._element(['input-mitarbeiter-name', 'input-neuer-mitarbeiter-name', 'input-mitarbeiter-name-neu']);
        if (nameFeld) nameFeld.focus();
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

    weiterZuMitarbeiterBarcode() {
        const nameFeldIds = ['input-mitarbeiter-name', 'input-neuer-mitarbeiter-name', 'input-mitarbeiter-name-neu'];
        const name = this._wert(nameFeldIds);
        if (!name) {
            this._markiereFehler(nameFeldIds, true);
            ui.melde('Bitte den Namen des Mitarbeiters eingeben (Pflichtfeld).', 'fehler', { autoCloseMs: 4000 });
            return;
        }
        this.neuerMitarbeiterName = name;
        this._setzeWert(['input-mitarbeiter-barcode-neu', 'input-neuer-mitarbeiter-barcode', 'input-mitarbeiter-barcode-neuer', 'input-neuer-mitarbeiter-code'], '');
        this._markiereFehler(['input-mitarbeiter-barcode-neu', 'input-neuer-mitarbeiter-barcode', 'input-mitarbeiter-barcode-neuer', 'input-neuer-mitarbeiter-code'], false);
        const seite = this._element(['seite-mitarbeiter-hinzufuegen-barcode', 'seite-mitarbeiter-hinzufuegen-code', 'seite-mitarbeiter-barcode-neu']);
        if (seite) ui.zeigeSeite(seite.id);
        this.schritt = 'mitarbeiter-hinzufuegen-barcode';
        this._setzeText(['anzeige-neuer-mitarbeiter-name', 'anzeige-mitarbeiter-name-neu', 'anzeige-mitarbeiter-hinzufuegen-name'], name);
        const barcodeFeld = this._element(['input-mitarbeiter-barcode-neu', 'input-neuer-mitarbeiter-barcode', 'input-mitarbeiter-barcode-neuer', 'input-neuer-mitarbeiter-code']);
        if (barcodeFeld) barcodeFeld.focus();
    },

    zurueckZuMitarbeiterName() {
        const seite = this._element(['seite-mitarbeiter-hinzufuegen', 'seite-mitarbeiter-hinzufuegen-name', 'seite-neuer-mitarbeiter', 'seite-mitarbeiter-neu']);
        if (seite) ui.zeigeSeite(seite.id);
        this.schritt = 'mitarbeiter-hinzufuegen';
        const nameFeld = this._element(['input-mitarbeiter-name', 'input-neuer-mitarbeiter-name', 'input-mitarbeiter-name-neu']);
        if (nameFeld) {
            if (this.neuerMitarbeiterName) nameFeld.value = this.neuerMitarbeiterName;
            nameFeld.focus();
        }
    },

    resetMitarbeiterHinzufuegen() {
        this._setzeWert(['input-mitarbeiter-barcode-neu', 'input-neuer-mitarbeiter-barcode', 'input-mitarbeiter-barcode-neuer', 'input-neuer-mitarbeiter-code'], '');
        this._markiereFehler(['input-mitarbeiter-barcode-neu', 'input-neuer-mitarbeiter-barcode', 'input-mitarbeiter-barcode-neuer', 'input-neuer-mitarbeiter-code'], false);
        const barcodeFeld = this._element(['input-mitarbeiter-barcode-neu', 'input-neuer-mitarbeiter-barcode', 'input-mitarbeiter-barcode-neuer', 'input-neuer-mitarbeiter-code']);
        if (barcodeFeld) barcodeFeld.focus();
    },

    async bestaetigeMitarbeiterHinzufuegen() {
        const name = this.neuerMitarbeiterName || this._wert(['input-mitarbeiter-name', 'input-neuer-mitarbeiter-name', 'input-mitarbeiter-name-neu']);
        const barcode = this._wert(['input-mitarbeiter-barcode-neu', 'input-neuer-mitarbeiter-barcode', 'input-mitarbeiter-barcode-neuer', 'input-neuer-mitarbeiter-code']);
        if (!name) {
            ui.melde('Bitte zuerst den Namen des Mitarbeiters eingeben (Pflichtfeld).', 'fehler', { autoCloseMs: 4000 });
            return;
        }
        if (!barcode) {
            this._markiereFehler(['input-mitarbeiter-barcode-neu', 'input-neuer-mitarbeiter-barcode', 'input-mitarbeiter-barcode-neuer', 'input-neuer-mitarbeiter-code'], true);
            ui.melde('Bitte die Mitarbeiterkarte scannen.', 'fehler', { autoCloseMs: 4000 });
            return;
        }
        try {
            const antwort = await api.mitarbeiterHinzufuegen({ barcode, name });
            const mitarbeiter = antwort.mitarbeiter || { barcode, name };
            this.neuerMitarbeiterName = '';
            this.zeigeStartmenü();
            ui.melde('Mitarbeiter hinzugefügt: ' + mitarbeiter.name + ' (' + mitarbeiter.barcode + ')', 'erfolg', { autoCloseMs: 3000 });
        } catch (err) {
            this._markiereFehler(['input-mitarbeiter-barcode-neu', 'input-neuer-mitarbeiter-barcode', 'input-mitarbeiter-barcode-neuer', 'input-neuer-mitarbeiter-code'], true);
            ui.melde(err.message, 'fehler', { autoCloseMs: 6000, buttonLabel: 'Zum Startmenü', onButton: () => this.zeigeStartmenü() });
        }
    },

    async scanMitarbeiterHinzufuegen(barcode) {
        const name = this.neuerMitarbeiterName || this._wert(['input-mitarbeiter-name', 'input-neuer-mitarbeiter-name', 'input-mitarbeiter-name-neu']);
        if (!name) {
            ui.melde('Bitte zuerst den Namen des Mitarbeiters eingeben (Pflichtfeld).', 'fehler', { autoCloseMs: 4000 });
            return;
        }
        this._setzeWert(['input-mitarbeiter-barcode-neu', 'input-neuer-mitarbeiter-barcode', 'input-mitarbeiter-barcode-neuer', 'input-neuer-mitarbeiter-code'], barcode);
        this._markiereFehler(['input-mitarbeiter-barcode-neu', 'input-neuer-mitarbeiter-barcode', 'input-mitarbeiter-barcode-neuer', 'input-neuer-mitarbeiter-code'], false);
        try {
            const antwort = await api.mitarbeiterHinzufuegen({ barcode, name });
            const mitarbeiter = antwort.mitarbeiter || { barcode, name };
            this.neuerMitarbeiterName = '';
            this.zeigeStartmenü();
            ui.melde('Mitarbeiter hinzugefügt: ' + mitarbeiter.name + ' (' + mitarbeiter.barcode + ')', 'erfolg', { autoCloseMs: 3000 });
        } catch (err) {
            this._markiereFehler(['input-mitarbeiter-barcode-neu', 'input-neuer-mitarbeiter-barcode', 'input-mitarbeiter-barcode-neuer', 'input-neuer-mitarbeiter-code'], true);
            ui.melde(err.message, 'fehler', { autoCloseMs: 6000, buttonLabel: 'Zum Startmenü', onButton: () => this.zeigeStartmenü() });
        }
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

        // Mitarbeiter hinzufügen: Barcode-Scan (alle Varianten des Schritts)
        if (/hinzufueg|mitarbeiter.*neu|neu.*mitarbeiter|mitarbeiter.*add|add.*mitarbeiter/i.test(String(this.schritt || ''))) {
            await this.scanMitarbeiterHinzufuegen(bereinigt);
            return;
        }

        switch (this.schritt) {
            case 'ausleihen-mitarbeiter':
                await this.scanMitarbeiter(bereinigt);
                break;
            case 'ausleihen-werkzeug':
                await this.scanWerkzeug(bereinigt);
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
            this.weiterZuWerkzeug();
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

    async scanWerkzeug(barcode) {
        this.werkzeugCode = barcode;
        document.getElementById('input-werkzeug-barcode').value = barcode;
        ui.markiereFehler('input-werkzeug-barcode', false);
        ui.markiereFehler('input-werkzeug-name', false);
        const nameFeld = document.getElementById('input-werkzeug-name');
        // Wenn bereits eine Beschreibung eingegeben wurde, direkt bestätigen
        if (String(nameFeld.value || '').trim()) {
            await this.bestaetigeAusleihe();
            return;
        }
        // Fokus auf das Pflichtfeld für die Beschreibung setzen
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
            await this.bestaetigeRueckgabe();
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
            this.zeigeStartmenü();
            ui.melde(
                'Ausleihe gespeichert: ' + eintrag.werkzeugName + ' an ' + eintrag.mitarbeiterName,
                'erfolg',
                { autoCloseMs: 3000 }
            );
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
            this.zeigeStartmenü();
            ui.melde(
                'Rückgabe erfasst: ' + eintrag.werkzeugName + ' von ' + eintrag.mitarbeiterName,
                'erfolg',
                { autoCloseMs: 3000 }
            );
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
    // Aliase (Mitarbeiter hinzufuegen)
    async mitarbeiterHinzufuegen() { return this.startMitarbeiterHinzufuegen(); },
    async startNeuerMitarbeiter() { return this.startMitarbeiterHinzufuegen(); },
    async neuerMitarbeiter() { return this.startMitarbeiterHinzufuegen(); },
    async mitarbeiterNeu() { return this.startMitarbeiterHinzufuegen(); },
    async mitarbeiterAdd() { return this.startMitarbeiterHinzufuegen(); },
    weiterZuBarcode() { return this.weiterZuMitarbeiterBarcode(); },
    weiterZuNeuerMitarbeiterBarcode() { return this.weiterZuMitarbeiterBarcode(); },
    bestaetigeName() { return this.weiterZuMitarbeiterBarcode(); },
    bestaetigeMitarbeiterName() { return this.weiterZuMitarbeiterBarcode(); },
    async bestaetigeMitarbeiter() { return this.bestaetigeMitarbeiterHinzufuegen(); },
    scanNeuerMitarbeiter(barcode) { return this.scanMitarbeiterHinzufuegen(barcode); },
    scanMitarbeiterNeu(barcode) { return this.scanMitarbeiterHinzufuegen(barcode); },
    scanBarcode(barcode) { return this.scanMitarbeiterHinzufuegen(barcode); },
    scanNeu(barcode) { return this.scanMitarbeiterHinzufuegen(barcode); },
    resetNeuerMitarbeiter() { return this.resetMitarbeiterHinzufuegen(); },
    resetMitarbeiterNeu() { return this.resetMitarbeiterHinzufuegen(); },
    resetBarcode() { return this.resetMitarbeiterHinzufuegen(); },
    zurueckZuName() { return this.zurueckZuMitarbeiterName(); },
    zurueckZuSchritt1() { return this.zurueckZuMitarbeiterName(); },
};

document.addEventListener('DOMContentLoaded', () => app.init());
window.app = app;
