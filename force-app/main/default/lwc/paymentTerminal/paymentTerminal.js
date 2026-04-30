import { LightningElement, api, track } from 'lwc';
import { FlowAttributeChangeEvent, FlowNavigationNextEvent } from 'lightning/flowSupport';
import getFeeItems from '@salesforce/apex/PaymentTerminalController.getFeeItems';
import getParentRecordName from '@salesforce/apex/PaymentTerminalController.getParentRecordName';
import PAYMENT_PRINT from '@salesforce/resourceUrl/paymentPrint';

export default class PaymentTerminal extends LightningElement {

    // ── Record context ──────────────────────────────────────────────
    @api objectApiName;
    @api recordId;

    // ── Receipt display ─────────────────────────────────────────────
    @api receiptHeading    = 'Invoice';
    @api receiptSubHeading = 'Services Provided';

    // ── Fee item data source ─────────────────────────────────────────
    @api feeItemsObjectApiName    = 'RegulatoryTrxnFeeItem';
    @api feeItemsParentField      = 'RegulatoryTrxnFeeId';
    @api feeItemsNameField        = 'Name';
    @api feeItemsAmountField      = 'FeeAmount';
    @api feeItemsDescriptionField = 'Comments';
    @api parentRecordNameField    = 'Name';

    // ── Processing fee mechanics ─────────────────────────────────────
    @api processingFeeLabel    = 'Processing Fee';
    @api processingFeeLanguage = 'A non-refundable service fee is charged per transaction, which goes toward costs of credit card processing, technology, and resources needed to serve you.';
    @api useFixedFee           = false;
    @api processingFeeAmount   = '0.025';
    @api processingDurationSeconds = 5;

    // ── Behavior ─────────────────────────────────────────────────────
    @api autoAdvance      = false;
    @api availableActions = [];

    // ── Screen state machine ─────────────────────────────────────────
    // 'loading' | 'bill' | 'cash' | 'processing' | 'receipt' | 'thankyou'
    @track _screen = 'loading';

    // ── Payment state ─────────────────────────────────────────────────
    @track selectedPaymentMethod;
    @track cashPaidAmount = null;
    @track changeDue      = 0;

    // ── Receipt outputs ───────────────────────────────────────────────
    @track phoneNumber   = '';
    @track emailAddress  = '';
    @track receiveTexts  = true;

    // ── Data ──────────────────────────────────────────────────────────
    @track billData         = {};
    @track receiptNumber    = '';
    @track saltedCardNumber = '';
    @track transactionDate  = '';
    @track error;

    // ── Flow output tracking ──────────────────────────────────────────
    @track _receiptDelivery = 'none';

    // Internal sync flags
    @track _parentNameLoaded = false;
    @track _feeItemsLoaded   = false;
    @track _parentName       = '';
    @track _feeItems         = null;

    keypadButtons = ['1','2','3','4','5','6','7','8','9','C','0','⌫'];

    // ── Screen getters ────────────────────────────────────────────────

    get isLoading()    { return this._screen === 'loading'; }
    get isBill()       { return this._screen === 'bill'; }
    get isCash()       { return this._screen === 'cash'; }
    get isProcessing() { return this._screen === 'processing'; }
    get isReceipt()    { return this._screen === 'receipt'; }
    get isThankYou()   { return this._screen === 'thankyou'; }

    // ── Lifecycle ────────────────────────────────────────────────────

    connectedCallback() {
        this._loadData();
    }

    async _loadData() {
        if (!this.recordId) return;

        const nameCall = getParentRecordName({
            recordId:      this.recordId,
            objectApiName: this.objectApiName || '',
            nameField:     this.parentRecordNameField
        })
        .then(name => {
            this._parentName       = name || '';
            this._parentNameLoaded = true;
            this._tryBuildBillData();
        })
        .catch(() => {
            this._parentName       = '';
            this._parentNameLoaded = true;
            this._tryBuildBillData();
        });

        const itemsCall = getFeeItems({
            parentId:           this.recordId,
            childObjectApiName: this.feeItemsObjectApiName,
            parentLookupField:  this.feeItemsParentField,
            nameField:          this.feeItemsNameField,
            amountField:        this.feeItemsAmountField,
            descriptionField:   this.feeItemsDescriptionField
        })
        .then(data => {
            this._feeItems       = data || [];
            this._feeItemsLoaded = true;
            this._tryBuildBillData();
        })
        .catch(err => {
            this.error           = err;
            this._feeItems       = [];
            this._feeItemsLoaded = true;
            this._tryBuildBillData();
        });

        await Promise.allSettled([nameCall, itemsCall]);
    }

