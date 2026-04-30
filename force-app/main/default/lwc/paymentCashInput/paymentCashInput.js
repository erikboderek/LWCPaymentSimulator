import { LightningElement, api } from 'lwc';

export default class PaymentCashInput extends LightningElement {
    @api formattedTotal = '$0.00';
    @api cashPaidAmount = null;
    @api formattedChangeDue = '$0.00';
    @api isCashProcessDisabled = false;

    handleCashChange(event) {
        this.dispatchEvent(new CustomEvent('cashinput', {
            detail: { value: parseFloat(event.detail.value) || 0 }
        }));
    }

    handleComplete() {
        this.dispatchEvent(new CustomEvent('complete'));
    }

    handleBack() {
        this.dispatchEvent(new CustomEvent('back'));
    }
}
