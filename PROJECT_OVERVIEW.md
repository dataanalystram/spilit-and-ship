# Split & Ship — Project Overview & Next-Level Roadmap

> **Internal Project Documentation**
> Last Updated: 10th April 2026
> CTO: Mark Deegan | Lab Team: Ram Somaraju, Laxman Prasad Somaraju

---

## 1. What Is This Project?

**Split & Ship (Gainsight Edition)** is a browser-based data operations toolkit built to solve a persistent, painful problem in Gainsight implementations: customers hand over messy CSV/Excel files, and consultants burn days cleaning and importing that data into Gainsight.

The tool currently runs as a **Vite + React + TypeScript** SPA, deployed on **Vercel** as a static site. All processing happens 100% client-side — no data ever leaves the browser.

### Current Capabilities (What's Built Today)

| Feature | Status | Description |
|---------|--------|-------------|
| **CSV Splitter** | ✅ Done | Drag-and-drop a CSV (even 10GB+), split it into Gainsight-safe 200MB chunks with headers preserved. Uses Web Workers + `File.slice()` for memory-safe streaming. |
| **Rich Text Formatter** | ✅ Done | Upload a CSV, auto-detect HTML/rich-text columns, validate against Gainsight limits (255 chars for strings, 131K for rich text), format to RFC 4180 compliance, and download a clean CSV. |
| **Gainsight Validation** | ✅ Done | Checks encoding (UTF-8), character limits, field consistency, and recommends import method (Direct Upload vs Bulk API vs S3). |

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19 + TypeScript |
| Build | Vite 7 |
| Styling | TailwindCSS 3 |
| CSV Parsing | PapaParse 5 |
| ZIP Bundling | JSZip 3 |
| Large File Streaming | `File.slice()` + Web Workers |
| Hosting | Vercel (static) |

### Project Structure

```
split-and-save/
├── src/
│   ├── App.tsx                    # Main app — tab navigation (Splitter / Formatter)
│   ├── worker.ts                  # Web Worker — file splitting engine
│   ├── types.ts                   # TypeScript interfaces
│   ├── components/
│   │   ├── DropZone.tsx           # Drag-and-drop file upload
│   │   ├── Configuration.tsx      # Split settings (Gainsight mode / Custom)
│   │   └── RichTextFormatter.tsx  # CSV validator + RFC 4180 formatter
│   └── lib/
│       ├── gainsight-validator.ts # Gainsight-specific validation rules
│       ├── rfc4180-formatter.ts   # RFC 4180 CSV formatting + download
│       └── utils.ts              # Utility helpers (cn/clsx)
├── scripts/                       # Test data generators
├── test-files/                    # Sample CSVs for testing
├── prd/email.md                   # Rich Text Formatter PRD
├── prds                           # Original CSV Splitter PRD
├── vercel.json                    # Security headers config
└── package.json
```

---

## 2. The Problem We're Solving (From Mark Deegan)

> *"Every fucking customer that has a data warehouse team... it's the same conversation. 'We can't get you the data.' Give us your CSV files, we'll dump it into our tool, we'll ETL it into a solution."*
> — Mark Deegan, 10th Apr 2026

### The Root Cause

Gainsight is poor at ETL-ing data without human intervention. Every customer engagement follows the same painful cycle:

1. **Customer gives shitty CSV/Excel files** — wrong formatting, bad date formats, special characters, duplicate records, blank columns with no name and a single value across 23,000+ rows.
2. **Consultants spend days/weeks manually cleaning** — Esther, Ben, Dan, the entire PS team burns 20+ hours per customer fixing data.
3. **Files need to be converted into Gainsight's metrics format** — the 50-column flat arrays need to be transformed into a standardized time-series structure.
4. **This repeats for every single customer** — Harry, Redgate, CSE, and everyone else. It's the same problem at every project.

### What Mark Wants — The End State

> *"I want to be able to take shitty data from a CSV, store it in the staging table, and then ETL it from the staging table into the company metrics table. And I don't want a human to touch this. I want it done end to end, fully automatic."*

The aspirational pipeline:

