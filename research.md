# CSV/TSV File Upload Requirements and Limits in Gainsight CS (NXT)

## Executive Summary

Gainsight CS (NXT) does not support uploading large CSV files directly into the Rules Engine UI; instead, CSV/TSV data must first be loaded into an S3 bucket or a Gainsight object and then consumed via S3 Dataset Tasks or object-based datasets in Rules Engine. Direct CSV uploads within Data Management and other modules are designed for small files (typically around 1 MB), while S3-based ingestion supports much larger files (up to 500 MB via S3 Connector and up to 1 GB per file for S3 Dataset Tasks), subject to additional system-level limits. The often-quoted 2 GB limit applies only to CTA file attachments, not to CSV ingestion paths.[1][2][3][4][5][6][7]

This report consolidates documented requirements, file size limits, and behavioral details for CSV/TSV ingestion across Gainsight CS modules, with emphasis on what is required to use CSV data in Rules Engine without assumptions.

## How CSV Data Enters Gainsight CS

### Data Management: Direct CSV Usage

The Data Management Horizon Experience allows admins to upload a small CSV file when creating a new custom object, solely to define fields, not to ingest large data volumes. The "Upload CSV file" option is available only at object creation time and is explicitly limited to files of size less than or equal to 1 MB. The related limits and constraints document reiterates a 1 MB cap both for creating a custom object via **Data File Upload (CSV)** and for using the **Import Data** option for data ingestion.[8][5]

Data Management’s "Load Data into the Gainsight Object" feature is described as being designed for small files under 1 MB, with the recommendation that larger data loads should use Bulk API or the S3 connector instead. System-level Data Management limits also list a "Total data load file size" of 5 MB for a tenant, which further reinforces that direct UI imports are intended only for small, manual data sets.[5][6][8]

### S3-Based Ingestion (Connectors 2.0 and S3 Dataset)

For production-scale CSV data flows, Gainsight documentation consistently points to S3-based ingestion. Admins upload CSV/TSV files into a Gainsight-managed or customer-managed S3 bucket (often via Cyberduck) and then use:[9][10][7]

- The **Gainsight S3 Connector** for scheduled ingestion into Gainsight objects.
- The **S3 Dataset Task** in Rules Engine.
- The **Amazon S3 data source** in Data Designer.
- Adoption Explorer’s S3-based usage data ingestion.

The **Gainsight S3 Connector** overview states that Gainsight has no storage limit for the S3 bucket itself, but the connector enforces a file size limit of 500 MB per file; files larger than 500 MB generate errors. The dedicated "Upload CSV/TSV Files into S3 Bucket" article for Connectors 2.0 explains that files placed in the S3 bucket’s *input* folder can then be consumed by S3 Connector, S3 Dataset Tasks in Rules, Data Designer, and Adoption Explorer.[10][7]

By contrast, the **S3 Dataset Task in Rules Engine** documentation states explicitly that "CSV/TSV files having a maximum size of 1GB can be loaded" into an S3 Dataset Task. This 1 GB limit applies at the S3 Dataset Task level, and coexists with the 500 MB limit enforced by the S3 Connector for connector-driven ingest jobs.[2][7]

### Journey Orchestrator: CSV Participants

Journey Orchestrator (JO) Programs support direct CSV upload as a participant source, separate from Rules Engine. For JO Programs, the documented limits for CSV participant uploads are:[11]

- Maximum 100,000 records per CSV file.
- Maximum file size 50 MB per CSV.
- Up to 5 CSV files per Program.[11]

CSV sources are used only to drive participant lists, not to create or update arbitrary Gainsight objects. An additional FAQ for the redesigned Advanced Programs notes that multiple CSVs can be uploaded, and each CSV must contain a name field, with all CSVs sharing identical header/column names; it also mentions planned enhancements to support time zones and CSV participants alongside other sources.[12][11]

### User Management and Data Import Lookup

The **Data Import Lookup** article covers how GSIDs can be populated when ingesting data from various channels (CSV file headers, S3 Connector, Rules Engine, Bulk API). When ingesting users via **User Management > Add Users > CSV**, the article shows:[13]

