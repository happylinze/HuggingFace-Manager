import { useState, useEffect } from 'react';
import { getCommits, type Commit } from '../api/client';

interface ManageGitOpsProps {
    repoId: string;
    repoType: string;
}

export function ManageGitOps({ repoId, repoType }: ManageGitOpsProps) {
    const [commits, setCommits] = useState<Commit[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        loadCommits();
    }, [repoId, repoType]);

    const loadCommits = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await getCommits(repoId, repoType);
            setCommits(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load commits');
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="text-center py-8 text-[var(--color-text-muted)]">Loading commit history...</div>;
    if (error) return <div className="text-red-500 p-4 bg-red-500/10 rounded-lg border border-red-500/20">{error}</div>;

    return (
        <div className="space-y-4 animate-fade-in">
            <h3 className="text-lg font-bold text-[var(--color-text)] flex items-center justify-between">
                Commit History
                <span className="text-xs font-normal text-[var(--color-text-muted)] bg-[var(--color-surface)] px-2 py-1 rounded">Latest 20</span>
            </h3>

            <div className="border border-[var(--color-border)] rounded-xl bg-[var(--color-background)] overflow-hidden">
                {commits.length === 0 ? (
                    <div className="p-8 text-center text-[var(--color-text-muted)]">No commits found.</div>
                ) : (
                    <div className="divide-y divide-[var(--color-border)]">
                        {commits.map((commit) => (
                            <div key={commit.commit_id} className="p-4 hover:bg-[var(--color-surface-hover)] transition-colors">
                                <div className="flex justify-between items-start mb-1">
                                    <h4 className="font-semibold text-[var(--color-text)] text-sm line-clamp-1" title={commit.summary}>
                                        {commit.summary}
                                    </h4>
                                    <span className="text-xs font-mono text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                                        {commit.commit_id.substring(0, 7)}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center text-xs text-[var(--color-text-muted)] mt-2">
                                    <div className="flex items-center gap-2">
                                        <span className="font-medium text-[var(--color-text-muted)]">
                                            {commit.authors[0] || 'Unknown'}
                                        </span>
                                    </div>
                                    <time dateTime={commit.date}>
                                        {new Date(commit.date).toLocaleString()}
                                    </time>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
