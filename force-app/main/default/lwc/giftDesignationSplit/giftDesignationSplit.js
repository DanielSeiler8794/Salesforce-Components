import { LightningElement, api } from 'lwc';
import { FlowAttributeChangeEvent } from 'lightning/flowSupport';
import LOCALE from '@salesforce/i18n/locale';
import CURRENCY from '@salesforce/i18n/currency';

import labelColDesignation from '@salesforce/label/c.GDS_ColDesignation';
import labelColAmount from '@salesforce/label/c.GDS_ColAmount';
import labelColPercent from '@salesforce/label/c.GDS_ColPercent';
import labelAddRow from '@salesforce/label/c.GDS_AddRow';
import labelRemoveRow from '@salesforce/label/c.GDS_RemoveRow';
import labelTakeRemainder from '@salesforce/label/c.GDS_TakeRemainder';
import labelTotalAmount from '@salesforce/label/c.GDS_TotalAmount';
import labelAllocatedAmount from '@salesforce/label/c.GDS_AllocatedAmount';
import labelRemainingAmount from '@salesforce/label/c.GDS_RemainingAmount';
import labelEnterAmountFirst from '@salesforce/label/c.GDS_EnterAmountFirst';
import labelOverAllocated from '@salesforce/label/c.GDS_OverAllocated';
import labelRowOverAllocated from '@salesforce/label/c.GDS_RowOverAllocated';
import labelRemainingOpen from '@salesforce/label/c.GDS_RemainingOpen';
import labelFullyAllocated from '@salesforce/label/c.GDS_FullyAllocated';
import labelDesignationRequired from '@salesforce/label/c.GDS_DesignationRequired';
import labelAmountGreaterZero from '@salesforce/label/c.GDS_AmountGreaterZero';
import labelMaxRowsReached from '@salesforce/label/c.GDS_MaxRowsReached';
import labelValidateError from '@salesforce/label/c.GDS_ValidateError';
import labelNoDesignations from '@salesforce/label/c.GDS_NoDesignations';

import {
    parseNumber,
    toCents,
    fromCents,
    percentFromCents,
    centsFromPercent,
    sumCents,
    outputPercents,
    overAllocatedRowKeys,
    getFieldValue,
    parseFieldList
} from './splitCalculations';

const ABSOLUTE_MAX_ROWS = 10;

/** Ersetzt {0}, {1}, ... in einem Custom Label. */
function formatLabel(label, ...args) {
    return label.replace(/\{(\d+)\}/g, (match, index) =>
        args[index] !== undefined ? args[index] : match
    );
}

/**
 * Gift Designation Split – Screen-Flow-Komponente.
 *
 * Verteilt den Betrag einer Gift Transaction auf 1 bis max. 10 Gift
 * Designations. Die Komponente speichert nichts selbst; sie gibt das Ergebnis
 * als Collection von GiftTransactionDesignation-Records an den Flow zurück.
 */
export default class GiftDesignationSplit extends LightningElement {
    // --- Input-Parameter ------------------------------------------------------

    /** Kommagetrennte API-Namen von Zusatzfeldern für die Suchtreffer */
    @api displayFields;
    /** Kommagetrennte API-Namen von zusätzlich durchsuchbaren Feldern */
    @api searchFields;
    /** Optional: in der ersten Zeile vorausgewählte Gift Designation */
    @api defaultDesignationId;

    labels = {
        colDesignation: labelColDesignation,
        colAmount: labelColAmount,
        colPercent: labelColPercent,
        addRow: labelAddRow,
        removeRow: labelRemoveRow,
        takeRemainder: labelTakeRemainder,
        totalAmount: labelTotalAmount,
        allocatedAmount: labelAllocatedAmount,
        remainingAmount: labelRemainingAmount,
        enterAmountFirst: labelEnterAmountFirst,
        noDesignations: labelNoDesignations
    };

