import { useState, useRef, useEffect } from 'react';
import { DropZone } from './components/DropZone';
import { Configuration } from './components/Configuration';
import { RichTextFormatter } from './components/RichTextFormatter';
import { DataCleanerETL } from './components/DataCleanerETL';
import { GainsightCSVCleaner } from './components/GainsightCSVCleaner';
import type { SplitConfig, WorkerResponse } from './types';
import { FileDown, RefreshCw, Loader2, Play, Download, Package, AlertTriangle, ArrowLeft, HardDrive, FileText, Split, Database, ShieldAlert } from 'lucide-react';

interface PartFile {
  url: string;
  name: string;
  partNumber: number;
  sizeBytes: number;
}

// Helper to format bytes to human readable
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

function App() {
  const [activeTab, setActiveTab] = useState<'splitter' | 'formatter' | 'etl' | 'cleaner'>('etl');
  const [file, setFile] = useState<File | null>(null);
  const [config, setConfig] = useState<SplitConfig>({
    mode: 'gainsight',
    chunkSizeMB: 200,
    filePrefix: 'split_part_'
  });

  const [status, setStatus] = useState<'IDLE' | 'PROCESSING' | 'COMPLETED' | 'ERROR'>('IDLE');
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('');
  const [resultZip, setResultZip] = useState<{ url: string; name: string } | null>(null);
  const [individualParts, setIndividualParts] = useState<PartFile[]>([]);
  const [completionMode, setCompletionMode] = useState<'zip' | 'individual' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    // Initialize worker
    workerRef.current = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });

    workerRef.current.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      if (msg.type === 'PROGRESS') {
        setProgress(msg.progress);
        setProgressText(`${msg.status} (${msg.currentPart}/${msg.totalParts || '?'})`);
      } else if (msg.type === 'PART_READY') {
        // For large files: individual parts are ready
        const url = URL.createObjectURL(msg.blob);
        setIndividualParts(prev => [...prev, {
          url,
          name: msg.filename,
          partNumber: msg.partNumber,
          sizeBytes: msg.sizeBytes
        }]);
        setProgressText(`Part ${msg.partNumber} of ${msg.totalParts} ready`);
      } else if (msg.type === 'COMPLETE') {
        setStatus('COMPLETED');
        setProgress(100);
        setCompletionMode(msg.mode);

        if (msg.mode === 'zip' && msg.blob) {
          setProgressText('Ready to download ZIP!');
          const url = URL.createObjectURL(msg.blob);
          setResultZip({ url, name: msg.filename! });
        } else {
          setProgressText(`${msg.totalParts} parts ready for download!`);
        }
      } else if (msg.type === 'ERROR') {
        setStatus('ERROR');
        setError(msg.error);
      }
    };

    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  const handleStart = () => {
    if (!file || !workerRef.current) return;

    setStatus('PROCESSING');
    setProgress(0);
    setError(null);
    setResultZip(null);
    setIndividualParts([]);
    setCompletionMode(null);

    workerRef.current.postMessage({
      type: 'START',
      file,
      config
    });
  };

  const handleReset = () => {
    // Revoke all object URLs to free memory
    if (resultZip) URL.revokeObjectURL(resultZip.url);
    individualParts.forEach(p => URL.revokeObjectURL(p.url));

    setFile(null);
    setStatus('IDLE');
    setProgress(0);
    setResultZip(null);
    setIndividualParts([]);
    setCompletionMode(null);
    setError(null);
  };

  // Go back to configuration (keep same file)
  const handleGoBack = () => {
    // Revoke all object URLs to free memory
    if (resultZip) URL.revokeObjectURL(resultZip.url);
    individualParts.forEach(p => URL.revokeObjectURL(p.url));

    setStatus('IDLE');
    setProgress(0);
    setResultZip(null);
    setIndividualParts([]);
    setCompletionMode(null);
    setError(null);
  };

  const downloadAllParts = () => {
    individualParts.forEach((part, index) => {
      // Stagger downloads to avoid browser blocking
      setTimeout(() => {
        const a = document.createElement('a');
        a.href = part.url;
        a.download = part.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }, index * 500);
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="text-center space-y-6">
          <div className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tight text-slate-900">
              Split & Ship
              <span className="ml-2 text-blue-600 text-lg align-top uppercase tracking-wider font-extrabold bg-blue-50 px-2 py-1 rounded-md border border-blue-100">
                Gainsight Edition
              </span>
            </h1>
            <p className="text-slate-600 text-lg">
              Essential local tools for Gainsight Admins & Data Operations.
            </p>
          </div>

          {/* Navigation Tabs */}
          <div className="flex justify-center">
            <div className="bg-white p-1 rounded-lg border border-slate-200 shadow-sm inline-flex">
              <button
                onClick={() => { setActiveTab('splitter'); setFile(null); }}
                className={`flex items-center space-x-2 px-6 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'splitter'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-600 hover:bg-slate-50'
                  }`}
              >
                <Split className="w-4 h-4" />
                <span>CSV Splitter</span>
              </button>
              <button
                onClick={() => { setActiveTab('formatter'); setFile(null); }}
                className={`flex items-center space-x-2 px-6 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'formatter'
                  ? 'bg-purple-600 text-white shadow-md'
                  : 'text-slate-600 hover:bg-slate-50'
                  }`}
              >
                <FileText className="w-4 h-4" />
                <span>Rich Text Formatter</span>
              </button>
              <button
                onClick={() => { setActiveTab('etl'); setFile(null); }}
                className={`flex items-center space-x-2 px-6 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'etl'
                  ? 'bg-teal-600 text-white shadow-md'
                  : 'text-slate-600 hover:bg-slate-50'
                  }`}
              >
                <Database className="w-4 h-4" />
                <span>Data Cleaning & ETL</span>
              </button>
              <button
                onClick={() => { setActiveTab('cleaner'); setFile(null); }}
                className={`flex items-center space-x-2 px-6 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'cleaner'
                  ? 'bg-[#1a1e30] text-white shadow-md'
                  : 'text-slate-600 hover:bg-slate-50'
                  }`}
              >
                <ShieldAlert className="w-4 h-4 text-[#6c63ff]" />
                <span>Gainsight Cleaner</span>
              </button>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">

          {/* TAB 1: SPLITTER */}
          {activeTab === 'splitter' && (
            <div className="animate-in fade-in slide-in-from-left-4 duration-300">
              {/* 1. File Selection */}
              <div className="p-8 border-b border-slate-100">
                <DropZone
                  onFileSelected={setFile}
                  selectedFile={file}
                  disabled={status === 'PROCESSING'}
                  title="Split Large CSV Files"
                  subtitle="Securely split files up to 10GB+ in your browser"
                />
              </div>

              {/* 2. Configuration (Only shown if file is selected) */}
              {file && status !== 'COMPLETED' && (
                <div className="p-8 bg-slate-50/50 space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
                  <Configuration
                    config={config}
                    onChange={setConfig}
                    disabled={status === 'PROCESSING'}
                  />

                  {/* Large file warning */}
                  {file.size > 500 * 1024 * 1024 && (
                    <div className="flex items-start space-x-3 p-4 bg-amber-50 rounded-lg border border-amber-200">
                      <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-amber-800">
                        <p className="font-medium">Large file detected ({(file.size / (1024 * 1024 * 1024)).toFixed(2)} GB)</p>
                        <p className="text-amber-700">Parts will be available for individual download instead of a single ZIP to prevent memory issues.</p>
                      </div>
                    </div>
                  )}

                  <div className="pt-4 flex justify-end">
                    {status === 'PROCESSING' ? (
                      <button disabled className="flex items-center space-x-2 bg-slate-100 text-slate-400 px-6 py-3 rounded-lg font-semibold cursor-not-allowed">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Processing... {progress}%</span>
                      </button>
                    ) : (
                      <button
                        onClick={handleStart}
                        className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-semibold shadow-lg shadow-blue-200 transition-all transform hover:scale-105 active:scale-95"
                      >
                        <Play className="w-5 h-5 fill-current" />
                        <span>Split File Now</span>
                      </button>
                    )}
                  </div>

                  {/* Progress Bar */}
                  {status === 'PROCESSING' && (
                    <div className="space-y-2">
                      <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-600 transition-all duration-300 ease-out"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <p className="text-xs text-center text-slate-500 font-mono">{progressText}</p>
                    </div>
                  )}

                  {status === 'ERROR' && (
                    <div className="p-4 bg-red-50 text-red-600 rounded-lg border border-red-100 text-sm font-medium">
                      Error: {error}
                    </div>
                  )}
                </div>
              )}

              {/* 3. Results - ZIP Mode */}
              {status === 'COMPLETED' && completionMode === 'zip' && resultZip && (
                <div className="p-12 text-center space-y-6 animate-in zoom-in-95 duration-500 bg-green-50/30">
                  <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto shadow-sm">
                    <Package className="w-10 h-10" />
                  </div>

                  <div className="space-y-2">
                    <h2 className="text-2xl font-bold text-slate-900">Processing Complete!</h2>
                    <p className="text-slate-600">Your file has been split and zipped successfully.</p>
                  </div>

                  <div className="flex justify-center space-x-4 flex-wrap gap-3">
                    <a
                      href={resultZip.url}
                      download={resultZip.name}
                      className="flex items-center space-x-2 bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-lg font-bold shadow-lg shadow-green-200 transition-all transform hover:scale-105"
                    >
                      <FileDown className="w-5 h-5" />
                      <span>Download ZIP</span>
                    </a>

                    <button
                      onClick={handleGoBack}
                      className="flex items-center space-x-2 bg-white border border-slate-300 text-slate-600 hover:bg-slate-50 px-6 py-3 rounded-lg font-medium transition-all"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      <span>Back to Settings</span>
                    </button>

                    <button
                      onClick={handleReset}
                      className="flex items-center space-x-2 bg-white border border-slate-300 text-slate-600 hover:bg-slate-50 px-6 py-3 rounded-lg font-medium transition-all"
                    >
                      <RefreshCw className="w-4 h-4" />
                      <span>Split Another</span>
                    </button>
                  </div>
                </div>
              )}

              {/* 3. Results - Individual Parts Mode (for large files) */}
              {status === 'COMPLETED' && completionMode === 'individual' && individualParts.length > 0 && (
                <div className="p-8 space-y-6 animate-in zoom-in-95 duration-500 bg-green-50/30">
                  <div className="text-center space-y-4">
                    <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto shadow-sm">
                      <FileDown className="w-10 h-10" />
                    </div>
                    <div className="space-y-2">
                      <h2 className="text-2xl font-bold text-slate-900">Processing Complete!</h2>
                      <p className="text-slate-600">
                        Your file has been split into {individualParts.length} parts @ {config.chunkSizeMB} MB each.
                      </p>
                    </div>
                  </div>

                  {/* Download All Button */}
                  <div className="flex justify-center space-x-4 flex-wrap gap-3">
                    <button
                      onClick={downloadAllParts}
                      className="flex items-center space-x-2 bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-lg font-bold shadow-lg shadow-green-200 transition-all transform hover:scale-105"
                    >
                      <Download className="w-5 h-5" />
                      <span>Download All ({individualParts.length} files)</span>
                    </button>

                    <button
                      onClick={handleGoBack}
                      className="flex items-center space-x-2 bg-white border border-slate-300 text-slate-600 hover:bg-slate-50 px-6 py-3 rounded-lg font-medium transition-all"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      <span>Back to Settings</span>
                    </button>

                    <button
                      onClick={handleReset}
                      className="flex items-center space-x-2 bg-white border border-slate-300 text-slate-600 hover:bg-slate-50 px-6 py-3 rounded-lg font-medium transition-all"
                    >
                      <RefreshCw className="w-4 h-4" />
                      <span>Split Another</span>
                    </button>
                  </div>

                  {/* Individual Parts List with Sizes */}
                  <div className="bg-white rounded-lg border border-slate-200 divide-y divide-slate-100 max-h-80 overflow-y-auto">
                    <div className="grid grid-cols-3 gap-4 p-3 bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider sticky top-0">
                      <span>File Name</span>
                      <span className="text-center">Size</span>
                      <span className="text-right">Action</span>
                    </div>
                    {individualParts.map((part) => (
                      <div key={part.partNumber} className="grid grid-cols-3 gap-4 items-center p-3 hover:bg-slate-50">
                        <span className="text-sm font-medium text-slate-700">{part.name}</span>
                        <span className="text-sm text-slate-500 text-center flex items-center justify-center space-x-1">
                          <HardDrive className="w-3 h-3" />
                          <span>{formatBytes(part.sizeBytes)}</span>
                        </span>
                        <div className="text-right">
                          <a
                            href={part.url}
                            download={part.name}
                            className="text-sm text-blue-600 hover:text-blue-700 font-medium inline-flex items-center space-x-1"
                          >
                            <FileDown className="w-4 h-4" />
                            <span>Download</span>
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Gainsight Tip */}
                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-100 text-sm text-blue-800">
                    <p className="font-medium">💡 Gainsight Tip:</p>
                    <p className="text-blue-700">
                      In your Gainsight Rules Engine S3 settings, set file search to <strong>"Starts With"</strong> → <strong>"{config.filePrefix}"</strong>
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: FORMATTER */}
          {activeTab === 'formatter' && (
            <div className="p-8 animate-in fade-in slide-in-from-right-4 duration-300">
              <RichTextFormatter />
            </div>
          )}

          {/* TAB 3: ETL ENGINE */}
          {activeTab === 'etl' && (
            <div className="p-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <DataCleanerETL />
            </div>
          )}

          {/* TAB 4: GAINSIGHT CSV CLEANER */}
          {activeTab === 'cleaner' && (
            <div className="bg-[#0d0f1a] animate-in fade-in slide-in-from-right-4 duration-300">
              <GainsightCSVCleaner />
            </div>
          )}

        </div>

        {/* Footer */}
        <p className="text-center text-sm text-slate-400">
          Powered by Web Workers & File.slice(). No data is sent to any server.
        </p>
      </div>
    </div>
  );
}

export default App;
