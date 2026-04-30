import { LightningElement, api } from 'lwc';

export default class PaymentPhoneKeypad extends LightningElement {
    @api buttons = [];
    @api compact = false;

    get gridClass() {
        return this.compact ? 'keypad-grid keypad-compact' : 'keypad-grid';
    }

    get buttonClass() {
        return this.compact ? 'keypad-button keypad-button-sm' : 'keypad-button';
    }

    handleKeyPress(event) {
        this.dispatchEvent(new CustomEvent('keypress', {
            detail: { key: event.currentTarget.dataset.key }
        }));
    }
}
