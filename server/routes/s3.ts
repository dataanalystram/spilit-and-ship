/**
 * S3 API Routes
 * 
 * All AWS interactions are server-side only.
 * The browser never sees AWS credentials.
 * 
 * Security:
 *   - Folder names: sanitized to [a-zA-Z0-9_-] only
 *   - Path traversal: blocked (no "..", "/", leading dots)
 *   - File uploads: CSV only, max 50MB via multer
 *   - Responses: Cache-Control no-store on listing data
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import {
    S3Client,
    ListObjectsV2Command,
    PutObjectCommand,
} from '@aws-sdk/client-s3';

// ─────────────────────────────────────────────────────────────────────────────
// S3 Client (server-side only — credentials from process.env)
// ─────────────────────────────────────────────────────────────────────────────

const s3 = new S3Client({
    region: process.env.AWS_REGION!,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
});

const BUCKET = process.env.AWS_S3_BUCKET!;
const BASE_PATH = (process.env.AWS_S3_BASE_PATH || '').replace(/\/+$/, '');

// ─────────────────────────────────────────────────────────────────────────────
// Multer: file upload handling (memory storage, 50 MB limit)
// ─────────────────────────────────────────────────────────────────────────────

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 },  // 50 MB
    fileFilter: (_req, file, cb) => {
        // Accept CSV and plain text (some systems send CSVs as text/plain)
        const allowed = ['text/csv', 'text/plain', 'application/csv', 'application/vnd.ms-excel'];
        if (allowed.includes(file.mimetype) || file.originalname.endsWith('.csv')) {
            cb(null, true);
        } else {
            cb(new Error(`Rejected file type: ${file.mimetype}. Only CSV files are accepted.`));
        }
    },
});

// ─────────────────────────────────────────────────────────────────────────────
// Input Sanitization
// ─────────────────────────────────────────────────────────────────────────────

/** Sanitize folder/file names: only alphanumeric, underscores, hyphens, and slashes for folders */
function sanitizePath(name: string): string {
    return name
        .trim()
        .replace(/\s+/g, '_')           // spaces → underscores
        .replace(/[^a-zA-Z0-9_\-\/]/g, '') // strip everything else (allow /)
        .replace(/\/+/g, '/')           // collapsed repeated slashes
        .replace(/^\/+|\/+$/g, '')      // strip leading/trailing slashes
        .replace(/^\.+/, '');           // no leading dots
}

