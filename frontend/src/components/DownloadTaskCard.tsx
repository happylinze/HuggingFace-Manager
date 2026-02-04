
import { useState, useEffect, useRef } from 'react';
import type { DownloadTask } from '../api/client';
import { formatBytes } from '../utils/format';
import { useLanguage } from '../contexts/LanguageContext';
import { addDebugLog } from './DebugPanel';

interface DownloadTaskCardProps {
    task: DownloadTask;
    onPause: (id: string) => void;
    onResume: (id: string) => void;
    onCancel: (id: string) => void;
    onRemove: (id: string) => void;
    onOpenFolder: (path: string) => void;
    debugMode?: boolean;
}

export function DownloadTaskCard({
    task,
    onPause,
    onResume,
    onCancel,
    onRemove,
    onOpenFolder,
    debugMode
}: DownloadTaskCardProps) {
    const { t } = useLanguage();

    // Determine initial state based on status
    // Active tasks default to expanded? User said "Downloading cards can also use this logic", implying they start collapsed or collapse automatically.
    // But usually you want to see progress.
    // Let's default: Active = Expanded, Inactive = Collapsed.
    // User said: "For completed tasks, don't expand every time".
    const isActive = ['DOWNLOADING', 'PAUSED', 'VERIFYING', 'PENDING'].includes(task.status.toUpperCase());

    // State
    const [isExpanded, setIsExpanded] = useState<boolean>(isActive);
    const prevStatusRef = useRef<string>(task.status);
    const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Clear timer helper
    const clearTimer = () => {
        if (collapseTimerRef.current) {
            clearTimeout(collapseTimerRef.current);
            collapseTimerRef.current = null;
        }
    };

    // Schedule collapse
    const scheduleCollapse = (delayMs: number = 5000) => {
        clearTimer();
        collapseTimerRef.current = setTimeout(() => {
            setIsExpanded(false);
        }, delayMs);
    };

    // Monitor status changes
    useEffect(() => {
        const prev = prevStatusRef.current.toUpperCase();
        const curr = task.status.toUpperCase();

        // Transition to COMPLETED or FAILED or CANCELLED
        if (prev !== curr && (curr === 'COMPLETED' || curr === 'FAILED')) {
            // "Show for a few seconds then retract"
            setIsExpanded(true);
            scheduleCollapse(5000);
        }

        prevStatusRef.current = task.status;
    }, [task.status]);

    // Handle expand toggle
    const toggleExpand = () => {
        if (isExpanded) {
            // Manually closing
            setIsExpanded(false);
            clearTimer();
        } else {
            // Manually opening
            setIsExpanded(true);
            // "Click to expand (5s auto collapse)"
            scheduleCollapse(5000);
        }
    };

    // Prevent toggle when clicking buttons
    const handleAction = (e: React.MouseEvent, action: () => void) => {
        e.stopPropagation();
        action();
    };

    // Render Compact Status Info for Collapsed View
    const renderCollapsedStatus = () => {
        if (task.status.toUpperCase() === 'DOWNLOADING') {
            return (
                <div className="flex items-center gap-3 text-xs font-mono ml-2">
                    <span className="text-[var(--color-primary)] font-bold">{task.progress.toFixed(1)}%</span>
                    <span className="text-[var(--color-text-muted)] hidden sm:inline">
                        {formatBytes(task.downloaded_size)} / {task.total_size > 0 ? formatBytes(task.total_size) : '?'}
                    </span>
                    <span className="text-[var(--color-text-muted)]">⚡ {task.speed_formatted}</span>
                </div>
            );
        }
        if (task.status.toUpperCase() === 'PAUSED') {
            return <span className="text-yellow-500 text-xs ml-2 font-mono">{t('download.status.paused')} ({task.progress.toFixed(1)}%)</span>;
        }
        return null;
    };

    return (
        <div
            className={`
                bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] shadow-sm animate-fade-in
                transition-all duration-300 overflow-hidden cursor-pointer hover:border-[var(--color-primary)]/30
                ${isExpanded ? 'p-5' : 'px-5 py-3'}
            `}
            onClick={(e) => {
                if (e.shiftKey && debugMode) {
                    e.stopPropagation();
                    addDebugLog('info', `DEBUG INSPECT [${task.id}]: ${JSON.stringify(task, null, 2)}`);
                    return;
                }
                toggleExpand();
            }}
        >
            {/* Header / Summary Row */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* Status Indicator Bar */}
                    <div className={`w-2 rounded-full transition-all duration-300 ${isExpanded ? 'h-10' : 'h-8'}
                        ${task.status.toUpperCase() === 'DOWNLOADING' ? 'bg-indigo-500 animate-pulse' :
                            task.status.toUpperCase() === 'VERIFYING' ? 'bg-purple-500 animate-pulse' :
                                task.status.toUpperCase() === 'COMPLETED' ? 'bg-emerald-500' :
                                    task.status.toUpperCase() === 'FAILED' ? 'bg-red-500' :
                                        task.status.toUpperCase() === 'PAUSED' ? 'bg-yellow-500' : 'bg-[var(--color-border)]'
                        }`}></div>

                    <div className="min-w-0 flex-1 flex flex-col gap-1">
                        <div className="flex items-center gap-3">
                            <h4 className="font-semibold text-lg truncate" title={task.repo_id}>
                                {task.repo_id}
                            </h4>
                            {/* Collapsed Status Info (Progress) - Only row 1 if collapsed? No, let's keep it clean. */}
                            {!isExpanded && renderCollapsedStatus()}
                        </div>

                        {/* Tags & Badges - ALWAYS VISIBLE to match original aesthetics */}
                        <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] flex-wrap">
                            <span className="uppercase bg-[var(--color-surface-hover)] px-1.5 py-0.5 rounded border border-[var(--color-border)]">{task.repo_type}</span>
                            {task.use_hf_transfer && (
                                <span className="text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded border border-red-400/20 font-bold flex items-center gap-1" title={t('download.turboEnabled')}>
                                    🚀 TURBO
                                </span>
                            )}

                            {task.include_patterns && task.include_patterns.length > 0 ? (
                                <span className="text-[var(--color-primary)] bg-[var(--color-primary)]/10 px-1.5 py-0.5 rounded break-all border border-[var(--color-primary)]/20" title={task.include_patterns.join(', ')}>
                                    {task.include_patterns.length === 1
                                        ? `📄 ${task.include_patterns[0]}`
                                        : task.total_files && task.total_files > 0
                                            ? `📦 ${t('download.fileProgress', { current: task.downloaded_files || 0, total: task.total_files })}`
                                            : `📦 ${t('download.patternCount', { count: task.include_patterns.length })}`
                                    }
                                </span>
                            ) : (
                                <span className="text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded break-all border border-emerald-500/20">
                                    {task.total_files && task.total_files > 0
                                        ? `📦 ${t('download.fileProgress', { current: task.downloaded_files || 0, total: task.total_files })}`
                                        : `📦 ${t('download.wholeRepo') || "Whole Repo"}`
                                    }
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Side Actions */}
                <div className="flex items-center gap-2 pl-2">
                    {/* Status Badge */}
                    <span className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider hidden sm:flex items-center gap-1
                          ${task.status.toUpperCase() === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-400' :
                            task.status.toUpperCase() === 'DOWNLOADING' ? 'bg-indigo-500/10 text-indigo-400' :
                                task.status.toUpperCase() === 'VERIFYING' ? 'bg-purple-500/10 text-purple-400' :
                                    task.status.toUpperCase() === 'PAUSED' ? 'bg-yellow-500/10 text-yellow-400' :
                                        task.status.toUpperCase() === 'FAILED' ? 'bg-red-500/10 text-red-500' :
                                            'bg-[var(--color-surface-hover)] text-[var(--color-text-muted)]'}`}
                    >
                        {task.status.toUpperCase() === 'VERIFYING' && <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />}
                        {task.use_hf_transfer && task.status.toUpperCase() === 'STALLED'
                            ? <span className="animate-pulse">STALLED</span>
                            : t(`download.status.${task.status.toLowerCase()}` as any) || task.status
                        }
                    </span>

                    {/* Actions */}
                    {task.status.toUpperCase() === 'DOWNLOADING' && (
                        <button
                            onClick={(e) => handleAction(e, () => task.pausable !== false && onPause(task.id))}
                            disabled={task.pausable === false}
                            className={`p-1.5 rounded-lg transition-colors border border-[var(--color-border)] 
                                ${task.pausable === false
                                    ? 'opacity-30 cursor-not-allowed bg-[var(--color-surface)] text-[var(--color-text-muted)] grayscale'
                                    : 'bg-[var(--color-surface-hover)] hover:bg-[var(--color-surface)] text-[var(--color-text)]'
                                }`}
                        >
                            ⏸️
                        </button>
                    )}
                    {['PAUSED', 'PENDING', 'FAILED', 'CANCELLED'].includes(task.status.toUpperCase()) && (
                        <button
                            onClick={(e) => handleAction(e, () => onResume(task.id))}
                            className="p-1.5 bg-[var(--color-surface-hover)] hover:bg-[var(--color-surface)] rounded-lg transition-colors border border-[var(--color-border)] text-[var(--color-text)]"
                        >
                            ▶️
                        </button>
                    )}
                    {task.status.toUpperCase() !== 'COMPLETED' && task.status.toUpperCase() !== 'CANCELLED' && (
                        <button
                            onClick={(e) => handleAction(e, () => onCancel(task.id))}
                            className="p-1.5 bg-[var(--color-surface-hover)] hover:bg-red-500/20 text-[var(--color-text-muted)] hover:text-red-500 rounded-lg transition-colors border border-[var(--color-border)] hover:border-red-500/30"
                        >
                            ✕
                        </button>
                    )}
                    {(['COMPLETED', 'FAILED', 'CANCELLED'].includes(task.status.toUpperCase()) || task.status.toUpperCase() === 'DOWNLOADING' || task.status.toUpperCase() === 'PAUSED') && (
                        <div className="relative group/folder">
                            <button
                                onClick={(e) => handleAction(e, () => onOpenFolder(task.result_path || ""))}
                                className={`p-1.5 bg-[var(--color-surface-hover)] hover:bg-[var(--color-primary)]/10 text-[var(--color-text-muted)] hover:text-[var(--color-primary)] rounded-lg transition-colors border border-[var(--color-border)] hover:border-[var(--color-primary)]/30 mr-1`}
                                title={t('download.openFolder')}
                            >
                                📂
                            </button>
                        </div>
                    )}

                    {['COMPLETED', 'FAILED', 'CANCELLED'].includes(task.status.toUpperCase()) && (
                        <button
                            onClick={(e) => handleAction(e, () => onRemove(task.id))}
                            className="p-1.5 bg-[var(--color-surface-hover)] hover:bg-red-500/20 text-[var(--color-text-muted)] hover:text-red-500 rounded-lg transition-colors border border-[var(--color-border)] hover:border-red-500/30"
                            title={t('download.delete')}
                        >
                            🗑️
                        </button>
                    )}

                    {/* Expand Chevron */}
                    <div className={`transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''} text-[var(--color-text-muted)] text-xs`}>
                        ▼
                    </div>
                </div>
            </div>

            {/* Expanded Content */}
            <div className={`grid transition-all duration-300 ease-in-out ${isExpanded ? 'grid-rows-[1fr] opacity-100 mt-4' : 'grid-rows-[0fr] opacity-0 mt-0'}`} onClick={(e) => e.stopPropagation()}>
                <div className="overflow-hidden min-h-0 selectable">
                    {/* Tags removed from here as they are now in header */}

                    {/* Progress Bar Area */}
                    {(task.status.toUpperCase() === 'DOWNLOADING' || task.status.toUpperCase() === 'PAUSED') && (
                        <div className="bg-[var(--color-background)]/50 p-3 rounded-lg border border-[var(--color-border)]">
                            <div className="flex justify-between text-sm mb-1">
                                <div className="text-[var(--color-text-muted)] font-mono text-xs truncate max-w-[70%]">
                                    {task.current_file ? t('download.downloadingFile', { file: task.current_file }) : t('download.downloading') || "Downloading..."}
                                </div>
                                <div className="text-[var(--color-primary)] font-bold">{task.progress.toFixed(1)}%</div>
                            </div>
                            <div className="w-full bg-[var(--color-surface-hover)] rounded-full h-2 mb-2 overflow-hidden">
                                <div
                                    className={`h-2 rounded-full transition-all duration-300 ${task.status.toUpperCase() === 'PAUSED' ? 'bg-yellow-500 combined-striped' : 'bg-[var(--color-primary)] relative overflow-hidden'
                                        }`}
                                    style={{ width: `${task.progress}%` }}
                                >
                                    {task.status.toUpperCase() === 'DOWNLOADING' && (
                                        <div className="absolute inset-0 bg-white/20 animate-[shimmer_2s_infinite]"></div>
                                    )}
                                </div>
                            </div>
                            <div className="flex justify-between text-xs text-[var(--color-text-muted)] font-mono">
                                <span>
                                    {formatBytes(task.downloaded_size)} / {task.total_size > 0 ? formatBytes(task.total_size) : t('download.status.pending')}
                                </span>
                                <span>
                                    {task.status.toUpperCase() === 'DOWNLOADING' ? `⚡ ${task.speed_formatted}` : ''}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Completed Full Info */}
                    {task.status === 'COMPLETED' && task.result_path && (
                        <div className="p-3 bg-emerald-900/10 border border-emerald-900/20 rounded-lg flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 overflow-hidden">
                                <span className="text-xl">🎉</span>
                                <div className="overflow-hidden">
                                    <div className="text-sm text-emerald-400 font-semibold">{t('download.status.completed')}</div>
                                    <div className="text-xs text-emerald-500/70 truncate">{task.result_path}</div>
                                </div>
                            </div>
                            <button
                                onClick={(e) => handleAction(e, () => onOpenFolder(task.result_path!))}
                                className="flex-shrink-0 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5"
                            >
                                <span>📂</span>
                                <span>{t('download.openFolder')}</span>
                            </button>
                        </div>
                    )}

                    {/* Error Message */}
                    {task.error_message && (
                        <div className="p-3 bg-red-900/10 border border-red-900/20 rounded-lg flex items-start gap-2 text-red-400">
                            <span className="mt-0.5">❌</span>
                            <div className="flex-1">
                                <div className="whitespace-pre-wrap font-medium">{task.error_message}</div>
                                {task.error_message.includes('https://huggingface.co/') && (
                                    <a
                                        href={task.error_message.match(/https:\/\/huggingface\.co\/[^\s)]*/)?.[0]}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-300 rounded-lg text-sm border border-red-500/30 transition-colors"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <span>📝</span>
                                        <span className="underline decoration-red-500/30 underline-offset-2">{t('download.signAgreement')}</span>
                                    </a>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