- An *Upload CSV* section where admins browse to select a CSV file from their computer.
- A note that the CSV file name must not contain spaces.
- Mapping between CSV fields and User object fields, with Data Import Lookup used to populate GSID-type fields from other objects.[13]

These details constrain CSV filenames (no spaces) for at least this ingestion path and demonstrate reuse of CSV headers for lookup mapping.[13]

### File Analyzer for CSV/TSV Troubleshooting

The **File Analyzer** (under Administration > Analyzer) allows admins to scan CSV/TSV files for potential issues before or after ingest. Documented limitations for File Analyzer are:[14]

- Only CSV/TSV formats are supported.
- Uploaded files via the UI must be under 10 MB; referenced S3 files must be less than 100 MB.
- Files must contain headers.
- Compressed and encrypted files are not supported.
- Files and error files are stored in S3 for 30 days.[14]

File Analyzer validates data against specific standard objects (User, Company, People, Relationship) but does not perform ingestion itself; it is used to troubleshoot files that will be ingested via other mechanisms.[14]

## Rules Engine and CSV: Documented Requirements

### No Direct CSV Upload into Rules UI

Rules Engine documentation for **Load to Gainsight Object** clearly states that a dataset can be created from the columns of a CSV file in an S3 bucket, and refers readers to the S3 Dataset Task in Rules; it does not describe any direct CSV upload control on the Rules Engine UI. The **Load to Cases** action type, in the Horizon Experience, similarly lists S3 Dataset Task as one of the channels for loading data into Rules Engine, alongside Gainsight objects.[3][15]

In all Rules Engine documentation examined, CSV/TSV files appear only as sources in S3 buckets that are then accessed via S3 Dataset Tasks; there is no documented workflow where an admin uploads a CSV file directly into a rule without going through S3 or a Gainsight object.[15][2][3]

### S3 Dataset Task: Core CSV Requirements for Rules

The **S3 Dataset Task in Rules Engine** article provides the most detailed description of how CSV/TSV files are consumed by Rules Engine. Key documented requirements are:[2]

- **Prerequisites**:
  - An S3 connection must exist in Connectors 2.0.[2]
  - The source CSV/TSV file must already be present in the specified S3 bucket (Gainsight-managed or custom).[2]
  - Date and DateTime values in the file must use one of the formats listed in the Date Configuration section.[2]

- **File Size Limit**:
  - "CSV/TSV files having a maximum size of 1GB can be loaded."[2]

- **Bucket Selection**:
  - Admins choose either **Gainsight Managed** or a custom S3 bucket for the file.[2]

- **File Path and Selection**:
  - File Path operators **Equals** and **Starts with** are available, optionally combined with **Use Date Pattern**.
  - For **Equals**, the exact filename including extension (.csv or .tsv and optional compression extension .gzip or .bzip) must be specified.[2]
  - **Starts with** is used together with a date pattern to ingest from multiple similarly named file fragments (for example, splitting a >10 GB export into 1.5 GB, 2 GB smaller files).[2]

- **File Properties**:
  - **Field Separator**: comma (`,`) for CSV, tab for TSV.[2]
  - **Text Qualifier**: double quote or single quote, used to import values containing special characters.[2]
  - **Escape Character**: backslash, single quote, or double quote; backslash is recommended to avoid data discrepancies.[2]
  - **Compression Type**: none, gzip, or bzip, with matching file extensions required when using Equals.[2]
  - **Is the source file encrypted**: if selected, a PGP key configured with Gainsight is required for decryption.[2]

- **Columns and Data Types**:
  - Column headers are fetched from the CSV/TSV file to define S3 dataset fields.[2]
  - Supported data types for mapping include Boolean, Date, DateTime, Number, String, and GSID.[2]
  - Certain type mappings are explicitly called out as failing (for example, String to Number, DateTime to Date, Date to DateTime), and String to Boolean only maps **True** correctly.[2]

- **Date and DateTime Configuration**:
  - A comprehensive list of allowed Date and DateTime formats is provided, with the requirement that selected formats and time zones match the source file values; otherwise, S3 dataset loading fails.[2]

These requirements define precisely how a CSV/TSV file must be structured and stored so that a Rules Engine S3 Dataset Task can read it successfully.

### Using CSV Data in Rules Actions

