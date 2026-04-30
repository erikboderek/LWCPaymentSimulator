import { LightningElement, api } from 'lwc';

export default class PaymentBill extends LightningElement {
    @api billData = {};
    @api receiptHeading = 'Invoice';
    @api receiptSubHeading = 'Services Provided';
    @api processingFeeLabel = 'Processing Fee';
    @api processingFeeLanguage = '';
    @api selectedPaymentMethod = '';
    @api isProcessButtonDisabled = false;

    get cardOptionClass() {
        return this.selectedPaymentMethod === 'card' ? 'payment-option selected' : 'payment-option';
    }

    get cashOptionClass() {
        return this.selectedPaymentMethod === 'cash' ? 'payment-option selected' : 'payment-option';
    }

    handleMethodSelect(event) {
        this.dispatchEvent(new CustomEvent('methodselected', {
            detail: { method: event.currentTarget.dataset.method }
        }));
    }

    handleProcessClick() {
        this.dispatchEvent(new CustomEvent('processclicked'));
    }
}
