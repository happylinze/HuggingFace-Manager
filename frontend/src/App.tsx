import { useState, useEffect, useRef } from 'react';
import './index.css';
import { SettingsPage } from './components/SettingsPage';
import { CachePage } from './components/CachePage';
import { RepoDetails } from './components/RepoDetails';
import { ConfirmModal } from './components/ConfirmModal';
import { DebugPanel, addDebugLog, setDebugContext } from './components/DebugPanel';
import { Dropdown } from './components/Dropdown';
import { MyReposPage } from './components/MyReposPage';
import { BatchDownloadModal } from './components/BatchDownloadModal';
import { DownloadTaskCard } from './components/DownloadTaskCard';
import { TrendingSection } from './components/TrendingSection';
import { ScrollToTop } from './components/ScrollToTop';
import {
    searchRepos,
    startDownload,
    getDownloadQueue,
    pauseDownload,
    resumeDownload,
    cancelDownload,
    removeDownload,
    openDownloadFolder,
    openPath,
    getSettings,
    getTrendingTags,
    type SearchResult,
    type DownloadTask
} from './api/client';
import { formatCompactNumber as formatNumber } from './utils/format';
import { ThemeProvider } from './contexts/ThemeContext';
import { LanguageProvider, useLanguage } from './contexts/LanguageContext';
import { ToastProvider } from './contexts/ToastContext';
import { ConfirmProvider } from './contexts/ConfirmContext';

type TabType = 'search' | 'downloads' | 'settings' | 'cache' | 'my-repos';

export default function App() {
    return (
        <ThemeProvider>
            <LanguageProvider>
                <ToastProvider>
                    <ConfirmProvider>
                        <AppContent />
                    </ConfirmProvider>
                </ToastProvider>
            </LanguageProvider>
        </ThemeProvider>
    );
}

