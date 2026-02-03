import { useState, useEffect } from 'react';
import { getSpaceSecrets, addSpaceSecret, deleteSpaceSecret, getSpaceRuntime, restartSpace, type RuntimeStatus } from '../api/client';
import { useToast } from '../contexts/ToastContext';
import { useConfirm } from '../contexts/ConfirmContext';

interface ManageSpaceOpsProps {
    repoId: string;
}

export function ManageSpaceOps({ repoId }: ManageSpaceOpsProps) {
    const { success, error: toastError } = useToast();
    const { confirm } = useConfirm();
    const [secrets, setSecrets] = useState<string[]>([]);
    const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
    const [loading, setLoading] = useState(false);

    // Form State
    const [newKey, setNewKey] = useState('');
    const [newValue, setNewValue] = useState('');
    const [adding, setAdding] = useState(false);

    useEffect(() => {
        loadData();
    }, [repoId]);

    const loadData = async () => {
        setLoading(true);
        try {
            const [secretsData, runtimeData] = await Promise.all([
                getSpaceSecrets(repoId),
                getSpaceRuntime(repoId)
            ]);
            setSecrets(secretsData);
            setRuntime(runtimeData);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleAddSecret = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newKey || !newValue) return;

        setAdding(true);
        try {
            await addSpaceSecret(repoId, newKey, newValue);
            setNewKey('');
            setNewValue('');
            loadData(); // Reload list
        } catch (err) {
            toastError('Failed to add secret: ' + err);
        } finally {
            setAdding(false);
        }
    };

    const handleDeleteSecret = async (key: string) => {
        confirm({
            title: 'Delete Secret',
            message: `Delete secret ${key}?`,
            isDestructive: true,
            onConfirm: async () => {
                try {
                    await deleteSpaceSecret(repoId, key);
                    setSecrets(prev => prev.filter(k => k !== key));
                    success('Secret deleted');
                } catch (err) {
                    toastError('Failed to delete secret: ' + err);
                }
            }
        });
    };

    const handleRestart = async (factory: boolean) => {
        confirm({
            title: factory ? 'Factory Reboot' : 'Restart Space',
            message: factory ? "Factory Reboot? This will clear all changes." : "Restart Space?",
            isDestructive: factory,
            onConfirm: async () => {
                try {
                    await restartSpace(repoId, factory);
                    success('Restart command sent.');
                    loadData();
                } catch (err) {
                    toastError('Restart failed: ' + err);
                }
            }
        });
    };

    return (
        <div className="space-y-6 animate-fade-in text-white">
            {/* Runtime Status */}
            <div className="bg-[var(--color-surface)]/50 p-4 rounded-xl border border-[var(--color-border)]">
                <h3 className="font-bold mb-3 flex items-center gap-2">
                    🚀 Runtime
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${runtime?.stage === 'RUNNING' ? 'bg-green-500/20 text-green-400 border-green-500/30' :
                        runtime?.stage === 'BUILDING' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' :
                            'bg-[var(--color-surface)] text-[var(--color-text-muted)] border-[var(--color-border)]'
                        }`}>
                        {runtime?.stage || 'UNKNOWN'}
                    </span>
                </h3>

                <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                        <span className="text-slate-400">Hardware:</span>
                        <div className="font-mono text-slate-200">{runtime?.hardware?.current || 'CPU Basic'}</div>
                    </div>
                    <div className="flex gap-2 justify-end items-center">
                        <button
                            onClick={() => handleRestart(false)}
                            className="bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 rounded text-xs font-bold transition-colors"
                        >
                            Restart
                        </button>
                        <button
                            onClick={() => handleRestart(true)}
                            className="bg-[var(--color-surface-hover)] hover:bg-red-500/20 hover:text-red-500 px-3 py-1.5 rounded text-xs font-bold transition-colors"
                        >
                            Factory Reboot
                        </button>
                    </div>
                </div>
            </div>

            {/* Secrets */}
            <div className="space-y-4">
                <h3 className="font-bold flex justify-between items-center">
                    🔑 Secrets (Environment Variables)
                </h3>

                {/* List */}
                <div className="space-y-2">
                    {secrets.map(key => (
                        <div key={key} className="flex justify-between items-center bg-[#0f121a] border border-slate-800 p-3 rounded-lg">
                            <span className="font-mono text-sm text-yellow-500/90">{key}</span>
                            <button
                                onClick={() => handleDeleteSecret(key)}
                                className="text-slate-500 hover:text-red-400 transition-colors"
                            >
                                🗑️
                            </button>
                        </div>
                    ))}
                    {secrets.length === 0 && !loading && (
                        <div className="text-slate-500 text-sm text-center py-2">No secrets configured</div>
                    )}
                </div>

                {/* Add Form */}
                <form onSubmit={handleAddSecret} className="bg-[var(--color-surface)]/30 p-3 rounded-xl border border-dashed border-[var(--color-border)] space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                        <input
                            type="text"
                            placeholder="Key (e.g. OPENAI_API_KEY)"
                            value={newKey}
                            onChange={e => setNewKey(e.target.value)}
                            className="bg-[#0b0f19] border border-slate-700 rounded px-2 py-1.5 text-sm text-white focus:border-indigo-500 outline-none"
                        />
                        <input
                            type="password"
                            placeholder="Value"
                            value={newValue}
                            onChange={e => setNewValue(e.target.value)}
                            className="bg-[#0b0f19] border border-slate-700 rounded px-2 py-1.5 text-sm text-white focus:border-indigo-500 outline-none"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={adding || !newKey || !newValue}
                        className="w-full bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30 py-1.5 rounded text-sm font-bold transition-colors disabled:opacity-50"
                    >
                        {adding ? 'Adding...' : '+ Add Secret'}
                    </button>
                </form>
            </div>
        </div>
    );
}
