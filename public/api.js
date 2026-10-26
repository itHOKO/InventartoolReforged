'use strict';
/**
 * Kapselung aller Server-Aufrufe (JSON-API).
 */
const api = {
    async anfrage(methode, pfad, body) {
        const optionen = {
            method: methode,
            headers: { 'Content-Type': 'application/json' },
        };
        if (body !== undefined) {
            optionen.body = JSON.stringify(body);
        }

        let antwort;
        try {
            antwort = await fetch(pfad, optionen);
        } catch (err) {
            throw new Error(
                'Keine Verbindung zum Server. Läuft die Anwendung noch? Bitte Seite neu laden.'
            );
        }

        let daten = {};
        try {
            daten = await antwort.json();
        } catch (err) {
            daten = {};
        }

        if (!antwort.ok) {
            throw new Error(daten.fehler || ('Fehler ' + antwort.status + ' bei der Anfrage.'));
        }
        return daten;
    },

    status() {
        return api.anfrage('GET', '/api/status');
    },

    mitarbeiterLaden() {
        return api.anfrage('GET', '/api/mitarbeiter');
    },

    mitarbeiterSuchen(barcode) {
        return api.anfrage('POST', '/api/mitarbeiter/suchen', { barcode });
    },

    mitarbeiterSpeichern(mitarbeiter) {
        return api.anfrage('POST', '/api/mitarbeiter/speichern', { mitarbeiter });
    },

    ausleiheAnlegen(daten) {
        return api.anfrage('POST', '/api/ausleihen', daten);
    },

    ausleihenOffen() {
        return api.anfrage('GET', '/api/ausleihen/offen');
    },

    rueckgabeSuchen(werkzeugCode) {
        return api.anfrage('POST', '/api/ausleihen/rueckgabe', { werkzeugCode });
    },

    rueckgabeBestaetigen(id) {
        return api.anfrage('POST', '/api/ausleihen/rueckgabe/bestaetigen', { id });
    },
};

window.api = api;
