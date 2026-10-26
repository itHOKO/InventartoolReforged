'use strict';
/**
 * Minimaler ZIP-Leser/-Schreiber (Store + Deflate).
 * Reicht vollkommen aus, um XLSX-Dateien zu erzeugen und zu lesen.
 */
const zlib = require('zlib');

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0 ^ -1;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ CRC_TABLE[(c ^ buf[i]) & 0xff];
  return (c ^ -1) >>> 0;
}

function dosZeit(datum) {
  const d = datum || new Date();
  const zeit = ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((d.getSeconds() / 2) & 0x1f);
  const tag = (((d.getFullYear() - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0x0f) << 5) | (d.getDate() & 0x1f);
  return { zeit, tag };
}

/**
 * @param {{name:string, data:Buffer}[]} dateien
 * @returns {Buffer}
 */
function zipSchreiben(dateien) {
  const { zeit, tag } = dosZeit();
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const datei of dateien) {
    const nameBuf = Buffer.from(datei.name, 'utf8');
    const crc = crc32(datei.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 Dateinamen
    local.writeUInt16LE(0, 8); // Store
    local.writeUInt16LE(zeit, 10);
    local.writeUInt16LE(tag, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(datei.data.length, 18);
    local.writeUInt32LE(datei.data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);

    chunks.push(local, nameBuf, datei.data);

    const cdir = Buffer.alloc(46);
    cdir.writeUInt32LE(0x02014b50, 0);
    cdir.writeUInt16LE(20, 4);
    cdir.writeUInt16LE(20, 6);
    cdir.writeUInt16LE(0x0800, 8);
    cdir.writeUInt16LE(0, 10);
    cdir.writeUInt16LE(zeit, 12);
    cdir.writeUInt16LE(tag, 14);
    cdir.writeUInt32LE(crc, 16);
    cdir.writeUInt32LE(datei.data.length, 20);
    cdir.writeUInt32LE(datei.data.length, 24);
    cdir.writeUInt16LE(nameBuf.length, 28);
    cdir.writeUInt16LE(0, 30);
    cdir.writeUInt16LE(0, 32);
    cdir.writeUInt16LE(0, 34);
    cdir.writeUInt16LE(0, 36);
    cdir.writeUInt32LE(0, 38);
    cdir.writeUInt32LE(offset, 42);
    central.push(cdir, nameBuf);

    offset += local.length + nameBuf.length + datei.data.length;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(dateien.length, 8);
  end.writeUInt16LE(dateien.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...chunks, centralBuf, end]);
}

/**
 * @param {Buffer} buffer
 * @returns {{name:string, data:Buffer}[]}
 */
function zipLesen(buffer) {
  // EOCD suchen
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0 && i > buffer.length - 22 - 65535; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Keine gültige ZIP-Datei gefunden.');

  const anzahl = buffer.readUInt16LE(eocd + 10);
  let pos = buffer.readUInt32LE(eocd + 16);
  const ergebnis = [];

  for (let i = 0; i < anzahl; i++) {
    if (buffer.readUInt32LE(pos) !== 0x02014b50) throw new Error('Central Directory beschädigt.');
    const methode = buffer.readUInt16LE(pos + 10);
    const komprGr = buffer.readUInt32LE(pos + 20);
    const nameLen = buffer.readUInt16LE(pos + 28);
    const extraLen = buffer.readUInt16LE(pos + 30);
    const kommentarLen = buffer.readUInt16LE(pos + 32);
    const localOffset = buffer.readUInt32LE(pos + 42);
    const name = buffer.toString('utf8', pos + 46, pos + 46 + nameLen);

    const lNameLen = buffer.readUInt16LE(localOffset + 26);
    const lExtraLen = buffer.readUInt16LE(localOffset + 28);
    const datenStart = localOffset + 30 + lNameLen + lExtraLen;
    const rohdaten = buffer.subarray(datenStart, datenStart + komprGr);
    const daten = methode === 0 ? Buffer.from(rohdaten) : zlib.inflateRawSync(rohdaten);
    ergebnis.push({ name, data: daten });

    pos += 46 + nameLen + extraLen + kommentarLen;
  }
  return ergebnis;
}

module.exports = { zipSchreiben, zipLesen, crc32 };
