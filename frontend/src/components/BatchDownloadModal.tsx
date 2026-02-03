
import { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { useLanguage } from '../contexts/LanguageContext';

interface BatchDownloadModalProps {
    isOpen: boolean;
    onClose: () => void;
    onDownload: (tasks: { id: string, type: 'model' | 'dataset' }[]) => Promise<void>;
}

interface ParsedTask {
    original: string;
    id: string;
    type: 'model' | 'dataset';
    valid: boolean;
    error?: string;
}

export function BatchDownloadModal({ isOpen, onClose, onDownload }: BatchDownloadModalProps) {
    const { t } = useLanguage();
    const [input, setInput] = useState('');
    const [parsedTasks, setParsedTasks] = useState<ParsedTask[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);

    // Auto-parse when input changes (debounced slightly or just on every change if fast enough)
    useEffect(() => {
        const lines = input.split('\n').filter(line => line.trim());
        const tasks: ParsedTask[] = lines.map(line => {
            const trimmed = line.trim();

            // 1. Try URL parsing
            if (trimmed.includes('huggingface.co/')) {
                try {
                    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
                    const parts = url.pathname.split('/').filter(p => p);

                    if (parts[0] === 'datasets' && parts.length >= 3) {
                        return { original: trimmed, id: `${parts[1]}/${parts[2]}`, type: 'dataset', valid: true };
                    } else if (parts.length >= 2 && parts[0] !== 'spaces' && parts[0] !== 'datasets') {
                        return { original: trimmed, id: `${parts[0]}/${parts[1]}`, type: 'model', valid: true };
                    }
                } catch { }
            }

            // 2. Try ID parsing (user/repo)
            const idParts = trimmed.split('/');
            if (idParts.length === 2 && !trimmed.includes(' ') && !trimmed.startsWith('http')) {
                // Default to model, but user might need to change it. 
                // For batch simplicity, we assume model unless it says 'datasets/' prefix in ID which isn't standard HF ID format but useful for us
                return { original: trimmed, id: trimmed, type: 'model', valid: true };
            }

            return { original: trimmed, id: '', type: 'model', valid: false, error: 'Invalid format' };
        });
        setParsedTasks(tasks);
    }, [input]);

    const validCount = parsedTasks.filter(t => t.valid).length;

    const handleDownload = async () => {
        setIsProcessing(true);
        const validTasks = parsedTasks.filter(t => t.valid).map(t => ({ id: t.id, type: t.type }));
        await onDownload(validTasks);
        setIsProcessing(false);
        setInput('');
        onClose();
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={t('batch.title') || "Batch Download"} // Fallback until translation added
            className="max-w-4xl"
        >
            <div className="flex flex-col gap-4 h-[60vh]">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full overflow-hidden">
                    {/* Input Area */}
                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium text-[var(--color-text-muted)]">
                            {t('batch.inputLabel') || "Paste links or IDs (one per line):"}
                        </label>
                        <textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="https://huggingface.co/meta-llama/Llama-2-7b&#10;google/bert&#10;https://huggingface.co/datasets/glue"
                            className="flex-1 w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg p-4 font-mono text-sm resize-none focus:outline-none focus:border-[var(--color-primary)]"
                        />
                    </div>

                    {/* Preview Area */}
                    <div className="flex flex-col gap-2 overflow-hidden">
                        <div className="flex justify-between items-center">
                            <label className="text-sm font-medium text-[var(--color-text-muted)]">
                                {t('batch.previewLabel') || "Preview"} ({validCount})
                            </label>
                        </div>

                        <div className="flex-1 overflow-auto bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg">
                            {parsedTasks.length === 0 ? (
                                <div className="h-full flex items-center justify-center text-[var(--color-text-muted)] text-sm">
                                    {t('batch.noInput') || "Waiting for input..."}
                                </div>
                            ) : (
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-[var(--color-surface-hover)] text-[var(--color-text-muted)] font-medium sticky top-0">
                                        <tr>
                                            <th className="px-3 py-2">ID</th>
                                            <th className="px-3 py-2">Type</th>
                                            <th className="px-3 py-2">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[var(--color-border)]">
                                        {parsedTasks.map((task, i) => (
                                            <tr key={i} className="hover:bg-[var(--color-surface-hover)]">
                                                <td className="px-3 py-2 font-mono truncate max-w-[150px]" title={task.id || task.original}>
                                                    {task.valid ? task.id : task.original}
                                                </td>
                                                <td className="px-3 py-2">
                                                    {task.valid && (
                                                        <span className={`text-xs px-1.5 py-0.5 rounded border ${task.type === 'model'
                                                            ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                                            : 'bg-green-500/10 text-green-400 border-green-500/20'
                                                            }`}>
                                                            {task.type}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-3 py-2">
                                                    {task.valid ? (
                                                        <span className="text-emerald-400">✓</span>
                                                    ) : (
                                                        <span className="text-red-400" title={task.error}>⚠</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-[var(--color-border)]">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] transition-colors"
                    >
                        {t('common.cancel') || "Cancel"}
                    </button>
                    <button
                        onClick={handleDownload}
                        disabled={validCount === 0 || isProcessing}
                        className="px-6 py-2 bg-[var(--color-primary)] hover:opacity-90 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {isProcessing ? "Processing..." : `${t('batch.download') || "Download"} (${validCount})`}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