    /**
     * Interner Zeilenzustand:
     * { key, designationId, amountCents, amountInput, percentInput, touched }
     * amountInput/percentInput halten den angezeigten Eingabewert, damit die
     * Eingabe des Users während des Tippens nicht überschrieben wird.
     */
    rows = [];

    /** Nach validate() werden auch Fehler unberührter Zeilen angezeigt */
    showAllErrors = false;

    _totalCents = null;
    _availableDesignations = [];
    _maxRows = ABSOLUTE_MAX_ROWS;
    _initialRecords;
    _isConnected = false;
    _keyCounter = 0;
    /** Solange true, folgt die einzige Zeile automatisch dem Gesamtbetrag */
    _autoFill = true;
    _lastOutput = {};

    // --- Reaktive Input-Parameter -------------------------------------------

    /** Gesamtbetrag der Spende (reaktiv). Als Text/Zahl akzeptiert. */
    @api
    get totalAmount() {
        return fromCents(this._totalCents);
    }
    set totalAmount(value) {
        const cents = toCents(value);
        if (cents === this._totalCents) {
            return;
        }
        this._totalCents = cents;
        if (this._isConnected) {
            this.handleTotalChange();
        }
    }

    /** GiftDesignation-Records aus einem Get Records im Flow */
    @api
    get availableDesignations() {
        return this._availableDesignations;
    }
    set availableDesignations(value) {
        this._availableDesignations = Array.isArray(value) ? value : [];
    }

    /** Maximale Anzahl Zeilen (1–10, Default 10) */
    @api
    get maxRows() {
        return this._maxRows;
    }
    set maxRows(value) {
        const num = parseNumber(value);
        this._maxRows =
            num === null
                ? ABSOLUTE_MAX_ROWS
                : Math.min(Math.max(Math.floor(num), 1), ABSOLUTE_MAX_ROWS);
    }

    // --- Output-Parameter (zusätzlich Input, um Zurück-Navigation zu erlauben)

    /** Je Zeile ein GiftTransactionDesignation-Record (GiftDesignationId, Amount, Percent) */
    @api
    get designationRecords() {
        return this.buildOutputRecords();
    }
    set designationRecords(value) {
        if (!this._isConnected) {
            this._initialRecords = value;
        }
    }

    /** Summe der verteilten Beträge */
    @api
    get allocatedAmount() {
        return fromCents(sumCents(this.rows));
    }

    /** true, wenn genau 100 % verteilt sind */
    @api
    get isValid() {
        return this.computeIsValid();
    }

    // --- Lifecycle -----------------------------------------------------------

    connectedCallback() {
        this._isConnected = true;
        if (this.rows.length === 0) {
            this.initRows();
        }
        this.notifyFlow();
    }

    disconnectedCallback() {
        this._isConnected = false;
    }

    initRows() {
        const restored = this.restoreRows(this._initialRecords);
        if (restored.length > 0) {
            this.rows = restored;
            this._autoFill = false;
            this.refreshPercents();
            return;
        }
        const defaultId = this.isAvailable(this.defaultDesignationId)
            ? this.defaultDesignationId
            : null;
        const row = this.createRow(defaultId);
        if (this.hasTotal) {
            this.setRowAmount(row, this._totalCents);
        }
        this.rows = [row];
        this._autoFill = true;
    }

    /** Stellt Zeilen aus einem früheren Output wieder her (Flow „Zurück“). */
    restoreRows(records) {
        if (!Array.isArray(records) || records.length === 0) {
            return [];
        }
        return records.slice(0, this._maxRows).map((record) => {
            const designationId = this.isAvailable(record.GiftDesignationId)
                ? record.GiftDesignationId
                : null;
            const row = this.createRow(designationId);
            const cents = toCents(record.Amount);
            if (cents !== null) {
                this.setRowAmount(row, cents);
            }
            row.touched = true;
            return row;
        });
    }

    createRow(designationId = null) {
        this._keyCounter += 1;
        return {
            key: `row-${this._keyCounter}`,
            designationId,
            amountCents: null,
            amountInput: null,
            percentInput: null,
            touched: false
        };
    }

