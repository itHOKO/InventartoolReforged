'use strict';
/**
 * Minimaler DOM-Stub, damit die Frontend-Logik ohne Browser testbar ist.
 * Deckt genau die APIs ab, die index.html / app.js / ui.js / scanner.js nutzen.
 */
class KlasseListe {
    constructor(element) {
        this.element = element;
        this.mengen = new Set();
    }
    add(...namen) { namen.forEach((n) => this.mengen.add(n)); }
    remove(...namen) { namen.forEach((n) => this.mengen.delete(n)); }
    contains(name) { return this.mengen.has(name); }
    toggle(name, an) {
        if (an === undefined) an = !this.mengen.has(name);
        if (an) this.mengen.add(name); else this.mengen.delete(name);
        return an;
    }
}

class Element {
    constructor(tag, id) {
        this.tagName = (tag || 'div').toUpperCase();
        this.id = id || '';
        this.children = [];
        this.attributes = {};
        this.dataset = {};
        this.style = {};
        this._text = '';
        this._value = '';
        this.classList = new KlasseListe(this);
        this.listeners = {};
        this.innerHTML = '';
    }
    get textContent() { return this._text; }
    set textContent(wert) { this._text = wert === null || wert === undefined ? '' : String(wert); }
    get value() { return this._value; }
    set value(wert) { this._value = wert === null || wert === undefined ? '' : String(wert); }
    get disabled() { return Boolean(this._disabled); }
    set disabled(wert) { this._disabled = Boolean(wert); }
    appendChild(kind) { this.children.push(kind); return kind; }
    addEventListener(name, fn) {
        this.listeners[name] = this.listeners[name] || [];
        this.listeners[name].push(fn);
    }
    dispatch(name, event) {
        (this.listeners[name] || []).forEach((fn) => fn(event || {}));
    }
    focus() { this._focused = true; }
    select() {}
    closest() { return null; }
    querySelectorAll() { return []; }
}

function createElement(tag) {
    return new Element(tag);
}

/**
 * Baut ein DOM mit allen Elementen, die die App referenziert.
 */
function baueDom() {
    const elemente = new Map();

    function anlegen(id, tag) {
        const element = new Element(tag || 'div', id);
        elemente.set(id, element);
        return element;
    }

    [
        'seite-start', 'seite-ausleihen-mitarbeiter', 'seite-ausleihen-werkzeug',
        'seite-zurueckgeben', 'seite-offene-ausleihen', 'seite-mitarbeiter', 'seite-status',
        'input-mitarbeiter-barcode', 'input-werkzeug-barcode', 'input-werkzeug-name',
        'input-rueckgabe-barcode', 'textarea-mitarbeiter',
        'mitarbeiter-info', 'rueckgabe-info', 'meldung-container',
        'anzeige-mitarbeiter-barcode', 'anzeige-mitarbeiter-name',
        'anzeige-mitarbeiter-schritt2', 'anzeige-mitarbeiter-barcode-schritt2',
        'anzeige-rueckgabe-mitarbeiter', 'anzeige-rueckgabe-werkzeug',
        'anzeige-rueckgabe-barcode', 'anzeige-rueckgabe-zeitstempel',
        'tbody-offene-ausleihen', 'btn-zu-schritt2', 'btn-bestaetigen-rueckgabe',
        'btn-bestaetigen-ausleihe', 'start-status', 'mitarbeiter-status',
        'status-mitarbeiter-datei', 'status-ausleihe-datei', 'status-mitarbeiter-anzahl',
        'status-ausleihen-anzahl', 'status-offen-anzahl',
    ].forEach((id) => anlegen(id));

    const dokument = {
        _elemente: elemente,
        getElementById(id) { return elemente.get(id) || null; },
        querySelectorAll() { return []; },
        createElement,
        addEventListener() {},
    };

    return dokument;
}

module.exports = { Element, KlasseListe, createElement, baueDom };