```
┌─────────────────┐     ┌──────────────────┐     ┌──────────────────────┐     ┌───────────────────┐
│  Customer dumps  │ ──▶ │  Tool cleans &   │ ──▶ │  Data lands in       │ ──▶ │  Auto-ETL into    │
│  CSV/Excel files │     │  validates data   │     │  staging table       │     │  Company Metrics  │
└─────────────────┘     └──────────────────┘     └──────────────────────┘     │  (time-series)    │
                                                                              └───────────────────┘
```

**Zero human intervention. Drag-and-drop → done.**

---

## 3. The Data Cleaning Exercise — What Mark Described

### Current Pain Points Across Customers

| Problem | Impact |
|---------|--------|
| Excel files with 4-5 sheets inside | Must be split and converted to individual CSVs |
| Blank columns with no name | Only 1 value in 23,000 rows — must be auto-removed |
| Shitty characters in files | Special chars break imports |
| Date formatting inconsistencies | All over the place across columns |
| Duplicate records | Flat file loads create duplicates — need merge-on-keys |
| 17+ different files per customer (Harry) | Each needs cleaning, unioning, and transforming |
| No modified dates in source data | Creates duplicate records when re-importing |

### What's Been Done So Far

- Laxman built a **Claude API-powered cleaning pipeline** — writes prompts describing Gainsight's expected format, sends 3-4 sample rows, Claude returns clean CSV output.
- **20 sheets cleaned and tested** in Gainsight demo environment.
- 7-8 records failing out of ~50,000 — acceptable per Mark.
- All clean CSVs verified as consumable by Gainsight.

### What Mark Wants Next

1. **Drag-and-drop UX** — No command-line. User drags file, tool handles everything.
2. **Remove blank/useless columns automatically** — If a column has no name and only 1 value across thousands of rows, drop it.
3. **Auto-detect and fix date formatting**.
4. **Demo ready by middle of next week** (target: ~16th April 2026).

---

## 4. The ETL Pipeline — From CSV to Company Metrics

This is the **big play**. Mark showed the exact data model he needs every customer's data to end up in.

### The Destination: Company Metrics Table

Every customer's data — regardless of how many files, what format, how messy — must be transformed into this **standardized 4-5 field structure**:

| Field | Description | Example Values |
|-------|-------------|----------------|
| **Company ID** | Gainsight company identifier | `GS-001` |
| **Metric Name** | What is being measured | `NPS Score`, `DAU`, `Support Tickets` |
| **Metric Date** | When it was measured | `2026-03-01` |
| **Metric Value** | The actual value | `85`, `1200`, `42` |
| **Unit of Measure** | Type of value | `Percent`, `Integer`, `Financial` |

### Extended Fields (for trend analysis)

| Field | Description |
|-------|-------------|
| **Time Granularity** | `Daily`, `Weekly`, `Monthly`, `Quarterly` |
| **Baseline Value** | What it was last period |
| **Actual Value** | What it is this period |
| **Target Value** | What it should be (aspirational — Phase 2) |

### The Transformation Pipeline

```
Source: Flat CSV with 50+ columns
┌──────────────────────────────────────────────────────┐
│ Company │ DAU_Jan │ DAU_Feb │ NPS_Q1 │ Tickets_Jan │ ...
│ Acme    │ 1200    │ 1350   │ 72     │ 15          │ ...
│ Beta    │ 800     │ 750    │ 45     │ 28          │ ...
└──────────────────────────────────────────────────────┘
                           ↓
                    UNPIVOT / MELT
                           ↓
Destination: Company Metrics (time-series)
┌────────────┬─────────────────┬────────────┬───────┬─────────┐
│ Company ID │ Metric Name     │ Metric Date│ Value │ UoM     │
│ Acme       │ DAU             │ 2026-01    │ 1200  │ Integer │
│ Acme       │ DAU             │ 2026-02    │ 1350  │ Integer │
│ Acme       │ NPS Score       │ 2026-Q1    │ 72    │ Percent │
│ Acme       │ Support Tickets │ 2026-01    │ 15    │ Integer │
│ Beta       │ DAU             │ 2026-01    │ 800   │ Integer │
│ Beta       │ DAU             │ 2026-02    │ 750   │ Integer │
└────────────┴─────────────────┴────────────┴───────┴─────────┘
```

### Key Insight From Mark

> *"The great thing about these objects is that you can store everything in about a four or five field table. And it's always the same."*

