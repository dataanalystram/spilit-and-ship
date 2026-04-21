/**
 * Split & Ship — Express Backend Server
 * 
 * Proxies S3 operations so AWS credentials never reach the browser.
 * Credentials are loaded from .env (gitignored).
 * 
 * Security principles:
 *   - Fail-fast if required env vars are missing
 *   - CORS: same-origin only in production
 *   - Request body capped at 50 MB
 *   - No credential logging
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { s3Router } from './routes/s3.js';

// ─────────────────────────────────────────────────────────────────────────────
// Fail-Fast: Validate required environment variables at startup
// ─────────────────────────────────────────────────────────────────────────────

const REQUIRED_ENV = [
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_S3_BUCKET',
    'AWS_REGION',
];

const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length > 0) {
    console.error('─────────────────────────────────────────────────────');
    console.error('❌ FATAL: Missing required environment variables:');
    missing.forEach(k => console.error(`   • ${k}`));
    console.error('');
    console.error('   Copy .env.example to .env and fill in your values.');
    console.error('─────────────────────────────────────────────────────');
    process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Express App
// ─────────────────────────────────────────────────────────────────────────────

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// CORS: In development Vite runs on a different port, so we allow it.
// In production, the frontend is served from the same origin.
app.use(cors({
    origin: process.env.NODE_ENV === 'production'
        ? false  // same-origin only
        : ['http://localhost:5173', 'http://localhost:8572', 'http://127.0.0.1:5173', 'http://127.0.0.1:8572'],
    credentials: false,
}));

// Body parsers (JSON for folder creation, etc.)
app.use(express.json({ limit: '1mb' }));

// ─────────────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────────────

app.use('/api/s3', s3Router);

// Health check
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─────────────────────────────────────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
    console.log('');
    console.log('─────────────────────────────────────────────────────');
    console.log(`🚀 Split & Ship API Server`);
    console.log(`   Port:   ${PORT}`);
    console.log(`   Bucket: ${process.env.AWS_S3_BUCKET}`);
    console.log(`   Base:   ${process.env.AWS_S3_BASE_PATH || '(root)'}`);
    console.log(`   Region: ${process.env.AWS_REGION}`);
    console.log('─────────────────────────────────────────────────────');
    console.log('');
});
