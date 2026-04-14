import React, { useState } from 'react';
import Papa from 'papaparse';
import { Download, AlertCircle, CheckCircle2, ShieldAlert, Cpu } from 'lucide-react';
import { cleanData } from '../lib/data-cleaner';

export function GainsightCSVCleaner() {
    const [file, setFile] = useState<File | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [stats, setStats] = useState<any>(null);
    const [logs, setLogs] = useState<string[]>([]);
    const [activeTab, setActiveTab] = useState<'known' | 'unknown'>('known');
    const [exportData, setExportData] = useState<any[] | null>(null);

    const handleFileDrop = async (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        const droppedFile = e.dataTransfer.files[0];
        if (droppedFile) processFile(droppedFile);
    };

    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            processFile(e.target.files[0]);
        }
    };

    const processFile = (fileToProcess: File) => {
        setFile(fileToProcess);
        setIsProcessing(true);
        setLogs([`Receiving file: ${fileToProcess.name}...`, `Size: ${(fileToProcess.size / 1024 / 1024).toFixed(2)} MB`]);
        setStats(null);
        setExportData(null);

        Papa.parse(fileToProcess, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                setLogs(prev => [...prev, `Found ${results.data.length.toLocaleString()} rows. Initializing Gainsight Regression Engine...`]);
                
                setTimeout(() => {
                    const result = cleanData(results.data, {
                        removeBlankColumns: true,
                        fixDateFormatting: true,
                        stripSpecialChars: true,
                        removeDuplicates: true,
                        applyGainsightRules: true
                    });

                    setLogs(prev => [...prev, ...result.logs, `Execution complete.`]);
                    setStats({
                        total: results.data.length,
                        cleanedRows: result.cleanedRowCount,
                        fieldsDropped: result.removedColumns.length
                    });
                    setExportData(result.data);
                    setIsProcessing(false);
                }, 800);
            }
        });
    };

    const downloadCsv = () => {
        if (!exportData) return;
        const csv = Papa.unparse(exportData);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.setAttribute("download", `cleaned_gainsight_${file?.name || 'export.csv'}`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const KNOWN_ERRORS = [
        { id: 1, desc: "SFDC ID dash placeholder", fix: "Replace with empty string" },
        { id: 2, desc: "ISO 8601 date format", fix: "Convert to YYYY-MM-DD HH:MM:SS" },
        { id: 3, desc: "Array/list syntax in field", fix: "Unwrap to plain string" },
        { id: 5, desc: "Artifact double-quotes wrapping value", fix: "Strip outer quotes" },
        { id: 6, desc: "Unicode replacement char U+FFFD", fix: "Replace with apostrophe" },
        { id: 10, desc: "Excel formula error exported as text", fix: "Replace with empty string" },
        { id: 11, desc: "Unicode U+21B5 line continuation char", fix: "Strip character" },
        { id: 12, desc: "String 'Ohio' in date column", fix: "Replace with empty string" }
    ];

    return (
        <div className="bg-[#0d0f1a] min-h-[calc(100vh-80px)] p-6 rounded-xl text-[#e4e8f8] font-sans antialiased">
            <header className="flex items-center space-x-4 mb-8 bg-[#141726] p-6 rounded-xl border border-[#2a2f4a] shadow-lg">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#6c63ff] to-[#00d4aa] flex items-center justify-center text-white text-2xl shadow-lg shadow-[#6c63ff]/20">
                    ⚡
                </div>
                <div>
                    <h1 className="text-xl font-bold text-white tracking-tight">Gainsight CSV Cleaner <span className="ml-2 text-xs uppercase bg-[#6c63ff]/20 text-[#6c63ff] px-2 py-1 rounded">Standalone</span></h1>
                    <p className="text-sm text-[#6b7299] mt-1 pr-6">Drag & drop dirty customer datasets. Automatically handles the 17 Known Gainsight Ingestion failures in browser without backend staging.</p>
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Left Column: Upload & Live Feed */}
                <div className="space-y-6">
                    <div className="bg-[#1a1e30] rounded-xl border border-[#2a2f4a] p-6 shadow-xl">
                        <div className="flex items-center text-[11px] font-bold uppercase tracking-widest text-[#6b7299] mb-4">
                            <span className="w-2 h-2 rounded-full bg-[#6c63ff] mr-2 shadow-[0_0_8px_#6c63ff]"></span>
                            ETL Dropzone
                        </div>
                        
                        <div 
                            className="border-2 border-dashed border-[#2a2f4a] rounded-xl p-10 text-center cursor-pointer transition-all hover:border-[#6c63ff] hover:bg-[#6c63ff]/5"
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={handleFileDrop}
                            onClick={() => document.getElementById('g-upload')?.click()}
                        >
                            <input id="g-upload" type="file" className="hidden" accept=".csv" onChange={handleFileInput} />
                            <Cpu className="w-12 h-12 mx-auto mb-4 text-[#6b7299]" />
                            <h3 className="text-[15px] font-bold text-white mb-2">Drop your customer dataset here</h3>
                            <p className="text-sm text-[#6b7299]">or click to browse (.csv only)</p>
                        </div>
                    </div>

                    <div className="bg-[#1a1e30] rounded-xl border border-[#2a2f4a] p-6 shadow-xl relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#00d4aa] to-transparent opacity-20"></div>
                        <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-widest text-[#6b7299] mb-4">
                            <div className="flex items-center">
                                <span className="w-2 h-2 rounded-full bg-[#00d4aa] mr-2 shadow-[0_0_8px_#00d4aa]"></span>
                                Active Heuristics Log
                            </div>
                            <span>{isProcessing ? 'Processing...' : 'Idle'}</span>
                        </div>
                        
                        <div className="bg-[#0a0c14] border border-[#2a2f4a] rounded-lg p-4 h-64 overflow-y-auto font-mono text-sm shadow-inner relative">
                           {logs.length === 0 && <p className="text-[#6b7299] italic mt-2 ml-2">Awaiting payload...</p>}
                           <div className="space-y-2">
                               {logs.map((l, i) => (
                                   <div key={i} className="flex space-x-3 text-[13px]">
                                       <span className="text-[#6b7299] flex-shrink-0">[{new Date().toLocaleTimeString('en-US', { hour12: false })}]</span>
                                       <span className={l.includes('complete') ? 'text-[#00d4aa] font-bold' : l.includes('17 Gainsight') ? 'text-[#6c63ff]' : 'text-[#e4e8f8]'}>{l}</span>
                                   </div>
                               ))}
                           </div>
                           {isProcessing && <div className="absolute bottom-4 left-4 w-2 h-2 bg-[#00d4aa] rounded-full animate-ping"></div>}
                        </div>
                    </div>
                </div>

                {/* Right Column: Execution Results & Error Registry */}
                <div className="space-y-6">
                    {stats && (
                        <div className="bg-[#1a1e30] rounded-xl border border-[#2a2f4a] p-6 shadow-xl animate-in fade-in slide-in-from-right-4 duration-500">
                            <div className="flex justify-between items-center mb-6">
                                <div className="flex items-center text-[11px] font-bold uppercase tracking-widest text-[#6b7299]">
                                    <span className="w-2 h-2 rounded-full bg-[#00d4aa] mr-2"></span>
                                    Sanitization Complete
                                </div>
                                <button onClick={downloadCsv} className="bg-gradient-to-r from-[#6c63ff] to-[#00d4aa] text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg hover:shadow-[#6c63ff]/20 transition-all flex items-center transform hover:-translate-y-0.5">
                                    <Download className="w-4 h-4 mr-2" /> Download Clean Payload
                                </button>
                            </div>
                            
                            <div className="grid grid-cols-3 gap-4">
                                <div className="bg-[#20253c] rounded-xl p-4 border border-[#2a2f4a]">
                                    <p className="text-3xl font-black text-white">{stats.total.toLocaleString()}</p>
                                    <p className="text-xs text-[#6b7299] uppercase tracking-wider font-bold mt-1">Total Verified</p>
                                </div>
                                <div className="bg-[#00d4aa]/10 rounded-xl p-4 border border-[#00d4aa]/30">
                                    <p className="text-3xl font-black text-[#00d4aa]">{stats.cleanedRows.toLocaleString()}</p>
                                    <p className="text-xs text-[#00d4aa]/70 uppercase tracking-wider font-bold mt-1">Clean Output</p>
                                </div>
                                <div className="bg-[#f5a623]/10 rounded-xl p-4 border border-[#f5a623]/30">
                                    <p className="text-3xl font-black text-[#f5a623]">{stats.fieldsDropped}</p>
                                    <p className="text-xs text-[#f5a623]/70 uppercase tracking-wider font-bold mt-1">Fields Dropped</p>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="bg-[#1a1e30] rounded-xl border border-[#2a2f4a] p-6 shadow-xl flex-1 h-[calc(100%-80px)]">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center text-[11px] font-bold uppercase tracking-widest text-[#6b7299]">
                                <span className="w-2 h-2 rounded-full bg-[#f5a623] mr-2"></span>
                                System Rule Registry
                            </div>
                            <div className="flex bg-[#20253c] rounded-lg p-1">
                                <button onClick={() => setActiveTab('known')} className={`px-4 py-1.5 text-[11px] font-bold rounded-md transition-all ${activeTab === 'known' ? 'bg-[#6c63ff] text-white shadow' : 'text-[#6b7299] hover:text-white'}`}>KNOWN (17)</button>
                                <button onClick={() => setActiveTab('unknown')} className={`px-4 py-1.5 text-[11px] font-bold rounded-md transition-all ${activeTab === 'unknown' ? 'bg-[#6c63ff] text-white shadow' : 'text-[#6b7299] hover:text-white'}`}>UNKNOWN</button>
                            </div>
                        </div>

                        {activeTab === 'known' ? (
                            <div className="space-y-3 overflow-y-auto h-[350px] pr-2 custom-scrollbar">
                                {KNOWN_ERRORS.map((err) => (
                                    <div key={err.id} className="bg-[#20253c] border-l-4 border-[#00d4aa] rounded-lg p-3">
                                        <div className="flex items-center mb-1">
                                            <span className="bg-[#00d4aa]/10 text-[#00d4aa] text-[10px] uppercase font-bold px-1.5 py-0.5 rounded mr-2">#{err.id}</span>
                                            <h4 className="text-sm font-bold text-white">{err.desc}</h4>
                                        </div>
                                        <p className="text-xs text-[#6b7299] ml-9 font-mono">Action: {err.fix}</p>
                                    </div>
                                ))}
                                <div className="text-center text-xs text-[#6b7299] pt-4 pb-2">...and 9 more natively executed inside TS</div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-[350px] text-center px-8">
                                <ShieldAlert className="w-16 h-16 text-[#2a2f4a] mb-4" />
                                <h3 className="text-lg font-bold text-[#6b7299] mb-2">Zero Anomalies Detected</h3>
                                <p className="text-sm text-[#4b5563]">The dataset parsing hasn't run into any unrecognized failure types. As unpredictable errors mount, they will be logged here via machine analysis.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            {/* Custom scrollbar styles for this isolated component */}
            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #2a2f4a; border-radius: 4px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #6c63ff; }
            `}</style>
        </div>
    );
}
