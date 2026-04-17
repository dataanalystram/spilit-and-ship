import React, { useCallback, useState } from 'react';
import { Upload, CheckCircle } from 'lucide-react';
import { cn } from '../lib/utils';

interface DropZoneProps {
    onFileSelected: (file: File) => void;
    selectedFile: File | null;
    disabled?: boolean;
    title?: string;
    subtitle?: string;
}

export function DropZone({ onFileSelected, selectedFile, disabled, title, subtitle }: DropZoneProps) {
    const [isDragActive, setIsDragActive] = useState(false);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        if (!disabled) setIsDragActive(true);
    }, [disabled]);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragActive(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragActive(false);

        if (disabled) return;

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            // Basic check for CSV type or extension, though we accept any for valid splitting
            // But let's warn if not csv.
            // For now just pass it.
            onFileSelected(file);
        }
    }, [onFileSelected, disabled]);

    const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            onFileSelected(e.target.files[0]);
        }
    }, [onFileSelected]);

    return (
        <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
                "relative flex flex-col items-center justify-center w-full p-10 border-2 border-dashed rounded-xl transition-all duration-200 cursor-pointer overflow-hidden group",
                isDragActive ? "border-blue-500 bg-blue-50/50" : "border-slate-300 hover:border-slate-400 hover:bg-slate-50",
                disabled && "opacity-50 cursor-not-allowed hover:border-slate-300 hover:bg-transparent"
            )}
            onClick={() => !disabled && document.getElementById('file-upload')?.click()}
        >
            <input
                id="file-upload"
                type="file"
                className="hidden"
                accept=".csv,.txt,.xlsx,.xls"
                onChange={handleFileInput}
                disabled={disabled}
            />

            <div className="z-10 flex flex-col items-center text-center space-y-4">
                <div className={cn(
                    "p-4 rounded-full transition-colors",
                    selectedFile ? "bg-green-100 text-green-600" : "bg-blue-100 text-blue-600 group-hover:bg-blue-200"
                )}>
                    {selectedFile ? <CheckCircle className="w-8 h-8" /> : <Upload className="w-8 h-8" />}
                </div>

                <div className="space-y-1">
                    {selectedFile ? (
                        <>
                            <h3 className="text-lg font-semibold text-slate-900">{selectedFile.name}</h3>
                            <p className="text-sm text-slate-500">
                                {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • {selectedFile.type || 'text/csv'}
                            </p>
                        </>
                    ) : (
                        <>
                            <h3 className="text-lg font-semibold text-slate-900">
                                {title || "Drag & drop your CSV here"}
                            </h3>
                            <p className="text-sm text-slate-500">
                                {subtitle || "or click to browse from your computer"}
                            </p>
                            {!subtitle && (
                                <p className="text-xs text-slate-400 mt-2">
                                    Up to 10GB+ supported • Local processing only
                                </p>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Background decoration */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.03] bg-[radial-gradient(#3b82f6_1px,transparent_1px)] [background-size:16px_16px]" />
        </div>
    );
}
