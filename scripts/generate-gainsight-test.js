
/**
 * Gainsight Rich Text Test Data Generator
 * 
 * Generates a small CSV with "real" looking data and Rich Text (HTML) fields
 * to verify the formatter tool.
 * 
 * Usage:
 *   node scripts/generate-gainsight-test.js
 */

import { createWriteStream } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// CONFIGURATION: Add your real test emails here
const testEmails = [
    "mark.deegan@example.com",
    "laxman.somaraju@example.com",
    "test.user.1@example.com",
    "test.user.2@example.com",
    // You can add more like: "real.person@company.com"
];

const outputPath = join(__dirname, '..', 'test-files', 'gainsight_rich_text_test.csv');

const richTextSamples = [
    `<h1>Quarterly Review</h1><p>Performance was <b>excellent</b>.</p><br>Next steps:<ul><li>Promote</li><li>Bonus</li></ul>`,
    `"Client requested updated terms.\n\nNote: Approval pending."`, // Native newline
    `<div style="color:red">Urgent Action Required</div>`,
    `Simple text description`,
    `Multi-line\ndescription\nwith\nbreaks.`,
    `Complex HTML: <span style="font-family: Arial;">Text with valid style</span>`
];

// Try to read the real-world HTML example if it exists
try {
    const { readFileSync } = await import('fs');
    const realEmailPath = join(__dirname, '..', 'test-files', 'testemail.html');
    const realEmailContent = readFileSync(realEmailPath, 'utf8');
    // Add it to the front so it's the first example used
    richTextSamples.unshift(realEmailContent);
    console.log("   Found and included 'testemail.html' in test data.");
} catch (e) {
    console.warn("   Could not load 'testemail.html', skipping real-world example.");
}

// Ensure valid header
const header = 'Name,Email,Account_Name,Description_HTML,Status\n';

async function generate() {
    console.log(`\n🧪 Generating Gainsight Test CSV...`);
    const writeStream = createWriteStream(outputPath);
    writeStream.write(header);

    testEmails.forEach((email, index) => {
        const name = `Test User ${index + 1}`;
        const account = `Account ${String.fromCharCode(65 + index)}`;
        // Pick a rich text sample, cycling through if we have more emails than samples
        const description = richTextSamples[index % richTextSamples.length];
        const status = index % 2 === 0 ? 'Active' : 'Inactive';

        // Intentionally create potential CSV issues for our tool to fix:
        // 1. Raw double quotes might need escaping if we were generating manually, 
        //    but here we construct the string.
        //    Let's rely on our formatted tool to fix "raw" text if we output it loosely.
        //    Actually, this script should generate "Bad" CSVs that need fixing, 
        //    OR "Good" CSVs to verify.
        //    The user's problem is they have "bad" CSVs often from other systems.
        //    Let's make this generate a "rough" CSV where possible, or just standard data.
        //    Node writable streams write raw strings.

        // We will write the description somewhat "raw" to simulate the problem if it has quotes,
        // but generally we want to validly quote it so it IS a valid file to start with,
        // just containing the HTML we want to preserve.

        // Proper CSV escaping for the generator itself so the file is valid to open:
        const escapedDesc = `"${description.replace(/"/g, '""')}"`;

        const row = `${name},${email},${account},${escapedDesc},${status}\n`;
        writeStream.write(row);
    });

    writeStream.end();

    await new Promise(resolve => writeStream.on('finish', resolve));
    console.log(`✅ Created: ${outputPath}`);
    console.log(`   Contains ${testEmails.length} rows with various HTML/Rich Text examples.`);
}

generate().catch(console.error);
