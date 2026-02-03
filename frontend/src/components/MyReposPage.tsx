import { useState, useEffect } from 'react';
import { searchRepos, getUserInfo, checkLocalStatus, getLocalRepos, openPath, getSettings, type SearchResult, type UserInfo, type RepoStatusResponse } from '../api/client';
import { RepoDetails } from './RepoDetails';
import { CreateRepoModal } from './CreateRepoModal';
import { ImportRepoModal } from './ImportRepoModal';
import { formatCompactNumber } from '../utils/format';
import { useLanguage } from '../contexts/LanguageContext';
import { useConfirm } from '../contexts/ConfirmContext';
import { setDebugContext } from './DebugPanel';
const CACHE_KEY = 'hf_my_repos_cache';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function MyReposPage() {
    const { t } = useLanguage();
    const { confirm } = useConfirm();

    // Initial state from cache if available
    const [user, setUser] = useState<UserInfo | null>(() => {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
            const { user: cachedUser, timestamp } = JSON.parse(cached);
            if (Date.now() - timestamp < CACHE_TTL) return cachedUser;
        }
        return null;
    });
    const [repos, setRepos] = useState<SearchResult[]>(() => {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
            const { repos: cachedRepos, timestamp } = JSON.parse(cached);
            if (Date.now() - timestamp < CACHE_TTL) return cachedRepos;
        }
        return [];
    });

    const [localStatus, setLocalStatus] = useState<Record<string, RepoStatusResponse>>({});
    const [loading, setLoading] = useState(!user); // Don't show loading if we have cached user
    const [error, setError] = useState<string | null>(null);

    // Modals State
    const [createModal, setCreateModal] = useState<{ isOpen: boolean, type: 'model' | 'dataset' | 'space' }>({
        isOpen: false, type: 'model'
    });
    const [detailsModal, setDetailsModal] = useState<{ isOpen: boolean, repoId: string, repoType: string, initialTab: 'readme' | 'files' | 'manage' }>({
        isOpen: false, repoId: '', repoType: 'model', initialTab: 'readme'
    });
    const [importModal, setImportModal] = useState(false);

    const [tokenConfigured, setTokenConfigured] = useState(false);

    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => {
        // Check if token is configured separately
        getSettings().then(s => setTokenConfigured(s.token_configured)).catch(() => { });
        loadUserAndRepos();

        // Listen for storage changes (Cross-tab sync)
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === CACHE_KEY) {
                if (e.newValue === null) {
                    // Cache cleared (Logout in another tab)
                    setUser(null);
                    setRepos([]);
                    setError(null);
                } else {
                    // Cache updated (Switch account in another tab)
                    const { user: newUser, repos: newRepos } = JSON.parse(e.newValue);
                    setUser(newUser);
                    setRepos(newRepos);
                    checkLocalStatusForRepos(newRepos);
                }
            }
        };

        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, []);

    // Debug Watcher
    useEffect(() => {
        setDebugContext('MY-REPOS', {
            user: user?.username,
            reposCount: repos.length,
            localStatusCount: Object.keys(localStatus).length,
            loading,
            error,
            tokenConfigured,
            refreshing
        });
    }, [user, repos.length, localStatus, loading, error, tokenConfigured, refreshing]);

    const loadUserAndRepos = async (forceRefresh = false) => {
        if (forceRefresh) {
            setRefreshing(true);
        } else {
            // Check cache BEFORE setting loading state if we haven't already
            const cached = localStorage.getItem(CACHE_KEY);
            if (cached) {
                const { user: cachedUser, repos: cachedRepos, timestamp } = JSON.parse(cached);
                if (Date.now() - timestamp < CACHE_TTL) {
                    setUser(cachedUser);
                    setRepos(cachedRepos);
                    checkLocalStatusForRepos(cachedRepos);
                    setLoading(false);
                    return;
                }
            }
            setLoading(true);
        }
        setError(null);

        try {
            // 1. Double check cache logic inside try to keep it robust
            if (!forceRefresh) {
                const cached = localStorage.getItem(CACHE_KEY);
                if (cached) {
                    const { user: cachedUser, repos: cachedRepos, timestamp } = JSON.parse(cached);
                    if (Date.now() - timestamp < CACHE_TTL) {
                        setUser(cachedUser);
                        setRepos(cachedRepos);
                        await checkLocalStatusForRepos(cachedRepos);
                        setLoading(false);
                        return;
                    }
                }
            }

            // 2. Fetch User Info (Online)
            let userInfo: UserInfo | null = null;
            let onlineError: any = null;

            try {
                userInfo = await getUserInfo();
                setUser(userInfo);
            } catch (err: any) {
                console.warn("User info fetch failed:", err);
                onlineError = err;
            }

            let finalRepos: SearchResult[] = [];
            let isOffline = !!onlineError;

            // 3. If Online, fetch remote repos
            if (userInfo && userInfo.username && !onlineError) {
                try {
                    const [myModels, myDatasets] = await Promise.all([
                        searchRepos(`author:${userInfo.username}`, 'model', 'lastModified'),
                        searchRepos(`author:${userInfo.username}`, 'dataset', 'lastModified')
                    ]);

                    finalRepos = [...myModels.map(r => ({ ...r, type: 'model' })), ...myDatasets.map(r => ({ ...r, type: 'dataset' }))]
                        .sort((a, b) => new Date(b.last_modified).getTime() - new Date(a.last_modified).getTime());

                    // Save to cache
                    localStorage.setItem(CACHE_KEY, JSON.stringify({
                        user: userInfo,
                        repos: finalRepos,
                        timestamp: Date.now()
                    }));

                } catch (err: any) {
                    console.error("Online search failed:", err);
                    onlineError = err;
                    isOffline = true;
                }
            } else {
                isOffline = true;
            }

            // 4. Fallback: If offline or failed, try Local Cache
            if (isOffline) {
                try {
                    const localReposResp = await getLocalRepos();
                    if (localReposResp.length > 0) {
                        const localSearchResults: SearchResult[] = localReposResp.map(r => ({
                            id: r.repo_id,
                            name: r.repo_id.split('/').pop() || r.repo_id,
                            author: r.repo_id.split('/')[0] || 'Local',
                            last_modified: r.last_modified || new Date().toISOString(),
                            downloads: 0,
                            likes: 0,
                            tags: [],
                            repo_type: (r as any).repo_type || 'model',
                            private: false
                        }));

                        finalRepos = localSearchResults;
                        // Specific error message
                        const errorMsg = onlineError ? (onlineError.message || 'Connection Failed') : 'Not Logged In';
                        setError(`Offline Mode (${errorMsg}) - Showing local files`);
                    } else {
                        // No local files either
                        throw onlineError || new Error("Not logged in and no local repositories found");
                    }
                } catch (localErr: any) {
                    // Both failed
                    throw onlineError || localErr;
                }
            }

            setRepos(finalRepos);

            // 5. Check Local Status (Update map)
            await checkLocalStatusForRepos(finalRepos);

        } catch (err: any) {
            setError(err.message || 'Failed to load repositories');
            console.error(err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const checkLocalStatusForRepos = async (currentRepos: SearchResult[]) => {
        if (currentRepos.length > 0) {
            const statusMap = await checkLocalStatus(currentRepos.map(r => ({
                repo_id: r.id,
                repo_type: (r as any).type
            })));
            setLocalStatus(statusMap);
        }
    };

    const handleOpenDetails = (repoId: string, repoType: string) => {
        setDetailsModal({ isOpen: true, repoId, repoType, initialTab: 'readme' });
    };

    const handleOpenFolder = async (path: string, e: React.MouseEvent) => {
        e.stopPropagation();
        await openPath(path);
    };

    const handleManage = (e: React.MouseEvent, repoId: string, repoType: string) => {
        e.stopPropagation();
        setDetailsModal({ isOpen: true, repoId, repoType, initialTab: 'manage' });
    };

    const handleUpload = (e: React.MouseEvent, repoId: string, repoType: string) => {
        e.stopPropagation();
        setDetailsModal({ isOpen: true, repoId, repoType, initialTab: 'manage' });
    };

    const openExternal = (url: string) => {
        window.open(url, '_blank');
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-[var(--color-text-muted)]">
                <div className="w-8 h-8 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin mb-4"></div>
                {t('common.loading')}
            </div>
        );
    }

    // If we have repos (offline mode), show them even if !user
    if ((!user || !user.username) && repos.length === 0) {
        if (tokenConfigured) {
            return (
                <div className="flex flex-col items-center justify-center h-64 text-[var(--color-text-muted)]">
                    <div className="text-4xl mb-4">⚠️</div>
                    <p className="text-lg font-medium mb-2">{t('myRepos.connectionFailed')}</p>
                    <p className="text-sm text-center max-w-md">
                        {t('myRepos.connectionFailedDesc')}
                    </p>
                    <button
                        onClick={() => loadUserAndRepos()}
                        className="mt-4 px-4 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white rounded-lg font-medium transition-colors"
                    >
                        {t('myRepos.retryConnection')}
                    </button>
                </div>
            );
        }

        return (
            <div className="flex flex-col items-center justify-center h-64 text-[var(--color-text-muted)]">
                <p className="text-lg font-medium mb-2">{t('myRepos.notLoggedIn')}</p>
                <p className="text-sm">{t('myRepos.notLoggedInDesc')}</p>
                <button
                    onClick={() => loadUserAndRepos()}
                    className="mt-4 px-4 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white rounded-lg font-medium transition-colors"
                >
                    {t('myRepos.retryCheck')}
                </button>
            </div>
        );
    }

    return (
        <div className="animate-fade-in p-0 max-w-6xl mx-auto space-y-6">

            {/* Header / Profile Card */}
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden group">
                {/* Background Decor */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>

                <div className="flex items-center gap-5 z-10 w-full md:w-auto">
                    {user && user.avatar_url ? (
                        <img src={user.avatar_url} alt={user.username || 'User'} className="w-20 h-20 rounded-full border-4 border-[var(--color-surface-hover)] shadow-xl" />
                    ) : (
                        <div className="w-20 h-20 rounded-full bg-[var(--color-surface-hover)] flex items-center justify-center text-3xl">
                            {user ? '👤' : '📡'}
                        </div>
                    )}
                    <div>
                        <h2 className="text-2xl font-bold text-[var(--color-text)] flex items-center gap-2">
                            {user && user.username ? (user.fullname || user.username) : 'Offline Mode'}
                            {user && user.is_pro && <span className="px-1.5 py-0.5 bg-yellow-500/10 text-yellow-400 text-[10px] border border-yellow-500/20 rounded uppercase font-bold tracking-wider">PRO</span>}
                            {user && user.username && (
                                <a
                                    href={`https://huggingface.co/${user.username}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-[var(--color-surface-hover)] rounded ml-1 text-[var(--color-text-muted)] hover:text-[var(--color-primary)] text-sm"
                                    title="Open Hugging Face Profile"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    🔗
                                </a>
                            )}
                        </h2>
                        <p className="text-[var(--color-text-muted)] text-sm font-mono">{user && user.username ? `@${user.username}` : 'Local Repository View'}</p>

                        {/* Status Indicator with integrated Refresh */}
                        <div className="flex items-center gap-4 mt-3 text-xs text-[var(--color-text-muted)]">
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => loadUserAndRepos(true)}
                                    disabled={refreshing}
                                    className="p-1.5 rounded-full hover:bg-[var(--color-surface-hover)] transition-all cursor-pointer group relative"
                                    title={t('myRepos.refreshStatus')}
                                >
                                    <div className={`w-2 h-2 rounded-full ${error ? 'bg-red-500' : 'bg-[var(--color-success)]'} ${refreshing ? 'animate-ping' : ''}`}></div>
                                </button>
                                <span className={error ? 'text-red-400' : 'text-[var(--color-text-muted)]'} title={error || ''}>
                                    {refreshing ? t('common.loading') : error ? `Offline: ${error}` : t('myRepos.accountStatus') + ': Active'}
                                </span>
                            </div>

                            <div className="flex items-center gap-1.5 border-l border-[var(--color-border)] pl-4">
                                <span>{user ? `${t('myRepos.plan')}: ${user.is_pro ? 'Pro' : 'Free'}` : 'Local Access'}</span>
                            </div>
                        </div>

                        {/* User Statistics */}
                        {user && repos.length > 0 && (
                            <div className="flex flex-wrap items-center gap-4 mt-4 pt-3 border-t border-[var(--color-border)]/50">
                                <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-text)]" title="Total Downloads">
                                    <span className="text-blue-400">⬇️</span>
                                    {formatCompactNumber(repos.reduce((acc, r) => acc + (r.downloads || 0), 0))}
                                </div>
                                <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-text)]" title="Total Likes">
                                    <span className="text-red-400">❤️</span>
                                    {formatCompactNumber(repos.reduce((acc, r) => acc + (r.likes || 0), 0))}
                                </div>
                                <div className="w-px h-3 bg-[var(--color-border)]"></div>
                                <div className="flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
                                    <span title="Models">📦 {repos.filter(r => (r as any).type === 'model').length}</span>
                                    <span title="Datasets">📊 {repos.filter(r => (r as any).type === 'dataset').length}</span>
                                    <span title="Spaces">🚀 {repos.filter(r => (r as any).type === 'space').length}</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Create Actions - Only show if online */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 w-full md:w-auto z-10">
                    {user && user.username && (
                        <>
                            <button
                                onClick={() => setCreateModal({ isOpen: true, type: 'model' })}
                                className="px-4 py-3 bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)] border border-[var(--color-border)] hover:border-[var(--color-primary)]/50 rounded-xl transition-all group text-left shadow-sm"
                            >
                                <div className="text-indigo-400 mb-1 group-hover:scale-110 transition-transform origin-left">📦</div>
                                <div className="text-xs text-[var(--color-text-muted)] font-medium">{t('myRepos.newModel')}</div>
                            </button>
                            <button
                                onClick={() => setCreateModal({ isOpen: true, type: 'dataset' })}
                                className="px-4 py-3 bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)] border border-[var(--color-border)] hover:border-red-500/50 rounded-xl transition-all group text-left shadow-sm"
                            >
                                <div className="text-red-400 mb-1 group-hover:scale-110 transition-transform origin-left">📊</div>
                                <div className="text-xs text-[var(--color-text-muted)] font-medium">{t('myRepos.newDataset')}</div>
                            </button>
                            <button
                                onClick={() => setCreateModal({ isOpen: true, type: 'space' })}
                                className="px-4 py-3 bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)] border border-[var(--color-border)] hover:border-blue-500/50 rounded-xl transition-all group text-left shadow-sm"
                            >
                                <div className="text-blue-400 mb-1 group-hover:scale-110 transition-transform origin-left">🚀</div>
                                <div className="text-xs text-[var(--color-text-muted)] font-medium">{t('myRepos.newSpace')}</div>
                            </button>
                        </>
                    )}
                    {user && user.username && (
                        <button
                            onClick={() => openExternal(`https://huggingface.co/collections/${user.username}/new`)}
                            className="px-4 py-3 bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)] border border-[var(--color-border)] hover:border-purple-500/50 rounded-xl transition-all group text-left shadow-sm"
                        >
                            <div className="text-purple-400 mb-1 group-hover:scale-110 transition-transform origin-left">📚</div>
                            <div className="text-xs text-[var(--color-text-muted)] font-medium">{t('myRepos.newCollection')}</div>
                        </button>
                    )}
                    <button
                        onClick={() => setImportModal(true)}
                        className="px-4 py-3 bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)] border border-[var(--color-border)] hover:border-yellow-500/50 rounded-xl transition-all group text-left shadow-sm"
                    >
                        <div className="text-yellow-400 mb-1 group-hover:scale-110 transition-transform origin-left">⚡</div>
                        <div className="text-xs text-[var(--color-text-muted)] font-medium">{t('import.title')}</div>
                    </button>
                </div>
            </div>

            {/* Repos Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {repos.map((repo) => {
                    const status = localStatus[repo.id];
                    const isLocal = status?.downloaded;

                    return (
                        <div
                            key={repo.id}
                            onClick={() => handleOpenDetails(repo.id, (repo as any).type)}
                            className="bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-primary)]/50 rounded-xl overflow-hidden cursor-pointer group transition-all hover:bg-[var(--color-surface-hover)] hover:shadow-lg hover:shadow-indigo-500/10 flex flex-col"
                        >
                            <div className="p-5 flex-1">
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xl">
                                            {(repo as any).type === 'model' ? '📦' : (repo as any).type === 'dataset' ? '📊' : '🚀'}
                                        </span>
                                        {(!user || !user.username) && (
                                            <span className="bg-yellow-500/10 text-yellow-500 text-[10px] px-1.5 py-0.5 rounded border border-yellow-500/20 uppercase font-bold tracking-tight">
                                                {t('myRepos.localCache') || "Local Cache"}
                                            </span>
                                        )}
                                        {repo.private && (
                                            <span className="bg-[var(--color-background)] text-[var(--color-text-muted)] text-[10px] px-1.5 py-0.5 rounded border border-[var(--color-border)]">
                                                {t('myRepos.private')}
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-xs text-[var(--color-text-muted)] font-mono">
                                        {new Date(repo.last_modified).toLocaleDateString()}
                                    </div>
                                </div>

                                <h3 className="text-lg font-bold text-[var(--color-text)] mb-1 group-hover:text-[var(--color-primary)] transition-colors truncate" title={repo.id}>
                                    {repo.id.split('/')[1]}
                                </h3>
                                <p className="text-[var(--color-text-muted)] text-xs font-mono mb-4">{repo.id}</p>

                                <div className="flex items-center gap-4 text-xs text-[var(--color-text-muted)]">
                                    <span className="flex items-center gap-1">
                                        ⬇️ {formatCompactNumber(repo.downloads)}
                                    </span>
                                    <span className="flex items-center gap-1">
                                        ❤️ {formatCompactNumber(repo.likes)}
                                    </span>
                                </div>
                            </div>

                            {/* Smart Sync Footer */}
                            <div className="px-5 py-3 bg-[var(--color-surface)]/50 border-t border-[var(--color-border)]/50 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    {isLocal ? (
                                        <>
                                            <div className="w-2 h-2 rounded-full bg-[var(--color-success)] shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                                            <span className="text-xs text-[var(--color-success)] font-medium">{t('myRepos.downloaded')}</span>
                                            {status.size_on_disk && status.size_on_disk > 0 && (
                                                <span className="text-[10px] text-[var(--color-text-muted)] ml-1">
                                                    {(status.size_on_disk / 1024 / 1024).toFixed(1)} MB
                                                </span>
                                            )}
                                        </>
                                    ) : (
                                        <>
                                            <div className="w-2 h-2 rounded-full bg-[var(--color-text-muted)]"></div>
                                            <span className="text-xs text-[var(--color-text-muted)]">{t('myRepos.cloudOnly')}</span>
                                        </>
                                    )}
                                </div>

                                <div className="flex items-center gap-2">
                                    {/* Upload Button */}
                                    <button
                                        onClick={(e) => handleUpload(e, repo.id, (repo as any).type)}
                                        className="text-xs font-bold text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 px-2 py-1.5 rounded-lg transition-colors flex items-center gap-1 border border-[var(--color-primary)]/20"
                                        title="Upload Files"
                                    >
                                        📤
                                    </button>

                                    <button
                                        onClick={(e) => handleManage(e, repo.id, (repo as any).type)}
                                        className="text-xs font-bold text-white bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 shadow-sm hover:shadow-indigo-500/20"
                                    >
                                        ⚙️ {t('common.manage')}
                                    </button>
                                    {isLocal && status.path && (
                                        <button
                                            onClick={(e) => handleOpenFolder(status.path!, e)}
                                            className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] bg-[var(--color-surface-hover)] hover:bg-[var(--color-surface)] px-2 py-1 rounded transition-colors flex items-center gap-1 border border-[var(--color-border)]"
                                        >
                                            📂
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {
                repos.length === 0 && !error && (
                    <div className="text-center py-20 text-[var(--color-text-muted)]">
                        <div className="text-4xl mb-4">📭</div>
                        <p>{t('myRepos.noRepos')}</p>
                        <p className="text-sm mt-1">{t('myRepos.noReposDesc')}</p>
                    </div>
                )
            }

            <CreateRepoModal
                isOpen={createModal.isOpen}
                initialType={createModal.type}
                onClose={() => setCreateModal({ ...createModal, isOpen: false })}
                onSuccess={(url) => {
                    loadUserAndRepos(true); // Force refresh
                    confirm({
                        title: t('common.success'),
                        message: t('myRepos.createSuccess'),
                        confirmText: t('common.open'),
                        onConfirm: () => { window.open(url, '_blank'); }
                    });
                }}
            />

            <ImportRepoModal
                isOpen={importModal}
                onClose={() => setImportModal(false)}
                onSuccess={(url) => {
                    loadUserAndRepos(true);
                    confirm({
                        title: t('common.success'),
                        message: t('import.success'),
                        confirmText: t('common.open'),
                        onConfirm: () => { window.open(url, '_blank'); }
                    });
                }}
            />

            <RepoDetails
                isOpen={detailsModal.isOpen}
                onClose={() => setDetailsModal({ ...detailsModal, isOpen: false })}
                repoId={detailsModal.repoId}
                repoType={detailsModal.repoType}
                initialTab={detailsModal.initialTab}
                onDownload={() => { }}
            />
        </div >
    );
}
