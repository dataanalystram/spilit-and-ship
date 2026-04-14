import type { DataCleaningConfig, CleanedDataResult } from '../types';
import * as aq from 'arquero';

// ─────────────────────────────────────────────
// Gainsight 17 Rule Helper Functions
// ─────────────────────────────────────────────
const EXCEL_ERRORS = new Set(['#VALUE!', '#N/A', '#REF!', '#NAME?', '#DIV/0!', '#NULL!']);
const DDMMYYYY_COLUMNS = new Set(['Last New Sale Subscription Start Date']);
const DATE_ONLY_COLUMNS = new Set(['created date(DD/mm/YYYY)']);

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
    } catch {}

    const singleQuoted = [...inner.matchAll(/'([^']*)'/g)].map(m => m[1]);
    if (singleQuoted.length) return singleQuoted.join('; ');

    const doubleQuoted = [...inner.matchAll(/"([^"]*)"/g)].map(m => m[1]);
    if (doubleQuoted.length) return doubleQuoted.join('; ');

    return inner;
};

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

export const applyGainsightLogic = (val: any, colName: string): string => {
    if (val === null || val === undefined || (typeof val === 'number' && isNaN(val))) return '';
    
    let strVal = String(val).trim();
    if (!strVal || ['nan', 'none'].includes(strVal.toLowerCase())) return '';

    if (EXCEL_ERRORS.has(strVal) || strVal === '#VALUE!') return '';
    strVal = strVal.replace(/\ufffd+/g, "'");
    strVal = strVal.replace(/\u21b5/g, '');
    if (strVal === '--') return '';
    if (DATE_ONLY_COLUMNS.has(colName) && strVal === 'Ohio') return '';
    if (DATE_ONLY_COLUMNS.has(colName)) return dateOnly(strVal);
    if (DDMMYYYY_COLUMNS.has(colName) && /^\d{1,2}\/\d{1,2}\/\d{4}/.test(strVal)) return ddmmToMmdd(strVal);
    
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(strVal)) {
         return strVal.substring(0, 19).replace('T', ' ');
    }
    if (isTrueArray(strVal)) return unwrapArray(strVal);
    strVal = strVal.replace(/"/g, '');
    if (strVal.endsWith("'")) strVal += ' ';
    strVal = strVal.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');

    return strVal;
};

export const cleanData = (
    data: any[],
    config: DataCleaningConfig
): CleanedDataResult => {
    let logs: string[] = [];
    let removedColumns: string[] = [];

    if (!data || data.length === 0) {
        return { data: [], originalRowCount: 0, cleanedRowCount: 0, removedColumns, logs: ["Empty dataset provided."] };
    }

    const originalRowCount = data.length;
    let table = aq.from(data);

    // 1. Auto-remove blank/unnamed columns
    if (config.removeBlankColumns) {
        const columns = table.columnNames();
        for (const col of columns) {
            const isUnnamed = /^(unnamed:\s*\d*|\s*|__parsed_extra.*)$/i.test(col);
            const colData = table.array(col);
            const uniqueValues = new Set();
            for (let i = 0; i < colData.length; i++) {
                const val = colData[i];
                if (val !== undefined && val !== null && String(val).trim() !== '') {
                    uniqueValues.add(val);
                }
            }

            if (isUnnamed && uniqueValues.size <= 1) {
                removedColumns.push(col);
                logs.push(`Removed useless column: "${col}" - contained ${uniqueValues.size} unique values.`);
            }
        }

        if (removedColumns.length > 0) {
            table = table.select(aq.not(removedColumns));
        }
    }

    // 2. Remove Duplicates
    if (config.removeDuplicates) {
        const beforeCount = table.numRows();
        if (config.primaryKeyColumn && table.columnNames().includes(config.primaryKeyColumn)) {
            table = table.dedupe(config.primaryKeyColumn);
            const dedupCount = beforeCount - table.numRows();
            if (dedupCount > 0) logs.push(`Removed ${dedupCount} duplicate records based on PK: ${config.primaryKeyColumn}.`);
        } else {
            table = table.dedupe();
            const dedupCount = beforeCount - table.numRows();
            if (dedupCount > 0) logs.push(`Removed ${dedupCount} duplicate records (exact matches).`);
        }
    }

    let cleanedData = table.objects();
    const dateRegex = /^(0?[1-9]|1[0-2])[\/\-](0?[1-9]|[12]\d|3[01])[\/\-](\d{4}|\d{2})$/;

    if (config.fixDateFormatting || config.applyGainsightRules) {
        let fixedDatesCount = 0;
        let gainsightFixesCount = 0;

        cleanedData = cleanedData.map((row) => {
            const newRow: any = {};
            for (const key of Object.keys(row)) {
                let val = row[key];
                
                if (typeof val === 'string' || typeof val === 'number') {
                    const originalVal = String(val);

                    if (config.applyGainsightRules) {
                        val = applyGainsightLogic(val, key);
                        if (String(val) !== originalVal) gainsightFixesCount++;
                    }

                    if (typeof val === 'string' && config.fixDateFormatting) {
                        const match = val.match(dateRegex);
                        if (match) {
                           const d = new Date(val);
                           if (!isNaN(d.getTime())) {
                               val = d.toISOString().split('T')[0];
                               fixedDatesCount++;
                           }
                        }
                    }
                }
                newRow[key] = val;
            }
            return newRow;
        });

        if (config.fixDateFormatting && fixedDatesCount > 0) logs.push(`Standardized ${fixedDatesCount} date forms to YYYY-MM-DD.`);
        if (config.applyGainsightRules && gainsightFixesCount > 0) logs.push(`Applied 17 Gainsight formatting fixes to ${gainsightFixesCount} cells.`);
    }

    return {
        data: cleanedData,
        originalRowCount,
        cleanedRowCount: cleanedData.length,
        removedColumns,
        logs
    };
};