    _tryBuildBillData() {
        if (!this._parentNameLoaded || !this._feeItemsLoaded) return;
        if (this.billData.recordId !== undefined) return;

        this._processBillData({
            recordId:   this.recordId,
            recordName: this._parentName,
            objectType: this.objectApiName,
            lineItems:  this._feeItems || []
        });

        setTimeout(() => { this._screen = 'bill'; }, 200);
    }

    // ── Public @api getters (Flow outputs) ───────────────────────────

    @api
    get paymentMethod() {
        return this.selectedPaymentMethod || 'None';
    }

    @api
    get paymentComplete() {
        return this._screen === 'thankyou';
    }

    @api
    get receiptDelivery() {
        return this._receiptDelivery;
    }

    @api
    get receiptPhoneNumber() {
        return this.phoneNumber.replace(/[^\d]/g, '') || '';
    }

    @api
    get receiptEmailAddress() {
        return this.emailAddress || '';
    }

    @api
    get transactionTotal() {
        return this.billData.formattedTotal || '$0.00';
    }

    @api
    get processedPayment() {
        return JSON.stringify({
            ...this.billData,
            paymentMethodUsed: this.capitalizedPaymentMethod,
            transactionId:     this.receiptNumber,
            cardMaskedNumber:  this.saltedCardNumber,
            amountTendered:    this.cashPaidAmount || this.billData.total,
            changeReturned:    this.changeDue,
            receiptDelivery:   this._receiptDelivery
        }) || '';
    }

    // ── Derived getters ───────────────────────────────────────────────

    get isCashPayment() {
        return this.selectedPaymentMethod === 'cash';
    }

    get capitalizedPaymentMethod() {
        if (!this.selectedPaymentMethod) return '';
        return this.selectedPaymentMethod.charAt(0).toUpperCase()
             + this.selectedPaymentMethod.slice(1);
    }

    get formattedTotal() {
        return this.billData.formattedTotal || '$0.00';
    }

    get formattedCashTendered() {
        const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
        return fmt.format(this.cashPaidAmount || 0);
    }

    get formattedChangeDue() {
        const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
        return fmt.format(Math.max(0, this.changeDue));
    }

    get isCashProcessDisabled() {
        const totalCents = Math.round((this.billData.total || 0) * 100);
        const paidCents  = Math.round((parseFloat(this.cashPaidAmount) || 0) * 100);
        return paidCents < totalCents;
    }

    get isProcessButtonDisabled() {
        return !this.selectedPaymentMethod;
    }

    // ── Bill data processing ──────────────────────────────────────────

    _processBillData(parentRecord) {
        try {
            const items = (parentRecord.lineItems || []).map(item => ({
                name:        item.name,
                description: item.description,
                amount:      item.amount,
                type:        'Fee Item'
            }));

            const round2    = (n) => Math.round(n * 100) / 100;
            const subtotal  = round2(items.reduce((sum, i) => sum + (Number(i.amount) || 0), 0));
            let   feeRate   = parseFloat(this.processingFeeAmount) || 0;
            // Accept both "2.5" (percent) and "0.025" (decimal) — normalize anything ≥ 1 to a decimal
            if (!this.useFixedFee && feeRate >= 1) feeRate = feeRate / 100;
            const processingFeeValue = round2(!this.useFixedFee ? subtotal * feeRate : feeRate);
            const total = round2(subtotal + processingFeeValue);

            const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

            this.billData = {
                recordId:               parentRecord.recordId,
                recordName:             parentRecord.recordName || '',
                objectType:             parentRecord.objectType,
                title:                  'Payment Terminal',
                items:                  items.map(i => ({ ...i, formattedAmount: fmt.format(i.amount) })),
                subtotal,
                processingFee:          processingFeeValue,
                total,
                formattedSubtotal:      fmt.format(subtotal),
                formattedProcessingFee: fmt.format(processingFeeValue),
                formattedTotal:         fmt.format(total)
            };
        } catch (err) {
            this.error    = err;
            this.billData = {};
        }
    }

