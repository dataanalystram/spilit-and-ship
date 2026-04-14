# Gainsight Data Cleaning & ETL Tool - User Guide

## Overview
Welcome to the internal **Split & Save Data Engine**. This application is an automated, browser-based data preparation tool designed to turn "messy", horizontal matrix tables into strictly structured payloads completely compliant with the **Gainsight Company Metrics** and **User Metrics** destinations.

Instead of spending hours executing manual VLOOKUPs, unpivoting columns via complex Excel formulas, or hunting down invisible formatting errors, this tool automatically cleans your file and shapes the data footprint in just three clicks.

---

## Step 1: Upload & Clean
The first stage involves feeding the system your data and letting our automated heuristics purge any critical errors that would cause an ingestion failure in Gainsight.

1. **Access the Engine:** Navigate to the `Data Cleaning & ETL` tab in the main navigation bar.
2. **Upload your File:** Drag and drop your raw `.csv` or `.xlsx` file into the file zone. 
   - *Note on Excel:* If your Excel file contains multiple worksheets, the system will detect them and ask you to select which specific sheet you want to process via a dropdown.
3. **Apply the Cleaning Heuristics:**
   You will see a configuration panel allowing you to clean the data. The following filters are highly recommended and turned on by default:
   - **Drop unnamed/blank columns:** Erases purely empty structural columns that would bloat the database.
   - **De-Duplicate Array:** Protects metrics from being double-counted.
   - **Standardize Dates to YYYY-MM-DD:** Ensures all ambiguous dates fit Gainsight's chronological format.
   - **Apply Gainsight Deep-Clean Rules (17 Fixes):** This is the most crucial step. Our native engine will scan every single cell and remove known Gainsight fatal errors, including: Excel formulas (e.g., `#VALUE!`), corrupted Array brackets (`['Platform']`), dash placeholders (`--`), and invalid Unicode configurations (`U+FFFD`).
4. Click **Execute Cleaning**.

---

## Step 2: "Captain Hindsight" Schema Mapping
Once the data is wiped clean of fatal artifacts, you must map the core dimensions of your file so the system knows how to properly Unpivot (melt) the data into the 11-field standard sequence required by Gainsight.

### 1. Identify Core Dimensions
Use the dropdown selectors to tell the tool which column headers in your file correspond to the core Gainsight IDs:
- **Company ID Column (Required):** Select the column holding your GSID or Salesforce Account ID.
- **Relationship ID (Optional):** Only map this if tracking metrics against specific Relationships.
- **Metric Date:** Tell the tool when this event happened. If left blank, it defaults to the Day of Run.
- **Granularity:** Select Daily, Weekly, Monthly, or Quarterly to classify the reporting cadence.
- **Data Source:** A free-text string to stamp the origin of this data (e.g., "Snowflake PX Dump").

### 2. Identify Baseline / Targets
If your original file contains established Target Goals or Previous Period Baseline values, map them here. These are completely optional, but critical for trending health outcomes.

### 3. Select Metrics to Melt
*(This is where the magic happens)*
Gainsight cannot ingest a file that has 50 different columns for 50 different features. It requires data to be stacked vertically. 
- In the **Select Metrics to Melt / Unpivot** field, simply click on every column name that represents an *Actual Value*. The tool will highlight your choices in bold teal. 
- The system will systematically fold these columns over into a vertical `Metric Name` / `Actual Value` standard layout.

### 4. Select Static Additional Columns
If there are columns you did *not* unpivot but you want them glued to the final CSV permanently (e.g., "Region", "Industry Type"), click them here.

Click **Execute Core Metrics ETL**.

---

## Step 3: Production Pipeline Output
You are almost done! The tool will now display the **Production Payload Preview**.

1. **Verify your Data:** Inspect the first 15 rows in the database preview window to ensure your columns stacked correctly and that your Actual Values dropped into their designated slots.
2. **Export the Package:** Click **Export CSV Payload**. The tool will instantly download a perfectly formatted CSV document compliant natively with RFC 4180 standards.

### Final Step: Gainsight Ingestion
Your new `.csv` document is completely stabilized. 
- You can now safely drag this file into your Gainsight **Data Management > Company Metrics** manual importer.
- Or, you can drop this file into your connected Amazon S3 Bucket to be picked up by your nightly Gainsight Rules Engine process. Because the column headers output by the tool rigidly match the standard, mapping should be virtually handled automatically.
