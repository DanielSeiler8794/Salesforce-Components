import {
    parseNumber,
    toCents,
    percentFromCents,
    centsFromPercent,
    outputPercents,
    overAllocatedRowKeys,
    getFieldValue,
    parseFieldList
} from '../splitCalculations';

describe('splitCalculations', () => {
    it('parst Zahlen inkl. Komma und Tausendertrennzeichen', () => {
        expect(parseNumber('12,50')).toBe(12.5);
        expect(parseNumber("1'000.25")).toBe(1000.25);
        expect(parseNumber('')).toBeNull();
        expect(parseNumber(null)).toBeNull();
        expect(parseNumber('abc')).toBeNull();
        expect(parseNumber(7)).toBe(7);
    });

    it('rundet Beträge auf 2 Nachkommastellen (Cents)', () => {
        expect(toCents(1.005)).toBe(101);
        expect(toCents('33.333')).toBe(3333);
        expect(toCents(100)).toBe(10000);
        expect(toCents(undefined)).toBeNull();
    });

    it('rechnet zwischen Betrag und Prozent', () => {
        expect(percentFromCents(3333, 10000)).toBe(33.33);
        expect(percentFromCents(5000, 0)).toBeNull();
        expect(centsFromPercent('33.33', 10000)).toBe(3333);
        expect(centsFromPercent('', 10000)).toBeNull();
    });

    it('gleicht Output-Prozente bei 100 % Verteilung auf genau 100 aus', () => {
        const percents = outputPercents([3334, 3333, 3333], 10000);
        expect(percents).toEqual([33.34, 33.33, 33.33]);
        const sum = percents.reduce((s, p) => s + Math.round(p * 100), 0);
        expect(sum).toBe(10000);

        // 1/3 von 10.00 -> 3.33 / 3.33 / 3.34 ergibt 33.3 + 33.3 + 33.4
        const uneven = outputPercents([1, 1, 1], 3);
        expect(uneven.reduce((s, p) => s + Math.round(p * 100), 0)).toBe(10000);
    });

    it('lässt Prozente unverändert, wenn nicht 100 % verteilt sind', () => {
        expect(outputPercents([3333, 3333, 3333], 10000)).toEqual([
            33.33, 33.33, 33.33
        ]);
    });

    it('kennzeichnet die Zeilen, die den Gesamtbetrag überschreiten', () => {
        const rows = [
            { key: 'a', amountCents: 6000 },
            { key: 'b', amountCents: 3000 },
            { key: 'c', amountCents: 2000 }
        ];
        expect([...overAllocatedRowKeys(rows, 10000)]).toEqual(['c']);
    });

    it('liest Feldwerte auch über Pfade', () => {
        const record = { Name: 'A', Campaign: { Name: 'C' } };
        expect(getFieldValue(record, 'Campaign.Name')).toBe('C');
        expect(getFieldValue(record, 'Foo.Bar')).toBeUndefined();
    });

    it('parst kommagetrennte Feldlisten', () => {
        expect(parseFieldList(' Code__c, ,Number__c ')).toEqual([
            'Code__c',
            'Number__c'
        ]);
        expect(parseFieldList(undefined)).toEqual([]);
    });
});
