
import Papa from 'papaparse';

export interface ValidationIssue {
    row: number;
    column: string;
    value: string;
    issue: string;
    severity: 'WARNING' | 'ERROR';
}

export interface ValidationResult {
    isValid: boolean;
    issues: ValidationIssue[];
    totalRows: number;
    richTextColumns: string[];
    previewRows: any[];
}

export const detectRichTextColumns = (data: any[]): string[] => {
    if (data.length === 0) return [];
    const headers = Object.keys(data[0]);
    const richTextCols: string[] = [];

    // Sample first 10 rows to detect HTML
    const sample = data.slice(0, 10);

    for (const header of headers) {
        const hasHtml = sample.some(row => {
            const val = row[header];
            if (typeof val !== 'string') return false;
            return /<[a-z][\s\S]*>/i.test(val) || val.includes('\n') || val.includes('\r');
        });

        if (hasHtml) richTextCols.push(header);
    }

    return richTextCols;
};

export const validateGainsightCSV = (file: File): Promise<ValidationResult> => {
    return new Promise((resolve, reject) => {
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                const issues: ValidationIssue[] = [];
                const rows = results.data as any[];

                if (rows.length === 0) {
                    resolve({
                        isValid: false,
                        issues: [{ row: 0, column: 'File', value: '', issue: 'File is empty', severity: 'ERROR' }],
                        totalRows: 0,
                        richTextColumns: [],
                        previewRows: []
                    });
                    return;
                }

                const richTextColumns = detectRichTextColumns(rows);

                rows.forEach((row, index) => {
                    const rowNum = index + 1; // 1-based index for user display

                    Object.entries(row).forEach(([col, val]) => {
                        const value = val as string;

                        // Check 1: Gainsight String Limit (255 chars)
                        // If it's NOT a rich text column, warn if > 255.
                        if (!richTextColumns.includes(col) && value.length > 255) {
                            issues.push({
                                row: rowNum,
                                column: col,
                                value: value.substring(0, 20) + '...',
                                issue: `Exceeds standard string limit (255 chars). Length: ${value.length}. Verify if this should be a Rich Text field.`,
                                severity: 'WARNING'
                            });
                        }

                        // Check 2: Gainsight Rich Text Limit (Typical max ~150k, but let's warn at 15k as per PRD "15,000-150,000")
                        if (richTextColumns.includes(col) && value.length > 131072) { // 128KB safety limit
                            issues.push({
                                row: rowNum,
                                column: col,
                                value: '...',
                                issue: `Approaching Rich Text character limit (Length: ${value.length}). Max is often 131,072 characters.`,
                                severity: 'WARNING'
                            });
                        }

                        // Check 3: Encoding check (basic) - Look for replacement character \uFFFD
                        if (value.includes('\uFFFD')) {
                            issues.push({
                                row: rowNum,
                                column: col,
                                value,
                                issue: 'Contains replacement character (\uFFFD). This indicates an encoding issue (likely not UTF-8).',
                                severity: 'ERROR'
                            });
                        }
                    });
                });

                resolve({
                    isValid: issues.filter(i => i.severity === 'ERROR').length === 0,
                    issues,
                    totalRows: rows.length,
                    richTextColumns,
                    previewRows: rows.slice(0, 5)
                });
            },
            error: (error) => {
                reject(error);
            }
        });
    });
};
