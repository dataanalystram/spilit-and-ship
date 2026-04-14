/**
 * Verify CSV Script
 * 
 * Parses the formatted CSV and checks integrity.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import Papa from 'papaparse';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const csvPath = join(__dirname, '..', 'test-files', 'formatted_gainsight_rich_text_test.csv');
const htmlPath = join(__dirname, '..', 'test-files', 'testemail.html');

console.log(`🔍 Verifying ${csvPath}...`);

try {
    const csvContent = readFileSync(csvPath, 'utf8');
    const htmlContent = readFileSync(htmlPath, 'utf8');

    Papa.parse(csvContent, {
        header: true,
        skipEmptyLines: true, // Important for trailing newlines
        transformHeader: h => h.trim(), // Sanitize headers
        complete: (results) => {
            console.log(`✅ Parsed ${results.data.length} rows.`);

            if (results.errors.length > 0) {
                console.error("❌ Parse Errors:", results.errors);
                process.exit(1);
            }

            const row1 = results.data[0];
            const name = row1['Name'];
            const description = row1['Description_HTML'];

            console.log(`   Row 1 Name: ${name}`);
            console.log(`   Row 1 Description Length: ${description ? description.length : 0}`);

            // Verify content match
            // Note: The HTML file might have slightly different whitespace than the memory string if normalized?
            // But let's check for a unique substring.
            const uniqueSubstring = 'Kieran Klaassen';

            if (description && description.includes(uniqueSubstring)) {
                console.log(`✅ Found unique content "${uniqueSubstring}" in CSV field.`);
            } else {
                console.error(`❌ Content mismatch! Could not find "${uniqueSubstring}" in processed CSV.`);
                console.log("   First 100 chars of Row 1:", description.substring(0, 100));
            }

            // Check headers
            const headers = results.meta.fields;
            console.log("   Headers:", headers);
            if (headers.includes('Status')) {
                console.log("✅ 'Status' column found (correctly escaped header row).");
            } else {
                console.error("❌ 'Status' column missing! Header parsing failed?");
            }

            // Check row count
            if (results.data.length >= 4) {
                console.log("✅ Expected number of rows found.");
            } else {
                console.error(`❌ Expected at least 4 rows, found ${results.data.length}`);
            }

        }
    });

} catch (e) {
    console.error("❌ Fatal Error:", e);
}
