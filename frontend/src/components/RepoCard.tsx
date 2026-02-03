import type { SearchResult } from '../api/client';
import { formatCompactNumber } from '../utils/format';

interface RepoCardProps {
    repo: SearchResult;
    onClick: (repo: SearchResult) => void;
}

export function RepoCard({ repo, onClick }: RepoCardProps) {

    const getIcon = () => {
        switch (repo.repo_type) {
            case 'dataset': return '📊';
            case 'space': return '🚀';
            default: return '📦';
        }
    };

    const getTypeLabel = () => {
        switch (repo.repo_type) {
            case 'dataset': return 'Dataset';
            case 'space': return 'Space';
            default: return 'Model';
        }
    };

    // Extract task tag if available
    const taskTag = repo.tags.find(tag =>
        !tag.includes(':') &&
        ['text-generation', 'text-to-image', 'audio-classification', 'computer-vision', 'multimodal'].includes(tag)
    );

    return (
        <div
            onClick={() => onClick(repo)}
            className="group relative p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl cursor-pointer transition-all duration-300 hover:border-[var(--color-primary)] hover:shadow-lg hover:shadow-[var(--color-primary)]/5 active:scale-[0.98] overflow-hidden"
        >
            {/* Type Badge - Top Right */}
            <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2 py-0.5 bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-full text-[10px] uppercase font-bold text-[var(--color-text-muted)] group-hover:text-[var(--color-primary)] transition-colors">
                <span>{getIcon()}</span>
                <span>{getTypeLabel()}</span>
            </div>

            {/* Author Section */}
            <div className="flex items-center gap-2 mb-3">
                {repo.avatar_url ? (
                    <img
                        src={repo.avatar_url}
                        alt={repo.author || 'Author'}
                        className="w-6 h-6 rounded-md border border-[var(--color-border)] object-cover"
                    />
                ) : (
                    <div className="w-6 h-6 rounded-md bg-gradient-to-br from-[var(--color-primary)]/10 to-[var(--color-primary)]/20 flex items-center justify-center text-[10px] font-bold text-[var(--color-primary)] border border-[var(--color-primary)]/20 uppercase">
                        {repo.author?.[0] || 'H'}
                    </div>
                )}
                <span className="text-xs text-[var(--color-text-muted)] truncate max-w-[120px]">
                    {repo.author || 'official'}
                </span>
            </div>

            {/* Title */}
            <h4 className="font-bold text-[var(--color-text)] mb-2 truncate group-hover:text-[var(--color-primary)] transition-colors" title={repo.id}>
                {repo.name}
            </h4>

            {/* Meta Tags */}
            <div className="flex flex-wrap gap-2 mb-4">
                {taskTag && (
                    <span className="px-2 py-0.5 bg-[var(--color-primary)]/10 text-[var(--color-primary)] text-[10px] font-medium rounded-md">
                        {taskTag.replace('-', ' ')}
                    </span>
                )}
            </div>

            {/* Footer Metrics */}
            <div className="flex items-center gap-4 text-[var(--color-text-muted)] border-t border-[var(--color-border)] pt-3 group-hover:border-[var(--color-primary)]/10 transition-colors">
                <div className="flex items-center gap-1">
                    <span className="text-xs opacity-60">📥</span>
                    <span className="text-xs font-medium">{formatCompactNumber(repo.downloads)}</span>
                </div>
                <div className="flex items-center gap-1">
                    <span className="text-xs opacity-60">❤️</span>
                    <span className="text-xs font-medium">{formatCompactNumber(repo.likes)}</span>
                </div>

                {repo.last_modified && (
                    <div className="ml-auto flex items-center gap-1">
                        <span className="text-[10px] opacity-40">🕒</span>
                        <span className="text-[10px]">{new Date(repo.last_modified).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                    </div>
                )}
            </div>

            {/* Hover Glow Effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-[var(--color-primary)]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
        </div>
    );
}
