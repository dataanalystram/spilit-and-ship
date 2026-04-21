/**
 * S3 API Client (Frontend)
 * 
 * Calls our OWN backend proxy — never touches AWS directly.
 * Zero credentials in the browser.
 */

const API_BASE = '/api/s3';

export interface S3FolderListResponse {
    success: boolean;
    folders: string[];
    error?: string;
}

export interface S3CreateFolderResponse {
    success: boolean;
    folderName: string;
    key: string;
    error?: string;
}

export interface S3UploadResponse {
    success: boolean;
    key: string;
    fileName: string;
    folderName: string;
    sizeBytes: number;
    error?: string;
}

/** Check if the backend API is reachable */
export async function checkConnection(): Promise<boolean> {
    try {
        const res = await fetch('/api/health', { signal: AbortSignal.timeout(3000) });
        return res.ok;
    } catch {
        return false;
    }
}

/** List existing folders in the configured S3 bucket */
export async function listFolders(): Promise<S3FolderListResponse> {
    const res = await fetch(`${API_BASE}/folders`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

/** Create a new folder in S3 */
export async function createFolder(folderName: string): Promise<S3CreateFolderResponse> {
    const res = await fetch(`${API_BASE}/folders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderName }),
    });
    return res.json();
}

/** Upload a CSV string as a file to a specific folder */
export async function uploadCSV(
    csvContent: string,
    folderName: string,
    fileName: string,
): Promise<S3UploadResponse> {
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const formData = new FormData();
    formData.append('file', blob, fileName);
    formData.append('folderName', folderName);
    formData.append('fileName', fileName);

    const res = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        body: formData,
    });
    return res.json();
}
