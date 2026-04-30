# LWCPaymentSimulator

This was the second LWC I ever vibe coded, and I've been busy reworking it to be more scalable and adhere to Salesforce design standards. 

Basically it mocks up paying for something using a point of sale (POS) integration with either cash or credit card, and how we can capture information from the end user and use that elsewhere in the system. 

I'm using it as a screen flow, but it can be used elsewhere. 

Originally this LWC had vertical layout like POS solutions you see at restaurants, and it had some cool animations. I'd like to bring those back in a future release. 

**Credit Card Payment**
<img width="800" alt="pos1" src="https://github.com/user-attachments/assets/ccefb0a1-543e-43a3-92d2-e9050d9241ce" />


**Cash Payment**
<img width="800" alt="pos2" src="https://github.com/user-attachments/assets/72241153-e883-49b5-9cfb-0e5eb92f518c" />







---

## How it works

The component is a state machine with six screens that advance in sequence:

```
loading → bill → [cash] → processing → receipt → thankyou
```

`paymentTerminal` is the orchestrator. It owns all state, makes all Apex calls, and handles all Flow events. The screens visible to the user are rendered by child components — none of the children touch Apex or the Flow API directly.

### Screen flow

| Screen | What happens |
|--------|-------------|
| **loading** | Two parallel Apex calls fetch the parent record name and fee line items. When both resolve the bill is built and the screen advances. |
| **bill** | Shows the itemized fee summary, processing fee, and total. The clerk selects a payment method (card or cash) and clicks Process. |
| **cash** *(cash only)* | A numeric keypad lets the clerk enter the tendered amount. Change due is calculated live. The Collect button is disabled until the tendered amount covers the total. |
| **processing** | An animated spinner plays for a configurable number of seconds (card) or instantly (cash). Simulates terminal processing time. |
| **receipt** | Shows the full transaction record. The customer chooses how to receive their receipt: text, email, print, or skip (Done). |
| **thankyou** | Confirmation screen. If `autoAdvance` is enabled the flow moves to the next screen automatically after 1.5 seconds. |

An example of how I use it in context to the rest of a flow. 
<img width="401" height="561" alt="image" src="https://github.com/user-attachments/assets/896fff38-0190-481d-a650-86612263b8c5" />


---

## Project structure

```
force-app/main/default/
├── lwc/
│   ├── paymentTerminal/        Orchestrator — state machine, @api props, Apex, Flow outputs
│   ├── paymentBill/            Bill screen — fee line items, payment method tiles, Process button
│   ├── paymentCashInput/       Cash screen — amount entry, change calculation
│   ├── paymentReceipt/         Receipt screen — transaction summary + text/email/print sub-screens
│   ├── paymentPhoneKeypad/     Reusable numeric keypad used on the text receipt sub-screen
│   └── billStyles/             Shared CSS design tokens and layout classes (imported by all components)
├── classes/
│   ├── PaymentTerminalController.cls         Apex controller — data queries and field writeback
│   ├── PaymentTerminalControllerTest.cls     Unit tests using generic Account/Contact stand-ins
│   └── PaymentTerminalControllerPssTest.cls  Integration tests for PSS objects (RegulatoryTrxnFee, Permit, etc.)
└── staticresources/
    └── paymentPrint.resource   HTML page opened in a popup window when the clerk chooses Print
```

### Component communication

Data flows down via `@api` properties; decisions flow up via `CustomEvent`. Only `paymentTerminal` fires `FlowAttributeChangeEvent` and `FlowNavigationNextEvent`.

```
paymentTerminal
  │  @api props down
  │
  ├── paymentBill          fires: methodselected, processclicked
  ├── paymentCashInput     fires: cashinput, complete, back
  └── paymentReceipt
        ├── (options)      fires: deliveryselected, print
        ├── (text)         fires: sendtext
        │     └── paymentPhoneKeypad   fires: keypress
        └── (email)        fires: sendemail
```

---

## Apex controller

`PaymentTerminalController` exposes three `@AuraEnabled` methods:

