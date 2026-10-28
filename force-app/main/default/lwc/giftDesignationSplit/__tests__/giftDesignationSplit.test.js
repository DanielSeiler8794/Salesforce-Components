import { createElement } from 'lwc';
import GiftDesignationSplit from 'c/giftDesignationSplit';

jest.mock(
    'lightning/flowSupport',
    () => {
        class FlowAttributeChangeEvent extends CustomEvent {
            constructor(attributeName, attributeValue) {
                super('lightning__flowattributechange', {
                    bubbles: true,
                    composed: true,
                    detail: { attributeName, attributeValue }
                });
            }
        }
        return { FlowAttributeChangeEvent };
    },
    { virtual: true }
);

const DESIGNATIONS = [
    { Id: 'a01000000000001AAA', Name: 'Allgemeine Spende', Code__c: '1000', Region__c: 'CH' },
    { Id: 'a01000000000002AAA', Name: 'Kinderhilfe', Code__c: '2000', Region__c: 'Afrika' },
    { Id: 'a01000000000003AAA', Name: 'Nothilfe', Code__c: '3000', Region__c: 'Weltweit' },
    { Id: 'a01000000000004AAA', Name: 'Bildung', Code__c: '4000' },
    { Id: 'a01000000000005AAA', Name: 'Wasser', Code__c: '5000' },
    { Id: 'a01000000000006AAA', Name: 'Gesundheit', Code__c: '6000' },
    { Id: 'a01000000000007AAA', Name: 'Klima', Code__c: '7000' },
    { Id: 'a01000000000008AAA', Name: 'Landwirtschaft', Code__c: '8000' },
    { Id: 'a01000000000009AAA', Name: 'Frauenförderung', Code__c: '9000' },
    { Id: 'a01000000000010AAA', Name: 'Patenschaft', Code__c: '1100' },
    { Id: 'a01000000000011AAA', Name: 'Infrastruktur', Code__c: '1200' }
];

function createComponent(props = {}) {
    const element = createElement('c-gift-designation-split', {
        is: GiftDesignationSplit
    });
    Object.assign(
        element,
        { totalAmount: 100, availableDesignations: DESIGNATIONS },
        props
    );
    const flowEvents = [];
    element.addEventListener('lightning__flowattributechange', (event) =>
        flowEvents.push(event.detail)
    );
    document.body.appendChild(element);
    element.flowEvents = flowEvents;
    return element;
}

const flushPromises = () => Promise.resolve();

function rows(element) {
    return element.shadowRoot.querySelectorAll('.gds-row');
}

function rowElement(element, index, selector) {
    return rows(element)[index].querySelector(selector);
}

async function selectDesignation(element, index, id) {
    rowElement(element, index, 'c-gift-designation-combobox').dispatchEvent(
        new CustomEvent('select', { detail: { value: id } })
    );
    await flushPromises();
}

async function enterAmount(element, index, value) {
    rowElement(element, index, 'lightning-input[data-field="amount"]').dispatchEvent(
        new CustomEvent('change', { detail: { value } })
    );
    await flushPromises();
}

async function enterPercent(element, index, value) {
    rowElement(element, index, 'lightning-input[data-field="percent"]').dispatchEvent(
        new CustomEvent('change', { detail: { value } })
    );
    await flushPromises();
}

async function click(target) {
    target.click();
    await flushPromises();
}

async function addRow(element) {
    await click(element.shadowRoot.querySelector('lightning-button[data-action="addRow"]'));
}

function status(element) {
    return element.shadowRoot.querySelector('.gds-status[data-status]').dataset.status;
}

