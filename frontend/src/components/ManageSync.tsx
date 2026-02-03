import { useState, useEffect } from 'react';
import { getSyncStatus, pullRepo, pushRepo, type SyncStatus } from '../api/client';
import { useToast } from '../contexts/ToastContext';

interface ManageSyncProps {
    repoId: string;
    repoType: string;
    defaultPath: string; // Typically download_dir/repo_id
}

export function ManageSync({ repoId, repoType, defaultPath }: ManageSyncProps) {
    const { info: _toastInfo, error: toastError } = useToast();
    const [status, setStatus] = useState<SyncStatus | null>(null);
    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [message, setMessage] = useState('');

    // Push commit message
    const [commitMsg, setCommitMsg] = useState('');

    useEffect(() => {
        checkStatus();
    }, [repoId, defaultPath]);

    const checkStatus = async () => {
        setLoading(true);
        try {
            const data = await getSyncStatus(repoId, repoType, defaultPath);
            setStatus(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handlePull = async (force: boolean = false) => {
        setActionLoading(true);
        setMessage(force ? 'Force updating local workspace...' : 'Downloading updates...');
        try {
            await pullRepo(repoId, repoType, defaultPath, force);
            setMessage(force ? 'Workspace reset to remote state!' : 'Update complete!');
            await checkStatus();
        } catch (err) {
            setMessage('Update failed: ' + (err as Error).message);
        } finally {
            setActionLoading(false);
        }
    };

    const handlePush = async (force: boolean = false) => {
        if (!commitMsg) {
            toastError("Please enter a commit message");
            return;
        }
        setActionLoading(true);
        setMessage(force ? 'Force pushing changes (overwriting remote)...' : 'Pushing changes...');
        try {
            await pushRepo(repoId, repoType, defaultPath, commitMsg, force);
            setMessage(force ? 'Remote overwritten successfully!' : 'Push complete!');
            setCommitMsg('');
            await checkStatus();
        } catch (err) {
            setMessage('Push failed: ' + (err as Error).message);
        } finally {
            setActionLoading(false);
        }
    };

    if (loading && !status) return <div className="text-center py-8 text-slate-400">Checking sync status...</div>;

    // State: Not a workspace (Folder doesn't exist or not managed)
    if (!status?.is_workspace) {
        return (
            <div className="text-center py-8 space-y-4 animate-fade-in">
                <div className="text-6xl mb-2">☁️</div>
                <h3 className="text-xl font-bold text-white">Cloud Only</h3>
                <p className="text-slate-400 max-w-sm mx-auto">
                    This repository is currently only in the standard cache.
                    To edit files and sync changes, you need to create a <strong>Writable Workspace</strong>.
                </p>
                <div className="bg-[var(--color-surface)] p-3 rounded-lg text-xs font-mono text-[var(--color-text-muted)] mb-4 inline-block">
                    Target: {defaultPath}
                </div>
                <div>
                    <button
                        onClick={() => handlePull(false)}
                        disabled={actionLoading}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 rounded-xl font-bold transition-all shadow-lg hover:shadow-indigo-500/20 disabled:opacity-50"
                    >
                        {actionLoading ? 'Initializing...' : '📥 Clone to Workspace'}
                    </button>
                    {message && <div className="mt-2 text-sm text-indigo-300">{message}</div>}
                </div>
            </div>
        );
    }

    // State: Workspace Active
    const isOutOfSync = status.sync_status === 'conflict' || status.sync_status === 'out_of_sync';

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Status Card */}
            <div className={`p-5 rounded-2xl border ${status.sync_status === 'synced' ? 'bg-green-500/10 border-green-500/20' :
                isOutOfSync ? 'bg-amber-500/10 border-amber-500/20' :
                    'bg-blue-500/10 border-blue-500/20'
                }`}>
                <div className="flex justify-between items-start">
                    <div>
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            {status.sync_status === 'synced' ? '✅ Synced' :
                                status.sync_status === 'unknown' ? '❓ Unknown' :
                                    isOutOfSync ? '⚠️ Out of Sync' :
                                        '⚠️ Changes Detected'}
                        </h3>
                        <p className="text-sm text-slate-400 mt-1">
                            Local Workspace: <span className="font-mono text-xs">{defaultPath}</span>
                        </p>
                    </div>
                    <div className="text-right text-xs font-mono text-slate-500 space-y-1">
                        <div>Local: {status.local_commit?.substring(0, 7) || 'HEAD'}</div>
                        <div>Remote: {status.remote_commit?.substring(0, 7) || 'HEAD'}</div>
                    </div>
                </div>

                {isOutOfSync && (
                    <div className="mt-4 p-3 bg-[var(--color-surface-hover)] rounded-xl border border-[var(--color-border)] flex flex-col gap-3">
                        <div className="text-xs text-amber-400 flex items-center gap-2">
                            <span>🛑</span>
                            <span>检测到版本不一致或冲突。请选择您的处理方式：</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                onClick={() => handlePull(true)}
                                disabled={actionLoading}
                                className="px-3 py-2 bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)] text-[var(--color-text)] rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2"
                                title="丢弃本地修改，强制同步云端代码"
                            >
                                📥 使用云端覆盖本地
                            </button>
                            <button
                                onClick={() => handlePush(true)}
                                disabled={actionLoading}
                                className="px-3 py-2 bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 border border-amber-500/30 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2"
                                title="强制将本地代码推送到云端（可能覆盖他人提交）"
                            >
                                📤 强制推送本地到云端
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Actions Grid */}
            <div className={`grid grid-cols-2 gap-4 ${isOutOfSync ? 'opacity-50 pointer-events-none' : ''}`}>
                {/* Pull Action */}
                <div className="bg-[var(--color-background)]/30 p-4 rounded-xl border border-[var(--color-border)] hover:border-[var(--color-primary)]/30 transition-colors">
                    <h4 className="font-bold text-slate-200 mb-2">⬇️ Pull Updates</h4>
                    <p className="text-xs text-slate-400 mb-4 h-8">
                        Download latest changes from Hugging Face.
                    </p>
                    <button
                        onClick={() => handlePull(false)}
                        disabled={actionLoading}
                        className="w-full bg-[var(--color-surface-hover)] hover:bg-[var(--color-surface)] text-[var(--color-text)] py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                    >
                        {actionLoading ? 'Pulling...' : 'Pull'}
                    </button>
                </div>

                {/* Push Action */}
                <div className="bg-[var(--color-background)]/30 p-4 rounded-xl border border-[var(--color-border)] hover:border-[var(--color-primary)]/30 transition-colors">
                    <h4 className="font-bold text-slate-200 mb-2">⬆️ Push Changes</h4>
                    <p className="text-xs text-slate-400 mb-2">
                        Upload your local edits to Hugging Face.
                    </p>
                    <div className="space-y-2">
                        <input
                            type="text"
                            placeholder="Commit message..."
                            value={commitMsg}
                            onChange={e => setCommitMsg(e.target.value)}
                            className="w-full bg-[#0b0f19] border border-slate-700 rounded px-2 py-1 text-xs text-white"
                        />
                        <button
                            onClick={() => handlePush(false)}
                            disabled={actionLoading}
                            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                        >
                            {actionLoading ? 'Pushing...' : 'Push'}
                        </button>
                    </div>
                </div>
            </div>

            {message && (
                <div className="p-3 bg-[var(--color-surface)] rounded-lg text-center text-sm text-[var(--color-text-muted)] animate-fade-in">
                    {message}
                </div>
            )}
        </div>
    );
}