This means the ETL logic is **universal**. Once we build the unpivot/melt engine, it works for every customer.

---

## 5. The Business Case — Why This Matters

### Tactical Value (Immediate)

- **Saves 20+ hours per customer engagement** on data cleaning alone.
- **Unblocks Harry immediately** — he's the priority customer with 17+ files.
- **Helps Esther** — she's facing identical problems with bad data from Snowflake.
- **Helps Dan** — consultancy body stops burning time on manual CSV work.
- **Saves Ben** — he spent ages trying to do this manually.

### Strategic Value (Long-Term)

> *"If we rip out that tool, they have to go back to doing manual processes — so we have a customer for life if we have this capability."*

- **Recurring revenue**: Customers depend on the tool → sticky product.
- **Feeds into Captain Hindsight**: The cleaned, standardized metrics data becomes the input for the renewal prediction engine.
- **Differentiator vs Gainsight native**: Gainsight doesn't do this. We fill the gap.

### The Captain Hindsight Connection

The data cleaning + ETL pipeline is **Phase 1** of the larger **Captain Hindsight** project:

```
Phase 1: CSV → Clean → Stage → Company Metrics     ← WE ARE HERE
Phase 2: Company Metrics → Health Score Engine
Phase 3: Health Scores + Renewal Data → Regression Analysis
Phase 4: Predictive Renewal Risk → "Here's who you can't save, who you can"
```

---

## 6. Priorities & Deadlines (From Mark)

| Priority | Task | Deadline | Status |
|----------|------|----------|--------|
| 🔴 **P0** | CSV cleaning with drag-and-drop UX – demo ready | Mid next week (~16 Apr) | 🟡 In Progress |
| 🔴 **P0** | CSV → Company Metrics ETL (auto-transform flat files to time-series) | ASAP | 🔵 Not Started |
| 🟡 **P1** | Captain Hindsight — pretty UX / proof-of-concept for demo | After CSV work | 🔵 Not Started |
| 🟢 **P2** | Fin2 / Agentic exploration (possible hackathon in June) | June 2026 | 🔵 Not Started |
| ⚪ **Not Now** | Automated PPTs, Mac server, Gemma local model | Parked | ❌ Don't build yet |

### Mark's Exact Words

> *"Get this thing done guys, please, because it's killing us. Being able to do the CSVs to the time series data, so I don't spend eight months doing it. Get that done. It's tactical, but it's efficient. And it is valuable."*

---

## 7. What Needs to Be Built Next

### Tab 3: Data Cleaning & ETL Engine

A new tab in the existing Split & Ship app:

**Step 1 — Drag & Drop**
- Accept CSV, Excel (.xlsx with multiple sheets), TSV
- Auto-detect file type and parse accordingly

**Step 2 — Intelligent Cleaning**
- Auto-remove blank/unnamed columns with negligible data
- Detect and standardize date formats
- Remove duplicate records (merge on primary key)
- Strip bad characters
- Handle encoding issues (force UTF-8)
- Show user a before/after preview of what was cleaned

**Step 3 — Configure ETL Transform**
- Auto-detect which columns are metrics vs identifiers
- Let user map: Company ID column, metric columns, date columns
- Choose time granularity (daily/weekly/monthly/quarterly)
- Auto-infer unit of measure (percent, integer, financial)

**Step 4 — Transform to Company Metrics**
- Unpivot/melt the flat table into the standard 5-field time-series structure
- De-duplicate on (Company ID + Metric Name + Metric Date)
- Calculate baseline values (prior period)

**Step 5 — Export**
- Download the transformed CSV, ready for Gainsight staging table import
- Show Gainsight import instructions

---

## 8. Definition of Done

Per Mark's directive:

> *"Make sure that our definition of done here is that it can actually be consumed by Gainsight."*

The output CSV must:
- ✅ Be valid RFC 4180
- ✅ Be UTF-8 encoded
- ✅ Have consistent column counts across all rows
- ✅ Match the Company Metrics table schema
- ✅ Be importable into Gainsight via Data Management / S3 / Bulk API
- ✅ Be testable in Gainsight demo environment before going to production

---

*This document serves as the ground truth for the Split & Ship project.*
*All priorities flow from Mark Deegan's directives as CTO.*