    // ── Child event handlers: paymentBill ────────────────────────────

    handleMethodSelected(event) {
        this.selectedPaymentMethod = event.detail.method;
        this.error = null;
        this._dispatchFlowAttribute('paymentMethod', this.selectedPaymentMethod);
    }

    handleProcessClicked() {
        if (!this.selectedPaymentMethod) return;
        this.error = null;
        if (this.selectedPaymentMethod === 'cash') {
            this.cashPaidAmount = null;
            this.changeDue      = 0;
            this._screen        = 'cash';
        } else {
            this._startProcessing();
        }
    }

    // ── Child event handlers: paymentCashInput ───────────────────────

    handleCashInput(event) {
        this.cashPaidAmount = event.detail.value;
        this._calculateChange();
    }

    handleCashComplete() {
        if (this.isCashProcessDisabled) return;
        this._screen = 'processing';
        setTimeout(() => {
            this._completePayment(true);
        }, 0);
    }

    handleCashBack() {
        this._screen        = 'bill';
        this.cashPaidAmount = null;
        this.changeDue      = 0;
    }

    _calculateChange() {
        const total = this.billData.total || 0;
        const paid  = this.cashPaidAmount  || 0;
        this.changeDue = Math.round((paid - total) * 100) / 100;
    }

    // ── Child event handlers: paymentReceipt ─────────────────────────

    handleDeliverySelected(event) {
        this._receiptDelivery = event.detail.action === 'skip' ? 'none' : event.detail.action;
        this._finishPayment();
    }

    handlePrint() {
        this._receiptDelivery = 'print';
        this._openPrintWindow();
    }

    handleSendText(event) {
        this.phoneNumber     = event.detail.phone;
        this.receiveTexts    = event.detail.optIn;
        this._receiptDelivery = 'text';
        this._finishPayment();
    }

    handleSendEmail(event) {
        this.emailAddress    = event.detail.email;
        this._receiptDelivery = 'email';
        this._finishPayment();
    }

    // ── Processing start ──────────────────────────────────────────────

    _startProcessing() {
        if (this.selectedPaymentMethod === 'card') {
            this.cashPaidAmount = this.billData.total;
        }
        this._screen = 'processing';
        const durationMs = Math.max(0, (parseFloat(this.processingDurationSeconds) || 5) * 1000);
        setTimeout(() => {
            this._completePayment(false);
        }, durationMs);
    }

    _completePayment() {
        this.receiptNumber    = this._generateTransactionId();
        this.transactionDate  = this._formatDate();
        this.saltedCardNumber = this.selectedPaymentMethod === 'card'
            ? this._generateSaltedCardNumber() : '';
        this._screen = 'receipt';
    }

    // ── Completion logic ──────────────────────────────────────────────

    _finishPayment() {
        this._screen = 'thankyou';

        this._dispatchFlowAttribute('paymentComplete',     true);
        this._dispatchFlowAttribute('paymentMethod',       this.selectedPaymentMethod || 'None');
        this._dispatchFlowAttribute('receiptDelivery',     this._receiptDelivery);
        this._dispatchFlowAttribute('receiptPhoneNumber',  this.receiptPhoneNumber);
        this._dispatchFlowAttribute('receiptEmailAddress', this.receiptEmailAddress);
        this._dispatchFlowAttribute('transactionTotal',    this.transactionTotal);
        this._dispatchFlowAttribute('processedPayment',    this.processedPayment);

        if (this.autoAdvance) {
            const canNext   = this.availableActions.includes('NEXT');
            const canFinish = this.availableActions.includes('FINISH');
            setTimeout(() => {
                if (canNext || canFinish) {
                    this.dispatchEvent(new FlowNavigationNextEvent());
                }
            }, 1500);
        }
    }