/** Sanitize single filename (no slashes) */
function sanitizeFilename(name: string): string {
    return sanitizePath(name).replace(/\//g, '_');
}

/** Block path traversal attempts */
function isPathSafe(name: string): boolean {
    if (!name || name.length === 0 || name.length > 500) return false;
    if (name.includes('..')) return false;
    if (name.includes('\\')) return false;
    if (name.startsWith('.')) return false;
    return true;
}

/** Build full S3 key from base path and folder/file */
function s3Key(...parts: string[]): string {
    return [BASE_PATH, ...parts].filter(Boolean).join('/');
}

// ─────────────────────────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────────────────────────

export const s3Router = Router();

/**
 * GET /api/s3/folders
 * List ALL existing folders recursively under the base path.
 */
s3Router.get('/folders', async (_req: Request, res: Response): Promise<void> => {
    try {
        const prefix = BASE_PATH ? `${BASE_PATH}/` : '';
        const folderSet = new Set<string>();
        let isTruncated = true;
        let nextContinuationToken: string | undefined = undefined;

        // Query recursively with pagination to find all unique folder paths
        while (isTruncated) {
            const command = new ListObjectsV2Command({
                Bucket: BUCKET,
                Prefix: prefix,
                ContinuationToken: nextContinuationToken,
            });
            const result = await s3.send(command);

            (result.Contents || []).forEach(obj => {
                if (!obj.Key) return;
                
                // Get path relative to prefix
                let relative = obj.Key;
                if (prefix && relative.startsWith(prefix)) {
                    relative = relative.slice(prefix.length);
                }
                
                // Extract unique folders from the path
                const parts = relative.split('/');
                let current = '';
                // If it ends in /, parts include an empty string at the end; if not, last part is a filename.
                // Either way, we take all parts except the very last non-directory part.
                const depth = relative.endsWith('/') ? parts.length - 1 : parts.length - 1;
                
                for (let i = 0; i < depth; i++) {
                    const segment = parts[i];
                    if (!segment) continue;
                    current = current ? `${current}/${segment}` : segment;
                    if (current) folderSet.add(current);
                }
            });

            isTruncated = result.IsTruncated || false;
            nextContinuationToken = result.NextContinuationToken;

            // Safety break to prevent infinite loops in weird edge cases
            if (folderSet.size > 5000) break; 
        }

        const folders = Array.from(folderSet).sort((a, b) => a.localeCompare(b));

        console.log(`[S3] Recursively found ${folders.length} folders under ${prefix}`);
        res.set('Cache-Control', 'no-store');
        res.json({ success: true, folders });
    } catch (err: any) {
        console.error('[S3] Error listing folders:', err.message);
        res.status(500).json({ success: false, error: 'Failed to list folders. Check server logs.' });
    }
});

/**
 * POST /api/s3/folders
 * Create a new folder (empty object with trailing slash).
 * Body: { folderName: string }
 */
s3Router.post('/folders', async (req: Request, res: Response): Promise<void> => {
    try {
        const rawName = req.body?.folderName;
        if (!rawName || typeof rawName !== 'string') {
            res.status(400).json({ success: false, error: 'folderName is required.' });
            return;
        }

        const folderName = sanitizePath(rawName);
        if (!isPathSafe(folderName)) {
            res.status(400).json({ success: false, error: 'Invalid folder name. Use only letters, numbers, underscores, and hyphens (and slashes for subfolders).' });
            return;
        }

        const key = s3Key(folderName) + '/';
        const command = new PutObjectCommand({
            Bucket: BUCKET,
            Key: key,
            Body: Buffer.alloc(0),  // Proper 0-byte folder marker
            ContentLength: 0,
            ContentType: 'application/x-directory',
        });

        await s3.send(command);
        console.log(`[S3] ✅ Created folder: ${key}`);
        res.json({ success: true, folderName, key });
    } catch (err: any) {
        console.error('[S3] Error creating folder:', err.message);
        res.status(500).json({ success: false, error: 'Failed to create folder. Check server logs.' });
    }
});

/**
 * POST /api/s3/upload
 * Upload a CSV file to a specific folder.
 * Multipart form: file (field name "file") + folderName (field name "folderName")
 */
s3Router.post('/upload', upload.single('file'), async (req: Request, res: Response): Promise<void> => {
    try {
        const file = req.file;
        const rawFolder = req.body?.folderName;
        const rawFilename = req.body?.fileName;

        if (!file) {
            res.status(400).json({ success: false, error: 'No file uploaded.' });
            return;
        }

        if (!rawFolder || typeof rawFolder !== 'string') {
            res.status(400).json({ success: false, error: 'folderName is required.' });
            return;
        }

        const folderName = sanitizePath(rawFolder);
        if (!isPathSafe(folderName)) {
            res.status(400).json({ success: false, error: 'Invalid folder path.' });
            return;
        }

        // Use the provided filename (already date-suffixed from frontend) or fall back
        let fileName: string;
        if (rawFilename && typeof rawFilename === 'string') {
            fileName = sanitizeFilename(rawFilename.replace(/\.csv$/i, '')) + '.csv';
        } else {
            fileName = sanitizeFilename(file.originalname.replace(/\.csv$/i, '')) + '.csv';
        }

        if (!isPathSafe(fileName.replace('.csv', ''))) {
            res.status(400).json({ success: false, error: 'Invalid file name.' });
            return;
        }

        const key = s3Key(folderName, fileName);
        const command = new PutObjectCommand({
            Bucket: BUCKET,
            Key: key,
            Body: file.buffer,
            ContentType: 'text/csv',
        });

        await s3.send(command);
        console.log(`[S3] ✅ Uploaded: ${key} (${(file.size / 1024).toFixed(1)} KB)`);
        res.json({
            success: true,
            key,
            fileName,
            folderName,
            sizeBytes: file.size,
        });
    } catch (err: any) {
        console.error('[S3] Error uploading file:', err.message);
        res.status(500).json({ success: false, error: 'Failed to upload file. Check server logs.' });
    }
});