    setRowAmount(row, cents) {
        row.amountCents = cents;
        row.amountInput = cents === null ? null : fromCents(cents).toFixed(2);
        row.percentInput = this.formatPercentInput(
            percentFromCents(cents, this._totalCents)
        );
    }

    formatPercentInput(percent) {
        return percent === null ? null : String(percent);
    }

    isAvailable(designationId) {
        return (
            !!designationId &&
            this._availableDesignations.some(
                (designation) => designation.Id === designationId
            )
        );
    }

    // --- Reaktion auf Änderungen des Gesamtbetrags ---------------------------

    handleTotalChange() {
        if (this._autoFill && this.rows.length === 1) {
            // Standardfall: einzige, unberührte Zeile erhält den vollen Betrag
            const row = { ...this.rows[0] };
            this.setRowAmount(row, this.hasTotal ? this._totalCents : null);
            this.rows = [row];
        } else {
            // Beträge bleiben bestehen, Prozente werden neu berechnet
            this.refreshPercents();
        }
        this.notifyFlow();
    }

    refreshPercents() {
        this.rows = this.rows.map((row) => ({
            ...row,
            percentInput: this.formatPercentInput(
                percentFromCents(row.amountCents, this._totalCents)
            )
        }));
    }

    // --- Event-Handler -------------------------------------------------------

    handleDesignationSelect(event) {
        const key = event.target.dataset.key;
        this.updateRow(key, (row) => {
            row.designationId = event.detail.value;
            row.touched = true;
        });
    }

    handleAmountChange(event) {
        const key = event.target.dataset.key;
        const raw = event.detail.value;
        this._autoFill = false;
        this.updateRow(key, (row) => {
            row.amountInput = raw;
            row.amountCents = toCents(raw);
            row.percentInput = this.formatPercentInput(
                percentFromCents(row.amountCents, this._totalCents)
            );
            row.touched = true;
        });
    }

    handlePercentChange(event) {
        const key = event.target.dataset.key;
        const raw = event.detail.value;
        this._autoFill = false;
        this.updateRow(key, (row) => {
            row.percentInput = raw;
            row.amountCents = centsFromPercent(raw, this._totalCents);
            row.amountInput =
                row.amountCents === null
                    ? null
                    : fromCents(row.amountCents).toFixed(2);
            row.touched = true;
        });
    }

    /** Nach Verlassen eines Feldes werden die Werte normalisiert angezeigt. */
    handleFieldBlur(event) {
        const key = event.target.dataset.key;
        this.updateRow(
            key,
            (row) => {
                row.amountInput =
                    row.amountCents === null
                        ? null
                        : fromCents(row.amountCents).toFixed(2);
                row.percentInput = this.formatPercentInput(
                    percentFromCents(row.amountCents, this._totalCents)
                );
            },
            false
        );
    }

    handleTakeRemainder(event) {
        const key = event.target.dataset.key;
        const remaining = this.remainingCents;
        this._autoFill = false;
        this.updateRow(key, (row) => {
            const cents = Math.max(0, (row.amountCents || 0) + remaining);
            this.setRowAmount(row, cents);
            row.touched = true;
        });
    }

    handleAddRow() {
        if (!this.canAddRow) {
            return;
        }
        this._autoFill = false;
        this.rows = [...this.rows, this.createRow()];
        this.notifyFlow();
    }

    handleRemoveRow(event) {
        if (this.rows.length <= 1) {
            return;
        }
        const key = event.target.dataset.key;
        this._autoFill = false;
        this.rows = this.rows.filter((row) => row.key !== key);
        this.notifyFlow();
    }

    updateRow(key, mutate, notify = true) {
        this.rows = this.rows.map((row) => {
            if (row.key !== key) {
                return row;
            }
            const copy = { ...row };
            mutate(copy);
            return copy;
        });
        if (notify) {
            this.notifyFlow();
        }
    }