Once a CSV-backed S3 dataset exists, it can be used as the source dataset in different Rules Engine action types:

- **Load to Gainsight Object**:
  - The action configuration explicitly notes that the source dataset may be created from the columns of a CSV file in S3, via an S3 Dataset Task.[15]
  - For upsert/update operations, identifiers must be selected, and GSID is recommended when re-uploading modified data back into a Gainsight object.[15]

- **Load to Cases (Horizon)**:
  - Data can be loaded from a Gainsight object or from an S3 Dataset Task whose underlying data may originate from a CSV file in S3.[3]

- Other rule actions that load into standard or custom objects follow the same pattern: they operate over datasets, and those datasets may be driven by CSV/TSV S3 files if an S3 Dataset Task is used.[15][2]

### Rules Engine System Limits

The **Gainsight CS System Limits** article lists an "Uncompressed file size for a task" of 5 GB under the Rules Engine section. This limit refers to the internal uncompressed data volume processed by a task, not a direct CSV upload size. In practice, S3 Dataset Tasks impose a stricter 1 GB per CSV/TSV file limit for S3-based ingestion, and the S3 Connector imposes a 500 MB limit for connector-managed S3 ingest jobs.[6][7][2]

## Other CSV Upload Contexts Relevant to Rules Usage

### Data Designer S3 Datasets

Data Designer uses Amazon S3 as a data source in a manner analogous to Rules Engine’s S3 Dataset Task. The **Use Data from Amazon S3 in Data Designer** article specifies that:[1]

- An S3 connection must be configured in Connectors 2.0.
- The source CSV/TSV file must exist in the chosen Gainsight-managed or custom S3 bucket.
- Admins select files or folders, then configure file properties including field separator, text qualifier, escape character, compression type, and character encoding (UTF-8, UTF-16, ASCII, ISO-8859 variants).[1]
- Optional encryption and archive options are provided similarly to Rules Engine’s S3 Dataset Task.[1]

Data Designer datasets sourced from CSV/TSV in S3 can be joined and transformed, and their resulting objects can later be used as sources in Rules Engine or Query Builder, indirectly propagating CSV data into rules.[6][1]

### Journey Orchestrator Query Builder

The JO **Query Builder** participant source uses existing Gainsight objects (such as Company Person or Relationship Person) or PX events, not direct CSV files. CSV data can still influence Query Builder indirectly if it has already been ingested into Gainsight objects via S3 Connector, Bulk API, or Data Management, but there is no documented feature for uploading CSV directly into Query Builder.[11]

### Reports and Export Limits

Report Builder and Dashboard limitations deal with preview and export limits (for example, Excel exports honoring a 100k row read limit), but they do not describe CSV upload mechanisms. CSV is mentioned primarily as an export format in Query Builder for PX Analytics, with an export limit of 100k rows, not as an ingest path for Rules Engine.[16][2]

## Comparison of CSV-Related Limits Across Modules

The following table summarizes documented CSV/TSV-related size and record limits across Gainsight CS features:

