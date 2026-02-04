import { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { importRepo, getUserInfo, selectFolderDialog, type ImportRepoRequest } from '../api/client';
import { useLanguage } from '../contexts/LanguageContext';

interface ImportRepoModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: (url: string) => void;
}

export function ImportRepoModal({ isOpen, onClose, onSuccess }: ImportRepoModalProps) {
    const { t } = useLanguage();
    const [formData, setFormData] = useState<ImportRepoRequest>({
        repo_id: '',
        repo_type: 'model',
        folder_path: '',
        private: true,
        license: ''
    });
    const [username, setUsername] = useState<string>('username');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            getUserInfo().then(info => {
                if (info.username) {
                    setUsername(info.username);
                    if (!formData.repo_id) {
                        setFormData(prev => ({ ...prev, repo_id: `${info.username}/` }));
                    }
                }
            });
        }
    }, [isOpen]);

    const handleBrowseContext = async () => {
        try {
            const result = await selectFolderDialog();
            if (result.path) {
                const folderName = result.path.replace(/\\/g, '/').split('/').pop() || 'imported-repo';
                const sanitized = folderName.toLowerCase().replace(/[^a-z0-9-]/g, '-');

                setFormData(prev => ({
                    ...prev,
                    folder_path: result.path!,
                    repo_id: prev.repo_id.includes('/') ? `${username}/${sanitized}` : `${username}/${sanitized}`
                }));
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();

        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) {
            const file = files[0] as any;

            // Check for absolute path (Electron or some local setups)
            if (file.path && typeof file.path === 'string') {
                const fullPath = file.path;

                // Crude check: does it look like a path?
                setFormData(prev => {
                    const folderName = fullPath.replace(/\\/g, '/').split('/').pop() || 'imported-repo';
                    const sanitized = folderName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
                    return {
                        ...prev,
                        folder_path: fullPath,
                        repo_id: prev.repo_id.includes('/') ? `${username}/${sanitized}` : `${username}/${sanitized}`
                    };
                });
            } else {
                // Browser security restriction
                setError(t('import.dragDropError') || 'Cannot detect absolute path from drag & drop (Browser Security). Please use the Browse button.');
            }
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (!formData.folder_path) {
            setError(t('import.noFolder') || "Please select a folder");
            return;
        }

        setLoading(true);
        try {
            const result = await importRepo(formData);
            if (result.success) {
                if (onSuccess) {
                    // Force official URL for browser navigation
                    const officialUrl = `https://huggingface.co/${formData.repo_type === 'model' ? '' : formData.repo_type === 'dataset' ? 'datasets/' : 'spaces/'}${formData.repo_id}`;
                    onSuccess(officialUrl);
                }
                onClose();
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Import failed');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={
                <div className="flex items-center gap-3">
                    <span className="text-2xl">⚡</span>
                    <div>
                        <span className="block text-sm font-normal text-[var(--color-text-muted)]">{t('import.title')}</span>
                        {t('import.subtitle')}
                    </div>
                </div>
            }
        >
            <div
                className="transition-colors relative"
                onDragOver={handleDragOver}
                onDrop={handleDrop}
            >
                {/* Drag Overlay Hint */}
                <div className="absolute inset-0 pointer-events-none border-2 border-[var(--color-primary)] border-dashed opacity-0 transition-opacity hover:opacity-100 flex items-center justify-center bg-[var(--color-background)]/80 z-50 rounded-xl" style={{ display: 'none' }}>
                    {/* This is complex to toggle without state, so just sticking to passive handlers for now */}
                </div>
                <form onSubmit={handleSubmit} className="space-y-8">
                    {/* Type Selection Tabs */}
                    <div className="flex p-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl">
                        {(['model', 'dataset'] as const).map(type => (
                            <button
                                key={type}
                                type="button"
                                onClick={() => setFormData(prev => ({ ...prev, repo_type: type }))}
                                className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${formData.repo_type === type
                                    ? 'bg-[var(--color-background)] text-[var(--color-primary)] shadow-sm border border-[var(--color-border)]'
                                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                                    }`}
                            >
                                <span>{type === 'model' ? '📦' : '📊'}</span>
                                {type === 'model' ? t('import.tabs.model') : t('import.tabs.dataset')}
                            </button>
                        ))}
                    </div>

                    {/* Local Path Input */}
                    <div className="space-y-4">
                        <label className="block text-base font-semibold text-[var(--color-text)]">
                            {t('import.localPath')}
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={formData.folder_path}
                                onChange={e => setFormData({ ...formData, folder_path: e.target.value })}
                                placeholder={t('import.pathPlaceholder')}
                                className="flex-1 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary)]"
                            />
                            <button
                                type="button"
                                onClick={handleBrowseContext}
                                className="px-4 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-bold rounded-lg transition-colors"
                            >
                                {t('import.browse')}
                            </button>
                        </div>
                    </div>

                    {/* Name Input */}
                    <div className="space-y-4">
                        <label className="block text-base font-semibold text-[var(--color-text)]">
                            {t('import.targetName')}
                        </label>
                        <div className="flex items-center gap-2">
                            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2.5 text-[var(--color-text-muted)] font-mono text-sm shrink-0 select-none">
                                {username}
                            </div>
                            <span className="text-[var(--color-text-muted)] font-bold">/</span>
                            <input
                                type="text"
                                value={formData.repo_id.replace(`${username}/`, '')}
                                onChange={e => setFormData({ ...formData, repo_id: `${username}/${e.target.value}` })}
                                placeholder={t('import.placeholderName')}
                                className="flex-1 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[var(--color-text)]"
                            />
                        </div>
                    </div>

                    {/* Visibility */}
                    <div className="space-y-4">
                        <label className="block text-base font-semibold text-[var(--color-text)]">{t('repoDetails.settings.visibility')}</label>
                        <div className="flex gap-4">
                            <label className={`flex-1 flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${!formData.private
                                ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10'
                                : 'border-[var(--color-border)] bg-[var(--color-surface)]'}`}>
                                <span className="text-xl">🌍</span>
                                <div>
                                    <div className="font-bold text-[var(--color-text)]">{t('repoDetails.settings.makePublic').replace('Make ', '')}</div>
                                </div>
                                <input
                                    type="radio"
                                    checked={!formData.private}
                                    onChange={() => setFormData({ ...formData, private: false })}
                                    className="hidden"
                                />
                            </label>
                            <label className={`flex-1 flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${formData.private
                                ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10'
                                : 'border-[var(--color-border)] bg-[var(--color-surface)]'}`}>
                                <span className="text-xl">🔒</span>
                                <div>
                                    <div className="font-bold text-[var(--color-text)]">{t('repoDetails.settings.makePrivate').replace('Make ', '')}</div>
                                </div>
                                <input
                                    type="radio"
                                    checked={formData.private}
                                    onChange={() => setFormData({ ...formData, private: true })}
                                    className="hidden"
                                />
                            </label>
                        </div>
                    </div>

                    {error && (
                        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm flex items-start gap-3">
                            <span className="text-lg">⚠️</span>
                            <div>{error}</div>
                        </div>
                    )}

                    <div className="pt-4 flex gap-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-3 bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)] rounded-xl text-[var(--color-text-muted)] font-bold transition-colors border border-[var(--color-border)]"
                        >
                            {t('import.cancel')}
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-[2] py-3 bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 rounded-xl text-white font-bold transition-all shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {loading ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : t('import.submit')}
                        </button>
                    </div>
                </form>
            </div>
        </Modal>
    );
}