function AppContent() {
    const { t } = useLanguage();
    const [activeTab, setActiveTab] = useState<TabType>('search');
    const [query, setQuery] = useState('');
    const [sort, setSort] = useState<string>('');
    const [type, setType] = useState<'model' | 'dataset'>('model');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [downloads, setDownloads] = useState<DownloadTask[]>([]);
    const [settings, setSettings] = useState<any>(null);

    // Debug Watcher for App (Search Tab)
    useEffect(() => {
        if (activeTab === 'search') {
            setDebugContext('SEARCH', {
                activeTab,
                query,
                sort,
                type,
                resultsCount: results.length,
                isLoading,
                error,
            });
        }
    }, [activeTab, query, sort, type, results.length, isLoading, error]);
    const [searchHistory, setSearchHistory] = useState<string[]>(() => {
        try {
            return JSON.parse(localStorage.getItem('search_history') || '[]');
        } catch { return []; }
    });
    const [trendingTags, setTrendingTags] = useState<string[]>([
        'text-generation', 'computer-vision', 'audio-classification', 'multimodal'
    ]); // Initial fallback
    const [isRefreshingTags, setIsRefreshingTags] = useState(false);

    const refreshTags = async () => {
        setIsRefreshingTags(true);
        try {
            const tags = await getTrendingTags();
            if (tags && tags.length > 0) {
                setTrendingTags(tags);
            }
        } finally {
            setIsRefreshingTags(false);
        }
    };

    useEffect(() => {
        // Fetch global settings
        getSettings().then(setSettings).catch(() => { });
        // Fetch dynamic trending tags
        refreshTags();
    }, [activeTab]); // Refresh when tab changes to keep badge updated

    const addToHistory = (term: string) => {
        if (!term.trim()) return;
        setSearchHistory(prev => {
            const newHistory = [term, ...prev.filter(t => t !== term)].slice(0, 8);
            localStorage.setItem('search_history', JSON.stringify(newHistory));
            return newHistory;
        });
    };

    const clearHistory = () => {
        setSearchHistory([]);
        localStorage.setItem('search_history', '[]');
    };

    // Modals State
    const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
    const [deleteFiles, setDeleteFiles] = useState(false);
    const [detailsModal, setDetailsModal] = useState<{ isOpen: boolean, repoId: string, repoType: string }>({
        isOpen: false, repoId: '', repoType: 'model'
    });

    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        onConfirm: () => void;
        isDestructive?: boolean;
        confirmText?: string;
        customType?: 'remove_download';
        targetId?: string;
        secondaryText?: string;
        onSecondary?: () => void;
    }>({
        isOpen: false, title: '', message: '', onConfirm: () => { }
    });

    // Fetch downloads and setup WebSocket
    useEffect(() => {
        const fetchDownloads = async () => {
            try {
                const tasks = await getDownloadQueue();
                setDownloads(tasks);
            } catch (err) { }
        };

        fetchDownloads();

        const pollInterval = setInterval(fetchDownloads, 3000);

        const wsUrl = 'ws://127.0.0.1:8000/ws/progress';
        let ws: WebSocket | null = null;

        const connectWs = () => {
            ws = new WebSocket(wsUrl);

            ws.onopen = () => {
                console.log('WS Connected');
                addDebugLog('ws', 'WebSocket connected');
            };

            ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    addDebugLog('ws', `Received: ${message.type} - ${JSON.stringify(message.data).slice(0, 100)}...`);
                    if (message.type === 'task_update') {
                        setDownloads(prev => {
                            const updated = message.data;
                            const index = prev.findIndex(t => t.id === updated.id);

                            if (index !== -1) {
                                const newDownloads = [...prev];
                                // Preserve include_patterns if missing in update (prevent flickering)
                                // Preserve include_patterns
                                const patterns = updated.include_patterns !== undefined
                                    ? updated.include_patterns
                                    : newDownloads[index].include_patterns;

                                // Progress Smoothing: Prevent jumping to 0% during re-checks
                                // If status is verifying/downloading and we drop to 0, keep showing previous progress
                                let smoothedProgress = updated.progress;
                                if ((updated.status === 'DOWNLOADING' || updated.status === 'VERIFYING') &&
                                    (updated.progress === 0 && newDownloads[index].progress > 0)) {
                                    smoothedProgress = newDownloads[index].progress;
                                }

                                newDownloads[index] = {
                                    ...newDownloads[index],
                                    ...updated,
                                    progress: smoothedProgress,
                                    include_patterns: patterns
                                };
                                return newDownloads;
                            } else {
                                return prev;
                            }
                        });
                    }
                } catch (e) {
                    console.error('WS Error:', e);
                    addDebugLog('error', `WS parse error: ${e}`);
                }
            };

            ws.onclose = () => {
                console.log('WS Closed, reconnecting in 3s...');
                setTimeout(connectWs, 3000);
            };
        };

        connectWs();

        return () => {
            clearInterval(pollInterval);
            if (ws) ws.close();
        };
    }, []);

    useEffect(() => {
        setResults([]);
    }, [type]);

    // Auto-search when type or sort changes
    const [isFirstRun, setIsFirstRun] = useState(true);
    const abortControllerRef = useRef<AbortController | null>(null);

    useEffect(() => {
        // Skip initial mount to avoid searching empty query/default state unless intended
        if (isFirstRun) {
            setIsFirstRun(false);
            return;
        }

        // Trigger search if query is valid, regardless of whether it matches lastSearchedQuery
        // This ensures creating a new search when changing filters with modified input
        if (query.trim()) {
            handleSearch();
        }
    }, [type, sort]); // Depend on type and sort

    const handleSearch = async () => {
        if (!query.trim()) return;

        // Cancel previous request
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();

        addToHistory(query.trim());

        setIsLoading(true);
        setError(null);
        try {
            const data = await searchRepos(query.trim(), type, sort, abortControllerRef.current.signal);
            setResults(data);
        } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') return;
            setError(err instanceof Error ? err.message : t('common.error'));
        } finally {
            // Only stop loading if we haven't been aborted (meaning we are the latest request)
            if (abortControllerRef.current && !abortControllerRef.current.signal.aborted) {
                setIsLoading(false);
            }
        }
    };

    const handleDownload = async (repoId: string, repoType: string, patterns?: string[], revision?: string, duplicateAction: string = 'check') => {
        try {
            const result = await startDownload(repoId, repoType, patterns, revision, duplicateAction);
            if (result.success) {
                setActiveTab('downloads');
                getDownloadQueue().then(setDownloads);
            } else if (result.error_code === 'DUPLICATE_DOWNLOAD') {
                // Handle duplicate
                setConfirmModal({
                    isOpen: true,
                    title: t('download.duplicate.title') || "Duplicate Download",
                    message: t('download.duplicate.message', { path: result.path || '' }) || `Target folder already exists: ${result.path}`,
                    confirmText: t('download.duplicate.resume') || "Resume / Overwrite",
                    secondaryText: t('download.duplicate.rename') || "Save as Copy (Rename)",
                    isDestructive: false,
                    onConfirm: () => handleDownload(repoId, repoType, patterns, revision, 'overwrite'),
                    onSecondary: () => handleDownload(repoId, repoType, patterns, revision, 'rename')
                });
            } else {
                setError(result.message);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : t('common.error'));
        }
    };

    const handleBatchDownload = async (tasks: { id: string, type: 'model' | 'dataset' }[]) => {
        for (const task of tasks) {
            try {
                await startDownload(task.id, task.type);
            } catch (e) {
                console.error(`Failed to start ${task.id}`, e);
            }
        }
        setActiveTab('downloads');
        getDownloadQueue().then(setDownloads);
    };

    const handlePause = async (taskId: string) => {
        await pauseDownload(taskId);
        getDownloadQueue().then(setDownloads);
    };

    const handlePauseAll = async () => {
        const activeTasks = downloads.filter(t => t.status.toUpperCase() === 'DOWNLOADING');
        for (const task of activeTasks) {
            await pauseDownload(task.id);
        }
        getDownloadQueue().then(setDownloads);
    };

    const handleResume = async (taskId: string) => {
        await resumeDownload(taskId);
        getDownloadQueue().then(setDownloads);
    };

    const handleResumeAll = async () => {
        const pausedTasks = downloads.filter(t => t.status.toUpperCase() === 'PAUSED');
        for (const task of pausedTasks) {
            await resumeDownload(task.id);
        }
        getDownloadQueue().then(setDownloads);
    };

    const handleCancel = async (taskId: string) => {
        // Direct cancellation as requested by user ("directly kill")
        try {
            await cancelDownload(taskId);
            getDownloadQueue().then(setDownloads);
        } catch (error) {
            console.error("Failed to cancel download:", error);
        }
    };

    const handleRemove = async (taskId: string) => {
        setDeleteFiles(false); // Reset default to false
        setConfirmModal({
            isOpen: true,
            title: t('download.removeConfirm.title'),
            message: t('download.removeConfirm.message'),
            isDestructive: true,
            confirmText: t('download.removeConfirm.confirmText'),
            customType: 'remove_download',
            targetId: taskId,
            onConfirm: async () => { } // Handled in render
        });
    };

    const handleOpenFolder = async (path: string) => {
        if (!path) {
            await openDownloadFolder();
            return;
        }
        const result = await openPath(path);
        if (!result.success) {
            console.log('Task folder check failed, opening default download folder...');
            await openDownloadFolder();
        }
    };

    const handleClearCompleted = async () => {
        setConfirmModal({
            isOpen: true,
            title: t('download.clearConfirm.title'),
            message: t('download.clearConfirm.message'),
            isDestructive: false, // Clearing history is not destructive to files
            confirmText: t('download.clearConfirm.confirmText'),
            onConfirm: async () => {
                const tasks = downloads.filter(t => ['COMPLETED', 'FAILED', 'CANCELLED'].includes(t.status.toUpperCase()));
                for (const task of tasks) {
                    await removeDownload(task.id);
                }
                getDownloadQueue().then(setDownloads);
            }
        });
    };

    // Details Handlers
    const handleOpenDetails = (repoId: string, repoType: string) => {
        setDetailsModal({ isOpen: true, repoId, repoType });
    };

    const handleDownloadFromDetails = (patterns?: string[], revision?: string) => {
        handleDownload(detailsModal.repoId, detailsModal.repoType, patterns, revision);
        setDetailsModal({ ...detailsModal, isOpen: false });
    };

    return (
        <div className="min-h-screen bg-[var(--color-background)] text-[var(--color-text)] font-sans selection:bg-indigo-500/30 selection:text-indigo-300">
            {/* Background Decor */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
                <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[100px] opacity-50 animate-pulse-glow" />
                <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-emerald-500/10 rounded-full blur-[80px] opacity-30" />
            </div>

            {/* Header */}
            <header className="bg-[var(--color-surface)]/80 backdrop-blur-sm border-b border-[var(--color-border)] sticky top-0 z-50 animate-fade-in-down transition-colors duration-300">
                <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3 group cursor-pointer" onClick={() => setActiveTab('search')}>
                        <img src="/logo.png" alt="HFManager" className="w-10 h-10 rounded-xl shadow-lg shadow-yellow-500/20 group-hover:scale-110 transition-transform duration-300 object-cover" />
                        <h1 className="text-xl font-bold bg-gradient-to-r from-yellow-400 to-amber-600 bg-clip-text text-transparent tracking-tight">
                            Hugging Face Manager
                        </h1>
                    </div>

                    <nav className="flex gap-2">
                        {(['search', 'downloads', 'cache', 'my-repos', 'settings'] as TabType[]).map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 capitalize flex items-center gap-2
                        ${activeTab === tab
                                        ? 'bg-[var(--color-primary)] text-white shadow-lg shadow-indigo-500/25'
                                        : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]'}`}
                            >
                                {t(`nav.${tab.replace('-', '')}` as any)}
                                {tab === 'downloads' && downloads.filter(t => !['COMPLETED', 'FAILED', 'CANCELLED'].includes(t.status)).length > 0 && (
                                    <span className="bg-white/20 px-1.5 py-0.5 rounded text-xs font-bold leading-none">
                                        {downloads.filter(t => !['COMPLETED', 'FAILED', 'CANCELLED'].includes(t.status)).length}
                                    </span>
                                )}
                            </button>
                        ))}
                    </nav>
                </div>
            </header>

            {/* Main */}
            <main className="max-w-6xl mx-auto px-4 py-8 animate-fade-in">
                {activeTab === 'search' ? (
                    <>
                        <h2
                            className="text-2xl font-bold mb-6 cursor-pointer hover:text-[var(--color-primary)] transition-colors inline-block select-none"
                            onClick={() => { setQuery(''); setResults([]); setError(null); }}
                            title={t('search.title')}
                        >
                            {t('search.title')}
                        </h2>

                        {/* Search Bar */}
                        <div className="flex flex-col md:flex-row gap-3 mb-6">
                            <div className="flex-1 relative">
                                <input
                                    type="text"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                    placeholder={t('search.placeholder')}
                                    className="w-full px-4 py-3 pr-10 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl
                           focus:outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20 transition-all font-medium text-[var(--color-text)] placeholder-[var(--color-text-muted)]"
                                />
                                {query && !isLoading && (
                                    <button
                                        type="button"
                                        onClick={() => setQuery('')}
                                        className="absolute right-3 top-0 bottom-0 my-auto h-8 w-8 flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text)] rounded-full hover:bg-[var(--color-surface-hover)] transition-colors z-10"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                                        </svg>
                                    </button>
                                )}
                            </div>

                            <div className="flex bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-1 self-start md:self-auto">
                                <button
                                    onClick={() => setType('model')}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all
                    ${type === 'model' ? 'bg-[var(--color-primary)] text-white shadow' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]'}`}
                                >
                                    {t('search.model')}
                                </button>
                                <button
                                    onClick={() => setType('dataset')}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all
                    ${type === 'dataset' ? 'bg-[var(--color-primary)] text-white shadow' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]'}`}
                                >
                                    {t('search.dataset')}
                                </button>
                            </div>

                            <div className="min-w-[140px]">
                                <Dropdown
                                    value={sort}
                                    onChange={(val) => {
                                        setSort(val);
                                    }}
                                    options={[
                                        { value: "", label: t('search.sort.default') },
                                        { value: "downloads", label: t('search.sort.downloads') },
                                        { value: "likes", label: t('search.sort.likes') },
                                        { value: "lastModified", label: t('search.sort.lastModified') }
                                    ]}
                                    buttonClassName="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-4 py-3 text-sm font-medium hover:border-[var(--color-border)] text-[var(--color-text)]"
                                    placeholder={t('search.sort.placeholder')}
                                />
                            </div>

                            <button
                                onClick={handleSearch}
                                disabled={isLoading || !query.trim()}
                                className="px-6 py-3 bg-gradient-to-r from-[var(--color-primary)] to-purple-600 rounded-xl font-medium shadow-lg shadow-indigo-500/20 text-white
                           hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 whitespace-nowrap"
                            >
                                {isLoading ? t('search.searching') : t('search.searchBtn')}
                            </button>
                        </div>

                        {/* Error */}
                        {error && (
                            <div className="p-4 mb-6 bg-red-500/10 border border-red-500 rounded-xl text-red-400 animate-pulse">
                                ⚠️ {error}
                            </div>
                        )}

                        {/* Empty State / Quick Access */}
                        {!results.length && !isLoading && !error && (
                            <div className="mt-8 w-full space-y-8 animate-fade-in">

                                {/* Recent Searches */}
                                {searchHistory.length > 0 && settings?.show_search_history !== false && (
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wider flex items-center gap-2">
                                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
                                                {t('search.recent')}
                                            </h3>
                                            <button
                                                onClick={clearHistory}
                                                className="text-xs text-[var(--color-text-muted)] hover:text-red-400 transition-colors"
                                            >
                                                {t('search.clear')}
                                            </button>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {searchHistory.map(term => (
                                                <button
                                                    key={term}
                                                    onClick={() => { setQuery(term); handleSearch(); }}
                                                    className="px-3 py-1.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-full text-sm text-[var(--color-text)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-all flex items-center gap-2 group"
                                                >
                                                    <span>{term}</span>
                                                    <span
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setSearchHistory(prev => {
                                                                const next = prev.filter(t => t !== term);
                                                                localStorage.setItem('search_history', JSON.stringify(next));
                                                                return next;
                                                            });
                                                        }}
                                                        className="w-4 h-4 rounded-full hover:bg-[var(--color-background)] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                                    >
                                                        &times;
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {settings?.show_trending_repos !== false && (
                                    <TrendingSection
                                        type={type}
                                        onRepoClick={(repo) => {
                                            setDetailsModal({
                                                isOpen: true,
                                                repoId: repo.id,
                                                repoType: repo.repo_type as any
                                            });
                                        }}
                                    />
                                )}

                                {/* Popular Tags */}
                                {settings?.show_trending_tags !== false && (
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wider flex items-center gap-2">
                                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>
                                                {t('search.popular')}
                                            </h3>
                                            <button
                                                onClick={refreshTags}
                                                className={`p-1 rounded-full hover:bg-[var(--color-surface-hover)] text-[var(--color-text-muted)] transition-all ${isRefreshingTags ? 'animate-spin text-[var(--color-primary)]' : ''}`}
                                                title="Refresh Tags"
                                            >
                                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" /><path d="M16 21h5v-5" /></svg>
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                                            {trendingTags.map(tag => (
                                                <button
                                                    key={tag}
                                                    onClick={() => { setQuery(tag); handleSearch(); }}
                                                    className="p-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl text-left hover:border-[var(--color-primary)] hover:shadow-lg hover:shadow-indigo-500/10 transition-all group"
                                                >
                                                    <div className="font-medium text-[var(--color-text)] group-hover:text-[var(--color-primary)] transition-colors truncate" title={tag}>
                                                        {/* Attempt to use translation if key exists (for old mapped tags), otherwise show tag itself */}
                                                        {tag.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Placeholder Illustration */}
                                {!searchHistory.length && (
                                    <div className="text-center py-10 opacity-50 select-none pointer-events-none">
                                        <div className="text-6xl mb-4">🔭</div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Results */}
                        {results.length > 0 && (
                            <div className="animate-fade-in-up">
                                <h3 className="text-lg font-semibold mb-3 text-slate-400">
                                    {t('search.resultsFound', { count: results.length })}
                                </h3>
                                <div className="grid gap-4">
                                    {results.map((result) => (
                                        <div
                                            key={result.id}
                                            className="p-5 bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] 
                                 hover:border-[var(--color-primary)]/50 hover:bg-[var(--color-surface-hover)] transition-all group"
                                        >
                                            <div className="flex items-start justify-between">
                                                <div>
                                                    <h4
                                                        onClick={() => handleOpenDetails(result.id, type)}
                                                        className="text-lg font-semibold group-hover:text-indigo-400 transition-colors cursor-pointer hover:underline"
                                                    >
                                                        {result.id}
                                                    </h4>
                                                    {result.author && (
                                                        <p className="text-sm text-slate-400 mt-1">by {result.author}</p>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <div className="text-right hidden sm:block">
                                                        <div className="text-sm text-slate-400">{t('search.downloads')}{formatNumber(result.downloads)}</div>
                                                        <div className="text-sm text-slate-500">
                                                            {t('search.lastUpdated', {
                                                                date: result.last_modified && !isNaN(new Date(result.last_modified).getTime())
                                                                    ? new Date(result.last_modified).toLocaleDateString()
                                                                    : '-'
                                                            })}
                                                        </div>
                                                    </div>

                                                    <div className="flex gap-2">
                                                        <a
                                                            href={`https://huggingface.co/${type === 'dataset' ? 'datasets/' : ''}${result.id}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="px-3 py-2 bg-[var(--color-surface-hover)] hover:bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] rounded-lg text-sm font-medium transition-colors border border-[var(--color-border)]"
                                                            title={t('search.openInBrowser')}
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            🌐
                                                        </a>
                                                        <button
                                                            onClick={() => handleDownload(result.id, type)}
                                                            className="px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-sm font-medium transition-colors"
                                                        >
                                                            {t('download.start')}
                                                        </button>
                                                    </div>

                                                </div>
                                            </div>
                                            {result.tags.length > 0 && (
                                                <div className="mt-3 flex flex-wrap gap-2">
                                                    {result.tags.slice(0, 5).map((tag) => (
                                                        <span
                                                            key={tag}
                                                            className="px-2 py-1 text-xs rounded-md bg-[var(--color-surface-hover)] text-[var(--color-text-muted)] border border-[var(--color-border)]"
                                                        >
                                                            {tag}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                ) : activeTab === 'downloads' ? (
                    <>
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-4">
                                <h2 className="text-2xl font-bold">{t('download.queue')}</h2>
                                {settings && (
                                    <div className="flex items-center gap-2 px-3 py-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-full text-xs font-mono text-[var(--color-text-muted)]">
                                        <span className={settings.current_mirror === 'official' ? 'text-yellow-500' : 'text-emerald-500'}>
                                            🌐 {settings.current_mirror === 'official' ? 'Official' : settings.current_mirror === 'hf-mirror' ? 'HF-Mirror' : settings.current_mirror}
                                        </span>
                                        <span className="text-[var(--color-border)]">|</span>
                                        <span className={settings.download_method === 'ARIA2' ? 'text-yellow-500 font-bold' : 'text-blue-400 font-bold'}>
                                            {settings.download_method === 'ARIA2' ? '⚡ Aria2' : '🐍 Python'}
                                        </span>
                                    </div>
                                )}
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => openDownloadFolder()}
                                    className="px-3 py-1.5 bg-[var(--color-surface-hover)] hover:bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-sm font-medium transition-colors flex items-center gap-1"
                                    title={t('download.openFolder') || "Open Folder"}
                                >
                                    📂
                                </button>
                                <button
                                    onClick={() => setIsBatchModalOpen(true)}
                                    className="px-3 py-1.5 bg-[var(--color-primary)]/10 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/20 border border-[var(--color-primary)]/20 rounded-lg text-sm font-medium transition-colors flex items-center gap-1"
                                >
                                    ➕ {t('batch.add') || "Batch Add"}
                                </button>
                                <button
                                    onClick={handlePauseAll}
                                    className="px-3 py-1.5 bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20 border border-yellow-500/20 rounded-lg text-sm font-medium transition-colors flex items-center gap-1"
                                    title="Pause All Downloading"
                                >
                                    ⏸ {t('batch.pauseAll') || "Pause All"}
                                </button>
                                <button
                                    onClick={handleResumeAll}
                                    className="px-3 py-1.5 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-lg text-sm font-medium transition-colors flex items-center gap-1"
                                    title="Resume All Paused"
                                >
                                    ▶ {t('batch.resumeAll') || "Resume All"}
                                </button>
                                {downloads.some(t => ['COMPLETED', 'FAILED', 'CANCELLED'].includes(t.status)) && (
                                    <button
                                        onClick={handleClearCompleted}
                                        className="px-4 py-2 bg-[var(--color-surface-hover)] hover:bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-sm font-medium transition-colors text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                                    >
                                        {t('download.clearCompleted')}
                                    </button>
                                )}
                            </div>
                        </div>

                        {downloads.length === 0 ? (
                            <div className="text-center py-24 text-[var(--color-text-muted)] bg-[var(--color-surface)]/50 rounded-2xl border-2 border-dashed border-[var(--color-border)]">
                                <p className="text-xl font-medium text-[var(--color-text-muted)]">{t('download.noTasks')}</p>
                                <p className="text-sm mt-2">{t('download.noTasksDesc')}</p>
                                <button
                                    onClick={() => setActiveTab('search')}
                                    className="mt-6 px-6 py-2 bg-[var(--color-primary)]/10 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/20 rounded-lg font-medium transition-colors"
                                >
                                    {t('download.goSearch')}
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {downloads.map((task) => (
                                    <DownloadTaskCard
                                        key={task.id}
                                        task={task}
                                        onPause={handlePause}
                                        onResume={handleResume}
                                        onCancel={handleCancel}
                                        onRemove={handleRemove}
                                        onOpenFolder={handleOpenFolder}
                                        debugMode={settings?.debug_mode}
                                    />
                                ))}
                            </div>
                        )}
                    </>
                ) : activeTab === 'my-repos' ? (
                    <MyReposPage />
                ) : activeTab === 'cache' ? (
                    <CachePage />
                ) : (
                    <SettingsPage onSettingsChanged={() => getSettings().then(setSettings)} />
                )}
            </main>


            <BatchDownloadModal
                isOpen={isBatchModalOpen}
                onClose={() => setIsBatchModalOpen(false)}
                onDownload={handleBatchDownload}
            />

            <RepoDetails
                isOpen={detailsModal.isOpen}
                onClose={() => setDetailsModal({ ...detailsModal, isOpen: false })}
                repoId={detailsModal.repoId}
                repoType={detailsModal.repoType}
                onDownload={handleDownloadFromDetails}
            />

            <ConfirmModal
                isOpen={confirmModal.isOpen}
                onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                title={confirmModal.title}
                message={confirmModal.message}
                isDestructive={confirmModal.isDestructive}
                confirmText={confirmModal.confirmText}
                secondaryText={confirmModal.secondaryText}
                onSecondary={confirmModal.onSecondary}
                extraContent={confirmModal.customType === 'remove_download' ? (
                    <div className="mt-4 p-3 bg-[var(--color-surface-hover)] rounded-lg border border-[var(--color-border)] flex items-center gap-3 animate-fade-in">
                        <input
                            type="checkbox"
                            id="deleteFiles"
                            checked={deleteFiles}
                            onChange={(e) => setDeleteFiles(e.target.checked)}
                            className="w-4 h-4 rounded border-gray-300 text-[var(--color-primary)] focus:ring-[var(--color-primary)] accent-[var(--color-primary)]"
                        />
                        <label htmlFor="deleteFiles" className="text-sm font-medium text-[var(--color-text)] cursor-pointer select-none flex-1">
                            {t('download.deleteFiles') || "Also delete downloaded files from disk"}
                        </label>
                    </div>
                ) : undefined}
                onConfirm={async () => {
                    if (confirmModal.customType === 'remove_download' && confirmModal.targetId) {
                        await removeDownload(confirmModal.targetId, deleteFiles);
                        getDownloadQueue().then(setDownloads);
                    } else {
                        confirmModal.onConfirm();
                    }
                }}
            />

            {/* Debug Panel - remove after development */}
            {settings?.debug_mode && <DebugPanel tasks={downloads} />}

            <ScrollToTop />
        </div>
    );
}
