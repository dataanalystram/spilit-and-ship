import JSZip from 'jszip';
import type { WorkerMessage, WorkerResponse, SplitConfig } from './types';

const ctx: Worker = self as any;

// Memory threshold: If estimated output > 500MB, use individual downloads instead of ZIP
const MAX_ZIP_SIZE_MB = 500;

ctx.onmessage = async (event: MessageEvent<WorkerMessage>) => {
    const { type, file, config } = event.data;

    if (type === 'START') {
        try {
            await processFile(file, config);
        } catch (err: any) {
            const errorMsg: WorkerResponse = {
                type: 'ERROR',
                error: err.message || 'Unknown error occurred during processing',
            };
            ctx.postMessage(errorMsg);
        }
    }
};

async function processFile(file: File, config: SplitConfig) {
    const CHUNK_SIZE = config.chunkSizeMB * 1024 * 1024;
    const HEADER_SIZE_ESTIMATE = 10 * 1024; // Grab 10KB for header just to be safe

    // 1. Read Header
    const headerSlice = file.slice(0, HEADER_SIZE_ESTIMATE);
    const headerText = await headerSlice.text();
    const firstNewlineIndex = headerText.indexOf('\n');

    if (firstNewlineIndex === -1) {
        throw new Error('Could not find a newline in the first 10KB. Is this a valid CSV?');
    }

    const globalHeader = headerText.slice(0, firstNewlineIndex + 1);
    const totalSize = file.size;
    const bodyStart = firstNewlineIndex + 1;

    // Estimate number of parts and total output size
    const estimatedParts = Math.ceil((totalSize - bodyStart) / CHUNK_SIZE);
    const estimatedOutputSizeMB = (totalSize + (estimatedParts * globalHeader.length)) / (1024 * 1024);

    // Decide mode: ZIP for small files, individual downloads for large files
    const useZip = estimatedOutputSizeMB < MAX_ZIP_SIZE_MB;

    console.log(`[Worker] File: ${(totalSize / (1024 * 1024)).toFixed(2)} MB, Est. Parts: ${estimatedParts}, Est. Output: ${estimatedOutputSizeMB.toFixed(2)} MB, Mode: ${useZip ? 'ZIP' : 'Individual'}`);

    const zip = useZip ? new JSZip() : null;
    const parts: { blob: Blob; filename: string }[] = [];

    let currentOffset = bodyStart;
    let partNumber = 1;

    while (currentOffset < totalSize) {
        // Report progress
        const progress = Math.round((currentOffset / totalSize) * 100);
        ctx.postMessage({
            type: 'PROGRESS',
            progress,
            currentPart: partNumber,
            totalParts: estimatedParts,
            status: `Processing part ${partNumber} of ~${estimatedParts}...`
        } as WorkerResponse);

        // Determine target end
        let targetEnd = currentOffset + CHUNK_SIZE;
        if (targetEnd >= totalSize) {
            targetEnd = totalSize;
        } else {
            // Find nearest newline AFTER targetEnd to complete the row
            const bufferSize = 10 * 1024; // 10KB lookahead for safety with long lines
            const searchSlice = file.slice(targetEnd, Math.min(targetEnd + bufferSize, totalSize));
            const searchText = await searchSlice.text();
            const newlineInSearch = searchText.indexOf('\n');

            if (newlineInSearch !== -1) {
                targetEnd += newlineInSearch + 1;
            }
            // If no newline found, we're likely at EOF or have a very long line
        }

        // Slice the chunk
        const chunkBlob = file.slice(currentOffset, targetEnd);

        // Combine Header + Chunk
        const finalBlob = new Blob([globalHeader, chunkBlob], { type: 'text/csv' });
        const partName = `${config.filePrefix}${partNumber}.csv`;

        if (useZip && zip) {
            zip.file(partName, finalBlob);
        } else {
            // For large files, send each part immediately for streaming download
            parts.push({ blob: finalBlob, filename: partName });

            ctx.postMessage({
                type: 'PART_READY',
                partNumber,
                totalParts: estimatedParts,
                blob: finalBlob,
                filename: partName,
                sizeBytes: finalBlob.size
            } as WorkerResponse);
        }

        currentOffset = targetEnd;
        partNumber++;
    }

    const actualParts = partNumber - 1;

    if (useZip && zip) {
        // Generate ZIP for smaller files
        ctx.postMessage({
            type: 'PROGRESS',
            progress: 100,
            currentPart: actualParts,
            totalParts: actualParts,
            status: 'Compressing files into ZIP...'
        } as WorkerResponse);

        const zipBlob = await zip.generateAsync({
            type: 'blob',
            compression: 'DEFLATE',
            compressionOptions: { level: 1 } // Fast compression
        });

        ctx.postMessage({
            type: 'COMPLETE',
            blob: zipBlob,
            filename: `${config.filePrefix}split-files.zip`,
            mode: 'zip',
            totalParts: actualParts
        } as WorkerResponse);
    } else {
        // Individual parts mode - signal completion
        ctx.postMessage({
            type: 'COMPLETE',
            mode: 'individual',
            totalParts: actualParts
        } as WorkerResponse);
    }
}
