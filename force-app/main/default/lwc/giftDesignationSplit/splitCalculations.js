/**
 * Reine Rechenfunktionen für den Gift Designation Split.
 *
 * Alle Beträge werden intern in Rappen/Cents (Integer) geführt, damit
 * Rundungsfehler von Gleitkommazahlen die 100 %-Prüfung nicht verfälschen.
 * Der Betrag ist die führende Grösse, Prozente werden daraus abgeleitet.
 */

/**
 * Wandelt eine Eingabe (Number oder String, auch mit Komma als
 * Dezimaltrennzeichen) in eine Zahl um. Leere/ungültige Werte ergeben null.
 */
export function parseNumber(value) {
    if (value === null || value === undefined) {
        return null;
    }
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }
    const normalized = String(value)
        .trim()
        .replace(/['’\s]/g, '')
        .replace(',', '.');
    if (normalized === '') {
        return null;
    }
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
}

/** Betrag -> Cents (gerundet auf 2 Nachkommastellen). null bleibt null. */
export function toCents(value) {
    const num = parseNumber(value);
    if (num === null) {
        return null;
    }
    // Korrektur für Werte wie 1.005, die binär knapp unter x.xx5 liegen
    return Math.round(num * 100 + (num >= 0 ? 1e-7 : -1e-7));
}

/** Cents -> Betrag mit 2 Nachkommastellen. */
export function fromCents(cents) {
    if (cents === null || cents === undefined) {
        return null;
    }
    return cents / 100;
}

/** Rundet einen Prozentwert auf 2 Nachkommastellen. */
export function roundPercent(value) {
    if (value === null || value === undefined) {
        return null;
    }
    return Math.round(value * 100 + (value >= 0 ? 1e-7 : -1e-7)) / 100;
}

/** Prozentwert eines Betrags am Gesamtbetrag (2 Nachkommastellen). */
export function percentFromCents(amountCents, totalCents) {
    if (amountCents === null || !totalCents) {
        return null;
    }
    return roundPercent((amountCents / totalCents) * 100);
}

/** Betrag in Cents aus einem Prozentwert des Gesamtbetrags. */
export function centsFromPercent(percent, totalCents) {
    const num = parseNumber(percent);
    if (num === null || !totalCents) {
        return null;
    }
    return Math.round((totalCents * num) / 100);
}

/** Summe der Zeilenbeträge in Cents (leere Zeilen zählen als 0). */
export function sumCents(rows) {
    return rows.reduce((sum, row) => sum + (row.amountCents || 0), 0);
}

/**
 * Prozentwerte für den Output. Jeder Wert ist aus dem Betrag abgeleitet;
 * ist genau 100 % verteilt, wird eine allfällige Rundungsdifferenz
 * (z. B. 3 × 33.33 % = 99.99 %) auf der grössten Zeile ausgeglichen,
 * damit die Prozente in Summe exakt 100 ergeben.
 */
export function outputPercents(amountsCents, totalCents) {
    const percents = amountsCents.map((cents) =>
        percentFromCents(cents, totalCents)
    );
    const allocated = amountsCents.reduce((s, c) => s + (c || 0), 0);
    if (!totalCents || allocated !== totalCents || percents.length === 0) {
        return percents;
    }
    // In Hundertstelprozent rechnen, um Gleitkommafehler zu vermeiden
    const sumBasisPoints = percents.reduce(
        (s, p) => s + Math.round((p || 0) * 100),
        0
    );
    const diff = 10000 - sumBasisPoints;
    if (diff !== 0) {
        let largest = 0;
        amountsCents.forEach((cents, index) => {
            if ((cents || 0) > (amountsCents[largest] || 0)) {
                largest = index;
            }
        });
        percents[largest] =
            (Math.round(percents[largest] * 100) + diff) / 100;
    }
    return percents;
}

/**
 * Ermittelt die Zeilen, durch die der Gesamtbetrag überschritten wird:
 * In der Reihenfolge der Zeilen wird kumuliert; jede Zeile mit Betrag,
 * ab der die laufende Summe den Gesamtbetrag übersteigt, ist betroffen.
 * Gibt ein Set der Zeilen-Keys zurück.
 */
export function overAllocatedRowKeys(rows, totalCents) {
    const keys = new Set();
    let running = 0;
    rows.forEach((row) => {
        const cents = row.amountCents || 0;
        running += cents;
        if (cents > 0 && running > totalCents) {
            keys.add(row.key);
        }
    });
    return keys;
}

/**
 * Liest einen Feldwert eines Records, auch über einen Pfad
 * (z. B. "Campaign.Name").
 */
export function getFieldValue(record, fieldPath) {
    if (!record || !fieldPath) {
        return undefined;
    }
    return fieldPath
        .split('.')
        .reduce(
            (value, part) =>
                value === null || value === undefined ? undefined : value[part],
            record
        );
}

/** Kommagetrennte Liste von API-Namen -> bereinigtes Array. */
export function parseFieldList(value) {
    if (!value) {
        return [];
    }
    return String(value)
        .split(',')
        .map((field) => field.trim())
        .filter((field) => field.length > 0);
}
