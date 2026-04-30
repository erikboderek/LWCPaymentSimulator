public with sharing class PaymentTerminalController {

    /**
     * Fetches fee line items from a configurable child object.
     * All object/field names are validated against the org schema before use
     * to prevent SOQL injection and surface clear errors to the LWC.
     */
    @AuraEnabled(cacheable=true)
    public static List<Map<String, Object>> getFeeItems(
        Id parentId,
        String childObjectApiName,
        String parentLookupField,
        String nameField,
        String amountField,
        String descriptionField
    ) {
        validateObjectAndFields(
            childObjectApiName,
            new List<String>{ parentLookupField, nameField, amountField, descriptionField }
        );

        String query = 'SELECT Id, '
            + String.escapeSingleQuotes(nameField) + ', '
            + String.escapeSingleQuotes(amountField) + ', '
            + String.escapeSingleQuotes(descriptionField)
            + ' FROM ' + String.escapeSingleQuotes(childObjectApiName)
            + ' WHERE ' + String.escapeSingleQuotes(parentLookupField) + ' = :parentId'
            + ' WITH SECURITY_ENFORCED'
            + ' ORDER BY ' + String.escapeSingleQuotes(nameField);

        List<SObject> records = Database.query(query);

        List<Map<String, Object>> result = new List<Map<String, Object>>();
        for (SObject rec : records) {
            Map<String, Object> row = new Map<String, Object>();
            row.put('id',          rec.Id);
            row.put('name',        rec.get(nameField));
            row.put('amount',      rec.get(amountField));
            row.put('description', rec.get(descriptionField));
            result.add(row);
        }
        return result;
    }

    /**
     * Fetches a single display name field from any parent record.
     * Used so the receipt header can show the record's name regardless of object type.
     */
    @AuraEnabled(cacheable=true)
    public static String getParentRecordName(
        Id recordId,
        String objectApiName,
        String nameField
    ) {
        validateObjectAndFields(objectApiName, new List<String>{ nameField });

        String query = 'SELECT ' + String.escapeSingleQuotes(nameField)
            + ' FROM ' + String.escapeSingleQuotes(objectApiName)
            + ' WHERE Id = :recordId'
            + ' WITH SECURITY_ENFORCED'
            + ' LIMIT 1';

        List<SObject> records = Database.query(query);
        if (records.isEmpty()) {
            return null;
        }
        Object val = records[0].get(nameField);
        return val != null ? String.valueOf(val) : null;
    }

    /**
     * Writes a single field update to the parent record on payment completion.
     * Validates schema access and field updateability before DML.
     */
    @AuraEnabled
    public static void markPaymentComplete(
        Id recordId,
        String objectApiName,
        String fieldApiName,
        String fieldValue
    ) {
        validateObjectAndFields(objectApiName, new List<String>{ fieldApiName });

        Schema.SObjectType objType = Schema.getGlobalDescribe().get(objectApiName);
        if (objType == null) {
            throw new AuraHandledException('Object not found: ' + objectApiName);
        }

        Schema.DescribeFieldResult fieldDesc =
            objType.getDescribe().fields.getMap().get(fieldApiName)?.getDescribe();
        if (fieldDesc == null) {
            throw new AuraHandledException('Field not found: ' + fieldApiName + ' on ' + objectApiName);
        }
        if (!fieldDesc.isUpdateable()) {
            throw new AuraHandledException('Field is not updateable: ' + fieldApiName);
        }

        SObject record = objType.newSObject(recordId);
        record.put(fieldApiName, fieldValue);

        try {
            update record;
        } catch (DmlException e) {
            throw new AuraHandledException('Update failed: ' + e.getDmlMessage(0));
        }
    }

    // Validates object exists in schema and that all requested fields exist on it.
    private static void validateObjectAndFields(String objectApiName, List<String> fieldNames) {
        Map<String, Schema.SObjectType> globalDescribe = Schema.getGlobalDescribe();
        Schema.SObjectType objType = globalDescribe.get(objectApiName);
        if (objType == null) {
            throw new AuraHandledException('Invalid object: ' + objectApiName);
        }
        Map<String, Schema.SObjectField> fields = objType.getDescribe().fields.getMap();
        for (String fieldName : fieldNames) {
            if (!fields.containsKey(fieldName.toLowerCase())) {
                throw new AuraHandledException(
                    'Invalid field "' + fieldName + '" on object "' + objectApiName + '"'
                );
            }
        }
    }
}
