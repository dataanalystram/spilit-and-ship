import type { DataCleaningConfig, CleanedDataResult } from '../types';
import * as aq from 'arquero';

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const EXCEL_ERRORS = new Set(['#VALUE!', '#N/A', '#REF!', '#NAME?', '#DIV/0!', '#NULL!']);
const DDMMYYYY_COLUMNS = new Set(['Last New Sale Subscription Start Date']);
const DATE_ONLY_COLUMNS = new Set(['created date(DD/mm/YYYY)']);

// Month name → zero-padded number for "DD-Mon-YYYY" / "Month DD, YYYY" formats
const MONTH_MAP: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

// ─────────────────────────────────────────────
// R19: Array unwrapping
// ─────────────────────────────────────────────
const isTrueArray = (v: string): boolean => {
    if (!/^\[.*\]$/.test(v)) return false;
    const inner = v.slice(1, -1).trim();
    return inner === '' || /^["']/.test(inner);
};

const unwrapArray = (v: string): string => {
    const inner = v.slice(1, -1).trim();
    if (!inner) return '';
    try {
        const items = JSON.parse(v);
        if (Array.isArray(items)) return items.join('; ');
    } catch { /* fall through */ }
    const singleQuoted = [...inner.matchAll(/'([^']*)'/g)].map(m => m[1]);
    if (singleQuoted.length) return singleQuoted.join('; ');
    const doubleQuoted = [...inner.matchAll(/"([^"]*)"/g)].map(m => m[1]);
    if (doubleQuoted.length) return doubleQuoted.join('; ');
    return inner;
};

// ─────────────────────────────────────────────
// R4: Column-level boolean detection
// ─────────────────────────────────────────────
const BOOL_TRUE_SET  = new Set(['true',  'yes', '1', 'y', 't']);
const BOOL_FALSE_SET = new Set(['false', 'no',  '0', 'n', 'f', '']);

const isColumnBoolean = (colData: any[]): boolean => {
    const nonEmpty = colData.filter(v => v !== null && v !== undefined && String(v).trim() !== '');
    if (nonEmpty.length === 0) return false;
    return nonEmpty.every(v => {
        const lower = String(v).trim().toLowerCase();
        return BOOL_TRUE_SET.has(lower) || BOOL_FALSE_SET.has(lower);
    });
};

const normaliseBoolean = (v: string): string =>
    BOOL_TRUE_SET.has(v.trim().toLowerCase()) ? 'True' : 'False';

// ─────────────────────────────────────────────
// R2: DateTime → yyyy-MM-ddTHH:mm:ss (UTC, no fractional seconds)
// ─────────────────────────────────────────────
const toISODateTime = (val: string): string => {
    const d = new Date(val);
    if (isNaN(d.getTime())) return val;
    const y  = d.getUTCFullYear();
    const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dy = String(d.getUTCDate()).padStart(2, '0');
    const h  = String(d.getUTCHours()).padStart(2, '0');
    const mi = String(d.getUTCMinutes()).padStart(2, '0');
    const s  = String(d.getUTCSeconds()).padStart(2, '0');
    return `${y}-${mo}-${dy}T${h}:${mi}:${s}`;
};

// ─────────────────────────────────────────────
// R1: Date → yyyy-MM-dd (multi-format support)
// ─────────────────────────────────────────────
const toYMD = (val: string): string | null => {
    // Already correct
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;

    // YYYYMMDD compact
    if (/^\d{8}$/.test(val)) {
        return `${val.slice(0,4)}-${val.slice(4,6)}-${val.slice(6,8)}`;
    }

    // DD-Mon-YYYY / DD-Mon-YY  (e.g. 15-Mar-2024)
    const monMatch = val.match(/^(\d{1,2})[-\/\s]([A-Za-z]{3})[-\/\s](\d{2,4})$/);
    if (monMatch) {
        const [, d, mon, y] = monMatch;
        const m = MONTH_MAP[mon.toLowerCase()];
        if (m) {
            const fullY = y.length === 2 ? (parseInt(y) > 50 ? '19' + y : '20' + y) : y;
            return `${fullY}-${m}-${d.padStart(2, '0')}`;
        }
    }

    // Month DD, YYYY  (e.g. March 15, 2024)
    const longMonMatch = val.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
    if (longMonMatch) {
        const [, mon, d, y] = longMonMatch;
        const m = MONTH_MAP[mon.slice(0, 3).toLowerCase()];
        if (m) return `${y}-${m}-${d.padStart(2, '0')}`;
    }

    // DD/MM/YYYY or MM/DD/YYYY or DD-MM-YYYY (4-digit year)
    const dmyMatch = val.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (dmyMatch) {
        const [, a, b, y] = dmyMatch;
        const n1 = parseInt(a), n2 = parseInt(b);
        if (n1 > 12) {
            // day > 12 → must be DD/MM/YYYY
            return `${y}-${String(n2).padStart(2, '0')}-${String(n1).padStart(2, '0')}`;
        }
        // Default: US convention MM/DD/YYYY
        return `${y}-${String(n1).padStart(2, '0')}-${String(n2).padStart(2, '0')}`;
    }

    // MM/DD/YY  two-digit year
    const mdyShort = val.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
    if (mdyShort) {
        const [, m, d, y] = mdyShort;
        const fullY = parseInt(y) > 50 ? '19' + y : '20' + y;
        return `${fullY}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }

    return null;
};

// ─────────────────────────────────────────────
// Legacy column-specific helpers (unchanged)
// ─────────────────────────────────────────────
const ddmmToMmdd = (val: string): string => {
    const parts = val.split(/[\s/:]+/);
    if (parts.length >= 3) {
        const [d, m, y] = parts;
        if (d.length <= 2 && m.length <= 2 && y.length === 4) {
            return `${m.padStart(2, '0')}/${d.padStart(2, '0')}/${y}`;
        }
    }
    return val;
};

const dateOnly = (val: string): string => {
    if (!val || ['nan', 'ohio'].includes(val.toLowerCase())) return '';
    const m = val.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : val;
};

// ─────────────────────────────────────────────
// Core cell-level Gainsight transform
// ─────────────────────────────────────────────
export const applyGainsightLogic = (val: any, colName: string, isBoolCol = false): string => {
    if (val === null || val === undefined || (typeof val === 'number' && isNaN(val))) return '';

    let strVal = String(val).trim();
    if (!strVal || ['nan', 'none', 'null', 'n/a', 'na', '#n/a'].includes(strVal.toLowerCase())) return '';

    // R14: Excel formula errors → empty
    if (EXCEL_ERRORS.has(strVal)) return '';

    // R15: Replacement characters → apostrophe
    strVal = strVal.replace(/\ufffd+/g, "'");

    // Strip return-arrow glyph (legacy)
    strVal = strVal.replace(/\u21b5/g, '');

    // R20: Double-dash null marker → empty
    if (strVal === '--') return '';

    // Legacy column-specific rules
    if (DATE_ONLY_COLUMNS.has(colName) && strVal.toLowerCase() === 'ohio') return '';
    if (DATE_ONLY_COLUMNS.has(colName)) return dateOnly(strVal);
    if (DDMMYYYY_COLUMNS.has(colName) && /^\d{1,2}\/\d{1,2}\/\d{4}/.test(strVal))
        return ddmmToMmdd(strVal);

    // R2: DateTime → yyyy-MM-ddTHH:mm:ss UTC (must run before R4 boolean check)
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(strVal)) {
        return toISODateTime(strVal);
    }

    // R4: Boolean column → normalise to True / False
    if (isBoolCol) return normaliseBoolean(strVal);

    // R19: Array-wrapped values → join with '; '
    if (isTrueArray(strVal)) return unwrapArray(strVal);

    // R16: Strip control characters (non-printable ASCII)
    strVal = strVal.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');

    // R6: Backslash escaping — single \ → \\  (Gainsight escape character spec)
    strVal = strVal.replace(/\\/g, '\\\\');

    // ⚠️  R5 NOTE: Do NOT strip or alter double-quote characters here.
    // The RFC4180 formatter (rfc4180-formatter.ts) wraps every field in double quotes
    // and correctly doubles any embedded quotes per RFC 4180 §2.7.
    // Previous code stripped quotes here — that was wrong and has been removed.

    // Legacy: trailing apostrophe padding
    if (strVal.endsWith("'")) strVal += ' ';

    return strVal;
};

// ─────────────────────────────────────────────
// Main cleaning pipeline
// ─────────────────────────────────────────────
export const cleanData = (
    data: any[],
    config: DataCleaningConfig
): CleanedDataResult => {
    const logs: string[] = [];
    let removedColumns: string[] = [];

    if (!data || data.length === 0) {
        return {
            data: [],
            originalRowCount: 0,
            cleanedRowCount: 0,
            removedColumns,
            logs: ['Empty dataset provided.'],
        };
    }

    const originalRowCount = data.length;

    // ── R10: Trim leading/trailing whitespace from column headers ─────────────
    const rawHeaders = Object.keys(data[0]);
    const headerTrimMap: Record<string, string> = {};
    let headersTrimmed = 0;
    rawHeaders.forEach(h => {
        const trimmed = h.trim();
        if (trimmed !== h) {
            headerTrimMap[h] = trimmed;
            headersTrimmed++;
        }
    });
    if (headersTrimmed > 0) {
        data = data.map(row => {
            const newRow: Record<string, any> = {};
            for (const k of Object.keys(row)) {
                newRow[headerTrimMap[k] ?? k] = row[k];
            }
            return newRow;
        });
        logs.push(`Trimmed whitespace from ${headersTrimmed} column header(s).`);
    }

    // ── R21: Ensure all headers start with an alphabet (Gainsight requirement) ──
    {
        const headers = Object.keys(data[0]);
        const alphaRegex = /^[A-Za-z]/;
        let invalidHeadersCount = 0;
        const renameMap: Record<string, string> = {};

        headers.forEach(h => {
            if (!alphaRegex.test(h)) {
                renameMap[h] = `Col_${h.replace(/^_+/, '') || 'Unnamed'}`;
                invalidHeadersCount++;
            }
        });

        if (invalidHeadersCount > 0) {
            data = data.map(row => {
                const newRow: Record<string, any> = {};
                for (const k of Object.keys(row)) {
                    newRow[renameMap[k] ?? k] = row[k];
                }
                return newRow;
            });
            logs.push(`Renamed ${invalidHeadersCount} invalid header(s) to start with a letter (e.g. __EMPTY -> Col_EMPTY).`);
        }
    }

    // ── R11: Detect and rename duplicate column headers ──────────────────────
    {
        const headers = Object.keys(data[0]);
        const seen: Record<string, number> = {};
        const dupes: string[] = [];
        headers.forEach(h => {
            seen[h] = (seen[h] ?? 0) + 1;
            if (seen[h] > 1) dupes.push(h);
        });
        if (dupes.length > 0) {
            // Rename on second+ occurrence by re-mapping
            const occurrence: Record<string, number> = {};
            data = data.map((row, rowIdx) => {
                if (rowIdx === 0) {
                    // Build a rename map for the whole dataset from first row keys
                    return row; // actual rename happens via re-keying below
                }
                return row;
            });
            // Rename duplicate keys by processing once over headers
            const finalHeaderMap: string[] = [];
            const occCount: Record<string, number> = {};
            headers.forEach(h => {
                occCount[h] = (occCount[h] ?? 0) + 1;
                finalHeaderMap.push(occCount[h] === 1 ? h : `${h}_${occCount[h]}`);
            });
            data = data.map(row => {
                const rowValues = Object.values(row);
                const newRow: Record<string, any> = {};
                finalHeaderMap.forEach((newKey, i) => { newRow[newKey] = rowValues[i]; });
                return newRow;
            });
            logs.push(`⚠️ WARNING: ${dupes.length} duplicate header(s) found (${dupes.join(', ')}) — renamed with _2, _3 suffix. Update your S3 Dataset task mapping to match.`);
        }
    }

    let table = aq.from(data);

    // ── R17: Remove blank / unnamed / fully-empty columns ───────────────────
    if (config.removeBlankColumns) {
        const cols = table.columnNames();
        for (const col of cols) {
            const trimmedCol = col.trim();

            // A column is "unnamed" if its header is blank, a SheetJS/PapaParse
            // auto-placeholder, or a generic generated name
            const isUnnamedHeader =
                trimmedCol === '' ||
                /^(unnamed:\s*\d*|__parsed_extra.*|__EMPTY.*|column\d*|Col_Unnamed|Col_EMPTY)$/i.test(trimmedCol);

            // Count non-empty values in this column
            const colData = table.array(col) as any[];
            const hasAnyData = colData.some(
                v => v !== undefined && v !== null && String(v).trim() !== '' && String(v).trim().toLowerCase() !== 'null'
            );

            if (isUnnamedHeader || !hasAnyData) {
                // Drop: blank/placeholder header, OR completely empty named column
                removedColumns.push(col);
                const reason = isUnnamedHeader ? 'blank/unnamed header' : 'no data in any row';
                logs.push(`Removed column "${col}" (${reason}).`);
            }
        }
        if (removedColumns.length > 0) {
            table = table.select(aq.not(removedColumns));
        }
    }

    // ── R18: Remove duplicate rows ───────────────────────────────────────────
    if (config.removeDuplicates) {
        const beforeCount = table.numRows();
        if (config.primaryKeyColumn && table.columnNames().includes(config.primaryKeyColumn)) {
            table = table.dedupe(config.primaryKeyColumn);
        } else {
            table = table.dedupe();
        }
        const removed = beforeCount - table.numRows();
        if (removed > 0) logs.push(`Removed ${removed} duplicate row(s).`);
    }

    let cleanedData = table.objects() as Record<string, any>[];

    // ── R4: Detect boolean columns at column level (before row-level pass) ───
    const booleanColumns = new Set<string>();
    if (config.applyGainsightRules) {
        for (const col of table.columnNames()) {
            const colData = cleanedData.map(r => r[col]);
            if (isColumnBoolean(colData)) booleanColumns.add(col);
        }
        if (booleanColumns.size > 0) {
            logs.push(`Detected ${booleanColumns.size} boolean column(s): ${[...booleanColumns].join(', ')} — normalised to True/False.`);
        }
    }

    // ── R1, R2, R4, R6, R14–R20: Row-level cell transforms ──────────────────
    if (config.fixDateFormatting || config.applyGainsightRules) {
        let dateFixCount = 0;
        let gainsightFixCount = 0;

        cleanedData = cleanedData.map(row => {
            const newRow: Record<string, any> = {};
            for (const key of Object.keys(row)) {
                let val: any = row[key];
                const originalStr = String(val ?? '');

                if (config.applyGainsightRules) {
                    val = applyGainsightLogic(val, key, booleanColumns.has(key));
                    if (String(val) !== originalStr) gainsightFixCount++;
                }

                // R1: Date normalisation — only on values that don't already look like ISO DateTime
                if (typeof val === 'string' && config.fixDateFormatting && val.length > 0) {
                    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val)) {
                        const normalised = toYMD(val);
                        if (normalised && normalised !== val) {
                            val = normalised;
                            dateFixCount++;
                        }
                    }
                }

                newRow[key] = val;
            }
            return newRow;
        });

        if (config.fixDateFormatting && dateFixCount > 0)
            logs.push(`Standardised ${dateFixCount} date value(s) to yyyy-MM-dd.`);
        if (config.applyGainsightRules && gainsightFixCount > 0)
            logs.push(`Applied Gainsight formatting rules to ${gainsightFixCount} cell(s).`);
    }

    return {
        data: cleanedData,
        originalRowCount,
        cleanedRowCount: cleanedData.length,
        removedColumns,
        logs,
    };
};