| Feature / Path | Purpose | File Size Limit | Row / Record Limit | Notes |
|----------------|---------|-----------------|--------------------|-------|
| Data Management – Create Object via **Data File Upload (CSV)** | Define object schema (and ingest small data) | 1 MB per CSV[5][8] | Not explicitly stated (small manual loads) | Used during object creation; Upload CSV option not available when editing object.[8] |
| Data Management – **Import Data** option | Direct data ingestion into object | 1 MB per CSV[5] | Not specified | Designed for small files; large loads should use Bulk API or S3 Connector.[8][5] |
| Data Management – "Total data load file size" | Overall Data Management ingest | 5 MB total[6] | N/A | Tenant-level limit for Data Management data load operations. |
| S3 Connector (Connectors 2.0) | Scheduled/batch ingest from S3 CSV/TSV into objects | 500 MB per file[7][10] | Not documented | Gainsight recommends keeping files at or below 200 MB for reliability.[10][7] |
| Rules Engine – S3 Dataset Task | Build rule datasets from S3 CSV/TSV | 1 GB per CSV/TSV file[2] | Not documented | Internal uncompressed dataset limit for any task is 5 GB.[6] |
| Rules Engine – internal task limit | Any rule task (not specific to CSV) | 5 GB uncompressed per task[6] | N/A | Applies regardless of data source; CSV-specific S3 limits still apply. |
| Journey Orchestrator Programs – CSV source | Upload participants list | 50 MB per CSV; up to 5 CSVs per Program[11] | 100,000 records per CSV[11] | CSV source used only for participants, not general data ingestion. |
| Journey Orchestrator – Exclusion list CSV | Exclusion list | Not specified | Not specified | CSV file used to exclude participants; only Email Address field is honored.[11] |
| Journey Orchestrator – Redesigned Advanced Programs | Participants via CSV | Not specified | Not specified | Multiple CSVs can be uploaded; each must include a name field and identical headers.[12] |
| User Management – Add Users via CSV (Data Import Lookup doc) | Load users into User object | Not specified | Not specified | CSV filename must not contain spaces; mapping supports GSID lookups.[13] |
| File Analyzer – direct upload | Scan CSV/TSV for issues | 10 MB per uploaded file; 100 MB per S3 file[14] | Not specified | Requires headers; no compressed or encrypted files.[14] |
| CTA Attachments | Attach files to CTAs | 2 GB per file[4] | N/A | This is an attachment limit; unrelated to CSV ingestion in Rules Engine. |

## Clarifying the 2 GB Limit vs. CSV Ingestion Limits

A Gainsight Community thread on CTA file attachments states that files attached to Timeline entries are limited to a total of 25 MB per Timeline entry, whereas files attached to CTAs (via the documented CTA attachment feature) may be up to 2 GB per file. This 2 GB limit applies only to CTA attachments, not to any CSV or data ingestion path in Rules Engine, Data Management, or Connectors.[4]

All documented CSV ingestion paths (Data Management, S3 Connector, S3 Dataset Task, Journey Orchestrator) enforce substantially smaller limits in the 1–500 MB range per file. Therefore, a 2 GB CSV file cannot be ingested into Gainsight CS Rules Engine or other ingest mechanisms as a single file using documented methods; it must be split into smaller files or handled via external processing before ingestion.[7][5][10][6][11][2]

## Exact Requirements to Use a CSV/TSV File in Rules Engine

This section consolidates the explicit requirements that must be met for a CSV/TSV file to be usable in Rules Engine via S3 Dataset Tasks, without making unstated assumptions.

### 1. Store the File in an Accessible S3 Bucket

- An S3 connection must be configured in Connectors 2.0, pointing either to a Gainsight-managed S3 bucket or to a custom S3 bucket.[7][1][2]
- The CSV/TSV file must be present in the configured bucket under the correct path (for example, within the *input* folder for Gainsight-managed buckets).[10][2]

If S3 Connector is used to ingest the file into objects first, each file must be no larger than 500 MB; larger files will error at the connector layer.[10][7]

### 2. Respect S3 Dataset Task File Limits

- For Rules Engine S3 Dataset Tasks, the CSV/TSV file must be no larger than 1 GB.[2]
- When creating the S3 Dataset Task, admins must select the correct S3 bucket and specify the file path via **Equals** (exact filename) or **Starts with** plus a date pattern.[2]
- When using **Equals**, file extensions must explicitly include `.csv` or `.tsv` and, if compressed, `.gzip` or `.bzip` as appropriate.[2]

### 3. Configure File Properties to Match the File

- **Field Separator**:
  - Comma for CSV files.
  - Tab for TSV files.[2]

- **Text Qualifier**:
  - Double quote or single quote, matching what is used in the file to enclose values that contain special characters.[2]

- **Escape Character**:
  - Backslash, single quote, or double quote; the documentation recommends backslash in the file to avoid data discrepancies.[2]

- **Compression Type**:
  - None, gzip, or bzip, matching the compression and extension of the file stored in S3.[2]

- **Encryption** (if applicable):
  - If the file is PGP-encrypted, the **Is the source file encrypted** option must be enabled and a PGP key configured via Gainsight Support must be selected.[2]

Incorrect or inconsistent configuration of these properties is explicitly described as a cause of rule execution failure.[2]

### 4. Ensure Valid Column Headers and Data Types

