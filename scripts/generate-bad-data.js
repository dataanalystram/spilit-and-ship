import fs from 'fs';
import path from 'path';

const headers = [
    "Company ID",           // Valid column
    "Relationship ID",      // Valid optional column
    "Messy Date",           // Valid date column, but with shitty formats
    "DAU_Jan",              // Wide Metric 1 (Integer)
    "DAU_Feb",              // Wide Metric 2 (Integer)
    "Q1_Score",             // Wide Metric 3 (Percent)
    "ARR_Value",            // Wide Metric 4 (Currency)
    "",                     // Literal empty header (blank col)
    "Unnamed: 8",           // Useless column name
    "Completely_Empty_Col", // Has name, but every row is blank
    "All_Same_Value_Col"    // Has name, but every row has the exact same value ("IGNORE_ME")
];

// Include raw unprintable control characters like VT (Vertical Tab \x0B) and Bell (\x07) per Mark's "shitty characters"
const badCharCompany1 = "Redgate\x07Software";
const badCharCompany2 = "Acme\x0BCorp";

const rows = [
    // Row 1: Valid values but bad characters and bad dates
    [badCharCompany1, "REL-001", "01/15/2026", "1200", "1350", "85%", "$10,500", "some_crap", "null", "", "IGNORE_ME"],
    
    // Row 2: Missing relationship, different messy date format, missing metrics (to test robust folding)
    [badCharCompany2, "", "2-28-2026", "800", "", "72%", "$8,000", "some_crap2", "null", "", "IGNORE_ME"],
    
    // Row 3: EXACT DUPLICATE OF ROW 1 (The system should detect and purge this)
    [badCharCompany1, "REL-001", "01/15/2026", "1200", "1350", "85%", "$10,500", "some_crap", "null", "", "IGNORE_ME"],
    
    // Row 4: Clean but missing actual metric values (test to throw away empty metric rows)
    ["Harry Corp", "REL-003", "2026/03/01", "", "", "90%", "$100,000", "some_crap3", "null", "", "IGNORE_ME"],
];

const csvStr = [
    headers.join(','),
    ...rows.map(r => r.join(','))
].join('\n');

const filepath = path.join(process.cwd(), 'test-files', 'worst_dataset_ever.csv');
fs.writeFileSync(filepath, csvStr, 'utf-8');

console.log('Successfully generated the nightmare CSV at: ' + filepath);