describe('c-gift-designation-split', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('TF1: eine Zeile erhält automatisch den vollen Betrag, Weiter möglich', async () => {
        const element = createComponent();
        await flushPromises();

        expect(rows(element)).toHaveLength(1);
        expect(rowElement(element, 0, 'lightning-input[data-field="amount"]').value).toBe('100.00');
        expect(rowElement(element, 0, 'lightning-input[data-field="percent"]').value).toBe('100');
        expect(element.validate().isValid).toBe(false);

        await selectDesignation(element, 0, DESIGNATIONS[0].Id);

        expect(element.isValid).toBe(true);
        expect(element.validate()).toEqual({ isValid: true });
        expect(element.designationRecords).toEqual([
            { GiftDesignationId: DESIGNATIONS[0].Id, Amount: 100, Percent: 100 }
        ]);
        expect(status(element)).toBe('success');
    });

    it('wählt die Default-Designation in der ersten Zeile vor', async () => {
        const element = createComponent({ defaultDesignationId: DESIGNATIONS[1].Id });
        await flushPromises();
        expect(rowElement(element, 0, 'c-gift-designation-combobox').value).toBe(DESIGNATIONS[1].Id);
        expect(element.isValid).toBe(true);
    });

    it('lässt die erste Zeile leer, wenn die Default-ID nicht verfügbar ist', async () => {
        const element = createComponent({ defaultDesignationId: 'a01XXXXXXXXXXXXXXX' });
        await flushPromises();
        expect(rowElement(element, 0, 'c-gift-designation-combobox').value).toBeNull();
    });

    it('TF2: Split auf drei Zeilen, gemischt per Betrag und Prozent', async () => {
        const element = createComponent();
        await flushPromises();
        await addRow(element);
        await addRow(element);
        expect(rows(element)).toHaveLength(3);

        await selectDesignation(element, 0, DESIGNATIONS[0].Id);
        await selectDesignation(element, 1, DESIGNATIONS[1].Id);
        await selectDesignation(element, 2, DESIGNATIONS[2].Id);

        await enterAmount(element, 0, '50');
        await enterPercent(element, 1, '30');
        expect(rowElement(element, 1, 'lightning-input[data-field="amount"]').value).toBe('30.00');
        await enterAmount(element, 2, '20');

        expect(element.allocatedAmount).toBe(100);
        expect(element.isValid).toBe(true);
        expect(element.designationRecords).toEqual([
            { GiftDesignationId: DESIGNATIONS[0].Id, Amount: 50, Percent: 50 },
            { GiftDesignationId: DESIGNATIONS[1].Id, Amount: 30, Percent: 30 },
            { GiftDesignationId: DESIGNATIONS[2].Id, Amount: 20, Percent: 20 }
        ]);

        const lastValid = element.flowEvents.filter((e) => e.attributeName === 'isValid').pop();
        expect(lastValid.attributeValue).toBe(true);
    });

    it('TF3: Überschreitung zeigt rote Meldung, markiert Zeile, blockiert Weiter', async () => {
        const element = createComponent();
        await flushPromises();
        await addRow(element);
        await selectDesignation(element, 0, DESIGNATIONS[0].Id);
        await selectDesignation(element, 1, DESIGNATIONS[1].Id);
        await enterAmount(element, 0, '80');
        await enterAmount(element, 1, '40');

        expect(status(element)).toBe('error');
        expect(rows(element)[1].classList).toContain('gds-row_error');
        expect(rows(element)[0].classList).not.toContain('gds-row_error');
        expect(element.isValid).toBe(false);
        expect(element.validate().isValid).toBe(false);
    });

    it('TF4: Rest offen zeigt Hinweis; «Rest übernehmen» schliesst die Lücke', async () => {
        const element = createComponent();
        await flushPromises();
        await addRow(element);
        await selectDesignation(element, 0, DESIGNATIONS[0].Id);
        await selectDesignation(element, 1, DESIGNATIONS[1].Id);
        await enterAmount(element, 0, '60');
        await enterAmount(element, 1, '10');

        expect(status(element)).toBe('warning');
        expect(element.validate().isValid).toBe(false);

        await click(rowElement(element, 1, 'lightning-button[data-action="takeRemainder"]'));

        expect(rowElement(element, 1, 'lightning-input[data-field="amount"]').value).toBe('40.00');
        expect(status(element)).toBe('success');
        expect(element.validate().isValid).toBe(true);
    });

    it('TF5: Rundung 3 × 33.33 % wird über die Beträge ausgeglichen', async () => {
        const element = createComponent();
        await flushPromises();
        await addRow(element);
        await addRow(element);
        for (let i = 0; i < 3; i++) {
            // eslint-disable-next-line no-await-in-loop
            await selectDesignation(element, i, DESIGNATIONS[i].Id);
            // eslint-disable-next-line no-await-in-loop
            await enterPercent(element, i, '33.33');
        }
        expect(element.allocatedAmount).toBe(99.99);
        expect(element.isValid).toBe(false);
        expect(status(element)).toBe('warning');

        await click(rowElement(element, 2, 'lightning-button[data-action="takeRemainder"]'));

        expect(element.allocatedAmount).toBe(100);
        expect(element.isValid).toBe(true);
        const records = element.designationRecords;
        expect(records.map((r) => r.Amount)).toEqual([33.33, 33.33, 33.34]);
        const percentSum = records.reduce((s, r) => s + Math.round(r.Percent * 100), 0);
        expect(percentSum).toBe(10000);
    });

    it('TF6: max. 10 Zeilen; Entfernen gibt Betrag frei; min. 1 Zeile', async () => {
        const element = createComponent();
        await flushPromises();
        const addButton = () => element.shadowRoot.querySelector('lightning-button[data-action="addRow"]');

        expect(rowElement(element, 0, 'lightning-button-icon[data-action="remove"]').disabled).toBe(true);

        for (let i = 0; i < 12; i++) {
            // eslint-disable-next-line no-await-in-loop
            await addRow(element);
        }
        expect(rows(element)).toHaveLength(10);
        expect(addButton().disabled).toBe(true);
        expect(element.shadowRoot.querySelector('.gds-max-rows')).not.toBeNull();

        await enterAmount(element, 0, '70');
        await enterAmount(element, 1, '30');
        expect(element.allocatedAmount).toBe(100);

        await click(rowElement(element, 1, 'lightning-button-icon[data-action="remove"]'));
        expect(rows(element)).toHaveLength(9);
        expect(element.allocatedAmount).toBe(70);
        expect(element.shadowRoot.querySelector('.gds-remaining').textContent).toContain('30');
        expect(addButton().disabled).toBe(false);
    });

    it('respektiert maxRows', async () => {
        const element = createComponent({ maxRows: 2 });
        await flushPromises();
        await addRow(element);
        await addRow(element);
        expect(rows(element)).toHaveLength(2);
    });

    it('TF7: gewählte Designation fehlt in anderen Zeilen und kehrt nach Entfernen zurück', async () => {
        const element = createComponent();
        await flushPromises();
        await addRow(element);
        await selectDesignation(element, 0, DESIGNATIONS[0].Id);

        const optionIds = () =>
            rowElement(element, 1, 'c-gift-designation-combobox').options.map((o) => o.id);
        expect(optionIds()).not.toContain(DESIGNATIONS[0].Id);
        // Reihenfolge entspricht der Input-Collection
        expect(optionIds()).toEqual(DESIGNATIONS.slice(1).map((d) => d.Id));

        await addRow(element);
        await click(rowElement(element, 0, 'lightning-button-icon[data-action="remove"]'));
        expect(rowElement(element, 0, 'c-gift-designation-combobox').options.map((o) => o.id))
            .toContain(DESIGNATIONS[0].Id);
    });

    it('TF8: Optionen enthalten Suchtext aus Name und searchFields sowie displayFields', async () => {
        const element = createComponent({ searchFields: 'Code__c', displayFields: 'Code__c, Region__c' });
        await flushPromises();
        const option = rowElement(element, 0, 'c-gift-designation-combobox').options[1];
        expect(option.name).toBe('Kinderhilfe');
        expect(option.details).toEqual(['2000', 'Afrika']);
        expect(option.searchText).toContain('kinderhilfe');
        expect(option.searchText).toContain('2000');
    });

    it('TF9: Gesamtbetrag ändern: Beträge bleiben, Prozente und Validierung aktualisieren sich', async () => {
        const element = createComponent();
        await flushPromises();
        await addRow(element);
        await selectDesignation(element, 0, DESIGNATIONS[0].Id);
        await selectDesignation(element, 1, DESIGNATIONS[1].Id);
        await enterAmount(element, 0, '50');
        await enterAmount(element, 1, '50');
        expect(element.isValid).toBe(true);

        element.totalAmount = 200;
        await flushPromises();

        expect(rowElement(element, 0, 'lightning-input[data-field="amount"]').value).toBe('50');
        expect(rowElement(element, 0, 'lightning-input[data-field="percent"]').value).toBe('25');
        expect(element.isValid).toBe(false);
        expect(status(element)).toBe('warning');
        const lastValid = element.flowEvents.filter((e) => e.attributeName === 'isValid').pop();
        expect(lastValid.attributeValue).toBe(false);
    });

    it('einzelne unberührte Zeile folgt dem Gesamtbetrag (Standardfall)', async () => {
        const element = createComponent({ totalAmount: null });
        await flushPromises();
        element.totalAmount = '250.50';
        await flushPromises();
        expect(rowElement(element, 0, 'lightning-input[data-field="amount"]').value).toBe('250.50');
    });

    it('TF10: Betrag 0 oder leer deaktiviert die Zeilen und blockiert Weiter', async () => {
        for (const total of [0, null, '']) {
            const element = createComponent({ totalAmount: total });
            // eslint-disable-next-line no-await-in-loop
            await flushPromises();
            expect(rowElement(element, 0, 'lightning-input[data-field="amount"]').disabled).toBe(true);
            expect(rowElement(element, 0, 'c-gift-designation-combobox').disabled).toBe(true);
            expect(element.shadowRoot.querySelector('lightning-button[data-action="addRow"]').disabled).toBe(true);
            expect(status(element)).toBe('info');
            const result = element.validate();
            expect(result.isValid).toBe(false);
            expect(result.errorMessage).toBe('c.GDS_EnterAmountFirst');
        }
    });

    it('Pflicht: Zeile mit Betrag ohne Designation ist ungültig und zeigt Fehler nach validate()', async () => {
        const element = createComponent();
        await flushPromises();
        const result = element.validate();
        expect(result.isValid).toBe(false);
        await flushPromises();
        expect(rowElement(element, 0, 'c-gift-designation-combobox').errorMessage).toBe('c.GDS_DesignationRequired');
    });

    it('Pflicht: Betrag muss grösser 0 sein', async () => {
        const element = createComponent();
        await flushPromises();
        await addRow(element);
        await selectDesignation(element, 0, DESIGNATIONS[0].Id);
        await selectDesignation(element, 1, DESIGNATIONS[1].Id);
        await enterAmount(element, 1, '0');
        expect(element.isValid).toBe(false);
        expect(rows(element)[1].querySelector('.gds-row-error').textContent).toContain('c.GDS_AmountGreaterZero');
    });

    it('TF12: Output enthält GiftDesignationId, Amount und Percent', async () => {
        const element = createComponent({ totalAmount: '150' });
        await flushPromises();
        await addRow(element);
        await selectDesignation(element, 0, DESIGNATIONS[0].Id);
        await selectDesignation(element, 1, DESIGNATIONS[1].Id);
        await enterAmount(element, 0, '100');
        await enterAmount(element, 1, '50');

        const lastRecords = element.flowEvents
            .filter((e) => e.attributeName === 'designationRecords')
            .pop().attributeValue;
        expect(lastRecords).toEqual([
            { GiftDesignationId: DESIGNATIONS[0].Id, Amount: 100, Percent: 66.67 },
            { GiftDesignationId: DESIGNATIONS[1].Id, Amount: 50, Percent: 33.33 }
        ]);
        const lastAllocated = element.flowEvents
            .filter((e) => e.attributeName === 'allocatedAmount')
            .pop().attributeValue;
        expect(lastAllocated).toBe(150);
    });

    it('stellt Zeilen aus designationRecords wieder her (Zurück-Navigation)', async () => {
        const element = createComponent({
            designationRecords: [
                { GiftDesignationId: DESIGNATIONS[2].Id, Amount: 60 },
                { GiftDesignationId: DESIGNATIONS[3].Id, Amount: 40 }
            ]
        });
        await flushPromises();
        expect(rows(element)).toHaveLength(2);
        expect(element.isValid).toBe(true);
    });
});
