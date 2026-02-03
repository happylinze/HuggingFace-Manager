import { useState, useEffect } from 'react';
import { updateMetadata, getModelInfo, deleteRepo, updateVisibility, moveRepo, getSettings, type UpdateMetadataRequest } from '../api/client';
import { ManageGitOps } from './ManageGitOps';
import { Modal } from './Modal';
import { ManageSpaceOps } from './ManageSpaceOps';
import { ManageSync } from './ManageSync';
import { useLanguage } from '../contexts/LanguageContext';
import { useToast } from '../contexts/ToastContext';
import { useConfirm } from '../contexts/ConfirmContext';

interface MetadataEditorModalProps {
    isOpen: boolean;
    onClose: () => void;
    repoId: string;
    repoType: 'model' | 'dataset' | 'space';
    onSuccess?: () => void;
}

const LICENSES = [
    { value: "mit", label: "MIT" },
    { value: "apache-2.0", label: "Apache 2.0" },
    { value: "cc-by-4.0", label: "CC-BY 4.0" },
    { value: "cc-by-nc-4.0", label: "CC-BY-NC 4.0" },
    { value: "bsd-3-clause", label: "BSD 3-Clause" },
    { value: "mpl-2.0", label: "MPL 2.0" },
    { value: "unlicense", label: "Unlicense" },
    { value: "gpl-3.0", label: "GPL 3.0" },
    { value: "afl-3.0", label: "AFL 3.0" },
];

const PIPELINE_TAGS = [
    "text-generation", "text-classification", "token-classification", "question-answering",
    "summarization", "translation", "image-classification", "object-detection",
    "text-to-image", "image-to-text", "audio-classification", "automatic-speech-recognition"
].sort();

