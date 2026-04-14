import { useState } from 'react';
import Papa from 'papaparse';
import { DropZone } from './DropZone';
import { cleanData } from '../lib/data-cleaner';
import { transformToCompanyMetrics } from '../lib/etl-transformer';
import { downloadCSV, formatToRFC4180 } from '../lib/rfc4180-formatter';
import type { DataCleaningConfig, ETLTransformationConfig, CleanedDataResult, CompanyMetric } from '../types';
import { Database, Filter, Layers, Download, CheckCircle, TableProperties, ArrowRight, Settings, FileSpreadsheet } from 'lucide-react';

export function DataCleanerETL() {
    const [file, setFile] = useState<File | null>(null);
    const [parsedData, setParsedData] = useState<any[]>([]);
    const [headers, setHeaders] = useState<string[]>([]);
    const [isParsing, setIsParsing] = useState(false);

    // Excel Specific State
    const [workbookParams, setWorkbookParams] = useState<any | null>(null);
    const [sheetNames, setSheetNames] = useState<string[]>([]);
    const [selectedSheet, setSelectedSheet] = useState<string>('');

    // Flow State
    const [step, setStep] = useState<1 | 2 | 3>(1);

    // Cleaning State
    const [cleanConfig, setCleanConfig] = useState<DataCleaningConfig>({
        removeBlankColumns: true,
        fixDateFormatting: true,
        removeDuplicates: true,
        applyGainsightRules: true,
        primaryKeyColumn: ''
    });
    const [cleanedResult, setCleanedResult] = useState<CleanedDataResult | null>(null);

    // ETL State (Full Captain Hindsight 11-field schema mappings)
    const [etlConfig, setEtlConfig] = useState<ETLTransformationConfig>({
        companyIdColumn: '',
        relationshipIdColumn: '',
        dataSource: 'CSV/Excel Upload',
        metricColumns: [],
        dateColumn: '',
        targetColumn: '',
        timeGranularity: 'Monthly',
        extraColumns: []
    });
    const [metricsResult, setMetricsResult] = useState<CompanyMetric[] | null>(null);

    const handleFileSelect = async (selectedFile: File) => {
        setFile(selectedFile);
        setIsParsing(true);
        setStep(1);
        setCleanedResult(null);
        setMetricsResult(null);
        setWorkbookParams(null);
        setSheetNames([]);

        if (selectedFile.name.endsWith('.xlsx') || selectedFile.name.endsWith('.xls')) {
            try {
                // Dynamically import xlsx so it doesn't break if user hasn't installed it yet
                const XLSX = await import('xlsx');
                const buffer = await selectedFile.arrayBuffer();
                const workbook = XLSX.read(buffer, { type: 'array' });
                
                setWorkbookParams(workbook);
                setSheetNames(workbook.SheetNames);
                
                // Load the first sheet automatically
                const firstSheet = workbook.SheetNames[0];
                setSelectedSheet(firstSheet);
                loadExcelSheet(workbook, firstSheet, XLSX);
            } catch (err) {
                console.error("Failed to parse Excel file. Is xlsx installed?", err);
                setIsParsing(false);
            }
        } else {
            // CSV / TSV handling via PapaParse
            Papa.parse(selectedFile, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    setParsedData(results.data);
                    if (results.meta.fields) {
                        setHeaders(results.meta.fields);
                        if (results.meta.fields.length > 0) {
                            setEtlConfig(prev => ({ ...prev, companyIdColumn: results.meta.fields![0] }));
                        }
                    }
                    setIsParsing(false);
                },
                error: (err) => {
                    console.error(err);
                    setIsParsing(false);
                }
            });
        }
    };

    const loadExcelSheet = (workbook: any, sheetName: string, XLSXLib: any) => {
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSXLib.utils.sheet_to_json(worksheet, { defval: "" }); // defval maps empty cells to empty strings
        setParsedData(data);
        
        if (data.length > 0) {
            const fields = Object.keys(data[0]);
            setHeaders(fields);
            setEtlConfig(prev => ({ ...prev, companyIdColumn: fields[0] }));
        } else {
            setHeaders([]);
        }
        setIsParsing(false);
    };

    const handleSheetChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newSheet = e.target.value;
        setSelectedSheet(newSheet);
        setIsParsing(true);
        setCleanedResult(null);
        setMetricsResult(null);
        const XLSX = await import('xlsx');
        loadExcelSheet(workbookParams, newSheet, XLSX);
    };

    const runCleaning = () => {
        const result = cleanData(parsedData, cleanConfig);
        setCleanedResult(result);
        
        // Update headers for ETL config based on cleaned data
        if (result.data.length > 0) {
            setHeaders(Object.keys(result.data[0]));
        }
        setStep(2);
    };

    const runETL = () => {
        if (!cleanedResult) return;
        const result = transformToCompanyMetrics(cleanedResult.data, etlConfig);
        setMetricsResult(result);
        setStep(3);
    };

    const handleDownload = () => {
        if (!metricsResult) return;
        const formatted = formatToRFC4180(metricsResult);
        downloadCSV(formatted, `company_metrics_${selectedSheet || 'export'}.csv`);
    };

    const toggleMetricColumn = (col: string) => {
        setEtlConfig(prev => {
            const isSelected = prev.metricColumns.includes(col);
            if (isSelected) {
                return { ...prev, metricColumns: prev.metricColumns.filter(c => c !== col) };
            } else {
                return { ...prev, metricColumns: [...prev.metricColumns, col] };
            }
        });
    };

    const toggleExtraColumn = (col: string) => {
        setEtlConfig(prev => {
            const isSelected = prev.extraColumns.includes(col);
            if (isSelected) {
                return { ...prev, extraColumns: prev.extraColumns.filter(c => c !== col) };
            } else {
                return { ...prev, extraColumns: [...prev.extraColumns, col] };
            }
        });
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <div className="bg-gradient-to-r from-emerald-50 to-teal-50 p-6 rounded-xl border border-teal-100">
                <h2 className="text-xl font-bold text-slate-800 flex items-center mb-2">
                    <Database className="w-6 h-6 mr-2 text-teal-600" />
                    Data Cleaning & ETL Engine <span className="ml-3 text-xs bg-teal-600 text-white px-2 py-1 rounded">Captain Hindsight Phase 1</span>
                </h2>
                <p className="text-slate-600">
                    Upload multi-sheet Excel files or CSVs, auto-clean messy rows, and run an Unpivot/Melt transform to construct the 11-field GainSight standard `Company Metrics` pipeline.
                </p>
            </div>

            {/* Step 1: Upload */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                    <h3 className="font-bold text-slate-800 flex items-center">
                        <span className="bg-teal-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-sm mr-3">1</span>
                        Upload & Clean
                    </h3>
                </div>
                <div className="p-8">
                    {parsedData.length === 0 ? (
                        <DropZone
                            onFileSelected={handleFileSelect}
                            selectedFile={file}
                            disabled={isParsing}
                            title="Drop Excel / CSV Files"
                            subtitle="Supports nested multi-sheet .xlsx, .csv, and .tsv formats"
                        />
                    ) : null}
                    
                    {parsedData.length > 0 && !isParsing && (
                        <div className="flex flex-col space-y-6">
                            
                            {/* Sheet Selector (Only if Excel with multiple sheets) */}
                            {sheetNames.length > 1 && (
                                <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-lg flex items-center justify-between">
                                    <div className="flex items-center text-indigo-900">
                                        <FileSpreadsheet className="w-5 h-5 mr-3" />
                                        <div>
                                            <p className="font-bold text-sm">Multi-Sheet Excel Detected</p>
                                            <p className="text-xs text-indigo-700">Select which tab to process</p>
                                        </div>
                                    </div>
                                    <select 
                                        className="border-indigo-300 rounded-md text-sm text-indigo-900 bg-white min-w-[200px] shadow-sm"
                                        value={selectedSheet}
                                        onChange={handleSheetChange}
                                    >
                                        {sheetNames.map(sheet => <option key={sheet} value={sheet}>{sheet}</option>)}
                                    </select>
                                </div>
                            )}

                            {/* Clean config */}
                            <div className="flex flex-col md:flex-row md:justify-between items-start md:items-end p-5 border border-slate-200 rounded-lg bg-slate-50 gap-4">
                                <div>
                                    <h4 className="text-base font-bold text-slate-800">{file?.name}</h4>
                                    {sheetNames.length > 0 && <p className="text-sm font-medium text-indigo-600 mt-1">Sheet: {selectedSheet}</p>}
                                    <p className="text-xs text-slate-500 mt-2">{parsedData.length.toLocaleString()} rows • {headers.length} columns</p>
                                </div>
                                {step === 1 && (
                                    <div className="w-full md:w-auto">
                                        <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm text-slate-700 mb-4 bg-white p-4 rounded border border-slate-200">
                                            <label className="flex items-center space-x-2">
                                                <input type="checkbox" checked={cleanConfig.removeBlankColumns} onChange={(e) => setCleanConfig({...cleanConfig, removeBlankColumns: e.target.checked})} className="rounded text-teal-600 focus:ring-teal-500" />
                                                <span>Drop unnamed/blank columns</span>
                                            </label>
                                            <label className="flex items-center space-x-2">
                                                <input type="checkbox" checked={cleanConfig.fixDateFormatting} onChange={(e) => setCleanConfig({...cleanConfig, fixDateFormatting: e.target.checked})} className="rounded text-teal-600 focus:ring-teal-500" />
                                                <span>Standardize Dates to YYYY-MM-DD</span>
                                            </label>
                                            <label className="flex items-center space-x-2">
                                                <input type="checkbox" checked={cleanConfig.removeDuplicates} onChange={(e) => setCleanConfig({...cleanConfig, removeDuplicates: e.target.checked})} className="rounded text-teal-600 focus:ring-teal-500" />
                                                <span>De-duplicate Array</span>
                                            </label>
                                            <label className="flex items-center space-x-2 col-span-2 pt-2 border-t border-slate-100 mt-1">
                                                <input type="checkbox" checked={cleanConfig.applyGainsightRules} onChange={(e) => setCleanConfig({...cleanConfig, applyGainsightRules: e.target.checked})} className="rounded text-indigo-600 focus:ring-indigo-500" />
                                                <span className="font-bold text-indigo-800 flex items-center">Apply Gainsight Deep-Clean Rules (17 Fixes)</span>
                                            </label>
                                        </div>
                                        <div className="flex justify-end gap-3">
                                            <button onClick={() => { setParsedData([]); setFile(null); }} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700">
                                                Restart
                                            </button>
                                            <button onClick={runCleaning} className="flex items-center space-x-2 bg-teal-600 hover:bg-teal-700 text-white px-6 py-2 rounded-lg font-bold shadow-sm">
                                                <Filter className="w-4 h-4" />
                                                <span>Execute Cleaning</span>
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Step 2: Cleanup Report & ETL Config */}
            {cleanedResult && step >= 2 && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden animate-in slide-in-from-top-4 duration-500">
                    <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                        <h3 className="font-bold text-slate-800 flex items-center">
                            <span className="bg-teal-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-sm mr-3">2</span>
                            Captain Hindsight Schema Mapping
                        </h3>
                    </div>
                    <div className="p-6">
                        {/* Cleaning Summary */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                            <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-100">
                                <p className="text-xs font-semibold text-emerald-800 uppercase tracking-widest mb-1">Row Density</p>
                                <p className="text-2xl font-bold text-emerald-600 mt-1">
                                    {(cleanedResult.cleanedRowCount / cleanedResult.originalRowCount * 100).toFixed(0)}%
                                </p>
                                <p className="text-xs text-emerald-600 mt-1">{cleanedResult.cleanedRowCount} of {cleanedResult.originalRowCount}</p>
                            </div>
                            <div className="p-4 rounded-lg bg-teal-50 border border-teal-100">
                                <p className="text-xs font-semibold text-teal-800 uppercase tracking-widest mb-1">Fields Dropped</p>
                                <p className="text-2xl font-bold text-teal-600 mt-1">{cleanedResult.removedColumns.length}</p>
                                <p className="text-xs text-teal-600 mt-1 line-clamp-1" title={cleanedResult.removedColumns.join(', ')}>
                                    {cleanedResult.removedColumns.length > 0 ? "Purged useless columns" : "All strict columns kept"}
                                </p>
                            </div>
                            <div className="p-4 rounded-lg bg-blue-50 border border-blue-100">
                                <p className="text-xs font-semibold text-blue-800 uppercase tracking-widest mb-1">Transform Execution</p>
                                <ul className="text-xs text-blue-700 space-y-1 mt-2">
                                    {cleanedResult.logs.length === 0 && <li>No format deviations found.</li>}
                                    {cleanedResult.logs.slice(0, 3).map((log, i) => <li key={i} className="line-clamp-1 truncate" title={log}>• {log}</li>)}
                                </ul>
                            </div>
                        </div>

                        {/* ETL Configuration Input */}
                        {step === 2 && (
                            <div className="space-y-6">
                                <div className="p-6 bg-slate-50 border border-slate-200 rounded-lg">
                                    <h4 className="text-sm font-bold text-slate-800 mb-6 flex items-center">
                                        <Settings className="w-5 h-5 mr-2 text-slate-600" />
                                        Map Data to the 11-Field Analytics Model
                                    </h4>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                        
                                        {/* Row 1 */}
                                        <div className="space-y-2 md:col-span-2">
                                            <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Company ID Column *</label>
                                            <select 
                                                value={etlConfig.companyIdColumn} 
                                                onChange={(e) => setEtlConfig({...etlConfig, companyIdColumn: e.target.value})}
                                                className="w-full text-sm border-slate-300 rounded focus:ring-teal-500 focus:border-teal-500 p-2.5 border bg-white"
                                            >
                                                <option value="">-- Map to Identifier --</option>
                                                {headers.map(h => <option key={`id-${h}`} value={h}>{h}</option>)}
                                            </select>
                                        </div>
                                        
                                        <div className="space-y-2 md:col-span-2">
                                            <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Relationship ID (Optional)</label>
                                            <select 
                                                value={etlConfig.relationshipIdColumn || ''} 
                                                onChange={(e) => setEtlConfig({...etlConfig, relationshipIdColumn: e.target.value})}
                                                className="w-full text-sm border-slate-300 rounded focus:ring-teal-500 focus:border-teal-500 p-2.5 border bg-white"
                                            >
                                                <option value="">Leave blank if null</option>
                                                {headers.map(h => <option key={`rel-${h}`} value={h}>{h}</option>)}
                                            </select>
                                        </div>

                                        {/* Row 2 */}
                                        <div className="space-y-2 md:col-span-1">
                                            <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Metric Date</label>
                                            <select 
                                                value={etlConfig.dateColumn} 
                                                onChange={(e) => setEtlConfig({...etlConfig, dateColumn: e.target.value})}
                                                className="w-full text-sm border-slate-300 rounded focus:ring-teal-500 focus:border-teal-500 p-2.5 border bg-white"
                                            >
                                                <option value="">Use Run Date (Today)</option>
                                                {headers.map(h => <option key={`dt-${h}`} value={h}>{h}</option>)}
                                            </select>
                                        </div>

                                        <div className="space-y-2 md:col-span-1">
                                            <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Granularity</label>
                                            <select 
                                                value={etlConfig.timeGranularity} 
                                                onChange={(e) => setEtlConfig({...etlConfig, timeGranularity: e.target.value as any})}
                                                className="w-full text-sm border-slate-300 rounded focus:ring-teal-500 focus:border-teal-500 p-2.5 border bg-white"
                                            >
                                                {['Daily', 'Weekly', 'Monthly', 'Quarterly'].map(g => (
                                                    <option key={g} value={g}>{g}</option>
                                                ))}
                                            </select>
                                        </div>
                                        
                                        <div className="space-y-2 md:col-span-2">
                                            <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Data Source</label>
                                            <input 
                                                type="text" 
                                                value={etlConfig.dataSource} 
                                                onChange={(e) => setEtlConfig({...etlConfig, dataSource: e.target.value})}
                                                placeholder="e.g. Snowflake Survey DB"
                                                className="w-full text-sm border-slate-300 rounded focus:ring-teal-500 focus:border-teal-500 p-2.5 border bg-white"
                                            />
                                        </div>

                                        {/* Row 3 - Trending Fields */}
                                        <div className="space-y-2 md:col-span-2">
                                            <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Baseline Value (Prior Period) *</label>
                                            <select 
                                                value={etlConfig.baselineColumn || ''} 
                                                onChange={(e) => setEtlConfig({...etlConfig, baselineColumn: e.target.value})}
                                                className="w-full text-sm border-slate-300 rounded focus:ring-teal-500 focus:border-teal-500 p-2.5 border bg-white"
                                            >
                                                <option value="">Leave blank if null</option>
                                                {headers.map(h => <option key={`base-${h}`} value={h}>{h}</option>)}
                                            </select>
                                        </div>

                                        <div className="space-y-2 md:col-span-2">
                                            <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Target Value (Goal) *</label>
                                            <select 
                                                value={etlConfig.targetColumn || ''} 
                                                onChange={(e) => setEtlConfig({...etlConfig, targetColumn: e.target.value})}
                                                className="w-full text-sm border-slate-300 rounded focus:ring-teal-500 focus:border-teal-500 p-2.5 border bg-white"
                                            >
                                                <option value="">Leave blank if null</option>
                                                {headers.map(h => <option key={`tgt-${h}`} value={h}>{h}</option>)}
                                            </select>
                                        </div>
                                    </div>

                                    <div className="mt-8 border-t border-slate-200 pt-6">
                                        <label className="text-xs font-bold text-slate-800 uppercase tracking-wider block mb-2">
                                            Select Metrics to Melt / Unpivot
                                        </label>
                                        <p className="text-xs text-slate-500 mb-4">
                                            Select the <strong>Actual Value</strong> columns. These horizontal columns will be folded into vertical rows. Target & Baseline mapping (above) will follow the same pattern if mapped.
                                        </p>
                                        <div className="flex flex-wrap gap-2 max-h-60 overflow-y-auto p-4 border border-slate-200 rounded-lg bg-white shadow-inner">
                                            {headers.map(h => {
                                                const isExempt = [etlConfig.companyIdColumn, etlConfig.relationshipIdColumn, etlConfig.dateColumn, etlConfig.baselineColumn, etlConfig.targetColumn].includes(h);
                                                if (isExempt) return null;

                                                const isSelected = etlConfig.metricColumns.includes(h);
                                                return (
                                                    <button 
                                                        key={`m-${h}`}
                                                        onClick={() => toggleMetricColumn(h)}
                                                        className={`px-3 py-2 text-sm font-medium border rounded-md transition-all transform active:scale-95 ${
                                                            isSelected ? 'bg-teal-600 border-teal-700 text-white shadow-md shadow-teal-500/20' : 'bg-slate-50 border-slate-300 text-slate-600 hover:bg-slate-100 hover:border-slate-400'
                                                        }`}
                                                    >
                                                        {h}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div className="mt-8 border-t border-slate-200 pt-6">
                                        <label className="text-xs font-bold text-slate-800 uppercase tracking-wider block mb-2">
                                            Select Additional Static Columns (Dimensions)
                                        </label>
                                        <p className="text-xs text-slate-500 mb-4">
                                            These columns will <strong>not</strong> be unpivoted. Choosing these simply appends their static value (e.g. Location Names or Account Regions) to every newly generated metric row.
                                        </p>
                                        <div className="flex flex-wrap gap-2 max-h-60 overflow-y-auto p-4 border border-slate-200 rounded-lg bg-white shadow-inner">
                                            {headers.map(h => {
                                                const isEssential = [etlConfig.companyIdColumn, etlConfig.relationshipIdColumn, etlConfig.dateColumn, etlConfig.baselineColumn, etlConfig.targetColumn].includes(h);
                                                const isMetricSelected = etlConfig.metricColumns.includes(h);
                                                
                                                if (isEssential || isMetricSelected) return null;

                                                const isSelected = etlConfig.extraColumns.includes(h);
                                                return (
                                                    <button 
                                                        key={`extra-${h}`}
                                                        onClick={() => toggleExtraColumn(h)}
                                                        className={`px-3 py-2 text-sm font-medium border rounded-md transition-all transform active:scale-95 ${
                                                            isSelected ? 'bg-indigo-600 border-indigo-700 text-white shadow-md shadow-indigo-500/20' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50 hover:border-slate-400'
                                                        }`}
                                                    >
                                                        {h}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex justify-end pt-4">
                                    <button 
                                        onClick={runETL}
                                        disabled={!etlConfig.companyIdColumn || etlConfig.metricColumns.length === 0}
                                        className="flex items-center space-x-2 bg-slate-900 hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-3.5 rounded-lg font-bold shadow-xl transition-all transform hover:scale-105"
                                    >
                                        <Layers className="w-5 h-5" />
                                        <span>Execute Core Metrics ETL</span>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Step 3: Output */}
            {metricsResult && step === 3 && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden animate-in slide-in-from-top-4 duration-500">
                    <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                        <h3 className="font-bold text-slate-800 flex items-center">
                            <span className="bg-teal-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-sm mr-3">3</span>
                            Production Pipeline Output
                        </h3>
                        <div className="text-xs font-bold px-3 py-1.5 bg-green-100 text-green-800 border border-green-300 rounded-md flex items-center shadow-sm">
                            <CheckCircle className="w-4 h-4 mr-1.5" />
                            Gainsight Ready Format
                        </div>
                    </div>
                    
                    <div className="p-6">
                        <div className="mb-6 flex justify-between items-end">
                            <div>
                                <p className="text-sm font-bold text-slate-800">Transformation Complete</p>
                                <p className="text-xs font-medium text-slate-500 mt-1">Rendered {metricsResult.length.toLocaleString()} highly-structured rows matching 11 Fields.</p>
                            </div>
                            <button
                                onClick={handleDownload}
                                className="flex items-center space-x-2 bg-teal-600 hover:bg-teal-700 text-white px-6 py-3 rounded-lg font-bold shadow-lg shadow-teal-200 transition-all"
                            >
                                <Download className="w-5 h-5" />
                                <span>Export CSV Payload</span>
                            </button>
                        </div>

                        {/* Preview Table */}
                        <div className="border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                            <div className="bg-slate-800 text-white px-4 py-2 text-xs font-bold flex items-center tracking-wider">
                                <TableProperties className="w-4 h-4 mr-2 text-teal-400" />
                                Database Preview (First 15 Rows)
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm whitespace-nowrap">
                                    <thead className="bg-slate-50 text-slate-700 border-b border-slate-200">
                                        <tr>
                                            {Object.keys(metricsResult[0] || {}).map((header, i) => (
                                                <th key={header} className={`px-4 py-3 font-bold text-xs uppercase ${['Actual Value', 'Baseline Value', 'Target Value'].includes(header) ? 'text-right' : ''}`}>
                                                    {header}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {metricsResult.slice(0, 15).map((row, i) => (
                                            <tr key={i} className="hover:bg-slate-50 transition-colors">
                                                {Object.keys(metricsResult[0] || {}).map((header) => {
                                                    const isRightAligned = ['Actual Value', 'Baseline Value', 'Target Value'].includes(header);
                                                    return (
                                                        <td key={`${i}-${header}`} className={`px-4 py-2 truncate max-w-[200px] ${isRightAligned ? 'text-right font-mono' : ''} ${header === 'Company ID' || header === 'Actual Value' ? 'text-slate-900 font-bold' : header === 'Metric Name' ? 'font-medium text-teal-800' : 'text-slate-500'}`}>
                                                            {row[header]}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Gainsight Insert Instructions */}
                        <div className="mt-8 p-5 rounded-lg bg-indigo-50 border border-indigo-100 text-slate-700 text-sm">
                            <h4 className="font-bold flex items-center text-indigo-900 mb-2">
                                <ArrowRight className="w-4 h-4 mr-2" />
                                Injection Ready
                            </h4>
                            <p className="mb-2">This dataset perfectly conforms to the **Captain Hindsight Regression Engine** prerequisites. Route actions:</p>
                            <ol className="list-decimal list-inside space-y-2 text-indigo-800 pl-2 font-medium">
                                <li>Establish S3 connection or manual Data Management pipeline targeting `Company Metrics`.</li>
                                <li>Select direct column mapping (1:1 precision via matching exact strings).</li>
                                <li>Execute import payload. No secondary transformation needed.</li>
                            </ol>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
