When uploading CSVs to S3 for use in Gainsight's Rules Engine, please ensure the following before each upload:
Date fields should all follow the same format throughout the column. We recommend yyyy-MM-dd (e.g., 2024-03-15).
DateTime fields should be standardized to yyyy-MM-dd'T'HH:mm:ss (e.g., 2024-03-15T14:30:00). If your values include a timezone offset, it must match the timezone configured in the rule — when in doubt, convert everything to UTC.
Identifier/key fields must never be blank or null — these are required for Gainsight to match and load records correctly.
Boolean fields should only contain True or False. Empty values will default to False.
Embedded double quotes within a field value must be escaped by doubling them (e.g., "John Smith aka ""Smithy"").
Backslashes in data values should be escaped as \\.
Column headers must match exactly what is registered in the S3 Dataset task in the Rules Engine — any mismatch will cause the rule to fail entirely.
File properties should be: UTF-8 encoding, comma as the field separator, double quotes as the text qualifier, and no spaces in the filename.
Following these standards before each upload will eliminate the majority of ingestion failures and partial success outcomes.