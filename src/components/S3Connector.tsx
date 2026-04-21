/**
 * S3Connector Component — Full-Width Layout with Searchable Folder Dropdown
 * 
 * Includes: select-all checkbox, per-file checkboxes, bulk upload,
 * and a CUSTOM searchable folder dropdown with scrolling and search.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
    Cloud, FolderPlus, FolderOpen, Upload, CheckCircle, XCircle,
    Loader2, ChevronDown, RefreshCw, Wifi, WifiOff,
    CloudUpload, FolderCheck, FileText, ArrowRight, Search, Check
} from 'lucide-react';
import {
    checkConnection,
    listFolders,
    createFolder,
    uploadCSV,
} from '../lib/s3-client';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface SheetUpload {
    sheetName: string;
    csvContent: string;
    fileName: string;
}

interface S3ConnectorProps {
    sheets: SheetUpload[];
    defaultFolderName: string;
}

type UploadStatus = 'idle' | 'uploading' | 'success' | 'error';

interface SheetUploadState {
    status: UploadStatus;
    error?: string;
    s3Key?: string;
}

function sanitizeForDisplay(name: string): string {
    return name.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-]/g, '');
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function S3Connector({ sheets, defaultFolderName }: S3ConnectorProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isConnected, setIsConnected] = useState<boolean | null>(null);

    // Folder state
    const [folderName, setFolderName] = useState(sanitizeForDisplay(defaultFolderName));
    const [existingFolders, setExistingFolders] = useState<string[]>([]);
    const [isLoadingFolders, setIsLoadingFolders] = useState(false);
    const [folderMode, setFolderMode] = useState<'create' | 'existing'>('create');
    const [selectedExistingFolder, setSelectedExistingFolder] = useState('');
    const [folderCreated, setFolderCreated] = useState(false);
    const [folderError, setFolderError] = useState('');
    const [isCreatingFolder, setIsCreatingFolder] = useState(false);

    // Custom Searchable Dropdown State
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Track folders we've created locally (S3 may not list empty ones)
    const [locallyCreatedFolders, setLocallyCreatedFolders] = useState<string[]>([]);

    // Selection state (checkboxes)
    const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set(sheets.map(s => s.sheetName)));

    // Upload state
    const [uploadStates, setUploadStates] = useState<Record<string, SheetUploadState>>({});
    const [isBulkUploading, setIsBulkUploading] = useState(false);

    const activeFolder = folderMode === 'existing' ? selectedExistingFolder : folderName;
    const isFolderReady = folderMode === 'existing' ? !!selectedExistingFolder : folderCreated;

    // Selection helpers
    const allSelected = sheets.length > 0 && sheets.every(s => selectedFiles.has(s.sheetName));
    const someSelected = sheets.some(s => selectedFiles.has(s.sheetName));
    const selectedCount = [...selectedFiles].filter(n => sheets.some(s => s.sheetName === n)).length;

    const toggleFile = (name: string) => {
        setSelectedFiles(prev => {
            const next = new Set(prev);
            if (next.has(name)) next.delete(name); else next.add(name);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (allSelected) {
            setSelectedFiles(new Set());
        } else {
            setSelectedFiles(new Set(sheets.map(s => s.sheetName)));
        }
    };

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // ── Connection ────────────────────────────────────────────────────────────

    const checkBackend = useCallback(async () => {
        const ok = await checkConnection();
        setIsConnected(ok);
        return ok;
    }, []);

    useEffect(() => {
        if (isExpanded && isConnected === null) checkBackend();
    }, [isExpanded, isConnected, checkBackend]);

    // ── Load folders ──────────────────────────────────────────────────────────

    const loadFolders = useCallback(async () => {
        setIsLoadingFolders(true);
        try {
            const result = await listFolders();
            if (result.success) {
                // Merge server list with locally created folders
                const merged = [...new Set([...result.folders, ...locallyCreatedFolders])]
                    .sort((a, b) => a.localeCompare(b));
                setExistingFolders(merged);
            }
        } catch { /* user can retry */ } finally {
            setIsLoadingFolders(false);
        }
    }, [locallyCreatedFolders]);

    useEffect(() => {
        if (isExpanded && isConnected) loadFolders();
    }, [isExpanded, isConnected, loadFolders]);

    // ── Create folder ─────────────────────────────────────────────────────────

    const handleCreateFolder = async () => {
        if (!folderName.trim()) return;
        setIsCreatingFolder(true);
        setFolderError('');
        setFolderCreated(false);
        try {
            const result = await createFolder(folderName);
            if (result.success) {
                setFolderCreated(true);
                // Immediately add to local list
                const sanitized = sanitizeForDisplay(folderName);
                setLocallyCreatedFolders(prev => prev.includes(sanitized) ? prev : [...prev, sanitized]);
                setExistingFolders(prev => {
                    if (prev.includes(sanitized)) return prev;
                    return [...prev, sanitized].sort((a, b) => a.localeCompare(b));
                });
                // Also refresh from server
                loadFolders().then(/* best effort */);
            } else {
                setFolderError(result.error || 'Unknown error');
            }
        } catch (err: any) {
            setFolderError(err.message || 'Failed to connect');
        } finally {
            setIsCreatingFolder(false);
        }
    };

    // ── Upload ────────────────────────────────────────────────────────────────

    const uploadSheet = async (sheet: SheetUpload) => {
        setUploadStates(prev => ({ ...prev, [sheet.sheetName]: { status: 'uploading' } }));
        try {
            const result = await uploadCSV(sheet.csvContent, activeFolder, sheet.fileName);
            if (result.success) {
                setUploadStates(prev => ({ ...prev, [sheet.sheetName]: { status: 'success', s3Key: result.key } }));
            } else {
                setUploadStates(prev => ({ ...prev, [sheet.sheetName]: { status: 'error', error: result.error } }));
            }
        } catch (err: any) {
            setUploadStates(prev => ({ ...prev, [sheet.sheetName]: { status: 'error', error: err.message } }));
        }
    };

    const uploadSelected = async () => {
        setIsBulkUploading(true);
        for (const sheet of sheets) {
            if (!selectedFiles.has(sheet.sheetName)) continue;
            if (uploadStates[sheet.sheetName]?.status === 'success') continue;
            await uploadSheet(sheet);
        }
        setIsBulkUploading(false);
    };

    const allUploaded = sheets.length > 0 && sheets.every(s => uploadStates[s.sheetName]?.status === 'success');
    const uploadedCount = sheets.filter(s => uploadStates[s.sheetName]?.status === 'success').length;
    const selectedReadyCount = [...selectedFiles].filter(n => {
        const state = uploadStates[n];
        return !state || state.status === 'idle' || state.status === 'error';
    }).length;

    // Filtered folders for searchable dropdown
    const filteredFolders = existingFolders.filter(f => 
        f.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // ─────────────────────────────────────────────────────────────────────────
    // Render
    // ─────────────────────────────────────────────────────────────────────────

    return (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm">

            {/* ══ Header Bar ══ */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className={`w-full flex items-center justify-between px-6 py-4 bg-gradient-to-r from-sky-50 via-indigo-50 to-violet-50 hover:from-sky-100 hover:via-indigo-100 hover:to-violet-100 transition-all text-left rounded-t-2xl ${!isExpanded ? 'rounded-b-2xl' : ''}`}
            >
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-gradient-to-br from-sky-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-sky-200">
                        <Cloud className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h3 className="text-base font-bold text-slate-800">Upload to AWS S3</h3>
                        <p className="text-xs text-slate-500 mt-0.5">Push {sheets.length} processed CSV{sheets.length !== 1 ? 's' : ''} directly to your S3 bucket</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {isConnected !== null && (
                        <span className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full ${
                            isConnected ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                            {isConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                            {isConnected ? 'Connected' : 'Offline'}
                        </span>
                    )}
                    {allUploaded && (
                        <span className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full bg-green-100 text-green-700">
                            <CheckCircle className="w-3 h-3" /> All uploaded
                        </span>
                    )}
                    {!allUploaded && uploadedCount > 0 && (
                        <span className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full bg-amber-100 text-amber-700">
                            {uploadedCount}/{sheets.length} uploaded
                        </span>
                    )}
                    <div className={`w-7 h-7 rounded-full bg-white border border-slate-200 flex items-center justify-center transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                    </div>
                </div>
            </button>

            {/* ══ Expanded Panel ══ */}
            {isExpanded && (
                <div className="border-t border-slate-100 animate-in slide-in-from-top-2 duration-300">

                    {/* Offline State */}
                    {isConnected === false && (
                        <div className="p-6">
                            <div className="flex items-center gap-4 p-5 bg-red-50 border border-red-200 rounded-xl">
                                <WifiOff className="w-6 h-6 text-red-400 flex-shrink-0" />
                                <div className="flex-1">
                                    <p className="text-sm font-bold text-red-800">Backend server not reachable</p>
                                    <p className="text-xs text-red-600 mt-1">
                                        Run <code className="bg-red-100 px-2 py-0.5 rounded font-mono text-[11px]">npm run dev:full</code> to start both the frontend and API server.
                                    </p>
                                </div>
                                <button onClick={checkBackend} className="flex items-center gap-1.5 text-sm text-red-600 hover:text-red-800 font-medium px-4 py-2 border border-red-300 rounded-lg hover:bg-red-100 transition-all">
                                    <RefreshCw className="w-3.5 h-3.5" /> Retry
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Connected Content */}
                    {isConnected && (
                        <div className="p-6 space-y-6 overflow-visible">
                            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">

                                {/* LEFT: Folder Configuration (2/5) */}
                                <div className="lg:col-span-2 space-y-5">
                                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                        <FolderOpen className="w-3.5 h-3.5" /> Destination Folder
                                    </h4>

                                    {/* Mode Toggle */}
                                    <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
                                        <button
                                            onClick={() => { setFolderMode('create'); setFolderCreated(false); setFolderError(''); }}
                                            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-xs font-bold transition-all ${
                                                folderMode === 'create' ? 'bg-white text-sky-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                                            }`}
                                        >
                                            <FolderPlus className="w-3.5 h-3.5" /> Create New
                                        </button>
                                        <button
                                            onClick={() => { setFolderMode('existing'); setFolderCreated(false); setFolderError(''); }}
                                            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-xs font-bold transition-all ${
                                                folderMode === 'existing' ? 'bg-white text-sky-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                                            }`}
                                        >
                                            <FolderOpen className="w-3.5 h-3.5" /> Use Existing
                                        </button>
                                    </div>

                                    {/* Create Mode */}
                                    {folderMode === 'create' && (
                                        <div className="space-y-4 animate-in fade-in duration-300">
                                            <div>
                                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Folder Name</label>
                                                <div className="flex gap-2">
                                                    <input
                                                        type="text"
                                                        value={folderName}
                                                        onChange={e => { setFolderName(e.target.value); setFolderCreated(false); setFolderError(''); }}
                                                        placeholder="e.g. SpendHound_NPS_Data"
                                                        className="flex-1 text-sm border border-slate-200 rounded-xl px-4 py-3 bg-slate-50/50 focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 focus:bg-white transition-all outline-none"
                                                    />
                                                    <button
                                                        onClick={handleCreateFolder}
                                                        disabled={isCreatingFolder || !folderName.trim() || folderCreated}
                                                        className="flex items-center gap-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl text-xs font-bold shadow-md shadow-sky-100 transition-all whitespace-nowrap"
                                                    >
                                                        {isCreatingFolder ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : folderCreated ? <FolderCheck className="w-3.5 h-3.5" /> : <FolderPlus className="w-3.5 h-3.5" />}
                                                        {folderCreated ? 'Created' : 'Create'}
                                                    </button>
                                                </div>
                                                <p className="text-[10px] text-slate-400 mt-2 font-mono flex items-center gap-1">
                                                    <ArrowRight className="w-3 h-3" /> MDA-Data-Ingest/input/<strong>{sanitizeForDisplay(folderName)}</strong>/
                                                </p>
                                            </div>
                                            {folderCreated && (
                                                <div className="flex items-center gap-3 p-3.5 bg-green-50 border border-green-100 rounded-xl text-xs text-green-700 animate-in zoom-in-95 duration-300">
                                                    <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                                                        <CheckCircle className="w-4 h-4 text-green-600" />
                                                    </div>
                                                    <p>Folder <strong>{sanitizeForDisplay(folderName)}</strong> is ready.</p>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Existing Mode (Custom Searchable Dropdown) */}
                                    {folderMode === 'existing' && (
                                        <div className="space-y-4 animate-in fade-in duration-300" ref={dropdownRef}>
                                            <div className="relative">
                                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Select Destination</label>
                                                
                                                {/* Combobox Trigger */}
                                                <div className="relative">
                                                    <button
                                                        type="button"
                                                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                                        className={`w-full flex items-center justify-between text-sm border ${
                                                            isDropdownOpen ? 'border-sky-500 ring-4 ring-sky-500/10' : 'border-slate-200'
                                                        } rounded-xl px-4 py-3 bg-slate-50/50 hover:bg-white transition-all text-left overflow-hidden`}
                                                    >
                                                        <span className={selectedExistingFolder ? 'text-slate-700 font-medium' : 'text-slate-400'}>
                                                            {selectedExistingFolder || '-- Select a folder --'}
                                                        </span>
                                                        <div className="flex items-center gap-2">
                                                            {isLoadingFolders && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
                                                            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
                                                        </div>
                                                    </button>

                                                    {/* Dropdown Menu */}
                                                    {isDropdownOpen && (
                                                        <div className="absolute z-50 mt-2 w-full bg-white border border-slate-200 rounded-xl shadow-xl shadow-slate-200/50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                                            
                                                            {/* Search Box */}
                                                            <div className="p-2 border-b border-slate-100 flex items-center gap-2 bg-slate-50/50">
                                                                <Search className="w-4 h-4 text-slate-400 ml-2" />
                                                                <input
                                                                    autoFocus
                                                                    type="text"
                                                                    placeholder="Search folders..."
                                                                    value={searchTerm}
                                                                    onChange={e => setSearchTerm(e.target.value)}
                                                                    className="w-full bg-transparent border-none text-sm py-1.5 focus:ring-0 outline-none text-slate-600 placeholder:text-slate-400"
                                                                />
                                                                <button 
                                                                    onClick={loadFolders}
                                                                    title="Refresh list"
                                                                    className="p-1.5 hover:bg-white rounded-md text-slate-400 hover:text-sky-600 transition-all"
                                                                >
                                                                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingFolders ? 'animate-spin' : ''}`} />
                                                                </button>
                                                            </div>

                                                            {/* Scrollable List */}
                                                            <div className="max-h-[160px] overflow-y-auto py-1 custom-scrollbar">
                                                                {filteredFolders.length > 0 ? (
                                                                    filteredFolders.map(folder => (
                                                                        <button
                                                                            key={folder}
                                                                            onClick={() => {
                                                                                setSelectedExistingFolder(folder);
                                                                                setIsDropdownOpen(false);
                                                                                setSearchTerm('');
                                                                            }}
                                                                            className={`w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-sky-50 transition-colors ${
                                                                                selectedExistingFolder === folder ? 'text-sky-700 font-bold bg-sky-50/50' : 'text-slate-600'
                                                                            }`}
                                                                        >
                                                                            <span className="truncate">{folder}</span>
                                                                            {selectedExistingFolder === folder && <Check className="w-4 h-4 text-sky-600" />}
                                                                        </button>
                                                                    ))
                                                                ) : (
                                                                    <div className="px-4 py-8 text-center text-slate-400">
                                                                        <FolderOpen className="w-8 h-8 mx-auto mb-2 opacity-20" />
                                                                        <p className="text-xs">No folders found</p>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                                {selectedExistingFolder && (
                                                    <p className="text-[10px] text-slate-400 mt-2 font-mono flex items-center gap-1">
                                                        <ArrowRight className="w-3 h-3" /> MDA-Data-Ingest/input/<strong>{selectedExistingFolder}</strong>/
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {!isFolderReady && (
                                        <div className="flex items-center gap-3 p-4 bg-slate-50 border border-slate-100 rounded-xl text-slate-500 animate-pulse">
                                            <ArrowRight className="w-4 h-4 text-slate-300" />
                                            <p className="text-xs">
                                                {folderMode === 'create' ? 'Create a folder to start uploading.' : 'Select a destination folder first.'}
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {/* RIGHT: File List with Checkboxes (3/5) */}
                                <div className="lg:col-span-3 space-y-5">

                                    {/* Action Bar */}
                                    <div className="flex items-center justify-between gap-4 flex-wrap">
                                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                            <FileText className="w-3.5 h-3.5" />
                                            Processed Files ({sheets.length})
                                        </h4>
                                        {isFolderReady && selectedCount > 0 && (
                                            <button
                                                onClick={uploadSelected}
                                                disabled={isBulkUploading || allUploaded || selectedReadyCount === 0}
                                                className="flex items-center gap-2.5 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-7 py-3 rounded-xl text-xs font-bold shadow-lg shadow-sky-100 transition-all transform hover:-translate-y-0.5 active:translate-y-0"
                                            >
                                                {isBulkUploading ? (
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                ) : allUploaded ? (
                                                    <CheckCircle className="w-4 h-4" />
                                                ) : (
                                                    <CloudUpload className="w-4 h-4" />
                                                )}
                                                {allUploaded ? 'All Uploaded!' : isBulkUploading ? 'Uploading...' : `Upload Selected (${selectedReadyCount})`}
                                            </button>
                                        )}
                                    </div>

                                    {/* Scrollable File Table */}
                                    <div className={`border rounded-2xl overflow-hidden transition-all ${isFolderReady ? 'border-slate-200' : 'border-slate-100 opacity-50 shadow-none'}`}>
                                        {/* Table header */}
                                        <div className="grid grid-cols-12 gap-4 px-5 py-3.5 bg-slate-50/80 backdrop-blur-sm text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-200 items-center">
                                            <div className="col-span-1 flex items-center pl-1">
                                                <input
                                                    type="checkbox"
                                                    checked={allSelected}
                                                    ref={el => { if (el) el.indeterminate = !allSelected && someSelected; }}
                                                    onChange={toggleSelectAll}
                                                    className="w-4 h-4 rounded-md text-sky-600 focus:ring-sky-500 border-slate-300 cursor-pointer accent-sky-600"
                                                />
                                            </div>
                                            <span className="col-span-4">File Name</span>
                                            <span className="col-span-2 text-center">Size</span>
                                            <span className="col-span-3">Destination</span>
                                            <span className="col-span-2 text-right">Status</span>
                                        </div>

                                        {/* Row container with fixed height and scroll */}
                                        <div className="max-h-[600px] overflow-y-auto divide-y divide-slate-100 content-start custom-scrollbar">
                                            {sheets.map(sheet => {
                                                const state = uploadStates[sheet.sheetName] || { status: 'idle' as UploadStatus };
                                                const sizeKB = (new Blob([sheet.csvContent]).size / 1024).toFixed(1);
                                                const isChecked = selectedFiles.has(sheet.sheetName);
                                                const isDone = state.status === 'success';

                                                return (
                                                    <div
                                                        key={sheet.sheetName}
                                                        className={`grid grid-cols-12 gap-4 items-center px-5 py-4 transition-all duration-200 ${
                                                            isDone ? 'bg-green-50/30' : isChecked ? 'bg-sky-50/20' : 'hover:bg-slate-50/80'
                                                        }`}
                                                    >
                                                        {/* Checkbox */}
                                                        <div className="col-span-1 pl-1">
                                                            <input
                                                                type="checkbox"
                                                                checked={isChecked}
                                                                onChange={() => toggleFile(sheet.sheetName)}
                                                                disabled={isDone}
                                                                className="w-4 h-4 rounded-md text-sky-600 focus:ring-sky-500 border-slate-300 cursor-pointer disabled:opacity-30 accent-sky-600"
                                                            />
                                                        </div>
                                                        {/* Name */}
                                                        <div className="col-span-4 min-w-0">
                                                            <p className={`text-sm font-semibold truncate ${isChecked ? 'text-slate-800' : 'text-slate-600'}`}>{sheet.fileName}</p>
                                                            <p className="text-[10px] text-slate-400 mt-1 truncate font-medium uppercase tracking-tighter opacity-70">{sheet.sheetName}</p>
                                                        </div>
                                                        {/* Size */}
                                                        <div className="col-span-2 text-center">
                                                            <span className="text-xs text-slate-500 font-mono bg-slate-100 px-2 py-1 rounded-md">{sizeKB} KB</span>
                                                        </div>
                                                        {/* Dest */}
                                                        <div className="col-span-3 min-w-0">
                                                            <p className="text-[10px] text-slate-400 font-mono truncate bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
                                                                {activeFolder || '—'}/
                                                            </p>
                                                        </div>
                                                        {/* Status */}
                                                        <div className="col-span-2 flex justify-end">
                                                            {state.status === 'idle' && isFolderReady && (
                                                                <button
                                                                    onClick={() => uploadSheet(sheet)}
                                                                    className="flex items-center gap-2 text-xs text-sky-600 hover:text-sky-800 font-bold px-3 py-1.5 bg-sky-50 hover:bg-sky-100 rounded-lg transition-all"
                                                                >
                                                                    <Upload className="w-3 h-3" /> Push
                                                                </button>
                                                            )}
                                                            {state.status === 'idle' && !isFolderReady && (
                                                                <span className="text-[10px] text-slate-300 font-bold uppercase tracking-widest">Wait</span>
                                                            )}
                                                            {state.status === 'uploading' && (
                                                                <span className="flex items-center gap-2 text-xs text-amber-600 font-bold">
                                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> ...
                                                                </span>
                                                            )}
                                                            {state.status === 'success' && (
                                                                <span className="flex items-center gap-2 text-xs text-green-700 font-black">
                                                                    <CheckCircle className="w-4 h-4 shadow-sm rounded-full" /> DONE
                                                                </span>
                                                            )}
                                                            {state.status === 'error' && (
                                                                <button 
                                                                    onClick={() => uploadSheet(sheet)}
                                                                    className="flex items-center gap-1.5 text-xs text-red-600 font-bold hover:underline"
                                                                >
                                                                    <XCircle className="w-3.5 h-3.5" /> Retry
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Success Banner */}
                                    {allUploaded && (
                                        <div className="flex items-center gap-4 p-5 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-100 rounded-2xl animate-in zoom-in-95 duration-500">
                                            <div className="w-12 h-12 bg-green-100 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-sm shadow-green-200/50">
                                                <CheckCircle className="w-6 h-6 text-green-600" />
                                            </div>
                                            <div className="flex-1">
                                                <p className="text-sm font-extrabold text-green-800">Pipeline Complete</p>
                                                <p className="text-xs text-green-600 mt-1">
                                                    All {sheets.length} datasets merged into <strong>{activeFolder}</strong>
                                                </p>
                                            </div>
                                            <div className="hidden sm:block">
                                                <span className="text-[10px] font-black text-green-300 uppercase tracking-widest border border-green-200 px-3 py-1 rounded-full">S3 Verified</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Custom Scrollbar Styles */}
            <style dangerouslySetInnerHTML={{ __html: `
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
            ` }} />
        </div>
    );
}
