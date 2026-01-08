import { Shield, Settings, AlertCircle, Info } from 'lucide-react';
import { cn } from '../lib/utils';
import type { SplitConfig } from '../types';

interface ConfigurationProps {
    config: SplitConfig;
    onChange: (config: SplitConfig) => void;
    disabled?: boolean;
}

export function Configuration({ config, onChange, disabled }: ConfigurationProps) {

    const updateConfig = (updates: Partial<SplitConfig>) => {
        onChange({ ...config, ...updates });
    };

    // Generate preview of output filenames
    const previewFilenames = [
        `${config.filePrefix}1.csv`,
        `${config.filePrefix}2.csv`,
        `${config.filePrefix}3.csv`,
    ];

    return (
        <div className="w-full space-y-6">
            <div className="flex p-1 bg-slate-100 rounded-lg">
                <button
                    onClick={() => updateConfig({ mode: 'gainsight', chunkSizeMB: 200, filePrefix: 'split_part_' })}
                    disabled={disabled}
                    className={cn(
                        "flex-1 flex items-center justify-center space-x-2 py-2.5 text-sm font-medium rounded-md transition-all",
                        config.mode === 'gainsight'
                            ? "bg-white text-blue-600 shadow-sm ring-1 ring-black/5"
                            : "text-slate-500 hover:text-slate-700",
                        disabled && "opacity-50 cursor-not-allowed"
                    )}
                >
                    <Shield className="w-4 h-4" />
                    <span>Gainsight Safe Mode</span>
                </button>
                <button
                    onClick={() => updateConfig({ mode: 'custom' })}
                    disabled={disabled}
                    className={cn(
                        "flex-1 flex items-center justify-center space-x-2 py-2.5 text-sm font-medium rounded-md transition-all",
                        config.mode === 'custom'
                            ? "bg-white text-blue-600 shadow-sm ring-1 ring-black/5"
                            : "text-slate-500 hover:text-slate-700",
                        disabled && "opacity-50 cursor-not-allowed"
                    )}
                >
                    <Settings className="w-4 h-4" />
                    <span>Custom Mode</span>
                </button>
            </div>

            <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
                {config.mode === 'gainsight' ? (
                    <div className="space-y-4">
                        <div className="flex items-start space-x-3 text-sm text-slate-600 bg-blue-50/50 p-4 rounded-md border border-blue-100">
                            <AlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                            <div className="space-y-1">
                                <p className="font-medium text-blue-900">Optimized for Gainsight Rules Engine</p>
                                <ul className="list-disc pl-4 space-y-1 text-slate-600">
                                    <li>Each part will be exactly <strong>200 MB</strong> max (Gainsight Safe Zone)</li>
                                    <li>Headers automatically preserved in every file</li>
                                    <li>Files named: <code className="bg-slate-100 px-1 rounded text-xs">split_part_1.csv</code>, <code className="bg-slate-100 px-1 rounded text-xs">split_part_2.csv</code>, etc.</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-700">Chunk Size (MB)</label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        min="1"
                                        max="2000"
                                        value={config.chunkSizeMB}
                                        onChange={(e) => updateConfig({ chunkSizeMB: Math.max(1, Math.min(2000, Number(e.target.value) || 200)) })}
                                        disabled={disabled}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                    />
                                    <span className="absolute right-3 top-2.5 text-xs font-medium text-slate-400">MB</span>
                                </div>
                                <p className="text-xs text-slate-500">Each split part will be approximately <strong>{config.chunkSizeMB} MB</strong>.</p>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-700 flex items-center space-x-1">
                                    <span>File Prefix</span>
                                    <span className="relative group">
                                        <Info className="w-3.5 h-3.5 text-slate-400 cursor-help" />
                                        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                                            Prefix added to each output filename
                                        </span>
                                    </span>
                                </label>
                                <input
                                    type="text"
                                    value={config.filePrefix}
                                    onChange={(e) => updateConfig({ filePrefix: e.target.value || 'split_part_' })}
                                    disabled={disabled}
                                    placeholder="e.g., my_data_part_"
                                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                />
                                <p className="text-xs text-slate-500">Used for Gainsight "Starts With" matching.</p>
                            </div>
                        </div>

                        {/* Preview of output filenames */}
                        <div className="p-3 bg-slate-50 rounded-md border border-slate-200">
                            <p className="text-xs font-medium text-slate-500 mb-2">Preview of output filenames:</p>
                            <div className="flex flex-wrap gap-2">
                                {previewFilenames.map((name, i) => (
                                    <code key={i} className="bg-white px-2 py-1 rounded border border-slate-200 text-xs text-slate-700">
                                        {name}
                                    </code>
                                ))}
                                <span className="text-xs text-slate-400 self-center">...</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
