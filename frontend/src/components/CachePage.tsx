import { useState, useEffect } from 'react';
import { getCacheRepos, deleteCacheRepo, verifyRepo, openPath, type CacheRepo } from '../api/client';
import { ConfirmModal } from './ConfirmModal';
import { RepoDetails } from './RepoDetails';
import { CacheDoctor } from './CacheDoctor';
import { useLanguage } from '../contexts/LanguageContext';
import { useToast } from '../contexts/ToastContext';
import ToolboxModal from './ToolboxModal';
import { WrenchScrewdriverIcon } from '@heroicons/react/24/outline';
import { setDebugContext } from './DebugPanel';

export function CachePage() {
    const { t } = useLanguage();
    const { success, error: toastError } = useToast();
    // Data
    const [repos, setRepos] = useState<CacheRepo[]>([]);
    const [rootPath, setRootPath] = useState('');

    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    // Modal state
    const [confirmState, setConfirmState] = useState<{ isOpen: boolean, repo: CacheRepo | null }>({ isOpen: false, repo: null });
    const [verifyState, setVerifyState] = useState<{ isOpen: boolean, repo: CacheRepo | null }>({ isOpen: false, repo: null });
    const [toolboxOpen, setToolboxOpen] = useState(false);

    // Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [typeFilter, setTypeFilter] = useState<'all' | 'model' | 'dataset'>('all');

    // Details
    const [detailsRepo, setDetailsRepo] = useState<CacheRepo | null>(null);

    useEffect(() => {
        loadCache();
    }, []);

    // Debug Watcher
    useEffect(() => {
        setDebugContext('CACHE', {
            rootPath,
            reposCount: repos.length,
            isLoading,
            error,
            searchTerm,
            typeFilter,
            totalSize: repos.reduce((acc, r) => acc + (r.size || 0), 0)
        });
    }, [rootPath, repos, isLoading, error, searchTerm, typeFilter]);

    const loadCache = async (refresh: boolean = false) => {
        setIsLoading(true);
        setError(null);
        try {
            // If refresh is true (boolean), pass it. If called from event (object), default to false/true logic?
            // Actually, implicit conversion of event object to boolean is true-ish but we check type
            const shouldRefresh = typeof refresh === 'boolean' ? refresh : false;
            const data = await getCacheRepos(shouldRefresh);
            const sorted = data.repos.sort((a, b) => b.size - a.size);
            setRepos(sorted);
            setRootPath(data.root_path);
        } catch (err) {
            console.error(err);
            setError(t('cache.loadFailed'));
        } finally {
            setIsLoading(false);
        }
    };



    const handleOpenFolder = (path?: string) => {
        const target = path || rootPath;
        if (target) openPath(target);
    };

    const handleDeleteClick = (repo: CacheRepo) => {
        setConfirmState({ isOpen: true, repo });
    };

    const handleConfirmDelete = async () => {
        const repo = confirmState.repo;
        if (!repo) return;

        setDeletingId(repo.repo_id);
        setConfirmState({ ...confirmState, isOpen: false });

        try {
            const result = await deleteCacheRepo(repo.repo_id, repo.repo_type);
            if (result.success) {
                await loadCache();
                success(t('common.success'));
            } else {
                toastError(`${t('cache.deleteFailed')}: ${result.message}`);
            }
        } catch (err) {
            toastError(t('cache.deleteRequestFailed'));
        } finally {
            setDeletingId(null);
        }
    };

    const handleVerifyClick = (repo: CacheRepo) => {
        setVerifyState({ isOpen: true, repo });
    };

    const handleConfirmVerify = async () => {
        const repo = verifyState.repo;
        if (!repo) return;

        setVerifyState({ ...verifyState, isOpen: false });

        try {
            await verifyRepo(repo.repo_id, repo.repo_type);
            success(t('common.success'));
        } catch (err) {
            toastError(`${t('cache.verifyFailed')}: ${err instanceof Error ? err.message : String(err)}`);
        }
    };

    // Filter logic
    const filteredRepos = repos.filter(repo => {
        const matchesSearch = repo.repo_id.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesType = typeFilter === 'all' || repo.repo_type === typeFilter;
        return matchesSearch && matchesType;
    });

    if (error) {
        return <div className="p-8 text-center text-red-400">❌ {error}</div>;
    }

    return (
        <div className="max-w-6xl mx-auto space-y-8 animate-fade-in">
            {/* Header Area */}
            <div className="flex flex-col gap-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <h2 className="text-2xl font-bold">{t('cache.title')}</h2>

                    {/* ToolBox Button */}
                    <button
                        onClick={() => setToolboxOpen(true)}
                        className="flex items-center space-x-2 px-4 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-surface-hover)] hover:border-[var(--color-primary)] transition-all text-[var(--color-text)]"
                    >
                        <WrenchScrewdriverIcon className="w-5 h-5 text-[var(--color-primary)]" />
                        <span className="font-semibold text-sm">{t('cache.toolbox')}</span>
                    </button>
                </div>

                {/* Sub-Header depends on View Mode */}
                <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
                    <span>{t('cache.location')}:</span>
                    <code className="bg-[var(--color-surface)] px-2 py-0.5 rounded border border-[var(--color-border)] font-mono text-xs truncate max-w-[300px]" title={rootPath}>{rootPath || t('common.loading')}</code>
                    <div className="group relative">
                        <div className="p-1 text-[var(--color-text-muted)] opacity-50 hover:opacity-100 cursor-help transition-opacity">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 p-2 bg-black/90 text-white text-xs rounded shadow-lg hidden group-hover:block z-50 pointer-events-none">
                            {t('cache.scanScopeHint')}
                            <br /><br />
                            Try the new <b>Toolbox</b> for GGUF Conversion!
                        </div>
                    </div>
                    <button onClick={() => handleOpenFolder()} className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors" title={t('common.openFolder')}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                        </svg>
                    </button>
                    <button
                        onClick={() => loadCache(true)}
                        disabled={isLoading}
                        className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors disabled:opacity-50"
                        title={t('common.refresh')}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${isLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                    </button>
                </div>
            </div>



            {/* Cache Doctor Dashboard (Internal Only) */}
            < CacheDoctor filter={typeFilter} onCleanComplete={loadCache} />

            <div className="border-t border-[var(--color-border)] pt-2"></div>

            {/* List Header & Filters */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <h3 className="text-xl font-bold">{t('cache.downloadedItems')} ({filteredRepos.length})</h3>

                <div className="flex gap-4 flex-1 md:flex-none">
                    <input
                        type="text"
                        placeholder={t('cache.searchPlaceholder')}
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="flex-1 md:w-64 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-4 py-2 focus:outline-none focus:border-[var(--color-primary)] transition-colors text-[var(--color-text)] placeholder-[var(--color-text-muted)]"
                    />
                    <div className="flex bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)] p-1">
                        {(['all', 'model', 'dataset'] as const).map(f => (
                            <button
                                key={f}
                                onClick={() => setTypeFilter(f)}
                                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${typeFilter === f ? 'bg-[var(--color-primary)] text-white shadow' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}
                            >
                                {t(`cache.${f}` as any)}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {
                isLoading && repos.length === 0 ? (
                    <div className="p-8 text-center text-[var(--color-text-muted)] animate-pulse">{t('cache.scanning')}</div>
                ) : filteredRepos.length === 0 ? (
                    <div className="text-center py-16 text-[var(--color-text-muted)] bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)]">
                        <p className="text-lg">{t('cache.noMatches')}</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {filteredRepos.map((repo) => (
                            <div
                                key={`${repo.repo_type}_${repo.repo_id}_${repo.repo_path}`}
                                className="p-4 bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)] hover:border-[var(--color-primary)]/30 transition-colors"
                            >
                                <div className="flex items-start justify-between">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className={`px-2 py-0.5 rounded text-xs font-medium uppercase
                      ${repo.repo_type === 'model' ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]' : 'bg-[var(--color-success)]/10 text-[var(--color-success)]'}`}
                                            >
                                                {repo.repo_type}
                                            </span>
                                            {repo.isExternal && (
                                                <span className="px-2 py-0.5 rounded text-xs font-medium uppercase bg-orange-500/10 text-orange-500 border border-orange-500/20">
                                                    EXTERNAL
                                                </span>
                                            )}
                                            <h3
                                                className="font-semibold text-lg cursor-pointer hover:text-[var(--color-primary)] transition-colors text-[var(--color-text)]"
                                                onClick={() => setDetailsRepo(repo)}
                                            >
                                                {repo.repo_id}
                                            </h3>
                                        </div>

                                        <div className="text-sm text-[var(--color-text-muted)] space-y-1">
                                            <p>{t('cache.revisions')}: <span className="font-mono text-xs bg-[var(--color-surface-hover)] px-1 rounded">{repo.revisions_count}</span></p>
                                            <p>{t('cache.lastModified')}: {repo.last_modified}</p>
                                            {repo.isExternal && <p className="text-xs text-[var(--color-text-muted)] font-mono">{repo.repo_path}</p>}
                                        </div>
                                    </div>

                                    <div className="text-right">
                                        <div className="text-xl font-bold text-[var(--color-text)] mb-2">
                                            {repo.size_formatted}
                                        </div>
                                        <div className="flex gap-2 justify-end">
                                            <button
                                                onClick={() => handleOpenFolder(repo.repo_path)}
                                                className="px-4 py-2 bg-[var(--color-surface-hover)] hover:bg-[var(--color-surface-hover)]/80 border border-[var(--color-border)] 
                                     rounded-lg text-sm font-medium text-[var(--color-text)] transition-colors flex items-center gap-1"
                                                title={t('common.openFolder')}
                                            >
                                                📂 {t('common.openFolder')}
                                            </button>
                                            <button
                                                onClick={() => setDetailsRepo(repo)}
                                                className="px-4 py-2 bg-[var(--color-surface-hover)] hover:bg-[var(--color-surface-hover)]/80 border border-[var(--color-border)] 
                                     rounded-lg text-sm font-medium text-[var(--color-text)] transition-colors flex items-center gap-1"
                                                title={t('cache.browse')}
                                            >
                                                📖 {t('cache.browse')}
                                            </button>

                                            <button
                                                onClick={() => handleVerifyClick(repo)}
                                                className="px-4 py-2 bg-[var(--color-primary)]/10 hover:bg-[var(--color-primary)]/20 text-[var(--color-primary)] border border-[var(--color-primary)]/50 
                                            rounded-lg text-sm font-medium transition-colors"
                                            >
                                                🛡️ {t('cache.verify')}
                                            </button>
                                            <button
                                                onClick={() => handleDeleteClick(repo)}
                                                disabled={deletingId === repo.repo_id}
                                                className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/50 
                                            rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                                            >
                                                {deletingId === repo.repo_id ? t('cache.deleting') : t('cache.deleteCache')}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )
            }

            <ConfirmModal
                isOpen={confirmState.isOpen}
                onClose={() => setConfirmState({ ...confirmState, isOpen: false })}
                onConfirm={handleConfirmDelete}
                title={t('cache.confirmDeleteTitle')}
                message={t('cache.confirmDeleteMessage', { id: confirmState.repo?.repo_id || '' })}
                confirmText={t('cache.confirmDeleteBtn')}
                isDestructive={true}
            />

            <ConfirmModal
                isOpen={verifyState.isOpen}
                onClose={() => setVerifyState({ ...verifyState, isOpen: false })}
                onConfirm={handleConfirmVerify}
                title={t('cache.confirmVerifyTitle')}
                message={t('cache.confirmVerifyMessage', { id: verifyState.repo?.repo_id || '' })}
                confirmText={t('cache.confirmVerifyBtn')}
                isDestructive={false}
            />

            <RepoDetails
                isOpen={!!detailsRepo}
                onClose={() => setDetailsRepo(null)}
                repoId={detailsRepo?.repo_id || ''}
                repoType={detailsRepo?.repo_type || 'model'}
                isLocal={true}
                onDownload={() => { }} // Not used in local mode
            />

            <ToolboxModal
                isOpen={toolboxOpen}
                onClose={() => setToolboxOpen(false)}
            />
        </div >
    );
}
