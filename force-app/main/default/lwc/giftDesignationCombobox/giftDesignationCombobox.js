import { LightningElement, api } from 'lwc';

import labelSearchPlaceholder from '@salesforce/label/c.GDS_SearchPlaceholder';
import labelNoResults from '@salesforce/label/c.GDS_NoResults';
import labelClearSelection from '@salesforce/label/c.GDS_ClearSelection';

const MAX_RESULTS = 50;
let idCounter = 0;

/**
 * Durchsuchbare Combobox für Gift Designations.
 * Sucht ausschliesslich clientseitig in den übergebenen Optionen.
 *
 * Erwartetes Format von options:
 *   [{ id, name, details: ['Wert 1', 'Wert 2'], searchText: 'kleingeschrieben ...' }]
 * Die Reihenfolge der Optionen wird nicht verändert.
 *
 * Event "select": detail = { value: <Id> | null }
 */
export default class GiftDesignationCombobox extends LightningElement {
    @api label;
    @api placeholder = labelSearchPlaceholder;
    @api disabled = false;
    @api required = false;
    /** Fehlermeldung unter dem Feld; leer = kein Fehler */
    @api errorMessage;

    labels = {
        noResults: labelNoResults,
        clearSelection: labelClearSelection
    };

    searchTerm = '';
    isOpen = false;
    activeIndex = -1;

    _options = [];
    _value = null;
    _uid = `gdc-${++idCounter}`;

    @api
    get options() {
        return this._options;
    }
    set options(value) {
        this._options = Array.isArray(value) ? value : [];
    }

    @api
    get value() {
        return this._value;
    }
    set value(val) {
        this._value = val || null;
    }

    get selectedOption() {
        return this._value
            ? this._options.find((option) => option.id === this._value) ||
                  null
            : null;
    }

    get hasSelection() {
        return this._value !== null;
    }

    get selectedName() {
        const option = this.selectedOption;
        return option ? option.name : '';
    }

    get selectedDetails() {
        const option = this.selectedOption;
        return option && option.details ? option.details.join(' · ') : '';
    }

    get filteredOptions() {
        const term = this.searchTerm.trim().toLowerCase();
        const result = [];
        for (const option of this._options) {
            if (option.id === this._value) {
                continue;
            }
            if (!term || (option.searchText || '').includes(term)) {
                result.push(option);
                if (result.length >= MAX_RESULTS) {
                    break;
                }
            }
        }
        return result.map((option, index) => ({
            ...option,
            domId: `${this._uid}-opt-${index}`,
            detailText: option.details ? option.details.join(' · ') : '',
            hasDetails: option.details && option.details.length > 0,
            optionClass:
                'slds-media slds-listbox__option slds-listbox__option_entity slds-listbox__option_has-meta' +
                (index === this.activeIndex ? ' slds-has-focus' : ''),
            ariaSelected: index === this.activeIndex ? 'true' : 'false'
        }));
    }

    get hasResults() {
        return this.filteredOptions.length > 0;
    }

    get listboxId() {
        return `${this._uid}-listbox`;
    }

    get inputId() {
        return `${this._uid}-input`;
    }

    get activeDescendant() {
        return this.activeIndex >= 0
            ? `${this._uid}-opt-${this.activeIndex}`
            : null;
    }

    get comboboxClass() {
        return (
            'slds-combobox slds-dropdown-trigger slds-dropdown-trigger_click' +
            (this.isOpen && !this.disabled ? ' slds-is-open' : '')
        );
    }

    get formElementClass() {
        return 'slds-form-element' + (this.errorMessage ? ' slds-has-error' : '');
    }

    get ariaExpanded() {
        return this.isOpen ? 'true' : 'false';
    }

    get hasError() {
        return !!this.errorMessage;
    }

    get errorId() {
        return `${this._uid}-error`;
    }

    // --- Event-Handler ----------------------------------------------------

    handleFocus() {
        if (!this.disabled) {
            this.isOpen = true;
        }
    }

    handleInput(event) {
        this.searchTerm = event.target.value || '';
        this.activeIndex = -1;
        this.isOpen = true;
    }

    handleBlur() {
        // Verzögert schliessen, damit ein Klick auf eine Option noch greift
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        setTimeout(() => {
            this.isOpen = false;
            this.activeIndex = -1;
        }, 200);
    }

    handleKeyDown(event) {
        const options = this.filteredOptions;
        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                this.isOpen = true;
                this.activeIndex = Math.min(
                    this.activeIndex + 1,
                    options.length - 1
                );
                break;
            case 'ArrowUp':
                event.preventDefault();
                this.activeIndex = Math.max(this.activeIndex - 1, 0);
                break;
            case 'Enter':
                if (this.isOpen && this.activeIndex >= 0 && options[this.activeIndex]) {
                    event.preventDefault();
                    this.select(options[this.activeIndex].id);
                }
                break;
            case 'Escape':
                this.isOpen = false;
                this.activeIndex = -1;
                break;
            default:
                break;
        }
    }

    handleOptionMouseDown(event) {
        // mousedown statt click: feuert vor dem blur des Inputs
        event.preventDefault();
        this.select(event.currentTarget.dataset.id);
    }

    handleClear() {
        if (this.disabled) {
            return;
        }
        this._value = null;
        this.searchTerm = '';
        this.dispatchEvent(new CustomEvent('select', { detail: { value: null } }));
        // Fokus zurück ins Suchfeld, sobald es gerendert ist
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        Promise.resolve().then(() => {
            const input = this.template.querySelector('input');
            if (input) {
                input.focus();
            }
        });
    }

    select(id) {
        this._value = id;
        this.searchTerm = '';
        this.isOpen = false;
        this.activeIndex = -1;
        this.dispatchEvent(new CustomEvent('select', { detail: { value: id } }));
    }
}
