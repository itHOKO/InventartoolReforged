'use strict';
/**
 * UI-Helfer: Navigation, Meldungen, Formatierung.
 */
const ui = {
    aktuelleSeite: 'seite-start',

    /**
     * @param {string} seitenId
     */
    zeigeSeite(seitenId) {
        document.querySelectorAll('.seite').forEach((element) => {
            element.classList.remove('aktiv');
        });
        const seite = document.getElementById(seitenId);
        if (seite) {
            seite.classList.add('aktiv');
            this.aktuelleSeite = seitenId;
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    /**
     * Zeigt eine Meldung unten an.
     * @param {string} text
     * @param {'erfolg'|'fehler'|'info'|'warnung'} typ
     * @param {object} optionen { autoCloseMs, buttonLabel, onButton }
     */
    melde(text, typ, optionen) {
        const opt = optionen || {};
        const container = document.getElementById('meldung-container');
        if (!container) return;

        container.innerHTML = '';
        container.classList.remove('versteckt');

        const box = document.createElement('div');
        box.className = 'meldung ' + (typ || 'info');

        const textElement = document.createElement('span');
        textElement.textContent = text;
        box.appendChild(textElement);

        if (opt.buttonLabel) {
            const knopf = document.createElement('button');
            knopf.type = 'button';
            knopf.textContent = opt.buttonLabel;
            knopf.addEventListener('click', () => {
                this.verbergeMeldung();
                if (typeof opt.onButton === 'function') opt.onButton();
            });
            box.appendChild(knopf);
        }

        container.appendChild(box);
        this.aktuelleMeldungText = text;

        if (opt.autoCloseMs && opt.autoCloseMs > 0) {
            window.clearTimeout(this._timer);
            this._timer = window.setTimeout(() => this.verbergeMeldung(), opt.autoCloseMs);
        }
    },

    verbergeMeldung() {
        const container = document.getElementById('meldung-container');
        if (!container) return;
        window.clearTimeout(this._timer);
        container.classList.add('versteckt');
        container.innerHTML = '';
        this.aktuelleMeldungText = '';
    },

    /**
     * Setzt bzw. entfernt die Fehlermarkierung eines Feldes.
     */
    markiereFehler(elementId, fehler) {
        const feld = document.getElementById(elementId);
        if (!feld) return;
        if (fehler) {
            feld.classList.add('fehler');
            feld.focus();
        } else {
            feld.classList.remove('fehler');
        }
    },

    setzeText(elementId, text) {
        const element = document.getElementById(elementId);
        if (element) element.textContent = text == null ? '' : String(text);
    },

    zeigeVersteckt(elementId, versteckt) {
        const element = document.getElementById(elementId);
        if (element) element.classList.toggle('versteckt', Boolean(versteckt));
    },

    /**
     * Formatiert einen ISO-Zeitstempel lesbar.
     */
    zeitpunkt(iso) {
        if (!iso) return '';
        const datum = new Date(iso);
        if (isNaN(datum.getTime())) return String(iso);
        const pad = (n) => String(n).padStart(2, '0');
        return (
            pad(datum.getDate()) + '.' + pad(datum.getMonth() + 1) + '.' + datum.getFullYear() +
            ', ' + pad(datum.getHours()) + ':' + pad(datum.getMinutes()) + ' Uhr'
        );
    },

    /**
     * Berechnet die Dauer seit einem Zeitstempel (z. B. "3 Tage, 4 Std.").
     */
    dauer(iso) {
        if (!iso) return '';
        const start = new Date(iso);
        if (isNaN(start.getTime())) return '';
        const ms = Date.now() - start.getTime();
        if (ms < 0) return '0 Min.';
        const minuten = Math.floor(ms / 60000);
        const tage = Math.floor(minuten / 1440);
        const stunden = Math.floor((minuten % 1440) / 60);
        const restMinuten = minuten % 60;
        if (tage > 0) return tage + ' Tage, ' + stunden + ' Std.';
        if (stunden > 0) return stunden + ' Std., ' + restMinuten + ' Min.';
        return restMinuten + ' Min.';
    },

    /**
     * Baut eine HTML-Tabelle aus Daten (XSS-sicher über textContent).
     * @param {Array<object>} zeilen
     * @param {Array<{key:string, format:function(any):string}>} spalten
     * @param {HTMLElement} ziel
     */
    zeichneTabelle(zeilen, spalten, ziel) {
        ziel.innerHTML = '';
        if (!zeilen || zeilen.length === 0) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = spalten.length;
            td.className = 'leerzeile';
            td.textContent = 'Keine Einträge vorhanden.';
            tr.appendChild(td);
            ziel.appendChild(tr);
            return;
        }
        for (const eintrag of zeilen) {
            const tr = document.createElement('tr');
            for (const spalte of spalten) {
                const td = document.createElement('td');
                td.textContent = spalte.format ? spalte.format(eintrag[spalte.key]) : String(eintrag[spalte.key] ?? '');
                tr.appendChild(td);
            }
            ziel.appendChild(tr);
        }
    },
};

window.ui = ui;
