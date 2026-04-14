
import { useState } from 'react';
import { DropZone } from './DropZone';
import { validateGainsightCSV } from '../lib/gainsight-validator';
import { formatToRFC4180, downloadCSV } from '../lib/rfc4180-formatter';
import type { ValidationResult } from '../lib/gainsight-validator';
import { AlertCircle, CheckCircle, FileText, Download, ShieldCheck, Loader2, ArrowRight } from 'lucide-react';

export function RichTextFormatter() {
    const [file, setFile] = useState<File | null>(null);
    const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    const handleFileSelect = async (selectedFile: File) => {
        setFile(selectedFile);
        await processFile(selectedFile);
    };

    const processFile = async (f: File) => {
        setIsProcessing(true);
        try {
            // Validate
            const result = await validateGainsightCSV(f);
            setValidationResult(result);

            // We also need the raw data for key-value pairs to re-format later
            // The validator essentially does this, but for now let's just re-parse or 
            // ideally the validator should return the data. 
            // To keep things simple and adhere to single responsibility, I'll just use Papa in the validator
            // but here we might need the actual data to "Format".
            // Let's assume for this MVP we re-parse or modify validator to return data?
            // Actually, let's just trust we can use the original file for re-parsing in the formatter 
            // OR update the validator to return the data. Let's update validator later if needed.
            // For now, I'll just trigger validation.

        } catch (error) {
            console.error(error);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleDownload = async () => {
        if (!file) return;
        setIsProcessing(true);

        // We need to parse again to get the data for formatting
        // In a real app we'd cache this from validation step.
        // Importing Papa here to parse for formatting "on click" 
        const Papa = (await import('papaparse')).default;

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                const formatted = formatToRFC4180(results.data);
                downloadCSV(formatted, `formatted_${file.name}`);
                setIsProcessing(false);
            }
        });
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

            {/* Intro / Header for this tool */}
            <div className="bg-gradient-to-r from-purple-50 to-blue-50 p-6 rounded-xl border border-blue-100">
                <h2 className="text-xl font-bold text-slate-800 flex items-center mb-2">
                    <ShieldCheck className="w-6 h-6 mr-2 text-purple-600" />
                    Gainsight CSV Validator & Formatter
                </h2>
                <p className="text-slate-600">
                    Upload your CSV to validate against Gainsight limits (255 chars for Strings, HTML for Rich Text)
                    and automatically format it to RFC 4180 standards (handling line breaks and quotes).
                </p>
            </div>

            {/* Upload Section */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-8">
                    <DropZone
                        onFileSelected={handleFileSelect}
                        selectedFile={file}
                        disabled={isProcessing}
                        title="Upload CSV for Validation"
                        subtitle="Checks for Rich Text limits, encoding issues, and formatting"
                    />
                </div>
            </div>

            {/* Results Section */}
            {validationResult && (
                <div className="space-y-6">

                    {/* Status Card */}
                    <div className={`p-6 rounded-xl border ${validationResult.isValid ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
                        <div className="flex items-start">
                            {validationResult.isValid ? (
                                <CheckCircle className="w-6 h-6 text-green-600 mt-1 mr-3 flex-shrink-0" />
                            ) : (
                                <AlertCircle className="w-6 h-6 text-amber-600 mt-1 mr-3 flex-shrink-0" />
                            )}
                            <div>
                                <h3 className={`text-lg font-bold ${validationResult.isValid ? 'text-green-800' : 'text-amber-800'}`}>
                                    {validationResult.isValid ? 'File is Ready for Import' : 'Issues Detected'}
                                </h3>
                                <p className={`mt-1 ${validationResult.isValid ? 'text-green-700' : 'text-amber-700'}`}>
                                    Scanned {validationResult.totalRows} rows. Found {validationResult.issues.length} potential issues.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Rich Text Detection */}
                    {validationResult.richTextColumns.length > 0 && (
                        <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 text-sm text-blue-800 flex items-start">
                            <FileText className="w-5 h-5 mr-3 flex-shrink-0 mt-0.5" />
                            <div>
                                <span className="font-bold block mb-1">Rich Text Fields Detected:</span>
                                <ul className="list-disc list-inside">
                                    {validationResult.richTextColumns.map(c => <li key={c}>{c}</li>)}
                                </ul>
                                <p className="mt-2 text-xs">These fields will be carefully quoted to preserve HTML tags and line breaks.</p>
                            </div>
                        </div>
                    )}

                    {/* Issues List */}
                    {validationResult.issues.length > 0 && (
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
                                <h4 className="font-semibold text-slate-700">Detailed Report</h4>
                            </div>
                            <div className="max-h-80 overflow-y-auto">
                                <table className="min-w-full divide-y divide-slate-200">
                                    <thead className="bg-slate-50 sticky top-0">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Row</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Field</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Issue</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-slate-200">
                                        {validationResult.issues.map((issue, idx) => (
                                            <tr key={idx} className="hover:bg-slate-50">
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 font-mono">#{issue.row}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">{issue.column}</td>
                                                <td className="px-6 py-4 text-sm text-slate-600">
                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium mr-2 ${issue.severity === 'ERROR' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                                        {issue.severity}
                                                    </span>
                                                    {issue.issue}
                                                    <div className="text-xs text-slate-400 mt-1 font-mono bg-slate-100 p-1 rounded inline-block max-w-md truncate">
                                                        Val: {issue.value}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Preview Section - Show satisfied user what the data looks like */}
                    {validationResult.previewRows && validationResult.previewRows.length > 0 && (
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                                <h4 className="font-semibold text-slate-700">Preview (First 5 Rows)</h4>
                                <span className="text-xs text-slate-500">Verify HTML content is preserved below</span>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-slate-200">
                                    <thead className="bg-slate-50">
                                        <tr>
                                            {Object.keys(validationResult.previewRows[0]).map((header) => (
                                                <th key={header} className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                                                    {header}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-slate-200">
                                        {validationResult.previewRows.map((row, idx) => (
                                            <tr key={idx} className="hover:bg-slate-50">
                                                {Object.values(row).map((val: any, vIdx) => (
                                                    <td key={vIdx} className="px-6 py-4 text-sm text-slate-600 max-w-xs truncate" title={String(val)}>
                                                        {String(val)}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex justify-end pt-4">
                        <button
                            onClick={handleDownload}
                            disabled={isProcessing}
                            className="flex items-center space-x-2 bg-purple-600 hover:bg-purple-700 text-white px-8 py-4 rounded-lg font-bold shadow-lg shadow-purple-200 transition-all transform hover:scale-105 active:scale-95"
                        >
                            {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                            <span>Download Formatted CSV</span>
                        </button>
                    </div>

                    {/* Import Recommendation */}
                    <div className="mt-8 p-4 rounded-lg bg-slate-100 border border-slate-200 text-slate-600 text-sm">
                        <h4 className="font-bold flex items-center mb-2">
                            <ArrowRight className="w-4 h-4 mr-2" />
                            Import Recommendation
                        </h4>
                        {validationResult.richTextColumns.length > 0 || validationResult.totalRows > 5000 ? (
                            <p>
                                Due to the complexity (Rich Text) or size of this file, we recommend using the
                                <strong> Gainsight Bulk API</strong> or <strong>S3 Connector</strong> rather than the standard web upload.
                            </p>
                        ) : (
                            <p>
                                This file looks simple enough for a direct <strong>Data Management Web Upload</strong>.
                            </p>
                        )}
                    </div>

                </div>
            )}
        </div>
    );
}
