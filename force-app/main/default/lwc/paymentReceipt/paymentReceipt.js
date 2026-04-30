import { LightningElement, api, track } from 'lwc';

export default class PaymentReceipt extends LightningElement {
    @api billData = {};
    @api processingFeeLabel = 'Processing Fee';
    @api receiptNumber = '';
    @api transactionDate = '';
    @api capitalizedPaymentMethod = '';
    @api saltedCardNumber = '';
    @api isCashPayment = false;
    @api formattedTotal = '$0.00';
    @api formattedCashTendered = '$0.00';
    @api formattedChangeDue = '$0.00';
    @api receiveTexts = false;
    @api keypadButtons = [];

    @track _subScreen = 'options'; // 'options' | 'text' | 'email'
    @track phoneNumber = '';
    @track emailAddress = '';
    @track _receiveTexts = true;

    connectedCallback() {
        this._receiveTexts = this.receiveTexts;
        window.addEventListener('keydown', this._handleGlobalKeydown);
    }

    disconnectedCallback() {
        window.removeEventListener('keydown', this._handleGlobalKeydown);
    }

    // ── Sub-screen getters ────────────────────────────────────────

    get isOptions() { return this._subScreen === 'options'; }
    get isText()    { return this._subScreen === 'text'; }
    get isEmail()   { return this._subScreen === 'email'; }

    // ── Phone display ─────────────────────────────────────────────

    get formattedPhoneNumber() {
        let num = this.phoneNumber.replace(/[^\d]/g, '');
        if (num.length > 10) num = num.substring(0, 10);
        if (num.length > 6)  return `(${num.substring(0,3)}) ${num.substring(3,6)}-${num.substring(6,10)}`;
        if (num.length > 3)  return `(${num.substring(0,3)}) ${num.substring(3)}`;
        if (num.length > 0)  return `(${num}`;
        return '';
    }

    get isPhoneNumberEmpty()  { return this.phoneNumber.length === 0; }
    get isSendTextDisabled()  { return this.phoneNumber.replace(/[^\d]/g, '').length !== 10; }
    get isSendEmailDisabled() { return !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.emailAddress); }

    // ── Delivery option handler ───────────────────────────────────

    handleDeliveryOption(event) {
        const action = event.currentTarget.dataset.action;
        if (action === 'text') {
            this._subScreen = 'text';
        } else if (action === 'email') {
            this._subScreen = 'email';
        } else if (action === 'print') {
            this.dispatchEvent(new CustomEvent('print'));
        } else if (action === 'skip') {
            this.dispatchEvent(new CustomEvent('deliveryselected', { detail: { action: 'skip' } }));
        }
    }

    handleBack() {
        this._subScreen = 'options';
        this.phoneNumber = '';
        this.emailAddress = '';
    }

    // ── Text sub-screen ───────────────────────────────────────────

    handleKeypadKey(event) {
        const key    = event.detail.key;
        let digits   = this.phoneNumber.replace(/[^\d]/g, '');
        if      (key === 'C')  this.phoneNumber = '';
        else if (key === '⌫') this.phoneNumber = digits.slice(0, -1);
        else if (key >= '0' && key <= '9' && digits.length < 10)
            this.phoneNumber = digits + key;
    }

    _handleGlobalKeydown = (event) => {
        if (!this.isText) return;
        const key   = event.key;
        let digits  = this.phoneNumber.replace(/[^\d]/g, '');
        if (key >= '0' && key <= '9') {
            event.preventDefault();
            if (digits.length < 10) this.phoneNumber = digits + key;
        } else if (key === 'Backspace' || key === 'Delete') {
            event.preventDefault();
            this.phoneNumber = digits.slice(0, -1);
        }
    }

    handleTextSignupChange(event) {
        this._receiveTexts = event.detail.checked;
    }

    handleSendText() {
        this.dispatchEvent(new CustomEvent('sendtext', {
            detail: {
                phone: this.phoneNumber.replace(/[^\d]/g, ''),
                optIn: this._receiveTexts
            }
        }));
    }

    // ── Email sub-screen ──────────────────────────────────────────

    handleEmailChange(event) {
        this.emailAddress = event.target.value;
    }

    handleSendEmail() {
        this.dispatchEvent(new CustomEvent('sendemail', {
            detail: { email: this.emailAddress }
        }));
    }
}