export function MetadataEditorModal({ isOpen, onClose, repoId, repoType, onSuccess }: MetadataEditorModalProps) {
    const { t } = useLanguage();
    const { success, error: toastError } = useToast();
    const { confirm } = useConfirm();
    const [activeTab, setActiveTab] = useState<'general' | 'sync' | 'history' | 'space' | 'danger'>('general');

    // Metadata Form
    const [formData, setFormData] = useState<UpdateMetadataRequest>({
        repo_id: repoId,
        repo_type: repoType,
        license: '',
        tags: [],
        pipeline_tag: '',
        sdk: '',
        gated: ''
    });

    // Settings State
    const [settings, setSettings] = useState({
        private: false,
        gated: false
    });

    // Global App Settings (for download dir)
    const [appSettings, setAppSettings] = useState<{ download_dir: string } | null>(null);

    // UI State
    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [params, setParams] = useState({ tagInput: '' });

    // Actions State
    const [moveTarget, setMoveTarget] = useState(repoId);
    const [deleteConfirm, setDeleteConfirm] = useState('');
    const [actionLoading, setActionLoading] = useState(false);

    useEffect(() => {
        if (isOpen && repoId) {
            loadRepoData();
            loadAppSettings();
        }
    }, [isOpen, repoId]);

    const loadAppSettings = async () => {
        try {
            const s = await getSettings();
            setAppSettings(s);
        } catch (e) {
            console.error("Failed to load settings", e);
        }
    };

    const loadRepoData = async () => {
        setFetching(true);
        setError(null);
        try {
            const info = await getModelInfo(repoId, repoType);

            // Populate Metadata
            setFormData({
                repo_id: repoId,
                repo_type: repoType,
                license: '',
                tags: info.tags || [],
                pipeline_tag: info.pipeline_tag || '',
                sdk: '',
                gated: typeof info.gated === 'boolean' ? (info.gated ? 'auto' : '') : (info.gated || '')
            });

            // Populate Settings
            setSettings({
                private: !!info.private,
                gated: !!info.gated
            });

            // Reset move target
            setMoveTarget(repoId);

        } catch (err) {
            console.error("Failed to load repo data", err);
            setError("Failed to load repository details. Some settings may be unavailable.");
        } finally {
            setFetching(false);
        }
    };

    const handleMetadataSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            const result = await updateMetadata(formData);
            if (result.success) {
                if (onSuccess) onSuccess();
                success(t('common.success') || 'Metadata updated successfully!');
            }
        } catch (err) {
            toastError(err instanceof Error ? err.message : 'Update failed');
        } finally {
            setLoading(false);
        }
    };

    const handleVisibilityToggle = async () => {
        const newPrivate = !settings.private;
        confirm({
            title: t('repoDetails.settings.visibility'),
            message: `Are you sure you want to make this ${repoType} ${newPrivate ? 'Private' : 'Public'}?`,
            onConfirm: async () => {
                setActionLoading(true);
                try {
                    await updateVisibility(repoId, repoType, newPrivate);
                    setSettings(prev => ({ ...prev, private: newPrivate }));
                    if (onSuccess) onSuccess();
                } catch (err) {
                    toastError('Failed to change visibility: ' + (err as Error).message);
                } finally {
                    setActionLoading(false);
                }
            }
        });
    };

    const handleGatedToggle = async () => {
        const newGated = !settings.gated;

        setActionLoading(true);
        try {
            // We use updateMetadata for gated
            await updateMetadata({
                repo_id: repoId,
                repo_type: repoType,
                gated: newGated ? 'auto' : 'false'
            });
            setSettings(prev => ({ ...prev, gated: newGated }));
            if (onSuccess) onSuccess();
        } catch (err) {
            toastError('Failed to update gated settings: ' + (err as Error).message);
        } finally {
            setActionLoading(false);
        }
    };

    const handleMove = async () => {
        if (moveTarget === repoId) return;
        confirm({
            title: t('repoDetails.settings.rename'),
            message: `Rename/Move repository to ${moveTarget}? This action cannot be undone efficiently.`,
            onConfirm: async () => {
                setActionLoading(true);
                try {
                    await moveRepo(repoId, moveTarget, repoType);
                    success(`Moved to ${moveTarget}`);
                    if (onSuccess) onSuccess();
                    onClose();
                } catch (err) {
                    toastError('Move failed: ' + (err as Error).message);
                } finally {
                    setActionLoading(false);
                }
            }
        });
    };

    const handleDelete = async () => {
        if (deleteConfirm !== repoId) return;

        setActionLoading(true);
        try {
            await deleteRepo(repoId, repoType);
            success(`Repository ${repoId} deleted.`);
            if (onSuccess) onSuccess();
            onClose();
        } catch (err) {
            toastError('Delete failed: ' + (err as Error).message);
            setActionLoading(false);
        }
    };

    const addTag = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && params.tagInput.trim()) {
            e.preventDefault();
            if (!formData.tags?.includes(params.tagInput.trim())) {
                setFormData(prev => ({
                    ...prev,
                    tags: [...(prev.tags || []), params.tagInput.trim()]
                }));
            }
            setParams({ ...params, tagInput: '' });
        }
    };

    const removeTag = (tagToRemove: string) => {
        setFormData(prev => ({
            ...prev,
            tags: prev.tags?.filter(t => t !== tagToRemove)
        }));
    };

    if (!isOpen) return null;

    const TabButton = ({ id, label, icon }: { id: typeof activeTab, label: string, icon: string }) => (
        <button
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 text-sm font-bold px-4 py-2 rounded-lg transition-all ${activeTab === id
                ? 'bg-[var(--color-surface-hover)] text-[var(--color-text)] shadow-lg shadow-black/5'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]/50'
                }`}
        >
            <span>{icon}</span>
            {label}
        </button>
    );

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={null}
            className="max-w-4xl h-[85vh]"
            bodyClassName="p-0 flex flex-col h-full overflow-hidden"
        >
            <div className="flex flex-col h-full">
                <div className="px-6 py-4 border-b border-[var(--color-border)] bg-[var(--color-surface)] flex flex-col gap-4 shrink-0">
                    <div className="flex justify-between items-center">
                        <h2 className="text-xl font-bold text-[var(--color-text)] flex items-center gap-2">
                            <span className="text-[var(--color-text-muted)] font-normal">Manage /</span> {repoId}
                        </h2>
                        <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] p-2 hover:bg-[var(--color-surface-hover)] rounded-full transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>

                    {/* Tabs */}
                    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                        <TabButton id="general" label="General" icon="⚙️" />
                        <TabButton id="sync" label="Sync & Workspace" icon="🔄" />
                        <TabButton id="history" label="Git History" icon="📜" />
                        {repoType === 'space' && (
                            <TabButton id="space" label="Space Ops" icon="🚀" />
                        )}
                        <div className="flex-1" />
                        <button
                            onClick={() => setActiveTab('danger')}
                            className={`text-sm font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-2 ${activeTab === 'danger' ? 'bg-red-500/10 text-red-500 border border-red-500/30' : 'text-[var(--color-text-muted)] hover:text-red-400'}`}
                        >
                            ⚠️ Danger Zone
                        </button>
                    </div>
                </div>

                <div className="p-6 overflow-y-auto custom-scrollbar flex-1 bg-[var(--color-background)]">
                    {fetching ? (
                        <div className="flex justify-center py-10">
                            <span className="animate-spin text-2xl">⏳</span>
                        </div>
                    ) : (
                        <>
                            {activeTab === 'general' && (
                                <div className="space-y-8 animate-fade-in">
                                    {error && (
                                        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm flex items-start gap-3">
                                            <span className="text-lg">⚠️</span>
                                            <div>{error}</div>
                                        </div>
                                    )}
                                    <form onSubmit={handleMetadataSubmit} className="space-y-6">
                                        <div className="flex items-center justify-between pb-4 border-b border-[var(--color-border)]">
                                            <h3 className="text-lg font-bold text-[var(--color-text)]">Metadata</h3>
                                            <button
                                                type="submit"
                                                disabled={loading}
                                                className="bg-indigo-600 hover:bg-indigo-500 rounded-lg px-4 py-2 text-white font-bold transition-colors disabled:opacity-50"
                                            >
                                                {loading ? 'Saving...' : 'Save Changes'}
                                            </button>
                                        </div>

                                        {repoType !== 'space' && (
                                            <div className="space-y-2">
                                                <label className="block text-sm font-semibold text-[var(--color-text)]">License</label>
                                                <select
                                                    value={formData.license || ""}
                                                    onChange={e => setFormData({ ...formData, license: e.target.value })}
                                                    className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2.5 text-[var(--color-text)]"
                                                >
                                                    <option value="">Keep current</option>
                                                    {LICENSES.map(l => (
                                                        <option key={l.value} value={l.value}>{l.label}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}

                                        {repoType === 'model' && (
                                            <div className="space-y-2">
                                                <label className="block text-sm font-semibold text-[var(--color-text)]">Task</label>
                                                <select
                                                    value={formData.pipeline_tag || ""}
                                                    onChange={e => setFormData({ ...formData, pipeline_tag: e.target.value })}
                                                    className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2.5 text-[var(--color-text)]"
                                                >
                                                    <option value="">None</option>
                                                    {PIPELINE_TAGS.map(t => (
                                                        <option key={t} value={t}>{t}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}

                                        <div className="space-y-2">
                                            <label className="block text-sm font-semibold text-[var(--color-text)]">Tags</label>
                                            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 flex flex-wrap gap-2">
                                                {formData.tags?.map(tag => (
                                                    <span key={tag} className="bg-[var(--color-primary)]/20 text-[var(--color-primary)] text-xs px-2 py-1 rounded-md flex items-center gap-1 border border-[var(--color-primary)]/30">
                                                        {tag}
                                                        <button type="button" onClick={() => removeTag(tag)} className="hover:text-[var(--color-text)]">×</button>
                                                    </span>
                                                ))}
                                                <input
                                                    type="text"
                                                    value={params.tagInput}
                                                    onChange={e => setParams({ ...params, tagInput: e.target.value })}
                                                    onKeyDown={addTag}
                                                    placeholder="Add tag + Enter..."
                                                    className="bg-transparent border-none focus:ring-0 text-sm text-[var(--color-text)] flex-1 min-w-[100px]"
                                                />
                                            </div>
                                        </div>
                                    </form>
                                </div>
                            )}

                            {activeTab === 'sync' && appSettings && (
                                <ManageSync
                                    repoId={repoId}
                                    repoType={repoType}
                                    defaultPath={`${appSettings.download_dir}\\${repoId.replace('/', '--')}`}
                                />
                            )}

                            {activeTab === 'history' && (
                                <ManageGitOps repoId={repoId} repoType={repoType} />
                            )}

                            {activeTab === 'space' && (
                                <ManageSpaceOps repoId={repoId} />
                            )}

                            {activeTab === 'danger' && (
                                <div className="space-y-8 animate-fade-in">
                                    {/* Visibility */}
                                    <div className="flex items-center justify-between p-4 bg-[var(--color-surface)]/30 rounded-xl border border-[var(--color-border)]">
                                        <div>
                                            <h4 className="text-[var(--color-text)] font-semibold flex items-center gap-2">
                                                {settings.private ? '🔒 Private' : '🌍 Public'}
                                            </h4>
                                            <p className="text-sm text-[var(--color-text-muted)]">
                                                {settings.private ? 'Only you and contributors can see this.' : 'Anyone can see this repository.'}
                                            </p>
                                        </div>
                                        <button
                                            onClick={handleVisibilityToggle}
                                            disabled={actionLoading}
                                            className="px-4 py-2 bg-[var(--color-surface-hover)] hover:bg-[var(--color-surface)] rounded-lg text-[var(--color-text)] text-sm font-medium transition-colors border border-[var(--color-border)]"
                                        >
                                            Switch to {settings.private ? 'Public' : 'Private'}
                                        </button>
                                    </div>

                                    {/* Gated */}
                                    <div className="flex items-center justify-between p-4 bg-[var(--color-surface)]/30 rounded-xl border border-[var(--color-border)]">
                                        <div>
                                            <h4 className="text-[var(--color-text)] font-semibold">
                                                Gated Access
                                            </h4>
                                            <p className="text-sm text-[var(--color-text-muted)]">
                                                {settings.gated ? 'Users must accept agreement (Auto-approve).' : 'No access restrictions.'}
                                            </p>
                                        </div>
                                        <button
                                            onClick={handleGatedToggle}
                                            disabled={actionLoading}
                                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${settings.gated ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)] border border-[var(--color-primary)]/30' : 'bg-[var(--color-surface-hover)] text-[var(--color-text-muted)]'}`}
                                        >
                                            {settings.gated ? 'Enabled' : 'Enable'}
                                        </button>
                                    </div>

                                    {/* Rename */}
                                    <div className="space-y-3 pt-4 border-t border-[var(--color-border)]">
                                        <h4 className="text-[var(--color-text)] font-semibold">Rename / Move</h4>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={moveTarget}
                                                onChange={(e) => setMoveTarget(e.target.value)}
                                                className="flex-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-[var(--color-text)]"
                                            />
                                            <button
                                                onClick={handleMove}
                                                disabled={actionLoading || moveTarget === repoId}
                                                className="px-4 py-2 bg-[var(--color-surface-hover)] hover:bg-[var(--color-surface)] border border-[var(--color-border)] disabled:opacity-50 rounded-lg text-[var(--color-text)] text-sm font-medium"
                                            >
                                                Move
                                            </button>
                                        </div>
                                    </div>

                                    {/* Danger Zone */}
                                    <div className="space-y-3 pt-6 border-t border-red-500/20">
                                        <h4 className="text-red-400 font-bold">Danger Zone</h4>
                                        <p className="text-xs text-red-400/70">
                                            This action cannot be undone. This will permanently delete the repository <strong>{repoId}</strong>.
                                        </p>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                placeholder={`Type ${repoId} to confirm`}
                                                value={deleteConfirm}
                                                onChange={(e) => setDeleteConfirm(e.target.value)}
                                                className="flex-1 bg-red-500/5 border border-red-500/30 rounded-lg px-3 py-2 text-red-200 placeholder-red-500/30 focus:border-red-500 focus:ring-1 focus:ring-red-500/50"
                                            />
                                            <button
                                                onClick={handleDelete}
                                                disabled={deleteConfirm !== repoId || actionLoading}
                                                className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:bg-red-900/50 rounded-lg text-white text-sm font-bold shadow-lg shadow-red-500/20"
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </Modal>
    );
}
