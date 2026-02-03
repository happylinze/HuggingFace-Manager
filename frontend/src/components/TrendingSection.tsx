import { useState, useEffect } from 'react';
import type { SearchResult } from '../api/client';
import { getTrendingRepos } from '../api/client';
import { RepoCard } from './RepoCard';
import { useLanguage } from '../contexts/LanguageContext';

interface TrendingSectionProps {
    type: 'model' | 'dataset';
    onRepoClick: (repo: SearchResult) => void;
}

export function TrendingSection({ type, onRepoClick }: TrendingSectionProps) {
    const { t } = useLanguage();
    const [repos, setRepos] = useState<SearchResult[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        fetchTrending(false);
    }, [type]);

    const fetchTrending = async (force: boolean) => {
        setIsLoading(true);
        try {
            const results = await getTrendingRepos(type, force);
            setRepos(results);
        } catch (error) {
            console.error('Failed to fetch trending repos:', error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="mt-8 animate-fade-in">
            {/* Header & Tabs */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-2">
                    <span className="text-xl">🔥</span>
                    <h3 className="text-lg font-bold text-[var(--color-text)]">
                        {type === 'model' ? t('search.sort.trendingModels') : t('search.sort.trendingDatasets')}
                    </h3>
                    <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded text-[10px] text-[var(--color-text-muted)] font-medium">
                            {t('search.sort.last7Days')}
                        </span>
                        <button
                            onClick={() => fetchTrending(true)}
                            className="p-1 hover:bg-[var(--color-surface-hover)] rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors"
                            title={t('common.refresh') || "Refresh"}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={isLoading ? "animate-spin" : ""}>
                                <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3" />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>

            {/* Content Grid */}
            {isLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {[...Array(8)].map((_, i) => (
                        <div key={i} className="h-40 bg-[var(--color-surface-hover)]/30 rounded-xl animate-pulse border border-[var(--color-border)]/50" />
                    ))}
                </div>
            ) : repos.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {repos.map((repo) => (
                        <RepoCard
                            key={repo.id}
                            repo={repo}
                            onClick={onRepoClick}
                        />
                    ))}
                </div>
            ) : (
                <div className="text-center py-12 bg-[var(--color-surface)]/30 rounded-2xl border border-dashed border-[var(--color-border)]">
                    <p className="text-[var(--color-text-muted)] text-sm">
                        {t('common.noResults') || 'No results found'}
                    </p>
                </div>
            )}
        </div>
    );
}
