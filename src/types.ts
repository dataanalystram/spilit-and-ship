export interface SplitConfig {
    mode: 'gainsight' | 'custom';
    chunkSizeMB: number; // in MB
    filePrefix: string;
}

export interface WorkerMessage {
    type: 'START';
    file: File;
    config: SplitConfig;
}

export interface ProgressMessage {
    type: 'PROGRESS';
    progress: number; // 0 to 100
    currentPart: number;
    totalParts: number;
    status: string;
}

export interface PartReadyMessage {
    type: 'PART_READY';
    partNumber: number;
    totalParts: number;
    blob: Blob;
    filename: string;
    sizeBytes: number; // Size of this part in bytes
}

export interface CompleteMessage {
    type: 'COMPLETE';
    blob?: Blob; // The ZIP file (only for smaller files)
    filename?: string;
    mode: 'zip' | 'individual'; // Whether we zipped or provided individual parts
    totalParts: number;
}

export interface ErrorMessage {
    type: 'ERROR';
    error: string;
}

export type WorkerResponse = ProgressMessage | PartReadyMessage | CompleteMessage | ErrorMessage;

export interface DataCleaningConfig {
    removeBlankColumns: boolean;
    fixDateFormatting: boolean;
    removeDuplicates: boolean;
    applyGainsightRules: boolean;
    primaryKeyColumn?: string;
}

export interface ETLTransformationConfig {
    companyIdColumn: string;
    relationshipIdColumn?: string;
    dataSource: string;
    metricColumns: string[];
    dateColumn: string;
    timeGranularity: 'Daily' | 'Weekly' | 'Monthly' | 'Quarterly';
    baselineColumn?: string;
    targetColumn?: string;
    extraColumns: string[];
}

export interface CleanedDataResult {
    data: any[];
    originalRowCount: number;
    cleanedRowCount: number;
    removedColumns: string[];
    logs: string[];
}

export type CompanyMetric = Record<string, string>;
