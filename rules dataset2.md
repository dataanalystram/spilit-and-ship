Administration > Connectors > S3 Connector; + Data Ingest Job

1) Data Ingest Job Setup

[i]Source CSV File

AVOID having file name with leading spaces
"Source CSV File" should match exactly with "File name" that will be pushed into S3 bucket




[i]File Properties


Ensure source CSV file properties matches with properties defined in Project Setup like Char Encoding, Quote Char, Separator,Header Line, Escape Char
Do not send Char Encoding “UTF-8 WITH BOM”
[i]Data Load Operation 


UPSERT - Ensure you have right keys in place to identify unique records  
AVOID changing UPSERT KEYS once data loaded into MDA object
Utilize "Administration > Operations > Data Management > [i][Click on an existing object] > Update Keys - BETA" feature, to select UPDATE keys at object level. This will allow not to accidentally make changes to the keys in S3 ingest job and ensures integrity.
2) Field Mapping


Source CSV field should match exactly with CSV header names 
AVOID having leading or trailing spaces in CSV header names
AVOID placing special characters in CSV header names (unless required)
AVOID having duplicate CSV header names



3) Schedule 


Utilize option “Send email notification to” to receive notification on S3 job execution details (success or failed)
Prefer POST FILE UPLOAD option and ensure minimum gap of two hours between file uploads.
On any given day, you can upload up to five files with a maximum size of up to 200MB