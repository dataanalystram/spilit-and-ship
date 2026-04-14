
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Papa from 'papaparse';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const csvPath = path.join(__dirname, '../test-files/formatted_gainsight_rich_text_test.csv');

try {
    const csvContent = fs.readFileSync(csvPath, 'utf8');

    Papa.parse(csvContent, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
            const rows = results.data;
            console.log(`Parsed ${rows.length} rows.`);

            rows.forEach((row, index) => {
                const rowNum = index + 1;
                Object.entries(row).forEach(([col, val]) => {
                    const value = val; // PapaParse in Node (from string) returns string?

                    // The logic from gainsight-validator.ts (Corrected)
                    if (value.includes('\uFFFD')) {
                        console.error(`Row ${rowNum}, Col ${col}: ERROR - Contains replacement character.`);
                        console.error(`Value: "${value}"`);
                    }
                    if (value.includes('\uFFFD')) { // Checking unicode explicitly too
                        console.error(`Row ${rowNum}, Col ${col}: ERROR - Contains unicode replacement character.`);
                    }
                });
            });
            console.log("Validation check complete.");
        }
    });

} catch (e) {
    console.error("Error reading file:", e);
}
