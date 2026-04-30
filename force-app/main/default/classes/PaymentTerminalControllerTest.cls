/**
 * Tests for PaymentTerminalController.
 *
 * Uses Account → Contact as a universally available parent/child pair to cover
 * the dynamic object/field paths without requiring PSS-licensed objects in the
 * test org. The real PSS objects (RegulatoryTrxnFee, RegulatoryTrxnFeeItem, etc.)
 * can be tested in an integration run against a scratch org that has the license.
 */
@isTest
private class PaymentTerminalControllerTest {

    // ── Test data setup ─────────────────────────────────────────────

    @TestSetup
    static void makeData() {
        Account acct = new Account(Name = 'Test Payment Agency', Description = 'Original value');
        insert acct;

        // Two "fee item" rows — Contact stands in for the generic child object
        insert new List<Contact>{
            new Contact(LastName = 'Alpha Fee', AccountId = acct.Id,
                        Title = 'Annual registration charge', Department = 'Licensing'),
            new Contact(LastName = 'Beta Fee',  AccountId = acct.Id,
                        Title = 'Late filing penalty',        Department = 'Enforcement')
        };
    }

    // ══════════════════════════════════════════════════════════════════
    // getFeeItems
    // ══════════════════════════════════════════════════════════════════

    @isTest
    static void getFeeItems_happyPath_returnsNormalizedRows() {
        Account acct = [SELECT Id FROM Account LIMIT 1];

        Test.startTest();
        List<Map<String, Object>> rows = PaymentTerminalController.getFeeItems(
            acct.Id,
            'Contact',
            'AccountId',
            'LastName',
            'Department',
            'Title'
        );
        Test.stopTest();

        System.assertEquals(2, rows.size(), 'Should return one row per child contact');
        // Verify normalized map keys are always present regardless of source field names
        for (Map<String, Object> row : rows) {
            System.assert(row.containsKey('id'),          'Row missing id key');
            System.assert(row.containsKey('name'),        'Row missing name key');
            System.assert(row.containsKey('amount'),      'Row missing amount key');
            System.assert(row.containsKey('description'), 'Row missing description key');
        }
    }

    @isTest
    static void getFeeItems_noChildRecords_returnsEmptyList() {
        Account emptyAcct = new Account(Name = 'Empty Agency');
        insert emptyAcct;

        Test.startTest();
        List<Map<String, Object>> rows = PaymentTerminalController.getFeeItems(
            emptyAcct.Id,
            'Contact',
            'AccountId',
            'LastName',
            'Department',
            'Title'
        );
        Test.stopTest();

        System.assertEquals(0, rows.size(), 'Should return empty list when no child records exist');
    }

    @isTest
    static void getFeeItems_invalidObject_throwsAuraHandledException() {
        Account acct = [SELECT Id FROM Account LIMIT 1];
        Boolean threw = false;

        Test.startTest();
        try {
            PaymentTerminalController.getFeeItems(
                acct.Id, 'NotARealObject__xyz', 'AccountId', 'LastName', 'Department', 'Title'
            );
        } catch (AuraHandledException e) {
            threw = true;
        }
        Test.stopTest();

        System.assert(threw, 'Expected AuraHandledException for non-existent object');
    }

    @isTest
    static void getFeeItems_invalidNameField_throwsAuraHandledException() {
        Account acct = [SELECT Id FROM Account LIMIT 1];
        Boolean threw = false;

        Test.startTest();
        try {
            PaymentTerminalController.getFeeItems(
                acct.Id, 'Contact', 'AccountId', 'NotARealField__xyz', 'Department', 'Title'
            );
        } catch (AuraHandledException e) {
            threw = true;
        }
        Test.stopTest();

        System.assert(threw, 'Expected AuraHandledException for invalid name field');
    }

    @isTest
    static void getFeeItems_invalidAmountField_throwsAuraHandledException() {
        Account acct = [SELECT Id FROM Account LIMIT 1];
        Boolean threw = false;

        Test.startTest();
        try {
            PaymentTerminalController.getFeeItems(
                acct.Id, 'Contact', 'AccountId', 'LastName', 'NotARealField__xyz', 'Title'
            );
        } catch (AuraHandledException e) {
            threw = true;
        }
        Test.stopTest();

        System.assert(threw, 'Expected AuraHandledException for invalid amount field');
    }

    @isTest
    static void getFeeItems_invalidParentLookupField_throwsAuraHandledException() {
        Account acct = [SELECT Id FROM Account LIMIT 1];
        Boolean threw = false;

        Test.startTest();
        try {
            PaymentTerminalController.getFeeItems(
                acct.Id, 'Contact', 'NotARealLookup__xyz', 'LastName', 'Department', 'Title'
            );
        } catch (AuraHandledException e) {
            threw = true;
        }
        Test.stopTest();

        System.assert(threw, 'Expected AuraHandledException for invalid parent lookup field');
    }