    // --- Berechnete Werte ----------------------------------------------------

    get hasTotal() {
        return this._totalCents !== null && this._totalCents > 0;
    }

    get isDisabled() {
        return !this.hasTotal;
    }

    get allocatedCents() {
        return sumCents(this.rows);
    }

    get remainingCents() {
        return (this._totalCents || 0) - this.allocatedCents;
    }

    get effectiveMaxRows() {
        return this._maxRows;
    }

    get canAddRow() {
        return (
            this.hasTotal &&
            this.rows.length < this.effectiveMaxRows &&
            this.rows.length < this._availableDesignations.length
        );
    }

    get isAddRowDisabled() {
        return !this.canAddRow;
    }

    get isMaxRowsReached() {
        return this.rows.length >= this.effectiveMaxRows;
    }

    get maxRowsMessage() {
        return formatLabel(labelMaxRowsReached, this.effectiveMaxRows);
    }

    get hasNoDesignations() {
        return this._availableDesignations.length === 0;
    }

    get searchFieldList() {
        return parseFieldList(this.searchFields);
    }

    get displayFieldList() {
        return parseFieldList(this.displayFields);
    }

    /** Alle Designations als Combobox-Optionen, in Reihenfolge der Input-Collection. */
    get allOptions() {
        const searchFieldList = this.searchFieldList;
        const displayFieldList = this.displayFieldList;
        return this._availableDesignations.map((designation) => {
            const searchValues = [designation.Name]
                .concat(
                    searchFieldList.map((field) =>
                        getFieldValue(designation, field)
                    )
                )
                .filter((value) => value !== null && value !== undefined);
            const details = displayFieldList
                .map((field) => getFieldValue(designation, field))
                .filter(
                    (value) =>
                        value !== null && value !== undefined && value !== ''
                )
                .map((value) => String(value));
            return {
                id: designation.Id,
                name: designation.Name,
                details,
                searchText: searchValues.join(' ').toLowerCase()
            };
        });
    }

    get overAllocatedKeys() {
        return this.hasTotal
            ? overAllocatedRowKeys(this.rows, this._totalCents)
            : new Set();
    }

    rowErrors(row, overKeys) {
        const errors = { designation: null, amount: null };
        if (!this.hasTotal) {
            return errors;
        }
        const show = this.showAllErrors || row.touched;
        if (show && !row.designationId) {
            errors.designation = labelDesignationRequired;
        }
        if (show && !(row.amountCents > 0)) {
            errors.amount = labelAmountGreaterZero;
        } else if (overKeys.has(row.key)) {
            errors.amount = labelRowOverAllocated;
        }
        return errors;
    }

    /** Aufbereitete Zeilen für das Template. */
    get rowViews() {
        const options = this.allOptions;
        const overKeys = this.overAllocatedKeys;
        const remaining = this.remainingCents;
        const disabled = this.isDisabled;
        const canRemove = this.rows.length > 1 && !disabled;

        return this.rows.map((row, index) => {
            // Keine Duplikate: in anderen Zeilen gewählte Designations ausblenden
            const takenElsewhere = new Set(
                this.rows
                    .filter((other) => other.key !== row.key && other.designationId)
                    .map((other) => other.designationId)
            );
            const errors = this.rowErrors(row, overKeys);
            const isOver = overKeys.has(row.key);
            const takeRemainderTarget = Math.max(
                0,
                (row.amountCents || 0) + remaining
            );
            return {
                key: row.key,
                rowNumber: index + 1,
                designationLabel: `${labelColDesignation} ${index + 1}`,
                amountLabel: `${labelColAmount} ${index + 1}`,
                percentLabel: `${labelColPercent} ${index + 1}`,
                designationId: row.designationId,
                options: options.filter(
                    (option) => !takenElsewhere.has(option.id)
                ),
                amountValue: row.amountInput,
                percentValue: row.percentInput,
                designationError: errors.designation,
                amountError: errors.amount,
                hasAmountError: !!errors.amount,
                rowClass:
                    'gds-row slds-grid slds-wrap slds-gutters_x-small slds-p-vertical_x-small' +
                    (isOver ? ' gds-row_error' : ''),
                amountInputClass: errors.amount ? 'slds-has-error' : '',
                disabled,
                isRemoveDisabled: !canRemove,
                isTakeRemainderDisabled:
                    disabled ||
                    remaining === 0 ||
                    takeRemainderTarget === (row.amountCents || 0)
            };
        });
    }

