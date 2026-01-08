/**
 * Test CSV File Generator
 * 
 * Generates CSV files of specified sizes for testing the Split & Ship tool.
 * Uses streaming to avoid memory issues when generating large files.
 * 
 * Usage:
 *   node scripts/generate-test-csv.js --size <MB>
 * 
 * Examples:
 *   node scripts/generate-test-csv.js --size 1      # 1 MB
 *   node scripts/generate-test-csv.js --size 50     # 50 MB
 *   node scripts/generate-test-csv.js --size 250    # 250 MB
 *   node scripts/generate-test-csv.js --size 2000   # 2 GB
 */

import { createWriteStream } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);
const sizeIndex = args.indexOf('--size');
const targetSizeMB = sizeIndex !== -1 ? parseInt(args[sizeIndex + 1], 10) : 1;

if (isNaN(targetSizeMB) || targetSizeMB < 1) {
    console.error('Usage: node generate-test-csv.js --size <MB>');
    console.error('Example: node generate-test-csv.js --size 50');
    process.exit(1);
}

const targetSizeBytes = targetSizeMB * 1024 * 1024;
const outputPath = join(__dirname, '..', 'test-files', `test_${targetSizeMB}mb.csv`);

// Ensure test-files directory exists
import { mkdirSync, existsSync } from 'fs';
const testFilesDir = join(__dirname, '..', 'test-files');
if (!existsSync(testFilesDir)) {
    mkdirSync(testFilesDir, { recursive: true });
}

// CSV Header
const header = 'id,first_name,last_name,email,company,job_title,phone,address,city,state,zip_code,country,created_at,amount,status\n';

// Sample data pools for realistic generation
const firstNames = ['John', 'Jane', 'Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Henry', 'Ivy', 'Jack', 'Kate', 'Leo', 'Mia', 'Noah', 'Olivia', 'Peter', 'Quinn', 'Rose'];
const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin'];
const companies = ['Acme Corp', 'Globex Inc', 'Initech', 'Umbrella Corp', 'Stark Industries', 'Wayne Enterprises', 'Cyberdyne Systems', 'Soylent Corp', 'Massive Dynamic', 'Oscorp'];
const titles = ['Manager', 'Engineer', 'Developer', 'Analyst', 'Director', 'VP', 'CEO', 'CTO', 'Designer', 'Consultant', 'Specialist', 'Coordinator'];
const cities = ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia', 'San Antonio', 'San Diego', 'Dallas', 'San Jose'];
const states = ['NY', 'CA', 'IL', 'TX', 'AZ', 'PA', 'TX', 'CA', 'TX', 'CA'];
const statuses = ['active', 'pending', 'inactive', 'completed', 'cancelled'];

function randomElement(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function generateRow(id) {
    const firstName = randomElement(firstNames);
    const lastName = randomElement(lastNames);
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${id}@example.com`;
    const company = randomElement(companies);
    const title = randomElement(titles);
    const phone = `+1-${Math.floor(Math.random() * 900 + 100)}-${Math.floor(Math.random() * 900 + 100)}-${Math.floor(Math.random() * 9000 + 1000)}`;
    const address = `${Math.floor(Math.random() * 9999) + 1} ${randomElement(['Main', 'Oak', 'Maple', 'Cedar', 'Pine'])} ${randomElement(['St', 'Ave', 'Blvd', 'Dr', 'Ln'])}`;
    const cityIndex = Math.floor(Math.random() * cities.length);
    const city = cities[cityIndex];
    const state = states[cityIndex];
    const zip = String(Math.floor(Math.random() * 90000 + 10000));
    const country = 'USA';
    const createdAt = new Date(Date.now() - Math.floor(Math.random() * 365 * 24 * 60 * 60 * 1000)).toISOString();
    const amount = (Math.random() * 10000).toFixed(2);
    const status = randomElement(statuses);

    return `${id},${firstName},${lastName},${email},${company},${title},${phone},"${address}",${city},${state},${zip},${country},${createdAt},${amount},${status}\n`;
}

async function generateCSV() {
    console.log(`\n🚀 Generating ${targetSizeMB} MB test CSV file...`);
    console.log(`   Output: ${outputPath}\n`);

    const writeStream = createWriteStream(outputPath);

    // Write header
    writeStream.write(header);
    let bytesWritten = Buffer.byteLength(header);
    let rowCount = 0;
    const startTime = Date.now();
    let lastProgressUpdate = startTime;

    // Generate rows until we reach target size
    while (bytesWritten < targetSizeBytes) {
        const row = generateRow(rowCount + 1);
        writeStream.write(row);
        bytesWritten += Buffer.byteLength(row);
        rowCount++;

        // Progress update every 2 seconds
        const now = Date.now();
        if (now - lastProgressUpdate > 2000) {
            const progress = ((bytesWritten / targetSizeBytes) * 100).toFixed(1);
            const mbWritten = (bytesWritten / (1024 * 1024)).toFixed(1);
            const elapsed = ((now - startTime) / 1000).toFixed(1);
            const rate = (bytesWritten / (1024 * 1024) / ((now - startTime) / 1000)).toFixed(1);
            process.stdout.write(`\r   Progress: ${progress}% (${mbWritten} MB) | ${rowCount.toLocaleString()} rows | ${rate} MB/s | ${elapsed}s elapsed`);
            lastProgressUpdate = now;
        }

        // Handle backpressure
        if (!writeStream.write('')) {
            await new Promise(resolve => writeStream.once('drain', resolve));
        }
    }

    writeStream.end();

    await new Promise(resolve => writeStream.on('finish', resolve));

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    const finalSizeMB = (bytesWritten / (1024 * 1024)).toFixed(2);

    console.log(`\n\n✅ Done!`);
    console.log(`   File: ${outputPath}`);
    console.log(`   Size: ${finalSizeMB} MB`);
    console.log(`   Rows: ${rowCount.toLocaleString()}`);
    console.log(`   Time: ${totalTime}s\n`);
}

generateCSV().catch(err => {
    console.error('Error generating CSV:', err);
    process.exit(1);
});