    // ══════════════════════════════════════════════════════════════════
    // getParentRecordName
    // ══════════════════════════════════════════════════════════════════

    @isTest
    static void getParentRecordName_happyPath_returnsFieldValue() {
        Account acct = [SELECT Id FROM Account WHERE Name = 'Test Payment Agency' LIMIT 1];

        Test.startTest();
        String result = PaymentTerminalController.getParentRecordName(
            acct.Id, 'Account', 'Name'
        );
        Test.stopTest();

        System.assertEquals('Test Payment Agency', result, 'Should return the Account Name');
    }

    @isTest
    static void getParentRecordName_nonExistentRecord_returnsNull() {
        // Well-formed ID that does not correspond to any real record
        Id fakeId = '001000000000001AAA';

        Test.startTest();
        String result = PaymentTerminalController.getParentRecordName(
            fakeId, 'Account', 'Name'
        );
        Test.stopTest();

        System.assertEquals(null, result, 'Should return null when no record is found');
    }

    @isTest
    static void getParentRecordName_invalidObject_throwsAuraHandledException() {
        Boolean threw = false;

        Test.startTest();
        try {
            PaymentTerminalController.getParentRecordName(
                '001000000000001AAA', 'NotARealObject__xyz', 'Name'
            );
        } catch (AuraHandledException e) {
            threw = true;
        }
        Test.stopTest();

        System.assert(threw, 'Expected AuraHandledException for invalid object');
    }

    @isTest
    static void getParentRecordName_invalidField_throwsAuraHandledException() {
        Account acct = [SELECT Id FROM Account LIMIT 1];
        Boolean threw = false;

        Test.startTest();
        try {
            PaymentTerminalController.getParentRecordName(
                acct.Id, 'Account', 'NotARealField__xyz'
            );
        } catch (AuraHandledException e) {
            threw = true;
        }
        Test.stopTest();

        System.assert(threw, 'Expected AuraHandledException for invalid field');
    }

    // ══════════════════════════════════════════════════════════════════
    // markPaymentComplete
    // ══════════════════════════════════════════════════════════════════

    @isTest
    static void markPaymentComplete_happyPath_updatesField() {
        Account acct = [SELECT Id FROM Account WHERE Name = 'Test Payment Agency' LIMIT 1];

        Test.startTest();
        PaymentTerminalController.markPaymentComplete(
            acct.Id, 'Account', 'Description', 'Payment Received'
        );
        Test.stopTest();

        Account updated = [SELECT Description FROM Account WHERE Id = :acct.Id];
        System.assertEquals('Payment Received', updated.Description,
            'Description field should reflect the written value');
    }

    @isTest
    static void markPaymentComplete_invalidObject_throwsAuraHandledException() {
        Account acct = [SELECT Id FROM Account LIMIT 1];
        Boolean threw = false;

        Test.startTest();
        try {
            PaymentTerminalController.markPaymentComplete(
                acct.Id, 'NotARealObject__xyz', 'Description', 'Paid'
            );
        } catch (AuraHandledException e) {
            threw = true;
        }
        Test.stopTest();

        System.assert(threw, 'Expected AuraHandledException for invalid object');
    }

    @isTest
    static void markPaymentComplete_invalidField_throwsAuraHandledException() {
        Account acct = [SELECT Id FROM Account LIMIT 1];
        Boolean threw = false;

        Test.startTest();
        try {
            PaymentTerminalController.markPaymentComplete(
                acct.Id, 'Account', 'NotARealField__xyz', 'Paid'
            );
        } catch (AuraHandledException e) {
            threw = true;
        }
        Test.stopTest();

        System.assert(threw, 'Expected AuraHandledException for invalid field');
    }

    @isTest
    static void markPaymentComplete_nonUpdateableField_throwsAuraHandledException() {
        Account acct = [SELECT Id FROM Account LIMIT 1];
        Boolean threw = false;

        Test.startTest();
        try {
            // CreatedDate exists in the field map but isUpdateable() returns false
            PaymentTerminalController.markPaymentComplete(
                acct.Id, 'Account', 'CreatedDate', '2024-01-01'
            );
        } catch (AuraHandledException e) {
            threw = true;
        }
        Test.stopTest();

        System.assert(threw, 'Expected AuraHandledException for non-updateable field');
    }

    @isTest
    static void markPaymentComplete_writesPicklistValue() {
        // Verify the method works with a picklist field (common for StatusCode patterns)
        // Using Account.Industry (a picklist) as a stand-in
        Account acct = [SELECT Id FROM Account LIMIT 1];

        Test.startTest();
        PaymentTerminalController.markPaymentComplete(
            acct.Id, 'Account', 'Industry', 'Government'
        );
        Test.stopTest();

        Account updated = [SELECT Industry FROM Account WHERE Id = :acct.Id];
        System.assertEquals('Government', updated.Industry,
            'Picklist field should be updated to the supplied value');
    }
}
