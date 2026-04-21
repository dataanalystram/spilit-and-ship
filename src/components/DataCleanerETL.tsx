import { useState, useMemo } from 'react';
import Papa from 'papaparse';
import { DropZone } from './DropZone';
import { S3Connector } from './S3Connector';
import { cleanData } from '../lib/data-cleaner';
import { transformToCompanyMetrics } from '../lib/etl-transformer';
import { downloadCSV, formatToRFC4180 } from '../lib/rfc4180-formatter';
import type { DataCleaningConfig, ETLTransformationConfig, CleanedDataResult, CompanyMetric } from '../types';
import {
    Database, Filter, Layers, Download, CheckCircle, TableProperties,
    ArrowRight, Settings, FileSpreadsheet, ShieldCheck, Archive,
    FileDown, BarChart2, RefreshCw, ImageOff
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface SheetState {
    name: string;
    hasData: boolean;       // false = chart / image-only sheet — skip
    rowCount: number;
    headers: string[];
    rawData: any[];
    skipReason?: string;    // why this sheet was skipped (images, charts, etc.)
    mode: 'clean' | 'etl';
    cleanedResult: CleanedDataResult | null;
    etlResult: CompanyMetric[] | null;
    etlConfig: ETLTransformationConfig;
    status: 'idle' | 'processed';
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const VALID_EXTENSIONS = ['.csv', '.tsv', '.xls', '.xlsx'];
const VALID_MIME_FRAGMENTS = [
    'text/csv',
    'text/tab-separated-values',
    'application/vnd.ms-excel',
    'spreadsheetml',
];

function isValidFile(f: File): boolean {
    const hasValidExt = VALID_EXTENSIONS.some(e => f.name.toLowerCase().endsWith(e));
    const hasValidMime = VALID_MIME_FRAGMENTS.some(m => f.type.includes(m)) || f.type === '';
    return hasValidExt && (hasValidMime || f.type === '');
}

function defaultEtlConfig(firstHeader = '', sheetName = 'CSV/Excel Upload'): ETLTransformationConfig {
    return {
        companyIdColumn: firstHeader,
        relationshipIdColumn: '',
        dataSource: sheetName,
        metricColumns: [],
        dateColumn: '',
        targetColumn: '',
        baselineColumn: '',
        timeGranularity: 'Monthly',
        extraColumns: [],
    };
}

function checkNonTabularSheet(headers: string[]): string | false {
    if (headers.length === 0) return false;

    // 2. Structural check: Catch empty strings, whitespace, SheetJS (__EMPTY, __EMPTY_1, __parsed_extra), 
    // and PapaParse (_1, _2 duplicates of empty headers)
    const emptyHeaderPattern = /^(__EMPTY.*|__parsed_extra|_\d+)$/i;
    const emptyCount = headers.filter(h => h.trim() === '' || emptyHeaderPattern.test(h)).length;
    
    // If 50% or more of columns are totally blank (no headers), it's overwhelmingly likely
    // to be randomly pasted notes, embedded tables, or a pivot table output.
    if ((emptyCount / headers.length) >= 0.5) {
        return '⚠️ No clean column headers detected (50%+ empty) — appears to be notes/context or a pivot table';
    }

    return false;
}

function detectSheet(worksheet: any, XLSXLib: any, sheetName: string): {
    hasData: boolean;
    rowCount: number;
    headers: string[];
    rawData: any[];
    skipReason?: string;
} {
    // Chart-only sheets have no !ref at all
    if (!worksheet || !worksheet['!ref']) {
        return { hasData: false, rowCount: 0, headers: [], rawData: [], skipReason: 'Chart-only sheet — no tabular data' };
    }

    // Strict: ANY embedded images or drawings = reject the whole sheet, even if it has data rows
    const hasImages   = Array.isArray(worksheet['!images'])   && worksheet['!images'].length   > 0;
    const hasDrawings = Array.isArray(worksheet['!drawings']) && worksheet['!drawings'].length > 0;

    if (hasImages) {
        return {
            hasData: false,
            rowCount: 0,
            headers: [],
            rawData: [],
            skipReason: '⚠️ Contains pasted images/pictures — sheet blocked for data integrity',
        };
    }

    if (hasDrawings) {
        return {
            hasData: false,
            rowCount: 0,
            headers: [],
            rawData: [],
            skipReason: '⚠️ Contains charts/drawings — sheet blocked for data integrity',
        };
    }

    try {
        const rawData: any[] = XLSXLib.utils.sheet_to_json(worksheet, { defval: '' });
        const headers = rawData.length > 0 ? Object.keys(rawData[0]) : [];

        // Detect non-tabular sheets via high ratio of empty columns
        const nonTabularReason = checkNonTabularSheet(headers);
        if (nonTabularReason) {
            return {
                hasData: false,
                rowCount: 0,
                headers: [],
                rawData: [],
                skipReason: nonTabularReason,
            };
        }

        return {
            hasData: rawData.length > 0,
            rowCount: rawData.length,
            headers,
            rawData,
        };
    } catch {
        return { hasData: false, rowCount: 0, headers: [], rawData: [], skipReason: 'Failed to parse sheet' };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function DataCleanerETL() {
    const [file, setFile] = useState<File | null>(null);
    const [isParsing, setIsParsing] = useState(false);
    const [sheetMap, setSheetMap] = useState<Record<string, SheetState>>({});
    const [sheetOrder, setSheetOrder] = useState<string[]>([]);
    const [activeSheet, setActiveSheet] = useState<string>('');
    const [isBulkProcessing, setIsBulkProcessing] = useState(false);
    const [step, setStep] = useState<1 | 2 | 3>(1);
    const [selectedSheets, setSelectedSheets] = useState<Set<string>>(new Set());

    const [cleanConfig, setCleanConfig] = useState<DataCleaningConfig>({
        removeBlankColumns: true,
        fixDateFormatting: true,
        removeDuplicates: true,
        applyGainsightRules: true,
        primaryKeyColumn: '',
    });

    // ── Derived helpers ──────────────────────────────────────────────────────

    const activeState: SheetState | null = sheetMap[activeSheet] ?? null;
    const dataSheetCount = sheetOrder.filter(n => sheetMap[n]?.hasData).length;
    const processedCount = sheetOrder.filter(n => sheetMap[n]?.status === 'processed').length;
    const dataSheetNames = sheetOrder.filter(n => sheetMap[n]?.hasData);
    const allSelected = dataSheetNames.length > 0 && dataSheetNames.every(n => selectedSheets.has(n));
    const someSelected = dataSheetNames.some(n => selectedSheets.has(n));

    const updateSheet = (name: string, updates: Partial<SheetState>) =>
        setSheetMap(prev => ({ ...prev, [name]: { ...prev[name], ...updates } }));

    const updateActive = (updates: Partial<SheetState>) => updateSheet(activeSheet, updates);

    const toggleSheetSelection = (name: string) => {
        setSelectedSheets(prev => {
            const next = new Set(prev);
            if (next.has(name)) next.delete(name); else next.add(name);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (allSelected) {
            setSelectedSheets(new Set());
        } else {
            setSelectedSheets(new Set(dataSheetNames));
        }
    };

    // ── File ingestion ────────────────────────────────────────────────────────

    const handleFileSelect = async (selectedFile: File) => {
        if (!isValidFile(selectedFile)) {
            alert('Invalid file type. Please upload .csv, .tsv, .xlsx, or .xls files only.');
            return;
        }

        setFile(selectedFile);
        setIsParsing(true);
        setStep(1);
        setSheetMap({});
        setSheetOrder([]);
        setActiveSheet('');
        setSelectedSheets(new Set());

        const isExcel = selectedFile.name.toLowerCase().endsWith('.xlsx') || selectedFile.name.toLowerCase().endsWith('.xls');

        if (isExcel) {
            try {
                const XLSX = await import('xlsx');
                const buffer = await selectedFile.arrayBuffer();
                const workbook = XLSX.read(buffer, { type: 'array' });

                const newMap: Record<string, SheetState> = {};
                let firstDataSheet = '';

                workbook.SheetNames.forEach((name: string) => {
                    const ws = workbook.Sheets[name];
                    const { hasData, rowCount, headers, rawData, skipReason } = detectSheet(ws, XLSX, name);
                    if (hasData && !firstDataSheet) firstDataSheet = name;

                    newMap[name] = {
                        name,
                        hasData,
                        rowCount,
                        headers,
                        rawData,
                        skipReason,
                        mode: 'etl',
                        cleanedResult: null,
                        etlResult: null,
                        etlConfig: defaultEtlConfig(headers[0] || '', name),
                        status: 'idle',
                    };
                });

                setSheetMap(newMap);
                setSheetOrder(workbook.SheetNames);
                setActiveSheet(firstDataSheet || workbook.SheetNames[0]);
            } catch (err) {
                console.error('Failed to parse Excel file.', err);
            } finally {
                setIsParsing(false);
            }
        } else {
            // CSV / TSV via PapaParse
            Papa.parse(selectedFile, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    const headers = results.meta.fields || [];
                    const sheetName = selectedFile.name;
                    
                    const nonTabularReason = checkNonTabularSheet(headers);
                    const hasValidData = results.data.length > 0 && !nonTabularReason;

                    setSheetMap({
                        [sheetName]: {
                            name: sheetName,
                            hasData: hasValidData,
                            rowCount: nonTabularReason ? 0 : results.data.length,
                            headers: nonTabularReason ? [] : headers,
                            rawData: nonTabularReason ? [] : results.data as any[],
                            skipReason: nonTabularReason || undefined,
                            mode: 'etl',
                            cleanedResult: null,
                            etlResult: null,
                            etlConfig: defaultEtlConfig(headers[0] || '', sheetName),
                            status: 'idle',
                        },
                    });
                    setSheetOrder([sheetName]);
                    setActiveSheet(sheetName);
                    setIsParsing(false);
                },
                error: () => setIsParsing(false),
            });
        }
    };

    // ── Processing ────────────────────────────────────────────────────────────

    const runClean = () => {
        if (!activeState) return;
        const result = cleanData(activeState.rawData, cleanConfig);
        const newHeaders = result.data.length > 0 ? Object.keys(result.data[0]) : activeState.headers;
        const isCleanOnly = activeState.mode === 'clean';
        updateActive({
            cleanedResult: result,
            headers: newHeaders,
            etlResult: null,
            status: isCleanOnly ? 'processed' : 'idle',
        });
        setStep(isCleanOnly ? 3 : 2);
    };

    const runETL = () => {
        if (!activeState?.cleanedResult) return;
        const result = transformToCompanyMetrics(activeState.cleanedResult.data, activeState.etlConfig);
        updateActive({ etlResult: result, status: 'processed' });
        setStep(3);
    };

    const runBulkProcess = async () => {
        setIsBulkProcessing(true);
        const updated = { ...sheetMap };
        for (const name of sheetOrder) {
            const s = sheetMap[name];
            if (!s.hasData || !selectedSheets.has(name)) continue;
            const cleaned = cleanData(s.rawData, cleanConfig);
            const newHeaders = cleaned.data.length > 0 ? Object.keys(cleaned.data[0]) : s.headers;
            // Bulk action only runs Clean Format Only
            updated[name] = {
                ...s,
                mode: 'clean',
                cleanedResult: cleaned,
                etlResult: null,
                headers: newHeaders,
                status: 'processed',
            };
        }
        setSheetMap(updated);
        setIsBulkProcessing(false);
    };

    // ── Downloads ─────────────────────────────────────────────────────────────

    const sheetToCSV = (s: SheetState): string => {
        if (s.mode === 'etl' && s.etlResult) return formatToRFC4180(s.etlResult);
        if (s.mode === 'clean' && s.cleanedResult) return formatToRFC4180(s.cleanedResult.data);
        return '';
    };


    // R12: Gainsight requires no spaces in filenames
    const sanitizeFilename = (name: string): string =>
        name.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-]/g, '');

    const sheetFilename = (s: SheetState): string => {
        const safe = sanitizeFilename(s.name);
        return s.mode === 'etl' ? `${safe}_metrics.csv` : `${safe}_cleaned.csv`;
    };

    // Date suffix for S3 file naming
    const todaySuffix = new Date().toISOString().split('T')[0];

    const sheetFilenameWithDate = (s: SheetState): string => {
        const safe = sanitizeFilename(s.name);
        const suffix = s.mode === 'etl' ? '_metrics' : '_cleaned';
        return `${safe}${suffix}_${todaySuffix}.csv`;
    };

    // Build S3 upload payload from all processed sheets
    const s3Sheets = useMemo(() => {
        return sheetOrder
            .filter(n => sheetMap[n]?.status === 'processed')
            .map(n => {
                const s = sheetMap[n];
                return {
                    sheetName: s.name,
                    csvContent: sheetToCSV(s),
                    fileName: sheetFilenameWithDate(s),
                };
            })
            .filter(s => s.csvContent.length > 0);
    }, [sheetMap, sheetOrder]);

    // Default S3 folder name from the uploaded file
    const defaultS3Folder = useMemo(() => {
        if (!file) return 'upload';
        return sanitizeFilename(file.name.replace(/\.[^.]+$/, ''));
    }, [file]);

    const downloadSingle = (name: string) => {
        const s = sheetMap[name];
        if (!s || s.status !== 'processed') return;
        const csv = sheetToCSV(s);
        if (csv) downloadCSV(csv, sheetFilename(s));
    };

    const downloadAllCSVs = () => {
        const ready = sheetOrder.filter(n => sheetMap[n].status === 'processed');
        ready.forEach((name, i) => setTimeout(() => downloadSingle(name), i * 400));
    };

    const downloadAsZip = async () => {
        const ready = sheetOrder.filter(n => sheetMap[n].status === 'processed');
        if (ready.length === 0) return;
        try {
            const JSZip = (await import('jszip')).default;
            const zip = new JSZip();
            ready.forEach(name => {
                const csv = sheetToCSV(sheetMap[name]);
                if (csv) zip.file(sheetFilename(sheetMap[name]), csv);
            });
            const blob = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${(file?.name || 'export').replace(/\.[^.]+$/, '')}_all_sheets.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch {
            // Fallback to individual downloads if jszip fails
            downloadAllCSVs();
        }
    };

    // ── Reset ─────────────────────────────────────────────────────────────────

    const handleReset = () => {
        setFile(null);
        setSheetMap({});
        setSheetOrder([]);
        setActiveSheet('');
        setStep(1);
        setIsBulkProcessing(false);
    };

    // ─────────────────────────────────────────────────────────────────────────
    // Render
    // ─────────────────────────────────────────────────────────────────────────

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

            {/* ── Header ── */}
            <div className="bg-gradient-to-r from-emerald-50 to-teal-50 p-5 rounded-xl border border-teal-100 flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <h2 className="text-xl font-bold text-slate-800 flex items-center mb-1">
                        <Database className="w-5 h-5 mr-2 text-teal-600" />
                        Data Cleaning &amp; ETL Engine
                        <span className="ml-3 text-xs bg-teal-600 text-white px-2 py-1 rounded">Captain Hindsight Phase 1</span>
                    </h2>
                    <p className="text-sm text-slate-600">
                        Upload multi-sheet Excel or CSV files. Clean Gainsight formatting, or run the full schema Unpivot/Melt ETL transform.
                    </p>
                </div>
                <div className="flex items-center text-xs text-teal-700 bg-white border border-teal-200 px-3 py-1.5 rounded-full shadow-sm whitespace-nowrap">
                    <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />
                    100% Client-Side · No Data Leaves Your Browser
                </div>
            </div>

            {/* ── Upload Zone (shown only before file loaded) ── */}
            {!file && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
                    <DropZone
                        onFileSelected={handleFileSelect}
                        selectedFile={file}
                        disabled={isParsing}
                        title="Drop Excel / CSV Files"
                        subtitle="Supports multi-sheet .xlsx, .xls, .csv, .tsv — chart & image-only sheets are automatically detected and skipped"
                    />
                </div>
            )}

            {/* ── Parsing Spinner ── */}
            {isParsing && (
                <div className="flex items-center justify-center p-16 text-teal-600">
                    <svg className="animate-spin w-6 h-6 mr-3" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span className="font-medium text-sm">Parsing workbook &amp; scanning all sheets for data...</span>
                </div>
            )}

            {/* ── Main Workspace: Sidebar + Right Panel ── */}
            {file && !isParsing && sheetOrder.length > 0 && (
                <div className="flex gap-5 items-start">

                    {/* ════════════════════════════════════════
                        LEFT SIDEBAR — Sheet Browser
                    ════════════════════════════════════════ */}
                    <div className="w-56 flex-shrink-0 flex flex-col gap-3">

                        {/* Workbook info */}
                        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                            <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-1">Workbook</p>
                            <p className="text-sm font-bold text-slate-800 truncate" title={file.name}>{file.name}</p>
                            <div className="flex gap-2 mt-2 flex-wrap">
                                <span className="text-[10px] font-bold px-2 py-0.5 bg-teal-100 text-teal-700 rounded-full">{dataSheetCount} data</span>
                                {sheetOrder.length - dataSheetCount > 0 && (
                                    <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full">{sheetOrder.length - dataSheetCount} skipped</span>
                                )}
                                {processedCount > 0 && (
                                    <span className="text-[10px] font-bold px-2 py-0.5 bg-green-100 text-green-700 rounded-full">{processedCount} ready</span>
                                )}
                            </div>
                        </div>

                        {/* Sheet list */}
                        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                            {/* Select All header */}
                            <div className="px-3 py-2.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between gap-2">
                                <label className="flex items-center gap-2 cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={allSelected}
                                        ref={el => { if (el) el.indeterminate = !allSelected && someSelected; }}
                                        onChange={toggleSelectAll}
                                        className="w-3.5 h-3.5 rounded text-teal-600 focus:ring-teal-500 border-slate-300"
                                    />
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Select All</span>
                                </label>
                                {someSelected && (
                                    <span className="text-[10px] font-bold text-teal-600">{[...selectedSheets].filter(n => sheetMap[n]?.hasData).length} selected</span>
                                )}
                            </div>
                            <div className="divide-y divide-slate-50 max-h-72 overflow-y-auto">
                                {sheetOrder.map(name => {
                                    const s = sheetMap[name];
                                    const isActive = activeSheet === name;
                                    const isChecked = selectedSheets.has(name);
                                    return (
                                        <div
                                            key={name}
                                            className={`flex items-start transition-all border-l-[3px] ${
                                                isActive
                                                    ? 'bg-teal-50 border-teal-500'
                                                    : 'border-transparent'
                                            }`}
                                        >
                                            {/* Checkbox col */}
                                            <div className="flex-shrink-0 pl-3 pt-3.5">
                                                {s.hasData ? (
                                                    <input
                                                        type="checkbox"
                                                        checked={isChecked}
                                                        onChange={() => toggleSheetSelection(name)}
                                                        onClick={e => e.stopPropagation()}
                                                        className="w-3.5 h-3.5 rounded text-teal-600 focus:ring-teal-500 border-slate-300"
                                                    />
                                                ) : (
                                                    <span title={s.skipReason ?? 'Skipped – non-tabular content'}>
                                                        {s.skipReason?.includes('image') || s.skipReason?.includes('picture')
                                                            ? <ImageOff className="w-3.5 h-3.5 text-orange-400" />
                                                            : <BarChart2 className="w-3.5 h-3.5 text-orange-300" />}
                                                    </span>
                                                )}
                                            </div>
                                            {/* Sheet info — click to activate */}
                                            <button
                                                onClick={() => {
                                                    if (!s.hasData) return;
                                                    setActiveSheet(name);
                                                    setStep(s.status === 'processed' ? 3 : 1);
                                                }}
                                                disabled={!s.hasData}
                                                className={`flex-1 text-left px-2.5 py-3 flex items-start gap-2 ${
                                                    s.hasData ? 'hover:bg-slate-50 cursor-pointer' : 'opacity-35 cursor-not-allowed'
                                                }`}
                                            >
                                                <div className="mt-0.5 flex-shrink-0">
                                                    {!s.hasData
                                                        ? null
                                                        : s.status === 'processed'
                                                            ? <CheckCircle className="w-3.5 h-3.5 text-teal-500" />
                                                            : <FileSpreadsheet className="w-3.5 h-3.5 text-slate-400" />
                                                    }
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className={`text-xs font-semibold truncate ${isActive ? 'text-teal-800' : 'text-slate-700'}`}>{name}</p>
                                                    <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">
                                                        {s.hasData
                                                            ? `${s.rowCount.toLocaleString()} rows`
                                                            : (s.skipReason ?? 'Skipped — no tabular data')}
                                                    </p>
                                                    {s.hasData && s.status === 'processed' && (
                                                        <span className="inline-block mt-1 text-[9px] font-bold px-1.5 py-0.5 rounded-sm uppercase bg-green-100 text-green-700">
                                                            Ready
                                                        </span>
                                                    )}
                                                </div>
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Bulk actions */}
                        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 space-y-2">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Bulk Actions</p>
                            <p className="text-[9px] text-amber-600 bg-amber-50 border border-amber-100 rounded px-2 py-1 mb-2 leading-tight">
                                <strong>Clean Format Only.</strong> ETL (Unpivot) requires per-sheet field mapping — configure individually using the right panel.
                            </p>

                            <button
                                onClick={runBulkProcess}
                                disabled={isBulkProcessing || !someSelected}
                                className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-2 rounded-lg text-xs font-bold shadow-sm transition-all"
                            >
                                {isBulkProcessing ? (
                                    <><svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Processing...</>
                                ) : (
                                    <><Filter className="w-3.5 h-3.5" />Clean Selected ({[...selectedSheets].filter(n => sheetMap[n]?.hasData).length})</>
                                )}
                            </button>

                            {processedCount > 0 && (
                                <>
                                    <button
                                        onClick={downloadAllCSVs}
                                        className="w-full flex items-center justify-center gap-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-3 py-2 rounded-lg text-xs font-semibold transition-all"
                                    >
                                        <FileDown className="w-3.5 h-3.5" />
                                        Download CSVs ({processedCount})
                                    </button>
                                    <button
                                        onClick={downloadAsZip}
                                        className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-black text-white px-3 py-2 rounded-lg text-xs font-bold transition-all"
                                    >
                                        <Archive className="w-3.5 h-3.5" />
                                        Download as ZIP
                                    </button>
                                </>
                            )}
                        </div>

                        {/* Reset */}
                        <button
                            onClick={handleReset}
                            className="w-full flex items-center justify-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 py-2 transition-all"
                        >
                            <RefreshCw className="w-3 h-3" /> Upload Different File
                        </button>
                    </div>

                    {/* ════════════════════════════════════════
                        RIGHT PANEL — Active Sheet
                    ════════════════════════════════════════ */}
                    <div className="flex-1 min-w-0 space-y-5">

                        {/* ── No active sheet (all sheets are charts) ── */}
                        {!activeState && (
                            <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-500">
                                <BarChart2 className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                                <p className="font-medium">No data sheets found</p>
                                <p className="text-sm mt-1">All sheets contain charts or images only and were skipped.</p>
                            </div>
                        )}

                        {/* ── Skipped sheet selected — show specific reason ── */}
                        {activeState && !activeState.hasData && (
                            <div className="bg-orange-50 border border-orange-200 rounded-xl p-12 text-center">
                                <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-orange-100 mb-4">
                                    {activeState.skipReason?.includes('image') || activeState.skipReason?.includes('picture')
                                        ? <ImageOff className="w-7 h-7 text-orange-400" />
                                        : <BarChart2 className="w-7 h-7 text-orange-400" />}
                                </div>
                                <p className="font-bold text-orange-800 text-base mb-2">"{activeState.name}" was blocked</p>
                                <p className="text-sm text-orange-700 max-w-xs mx-auto">
                                    {activeState.skipReason ?? 'This sheet contains non-tabular content and cannot be processed.'}
                                </p>
                                <p className="text-xs text-orange-500 mt-3">Remove any images, charts, or drawings from this sheet in Excel, then re-upload.</p>
                            </div>
                        )}

                        {/* ── Active data sheet ── */}
                        {activeState && activeState.hasData && (
                            <>
                                {/* Sheet header + Mode Toggle */}
                                <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
                                    <div className="flex items-center justify-between flex-wrap gap-4">
                                        <div>
                                            <h3 className="font-bold text-slate-800 text-base">{activeState.name}</h3>
                                            <p className="text-xs text-slate-500 mt-0.5">
                                                {activeState.rowCount.toLocaleString()} rows &middot; {activeState.headers.length} columns
                                            </p>
                                        </div>
                                        {/* Mode Toggle */}
                                        <div className="flex bg-slate-100 rounded-lg p-1 gap-1">
                                            <button
                                                onClick={() => { updateActive({ mode: 'clean', cleanedResult: null, etlResult: null, status: 'idle' }); setStep(1); }}
                                                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-all ${
                                                    activeState.mode === 'clean' ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200'
                                                }`}
                                            >
                                                <Filter className="w-4 h-4" />
                                                Clean Format Only
                                            </button>
                                            <button
                                                onClick={() => { updateActive({ mode: 'etl', cleanedResult: null, etlResult: null, status: 'idle' }); setStep(1); }}
                                                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-all ${
                                                    activeState.mode === 'etl' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200'
                                                }`}
                                            >
                                                <Layers className="w-4 h-4" />
                                                Clean + Unpivot (ETL)
                                            </button>
                                        </div>
                                    </div>

                                    {activeState.mode === 'clean' && (
                                        <div className="mt-3 p-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg">
                                            <strong>Clean Format Only:</strong> Applies all Gainsight formatting rules and date standardization.
                                            Output CSV keeps the <em>same column structure</em> as the original — no schema change, no unpivoting.
                                        </div>
                                    )}
                                    {activeState.mode === 'etl' && (
                                        <div className="mt-3 p-3 bg-indigo-50 border border-indigo-200 text-indigo-800 text-xs rounded-lg">
                                            <strong>Clean + Unpivot (ETL):</strong> Runs the full Captain Hindsight pipeline — clean data, map Company ID &amp; schema,
                                            then melt selected metric columns into the 11-field <code className="bg-indigo-100 px-1 rounded">Company Metrics</code> vertical format ready for Gainsight ingestion.
                                        </div>
                                    )}
                                </div>

                                {/* ── Step 1: Cleaning Config ── */}
                                {step === 1 && (
                                    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                                        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center">
                                            <span className="bg-teal-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mr-3 flex-shrink-0">1</span>
                                            <h3 className="font-bold text-slate-800 text-sm">Configure Cleaning Rules</h3>
                                        </div>
                                        <div className="p-5">
                                            <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm text-slate-700 bg-slate-50 p-4 rounded-lg border border-slate-200">
                                                <label className="flex items-center gap-2">
                                                    <input type="checkbox" checked={cleanConfig.removeBlankColumns} onChange={e => setCleanConfig({ ...cleanConfig, removeBlankColumns: e.target.checked })} className="rounded text-teal-600 focus:ring-teal-500" />
                                                    <span>Drop unnamed/blank columns</span>
                                                </label>
                                                <label className="flex items-center gap-2">
                                                    <input type="checkbox" checked={cleanConfig.fixDateFormatting} onChange={e => setCleanConfig({ ...cleanConfig, fixDateFormatting: e.target.checked })} className="rounded text-teal-600 focus:ring-teal-500" />
                                                    <span>Standardize Dates to YYYY-MM-DD</span>
                                                </label>
                                                <label className="flex items-center gap-2">
                                                    <input type="checkbox" checked={cleanConfig.removeDuplicates} onChange={e => setCleanConfig({ ...cleanConfig, removeDuplicates: e.target.checked })} className="rounded text-teal-600 focus:ring-teal-500" />
                                                    <span>De-duplicate rows</span>
                                                </label>
                                                <label className="flex items-center gap-2 col-span-2 pt-2 border-t border-slate-200 mt-1">
                                                    <input type="checkbox" checked={cleanConfig.applyGainsightRules} onChange={e => setCleanConfig({ ...cleanConfig, applyGainsightRules: e.target.checked })} className="rounded text-indigo-600 focus:ring-indigo-500" />
                                                    <span className="font-bold text-indigo-800">Apply Gainsight Deep-Clean Rules (17 Fixes)</span>
                                                </label>
                                            </div>
                                            <div className="flex justify-end mt-4">
                                                <button onClick={runClean} className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-6 py-2.5 rounded-lg text-sm font-bold shadow-sm transition-all">
                                                    <Filter className="w-4 h-4" />
                                                    Execute Cleaning
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* ── Step 2: ETL Schema Mapping (ETL mode only) ── */}
                                {step >= 2 && activeState.cleanedResult && activeState.mode === 'etl' && (
                                    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                                        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between flex-wrap gap-3">
                                            <div className="flex items-center">
                                                <span className="bg-teal-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mr-3 flex-shrink-0">2</span>
                                                <h3 className="font-bold text-slate-800 text-sm">Captain Hindsight Schema Mapping</h3>
                                            </div>
                                            <div className="flex gap-2">
                                                <span className="text-xs font-bold px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-full">
                                                    {activeState.cleanedResult.cleanedRowCount.toLocaleString()} rows kept
                                                </span>
                                                <span className="text-xs font-bold px-2.5 py-1 bg-slate-100 text-slate-500 rounded-full">
                                                    {activeState.cleanedResult.removedColumns.length} cols dropped
                                                </span>
                                            </div>
                                        </div>
                                        <div className="p-5 space-y-5">
                                            <div className="p-5 bg-slate-50 border border-slate-200 rounded-lg">
                                                <h4 className="text-xs font-bold text-slate-700 mb-4 flex items-center uppercase tracking-wide">
                                                    <Settings className="w-4 h-4 mr-2 text-slate-500" />
                                                    Map Data to the 11-Field Analytics Model
                                                </h4>

                                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                                    {/* Company ID */}
                                                    <div className="space-y-1.5 md:col-span-2">
                                                        <label className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Company ID Column *</label>
                                                        <select
                                                            value={activeState.etlConfig.companyIdColumn}
                                                            onChange={e => updateActive({ etlConfig: { ...activeState.etlConfig, companyIdColumn: e.target.value } })}
                                                            className="w-full text-sm border-slate-300 rounded p-2.5 border bg-white focus:ring-teal-500 focus:border-teal-500"
                                                        >
                                                            <option value="">-- Select Column --</option>
                                                            {activeState.headers.map(h => <option key={h} value={h}>{h}</option>)}
                                                        </select>
                                                    </div>
                                                    {/* Relationship ID */}
                                                    <div className="space-y-1.5 md:col-span-2">
                                                        <label className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Relationship ID (Optional)</label>
                                                        <select
                                                            value={activeState.etlConfig.relationshipIdColumn || ''}
                                                            onChange={e => updateActive({ etlConfig: { ...activeState.etlConfig, relationshipIdColumn: e.target.value } })}
                                                            className="w-full text-sm border-slate-300 rounded p-2.5 border bg-white focus:ring-teal-500"
                                                        >
                                                            <option value="">Leave blank if null</option>
                                                            {activeState.headers.map(h => <option key={h} value={h}>{h}</option>)}
                                                        </select>
                                                    </div>
                                                    {/* Metric Date */}
                                                    <div className="space-y-1.5">
                                                        <label className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Metric Date</label>
                                                        <select
                                                            value={activeState.etlConfig.dateColumn}
                                                            onChange={e => updateActive({ etlConfig: { ...activeState.etlConfig, dateColumn: e.target.value } })}
                                                            className="w-full text-sm border-slate-300 rounded p-2.5 border bg-white focus:ring-teal-500"
                                                        >
                                                            <option value="">Use Run Date</option>
                                                            {activeState.headers.map(h => <option key={h} value={h}>{h}</option>)}
                                                        </select>
                                                    </div>
                                                    {/* Granularity */}
                                                    <div className="space-y-1.5">
                                                        <label className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Granularity</label>
                                                        <select
                                                            value={activeState.etlConfig.timeGranularity}
                                                            onChange={e => updateActive({ etlConfig: { ...activeState.etlConfig, timeGranularity: e.target.value as any } })}
                                                            className="w-full text-sm border-slate-300 rounded p-2.5 border bg-white focus:ring-teal-500"
                                                        >
                                                            {['Daily', 'Weekly', 'Monthly', 'Quarterly'].map(g => <option key={g} value={g}>{g}</option>)}
                                                        </select>
                                                    </div>
                                                    {/* Data Source */}
                                                    <div className="space-y-1.5 md:col-span-2">
                                                        <label className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Data Source</label>
                                                        <input
                                                            type="text"
                                                            value={activeState.etlConfig.dataSource}
                                                            onChange={e => updateActive({ etlConfig: { ...activeState.etlConfig, dataSource: e.target.value } })}
                                                            placeholder="e.g. Snowflake PX Dump"
                                                            className="w-full text-sm border-slate-300 rounded p-2.5 border bg-white focus:ring-teal-500 focus:border-teal-500"
                                                        />
                                                    </div>
                                                    {/* Baseline */}
                                                    <div className="space-y-1.5 md:col-span-2">
                                                        <label className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Baseline Value (Prior Period)</label>
                                                        <select
                                                            value={activeState.etlConfig.baselineColumn || ''}
                                                            onChange={e => updateActive({ etlConfig: { ...activeState.etlConfig, baselineColumn: e.target.value } })}
                                                            className="w-full text-sm border-slate-300 rounded p-2.5 border bg-white focus:ring-teal-500"
                                                        >
                                                            <option value="">Leave blank if null</option>
                                                            {activeState.headers.map(h => <option key={h} value={h}>{h}</option>)}
                                                        </select>
                                                    </div>
                                                    {/* Target */}
                                                    <div className="space-y-1.5 md:col-span-2">
                                                        <label className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Target Value (Goal)</label>
                                                        <select
                                                            value={activeState.etlConfig.targetColumn || ''}
                                                            onChange={e => updateActive({ etlConfig: { ...activeState.etlConfig, targetColumn: e.target.value } })}
                                                            className="w-full text-sm border-slate-300 rounded p-2.5 border bg-white focus:ring-teal-500"
                                                        >
                                                            <option value="">Leave blank if null</option>
                                                            {activeState.headers.map(h => <option key={h} value={h}>{h}</option>)}
                                                        </select>
                                                    </div>
                                                </div>

                                                {/* Side-by-side Metric + Dimension pickers */}
                                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-6 pt-5 border-t border-slate-200">
                                                    {/* Metrics to melt */}
                                                    <div className="flex flex-col">
                                                        <label className="text-[10px] font-bold text-slate-700 uppercase tracking-widest mb-1">
                                                            Select Metrics to Melt / Unpivot
                                                        </label>
                                                        <p className="text-xs text-slate-500 mb-2">
                                                            Select <strong>Actual Value</strong> columns to fold into vertical rows.
                                                        </p>
                                                        <div className="flex flex-wrap gap-2 flex-1 min-h-[100px] max-h-44 overflow-y-auto p-3 border border-slate-200 rounded-lg bg-white shadow-inner">
                                                            {activeState.headers.map(h => {
                                                                const { companyIdColumn, relationshipIdColumn, dateColumn, baselineColumn, targetColumn } = activeState.etlConfig;
                                                                if ([companyIdColumn, relationshipIdColumn, dateColumn, baselineColumn, targetColumn].includes(h)) return null;
                                                                const isSelected = activeState.etlConfig.metricColumns.includes(h);
                                                                return (
                                                                    <button
                                                                        key={`m-${h}`}
                                                                        onClick={() => {
                                                                            const cols = isSelected
                                                                                ? activeState.etlConfig.metricColumns.filter(c => c !== h)
                                                                                : [...activeState.etlConfig.metricColumns, h];
                                                                            updateActive({ etlConfig: { ...activeState.etlConfig, metricColumns: cols } });
                                                                        }}
                                                                        className={`px-3 py-1.5 text-xs font-medium border rounded-md transition-all ${isSelected
                                                                            ? 'bg-teal-600 border-teal-700 text-white shadow-md'
                                                                            : 'bg-slate-50 border-slate-300 text-slate-600 hover:bg-slate-100'}`}
                                                                    >
                                                                        {h}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>

                                                    {/* Static Dimensions */}
                                                    <div className="flex flex-col">
                                                        <label className="text-[10px] font-bold text-slate-700 uppercase tracking-widest mb-1">
                                                            Select Static Dimensions
                                                        </label>
                                                        <p className="text-xs text-slate-500 mb-2">
                                                            Appended as static context (Region, Tier, etc.) — <strong>not</strong> unpivoted.
                                                        </p>
                                                        <div className="flex flex-wrap gap-2 flex-1 min-h-[100px] max-h-44 overflow-y-auto p-3 border border-slate-200 rounded-lg bg-white shadow-inner">
                                                            {activeState.headers.map(h => {
                                                                const { companyIdColumn, relationshipIdColumn, dateColumn, baselineColumn, targetColumn, metricColumns } = activeState.etlConfig;
                                                                if ([companyIdColumn, relationshipIdColumn, dateColumn, baselineColumn, targetColumn].includes(h) || metricColumns.includes(h)) return null;
                                                                const isSelected = activeState.etlConfig.extraColumns.includes(h);
                                                                return (
                                                                    <button
                                                                        key={`e-${h}`}
                                                                        onClick={() => {
                                                                            const cols = isSelected
                                                                                ? activeState.etlConfig.extraColumns.filter(c => c !== h)
                                                                                : [...activeState.etlConfig.extraColumns, h];
                                                                            updateActive({ etlConfig: { ...activeState.etlConfig, extraColumns: cols } });
                                                                        }}
                                                                        className={`px-3 py-1.5 text-xs font-medium border rounded-md transition-all ${isSelected
                                                                            ? 'bg-indigo-600 border-indigo-700 text-white shadow-md'
                                                                            : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'}`}
                                                                    >
                                                                        {h}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex justify-end">
                                                <button
                                                    onClick={runETL}
                                                    disabled={!activeState.etlConfig.companyIdColumn || activeState.etlConfig.metricColumns.length === 0}
                                                    className="flex items-center gap-2 bg-slate-900 hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-3 rounded-lg text-sm font-bold shadow-xl transition-all transform hover:scale-105"
                                                >
                                                    <Layers className="w-4 h-4" />
                                                    Execute Core Metrics ETL
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* ── Step 3: Output Preview ── */}
                                {step === 3 && activeState.status === 'processed' && (
                                    <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
                                        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between flex-wrap gap-3 rounded-t-xl">
                                            <div className="flex items-center">
                                                <span className="bg-teal-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mr-3 flex-shrink-0">
                                                    {activeState.mode === 'etl' ? 3 : 2}
                                                </span>
                                                <h3 className="font-bold text-slate-800 text-sm">
                                                    {activeState.mode === 'etl' ? 'Production Pipeline Output' : 'Cleaned Output — Same Structure, Gainsight Formatted'}
                                                </h3>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-bold px-3 py-1.5 bg-green-100 text-green-800 border border-green-300 rounded-md flex items-center">
                                                    <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                                                    Gainsight Ready
                                                </span>
                                                <button
                                                    onClick={() => downloadSingle(activeSheet)}
                                                    className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-5 py-2 rounded-lg text-sm font-bold shadow-lg transition-all"
                                                >
                                                    <Download className="w-4 h-4" />
                                                    Export CSV
                                                </button>
                                            </div>
                                        </div>
                                        <div className="p-5">
                                            {(() => {
                                                const rows = activeState.mode === 'etl'
                                                    ? (activeState.etlResult ?? []).slice(0, 15)
                                                    : (activeState.cleanedResult?.data ?? []).slice(0, 15);
                                                const totalRows = activeState.mode === 'etl'
                                                    ? (activeState.etlResult ?? []).length
                                                    : (activeState.cleanedResult?.cleanedRowCount ?? 0);
                                                const cols = rows.length > 0 ? Object.keys(rows[0]) : [];

                                                return (
                                                    <>
                                                        <p className="text-xs text-slate-500 mb-3">
                                                            {totalRows.toLocaleString()} structured rows · showing first 15
                                                        </p>
                                                        <div className="border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                                                            <div className="bg-slate-800 text-white px-4 py-2 text-xs font-bold flex items-center tracking-wider">
                                                                <TableProperties className="w-3.5 h-3.5 mr-2 text-teal-400" />
                                                                Preview
                                                            </div>
                                                            <div className="overflow-x-auto">
                                                                <table className="w-full text-left text-xs whitespace-nowrap">
                                                                    <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                                                                        <tr>
                                                                            {cols.map(h => (
                                                                                <th key={h} className="px-3 py-2.5 font-bold uppercase tracking-wide">{h}</th>
                                                                            ))}
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody className="divide-y divide-slate-100">
                                                                        {rows.map((row: any, i: number) => (
                                                                            <tr key={i} className="hover:bg-slate-50">
                                                                                {cols.map(h => (
                                                                                    <td key={h} className="px-3 py-2 truncate max-w-[160px] text-slate-600">{row[h]}</td>
                                                                                ))}
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        </div>
                                                    </>
                                                );
                                            })()}
                                            <div className="mt-5 flex justify-between items-center">
                                                <button
                                                    onClick={() => { setStep(1); updateActive({ cleanedResult: null, etlResult: null, status: 'idle' }); }}
                                                    className="text-xs text-slate-500 hover:text-teal-700 font-medium transition-all"
                                                >
                                                    ← Re-process this sheet
                                                </button>
                                                <span className="text-xs text-slate-400 flex items-center gap-1">
                                                    <ArrowRight className="w-3.5 h-3.5" />
                                                    Upload to Gainsight S3 → Data Management → Company Metrics
                                                </span>
                                            </div>

                                            {/* ── Per-sheet S3 Upload ── */}
                                            {activeState.status === 'processed' && sheetToCSV(activeState).length > 0 && (
                                                <S3Connector
                                                    sheets={[{
                                                        sheetName: activeState.name,
                                                        csvContent: sheetToCSV(activeState),
                                                        fileName: sheetFilenameWithDate(activeState),
                                                    }]}
                                                    defaultFolderName={defaultS3Folder}
                                                />
                                            )}

                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* ════════════════════════════════════════════════════════════════
                FULL-WIDTH S3 CONNECTOR — below the main workspace
            ════════════════════════════════════════════════════════════════ */}
            {s3Sheets.length > 0 && (
                <S3Connector
                    sheets={s3Sheets}
                    defaultFolderName={defaultS3Folder}
                />
            )}
        </div>
    );
}
