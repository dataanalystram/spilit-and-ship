
import Papa from 'papaparse';

/**
 * Formats data to strict RFC 4180 compliance, ensuring Gainsight compatibility.
 * Specifically forces quoting for fields with newlines, commas, or quotes.
 */
export const formatToRFC4180 = (data: any[]): string => {
    // We use Papa Parse's unparse, but with specific config to ensure
    // we force quotes where necessary (or everywhere for safety).
    // Gainsight typically handles fully quoted CSVs well.

    return Papa.unparse(data, {
        quotes: true, // Force quotes on all fields to be safe and consistent
        quoteChar: '"',
        escapeChar: '"',
        delimiter: ',',
        header: true,
        newline: '\r\n', // RFC 4180 specifies CRLF
    });
};

/**
 * Helper to download the processed CSV
 */
export const downloadCSV = (csvContent: string, fileName: string) => {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url); // Clean up immediately
};