- The first row is treated as column headers; S3 Dataset Task displays these headers and allows mapping to dataset fields.[2]
- Supported data types for S3 dataset fields are Boolean, Date, DateTime, Number, String, and GSID.[2]
- Certain type conversions are known to fail and must be avoided (for example, String to Number, DateTime to Date, Date to DateTime).[2]
- For dropdown lists, either labels or GSIDs can be stored in CSV headers and later matched to dropdown items when data is loaded into Gainsight objects via rule actions.[2]

If headers in the CSV/TSV file no longer match the header names configured in the S3 Dataset Task, rule execution fails; documentation advises keeping header names in sync between S3 dataset configuration and the S3 file.[2]

### 5. Use Supported Date and DateTime Formats and Time Zones

- Date and DateTime values in the file must use one of the formats listed in the **Date Configuration** section of the S3 Dataset Task documentation.[2]
- A default Date format, DateTime format, and Time Zone must be selected; if field-level formats are not set, these defaults apply.[2]
- If Date/DateTime formats or time zones selected in configuration do not match those in the file, data loading into the S3 dataset fails.[2]

### 6. Observe Data Management and Object-Level Constraints (when Loading into Objects)

When Rules Engine actions load CSV-derived data into Gainsight objects, object-level constraints described in Data Management and Limits documents apply:

- Objects typically support up to 200 fields.[5]
- Field data types and constraints (string length, number precision, email format, etc.) are enforced during data ingestion.[8][5]
- Identifiers and Data Import Lookup can be used to define upsert keys and populate GSIDs accurately.[8][13]

Rules Engine **Load to Gainsight Object** and **Load to Cases** actions also require appropriate identifier mappings and may mandate specific fields (such as External ID, Case Priority, Case Status for Load to Cases).[3][15]

### 7. No Documented Direct UI Upload of Large CSV Files into Rules Engine

Across all reviewed documentation, there is no description of a UI control in Rules Engine that allows an admin to upload a CSV file directly into a rule without passing through S3 or a Gainsight object; CSV/TSV ingestion for Rules Engine is consistently described via S3 Dataset Tasks or object-based datasets. Community feedback on CSV uploads to Data Management further indicates that admins often prefer to handle significant CSV data through Rules Engine S3 datasets rather than Data Management’s small-file UI, reinforcing this pattern.[17][3][15][2]

## Ongoing and Related Developments

- The redesigned Advanced Programs in Journey Orchestrator already support multiple CSV uploads (with constraints on headers and name fields), and planned updates will allow CSV-based participants to be combined with other data sources and to support different time zones.[12]
- Community feedback about Data Management’s Horizon Experience notes pain points with CSV-based schema creation and direct CSV uploads (performance, usability, lack of upsert options), and explicitly mentions that some admins "will be running CSV uploads via the rules engine instead," aligning with the S3 Dataset Task-centric ingestion model.[17]

No official documentation was found that changes the S3 Dataset Task 1 GB limit, S3 Connector 500 MB limit, or the absence of direct large CSV uploads into Rules Engine as of the latest referenced articles.[6][7][2]

## Key Takeaways for Designing a CSV-Based Workflow on Gainsight CS

- Large CSV/TSV files cannot be uploaded directly into Rules Engine; they must be stored in S3 (Gainsight-managed or custom) and consumed via S3 Dataset Tasks, respecting a per-file limit of 1 GB and connector-level limit of 500 MB.[7][10][2]
- Direct Data Management CSV imports are intentionally constrained to very small files (around 1 MB) and are best suited for schema setup and small, manual data loads rather than ongoing ingestion.[5][8]
- Journey Orchestrator’s CSV participant sources and exclusion lists have their own limits (50 MB and 100k records per CSV) and are independent of Rules Engine ingestion behavior.[11]
- The 2 GB limit that some users observe in Gainsight pertains only to CTA attachments, not to core data ingestion paths; CSV ingestion limits for data processing are significantly lower.[4]
- Any robust CSV-based workflow for analytics or processing should standardize on S3-based ingestion, with careful configuration of file properties, date/time formats, and data types, and then feed Rules Engine via S3 Dataset Tasks and object-based datasets.[7][1][2]