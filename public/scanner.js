'use strict';
/**
 * Barcode-Scanner-Anbindung.
 *
 * Hardware-Scanner (USB/HID) verhalten sich wie Tastaturen: sie tippen den
 * Code Zeichen für Zeichen und senden zum Abschluss "Enter". Manche Scanner
 * liefern zusätzlich einen Prefix (z. B. "TAB") – deshalb wird nicht auf das
 * Enter-Ereignis allein vertraut, sondern auf einen schnellen Tasten-Buffer.
 *
 * Es wird bewusst KEIN Scanner-Event des Herstellers vorausgesetzt, damit
 * jeder Standard-HID-Scanner ohne Konfiguration funktioniert.
 */
const scanner = {
    // Maximale Länge eines gültigen Barcodes
    maxLaenge: 64,
    // Maximale Pause zwischen zwei Zeichen (ms). Scanner tippen sehr schnell.
    maxPause: 120,
    // Mindestlänge, damit einzelne Tastendrücke nicht als Scan gelten
    minLaenge: 2,

    puffer: '',
    zeitpunkt: 0,
    handler: null,

    /**
     * Registriert den Callback für gescannte Codes.
     * @param {function(string): void} handler
     */
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

        // In Freitextfeldern (Beschreibung, Mitarbeiterliste) wird nichts abgefangen –
        // dort soll der Nutzer normal tippen und Tab nutzen können.
        if (istFreitext) {
            this.puffer = '';
            return;
        }

        if (event.key === 'Enter') {
            if (this.codeAusFeld(ziel)) return;
            if (this.puffer.length >= this.minLaenge) {
                event.preventDefault();
                this.abschliessen();
            }
            return;
        }

        // TAB am Scanende (häufige Scanner-Variante)
        if (event.key === 'Tab') {
            if (this.puffer.length >= this.minLaenge) {
                event.preventDefault();
                this.abschliessen();
            }
            return;
        }

        // Steuerzeichen (Shift, Strg, Alt, Escape …) ignorieren
        if (event.key.length !== 1) return;
        if (event.ctrlKey || event.altKey || event.metaKey) return;

        const jetzt = Date.now();
        if (jetzt - this.zeitpunkt > this.maxPause) {
            this.puffer = '';
        }
        this.zeitpunkt = jetzt;
        this.puffer += event.key;

        if (this.puffer.length > this.maxLaenge) {
            this.puffer = '';
        }
    },

    /**
     * Liest einen Code aus dem fokussierten Eingabefeld (manuelle Eingabe).
     * @returns {boolean} true, wenn ein Code übernommen wurde
     */
    codeAusFeld(ziel) {
        if (!ziel || ziel.tagName !== 'INPUT') return false;
        const wert = String(ziel.value || '').trim();
        if (wert.length < this.minLaenge) return false;
        this.puffer = '';
        if (this.handler) this.handler(wert);
        return true;
    },

    abschliessen() {
        const code = this.puffer.trim();
        this.puffer = '';
        if (!code) return;
        if (this.handler) this.handler(code);
    },

    /**
     * Setzt den Fokus auf das aktive Scanner-Feld.
     * @param {string} elementId
     */
    fokus(elementId) {
        const feld = document.getElementById(elementId);
        if (!feld) return;
        feld.focus();
        feld.select();
    },
};

document.addEventListener('DOMContentLoaded', () => scanner.start());
window.scanner = scanner;
