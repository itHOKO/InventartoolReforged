'use strict';
/**
 * Barcode-Scanner-Anbindung.
 */
const scanner = {
    maxLaenge: 64,
    autoLaenge: 4,
    maxPause: 120,
    minLaenge: 2,

    puffer: '',
    zeitpunkt: 0,
    handler: null,
    letzterCode: '',
    _autoAusgeloest: false,

    setzeHandler(handler) {
        this.handler = handler;
    },

    start() {
        document.addEventListener('keydown', (event) => this.onKeyDown(event), true);
    },

    onKeyDown(event) {
        const ziel = event.target;
        const istEingabefeld = ziel && (ziel.tagName === 'INPUT' || ziel.tagName === 'TEXTAREA');
        const istFreitext = istEingabefeld && ziel.dataset.keinScanner === 'true';

        if (istFreitext) {
            this.puffer = '';
            this._autoAusgeloest = false;
            return;
        }

        if (event.key === 'Enter') {
            if (this.codeAusFeld(ziel)) return;
            if (this.puffer.length >= this.minLaenge) {
                event.preventDefault();
                this.abschliessen(false);
            }
            return;
        }

        if (event.key === 'Tab') {
            if (this.puffer.length >= this.minLaenge) {
                event.preventDefault();
                this.abschliessen(false);
            }
            return;
        }

        if (event.key.length !== 1) return;
        if (event.ctrlKey || event.altKey || event.metaKey) return;

        const jetzt = Date.now();
        if (jetzt - this.zeitpunkt > this.maxPause) {
            this.puffer = '';
            this._autoAusgeloest = false;
        }
        this.zeitpunkt = jetzt;
        this._autoAusgeloest = false;
        this.puffer += event.key;

        if (this.puffer.length > this.maxLaenge) {
            this.puffer = '';
            this._autoAusgeloest = false;
        }

        if (!istFreitext && this.puffer.length >= this.autoLaenge) {
            event.preventDefault();
            this.abschliessen(true);
            return;
        }
    },

    codeAusFeld(ziel) {
        if (!ziel || ziel.tagName !== 'INPUT') return false;
        const wert = String(ziel.value || '').trim();
        if (wert.length < this.minLaenge) return false;
        if (this._autoAusgeloest && wert === this.letzterCode) {
            this._autoAusgeloest = false;
            this.puffer = '';
            return true;
        }
        this._autoAusgeloest = false;
        this.puffer = '';
        this.letzterCode = wert;
        if (this.handler) this.handler(wert);
        return true;
    },

    abschliessen(auto = false) {
        const code = this.puffer.trim();
        this.puffer = '';
        if (!code) return;
        this._autoAusgeloest = auto;
        this.letzterCode = code;
        if (this.handler) this.handler(code);
    },

    fokus(elementId) {
        const feld = document.getElementById(elementId);
        if (!feld) return;
        feld.focus();
        feld.select();
    },
};

document.addEventListener('DOMContentLoaded', () => scanner.start());
window.scanner = scanner;