    // ── Flow attribute helper ─────────────────────────────────────────

    _dispatchFlowAttribute(name, value) {
        try {
            this.dispatchEvent(new FlowAttributeChangeEvent(name, value));
        } catch (_) {
            // Not in a Flow context — safe to ignore
        }
    }

    // ── Print receipt popup ───────────────────────────────────────────

    _openPrintWindow() {
        const html    = this._buildPrintableReceiptHtml();
        const bytes   = new TextEncoder().encode(html);
        let binary    = '';
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        const encoded = btoa(binary);
        const win     = window.open(PAYMENT_PRINT + '#' + encoded, '_blank', 'width=460,height=720,scrollbars=yes');
        if (!win) window.print();
        else win.focus();
    }

    _buildPrintableReceiptHtml() {
        const items  = this.billData.items || [];
        const isCash = this.isCashPayment;
        const fmt    = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

        const itemRows = items.map(i =>
            `<tr><td>${i.name}</td><td class="r">${i.formattedAmount}</td></tr>`
        ).join('');

        const cashRows = isCash ? `
            <tr><td>Cash Tendered:</td><td class="r">${fmt.format(this.cashPaidAmount || 0)}</td></tr>
            <tr><td>Change Given:</td><td class="r">${fmt.format(Math.max(0, this.changeDue))}</td></tr>` : '';

        const cardRow = this.saltedCardNumber
            ? `<tr><td>Card Number:</td><td class="r">${this.saltedCardNumber}</td></tr>` : '';

        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Receipt — ${this.receiptNumber}</title>
<script>window.onload = function() { window.print(); }</script>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
         font-size: 13px; color: #222; padding: 24px; max-width: 400px; margin: 0 auto; }
  h1 { font-size: 1.25rem; text-align: center; margin-bottom: 2px; }
  .sub { font-size: 0.7rem; text-align: center; color: #666;
         text-transform: uppercase; letter-spacing: 1px; }
  .rec-name { text-align: center; color: #555; margin: 4px 0; }
  hr { border: none; border-top: 1px solid #ddd; margin: 10px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 3px 0; vertical-align: top; }
  td.r { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; padding-left: 8px; }
  .total-row { font-size: 1.1rem; font-weight: 700; border-top: 2px solid #222; }
  .total-row td { padding-top: 6px; }
  .muted td { color: #666; font-size: 0.85rem; }
  @media print { @page { margin: 0.5cm; } body { padding: 0; } }
</style>
</head>
<body>
<h1>Payment Successful!</h1>
<p class="sub">Transaction Receipt</p>
<p class="rec-name">${this.billData.recordName || ''}</p>
<hr>
<table class="muted">
  <tr><td>Transaction ID:</td><td class="r">${this.receiptNumber}</td></tr>
  <tr><td>Date:</td><td class="r">${this.transactionDate}</td></tr>
  <tr><td>Payment Method:</td><td class="r">${this.capitalizedPaymentMethod}</td></tr>
  ${cardRow}
</table>
<hr>
<table>${itemRows}</table>
<hr>
<table>
  <tr class="muted"><td>Subtotal:</td><td class="r">${this.billData.formattedSubtotal}</td></tr>
  <tr class="muted"><td>${this.processingFeeLabel}:</td><td class="r">${this.billData.formattedProcessingFee}</td></tr>
  ${cashRows}
  <tr class="total-row"><td>${isCash ? 'Transaction Total' : 'Amount Paid'}:</td><td class="r">${this.formattedTotal}</td></tr>
</table>
</body>
</html>`;
    }

    // ── Utility helpers ───────────────────────────────────────────────

    _generateTransactionId() {
        const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        let result  = '';
        for (let i = 0; i < 8; i++) result += chars[Math.floor(Math.random() * chars.length)];
        return result;
    }

    _generateSaltedCardNumber() {
        const last4 = Array.from({ length: 4 }, () => Math.floor(Math.random() * 10)).join('');
        return `XXXX-XXXX-XXXX-${last4}`;
    }

    _formatDate() {
        const d  = new Date();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${mm}/${dd}/${d.getFullYear()}`;
    }
}