    get formattedTotal() {
        return this.formatCurrency(this._totalCents || 0);
    }

    get formattedAllocated() {
        return this.formatCurrency(this.allocatedCents);
    }

    get formattedRemaining() {
        return this.formatCurrency(this.remainingCents);
    }

    get remainingClass() {
        if (!this.hasTotal) {
            return 'slds-text-heading_small';
        }
        if (this.remainingCents < 0) {
            return 'slds-text-heading_small slds-text-color_error';
        }
        if (this.remainingCents === 0) {
            return 'slds-text-heading_small slds-text-color_success';
        }
        return 'slds-text-heading_small gds-text-warning';
    }

    /** Zentrale Statusmeldung unter der Tabelle. */
    get statusMessage() {
        if (!this.hasTotal) {
            return this.status('info', labelEnterAmountFirst);
        }
        if (this.remainingCents < 0) {
            return this.status(
                'error',
                formatLabel(
                    labelOverAllocated,
                    this.formatCurrency(-this.remainingCents)
                )
            );
        }
        if (this.remainingCents > 0) {
            return this.status(
                'warning',
                formatLabel(
                    labelRemainingOpen,
                    this.formatCurrency(this.remainingCents)
                )
            );
        }
        return this.status('success', labelFullyAllocated);
    }

    status(type, text) {
        return {
            type,
            text,
            className: `gds-status gds-status_${type}`,
            icon: `utility:${type}`,
            role: type === 'error' ? 'alert' : 'status'
        };
    }

    formatCurrency(cents) {
        const value = fromCents(cents) || 0;
        try {
            return new Intl.NumberFormat(LOCALE, {
                style: 'currency',
                currency: CURRENCY,
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }).format(value);
        } catch (e) {
            return value.toFixed(2);
        }
    }

    // --- Validierung & Output ------------------------------------------------

    computeIsValid() {
        if (!this.hasTotal || this.rows.length === 0) {
            return false;
        }
        const rowsComplete = this.rows.every(
            (row) => row.designationId && row.amountCents > 0
        );
        return rowsComplete && this.allocatedCents === this._totalCents;
    }

    buildOutputRecords() {
        const complete = this.rows.filter(
            (row) => row.designationId && row.amountCents > 0
        );
        const percents = outputPercents(
            complete.map((row) => row.amountCents),
            this._totalCents
        );
        return complete.map((row, index) => ({
            GiftDesignationId: row.designationId,
            Amount: fromCents(row.amountCents),
            Percent: percents[index]
        }));
    }

    notifyFlow() {
        const outputs = {
            designationRecords: this.buildOutputRecords(),
            allocatedAmount: fromCents(this.allocatedCents),
            isValid: this.computeIsValid()
        };
        Object.keys(outputs).forEach((name) => {
            const serialized = JSON.stringify(outputs[name]);
            if (this._lastOutput[name] !== serialized) {
                this._lastOutput[name] = serialized;
                this.dispatchEvent(
                    new FlowAttributeChangeEvent(name, outputs[name])
                );
            }
        });
    }

    /**
     * Wird vom Flow beim Klick auf „Weiter“ aufgerufen.
     * Weiter ist nur bei genau 100 % Verteilung möglich.
     */
    @api
    validate() {
        if (this.computeIsValid()) {
            return { isValid: true };
        }
        this.showAllErrors = true;
        return {
            isValid: false,
            errorMessage: this.hasTotal ? labelValidateError : labelEnterAmountFirst
        };
    }
}
