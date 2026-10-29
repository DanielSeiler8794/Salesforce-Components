import { createElement } from 'lwc';
import GiftDesignationCombobox from 'c/giftDesignationCombobox';

const OPTIONS = [
    { id: '1', name: 'Allgemeine Spende', details: ['1000'], searchText: 'allgemeine spende 1000' },
    { id: '2', name: 'Kinderhilfe', details: ['2000', 'Afrika'], searchText: 'kinderhilfe 2000' },
    { id: '3', name: 'Nothilfe', details: [], searchText: 'nothilfe 3000' }
];

function createComponent(props = {}) {
    const element = createElement('c-gift-designation-combobox', {
        is: GiftDesignationCombobox
    });
    Object.assign(element, { label: 'Designation', options: OPTIONS }, props);
    document.body.appendChild(element);
    return element;
}

const flushPromises = () => Promise.resolve();

async function typeSearch(element, value) {
    const input = element.shadowRoot.querySelector('input');
    input.dispatchEvent(new CustomEvent('focus'));
    input.value = value;
    input.dispatchEvent(new CustomEvent('input'));
    await flushPromises();
}

function optionNames(element) {
    return [...element.shadowRoot.querySelectorAll('.option-name')].map((n) => n.textContent);
}

describe('c-gift-designation-combobox', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('zeigt alle Optionen in Input-Reihenfolge', async () => {
        const element = createComponent();
        await typeSearch(element, '');
        expect(optionNames(element)).toEqual(['Allgemeine Spende', 'Kinderhilfe', 'Nothilfe']);
    });

    it('sucht über Name (case-insensitive)', async () => {
        const element = createComponent();
        await typeSearch(element, 'HILFE');
        expect(optionNames(element)).toEqual(['Kinderhilfe', 'Nothilfe']);
    });

    it('sucht über zusätzliche Suchfelder und zeigt displayFields an', async () => {
        const element = createComponent();
        await typeSearch(element, '2000');
        expect(optionNames(element)).toEqual(['Kinderhilfe']);
        expect(element.shadowRoot.querySelector('.option-details').textContent).toBe('2000 · Afrika');
    });

    it('zeigt "keine Treffer"', async () => {
        const element = createComponent();
        await typeSearch(element, 'xyz');
        expect(element.shadowRoot.querySelector('.no-results')).not.toBeNull();
    });

    it('feuert select bei Klick und zeigt die Auswahl', async () => {
        const element = createComponent();
        const handler = jest.fn();
        element.addEventListener('select', handler);
        await typeSearch(element, 'kinder');
        element.shadowRoot
            .querySelector('[role="option"]')
            .dispatchEvent(new CustomEvent('mousedown', { cancelable: true }));
        await flushPromises();

        expect(handler).toHaveBeenCalled();
        expect(handler.mock.calls[0][0].detail).toEqual({ value: '2' });
        expect(element.shadowRoot.querySelector('.selected-name').textContent).toBe('Kinderhilfe');
    });

    it('wählt per Tastatur aus', async () => {
        const element = createComponent();
        const handler = jest.fn();
        element.addEventListener('select', handler);
        await typeSearch(element, '');
        const input = element.shadowRoot.querySelector('input');
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        await flushPromises();
        expect(handler.mock.calls[0][0].detail).toEqual({ value: '2' });
    });

    it('entfernt die Auswahl', async () => {
        const element = createComponent({ value: '1' });
        const handler = jest.fn();
        element.addEventListener('select', handler);
        await flushPromises();
        element.shadowRoot.querySelector('button[data-id="clear"]').click();
        await flushPromises();
        expect(handler.mock.calls[0][0].detail).toEqual({ value: null });
        expect(element.shadowRoot.querySelector('input')).not.toBeNull();
    });

    it('zeigt eine Fehlermeldung', async () => {
        const element = createComponent({ errorMessage: 'Pflichtfeld' });
        await flushPromises();
        expect(element.shadowRoot.querySelector('.slds-form-element__help').textContent).toBe('Pflichtfeld');
    });
});