| Method | Purpose |
|--------|---------|
| `getFeeItems` | Dynamic SOQL against any child object. Object name, lookup field, name field, amount field, and description field are all passed in as parameters. Names are validated against the org schema before the query runs (`WITH SECURITY_ENFORCED`). |
| `getParentRecordName` | Fetches a single display-name field from the parent record for the receipt header. |
| `markPaymentComplete` | Writes a single field value to the parent record. Available for use from a Screen Flow's Apex Action element if a downstream field stamp is needed. |

Both read methods are `cacheable=true`. All three methods validate object and field names against `Schema.getGlobalDescribe()` before running — invalid names throw an `AuraHandledException` with a descriptive message.

---

## Flow configuration

Add `paymentTerminal` to a Screen Flow screen element. Required inputs:

| Property | Type | Description |
|----------|------|-------------|
| `recordId` | String | ID of the record fees are being collected for |
| `objectApiName` | String | API name of that record's object (e.g. `RegulatoryTrxnFee`) |

All other inputs are optional with defaults. Key ones:

| Property | Default | Description |
|----------|---------|-------------|
| `processingFeeAmount` | `0.025` | Processing fee as a decimal rate (`0.025` = 2.5%) or fixed dollar amount — controlled by `useFixedFee` |
| `useFixedFee` | `false` | When `true`, `processingFeeAmount` is treated as a flat dollar amount instead of a percentage |
| `processingFeeLabel` | `Processing Fee` | Label shown next to the processing fee line |
| `processingFeeLanguage` | *(disclosure text)* | Disclosure text shown below the fee line — set blank to hide it |
| `processingDurationSeconds` | `5` | How long the processing animation plays for card payments |
| `autoAdvance` | `false` | Automatically navigates to the next flow screen 1.5 seconds after Thank You |
| `receiptHeading` | `Invoice` | Large heading on the bill and receipt screens |
| `receiptSubHeading` | `Services Provided` | Smaller heading below the main heading |
| `feeItemsObjectApiName` | `RegulatoryTrxnFeeItem` | Child object holding the fee line items |
| `feeItemsParentField` | `RegulatoryTrxnFeeId` | Lookup field on the fee item pointing to the parent |
| `feeItemsAmountField` | `FeeAmount` | Field holding each line item's dollar amount |

Flow outputs available for use in downstream elements:

| Output | Type | Description |
|--------|------|-------------|
| `paymentComplete` | Boolean | `true` once the customer reaches Thank You |
| `paymentMethod` | String | `card` or `cash` |
| `transactionTotal` | String | Formatted total (e.g. `$112.75`) |
| `receiptDelivery` | String | `text`, `email`, `print`, or `none` |
| `receiptPhoneNumber` | String | 10-digit phone number (digits only) if text was chosen |
| `receiptEmailAddress` | String | Email address if email was chosen |
| `processedPayment` | String | Full transaction JSON — line items, subtotal, processing fee, total, payment method, transaction ID, masked card number, cash tendered, change given, and receipt delivery choice |

### Processing fee math

```
subtotal       = sum of all fee line items
processingFee  = subtotal × rate   (useFixedFee = false)
               = flat amount       (useFixedFee = true)
total          = subtotal + processingFee
```

The rate accepts both `0.025` (decimal) and `2.5` (percent) — anything ≥ 1 is automatically divided by 100 before applying.

### Print receipt

When the customer chooses Print, `paymentTerminal` builds a self-contained HTML receipt string, base64-encodes it, and opens `paymentPrint.resource` in a new popup window with the encoded HTML passed in the URL fragment. The static resource reads the fragment, writes the HTML into the document, and calls `window.print()` automatically.

---

## Deployment

```bash
# Deploy everything
sf project deploy start --source-dir force-app --target-org <your-org>

# Deploy LWC only
sf project deploy start --source-dir force-app/main/default/lwc/paymentTerminal --target-org <your-org>

# Run Apex tests
sf apex run test --class-names PaymentTerminalControllerTest --target-org <your-org> --synchronous
sf apex run test --class-names PaymentTerminalControllerPssTest --target-org <your-org> --synchronous
```

`PaymentTerminalControllerTest` uses `Account` and `Contact` as stand-ins so it runs in any org without a PSS license. `PaymentTerminalControllerPssTest` checks for PSS objects at runtime and skips tests gracefully when the license is not present — it fully executes against any PSS-licensed org.
