import { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { createRepo, getUserInfo, type CreateRepoRequest } from '../api/client';
import { useLanguage } from '../contexts/LanguageContext';

interface CreateRepoModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: (url: string) => void;
    initialType?: 'model' | 'dataset' | 'space';
}

const LICENSES = [
    { value: "mit", label: "MIT" },
    { value: "apache-2.0", label: "Apache 2.0" },
    { value: "cc-by-4.0", label: "CC-BY 4.0" },
    { value: "cc-by-nc-4.0", label: "CC-BY-NC 4.0" },
    { value: "bsd-3-clause", label: "BSD 3-Clause" },
    { value: "mpl-2.0", label: "MPL 2.0" },
    { value: "unlicense", label: "Unlicense" },
];

const SDK_OPTIONS = [
    { value: "gradio", label: "Gradio", icon: "🧠", desc: "Showcase your ML model with a python interface" },
    { value: "streamlit", label: "Streamlit", icon: "👑", desc: "Turn python scripts into shareable web apps" },
    { value: "docker", label: "Docker", icon: "🐳", desc: "Deploy any application with a Dockerfile" },
    { value: "static", label: "Static", icon: "📄", desc: "Host static files (HTML, CSS, JS)" },
];

export function CreateRepoModal({ isOpen, onClose, onSuccess, initialType = 'model' }: CreateRepoModalProps) {
    const { t } = useLanguage();
    const [formData, setFormData] = useState<CreateRepoRequest>({
        repo_id: '',
        repo_type: initialType,
        private: true,
        sdk: 'gradio',
        license: ''
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [username, setUsername] = useState<string>('username');

    useEffect(() => {
        if (isOpen) {
            setFormData(prev => ({ ...prev, repo_type: initialType, license: '' }));
            getUserInfo().then(info => {
                if (info.username) {
                    setUsername(info.username);
                    setFormData(prev => ({
                        ...prev,
                        repo_id: `${info.username}/`,
                        repo_type: initialType
                    }));
                }
            });
        }
    }, [isOpen, initialType]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        // Validate repo_id
        if (!formData.repo_id.includes('/')) {
            // If user cleared the prefix, add it back
            setFormData(prev => ({ ...prev, repo_id: `${username}/${prev.repo_id}` }));
            // Wait for state update? No, just use local var or fix logic.
            // Actually better to just check if it's empty after slash
        }

        try {
            const result = await createRepo(formData);
            if (result.success) {
                if (onSuccess) {
                    // Force official URL for browser navigation
                    const officialUrl = `https://huggingface.co/${formData.repo_type === 'model' ? '' : formData.repo_type === 'dataset' ? 'datasets/' : 'spaces/'}${formData.repo_id}`;
                    onSuccess(officialUrl);
                }
                onClose();
                // Reset form
                setFormData({
                    repo_id: '',
                    repo_type: 'model',
                    private: true,
                    sdk: 'gradio',
                    license: ''
                });
            }
        } catch (err) {
            console.error('Create Repo Error:', err);
            setError(err instanceof Error ? err.message : t('createRepo.error'));
        } finally {
            setLoading(false);
        }
    };

    const handleNameChange = (val: string) => {
        // Enforce username prefix logic visually or logically
        // We'll just update the whole string for now but UI can be smarter
        // However user passes full string including username
        setFormData(prev => ({ ...prev, repo_id: val }));
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={
                <div className="flex items-center gap-3">
                    {formData.repo_type === 'model' && <span className="text-2xl">📦</span>}
                    {formData.repo_type === 'dataset' && <span className="text-2xl">📊</span>}
                    {formData.repo_type === 'space' && <span className="text-2xl">🚀</span>}
                    <div>
                        <span className="block text-sm font-normal text-[var(--color-text-muted)]">{t('createRepo.title')}</span>
                        {/* Capitalize first letter */}
                        {t(`search.${formData.repo_type}` as any)}
                    </div>
                </div>
            }
        >
            <form onSubmit={handleSubmit} className="space-y-8">

                {/* Name Input Section */}
                <div className="space-y-4">
                    <label className="block text-base font-semibold text-[var(--color-text)]">
                        {t(`search.${formData.repo_type}` as any)} {t('createRepo.name')}
                    </label>
                    <div className="flex items-center gap-2">
                        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2.5 text-[var(--color-text-muted)] font-mono text-sm shrink-0 select-none">
                            {username}
                        </div>
                        <span className="text-[var(--color-text-muted)] font-bold">/</span>
                        <input
                            type="text"
                            value={formData.repo_id.replace(`${username}/`, '')}
                            onChange={e => handleNameChange(`${username}/${e.target.value}`)}
                            placeholder={t('createRepo.placeholder')}
                            className="flex-1 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-all font-medium"
                            autoFocus
                        />
                    </div>
                </div>

                {/* License Section - Models & Datasets */}
                {formData.repo_type !== 'space' && (
                    <div className="space-y-3">
                        <label className="block text-base font-semibold text-[var(--color-text)]">{t('createRepo.license')}</label>
                        <div className="relative">
                            <select
                                value={formData.license || ""}
                                onChange={e => setFormData({ ...formData, license: e.target.value })}
                                className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg px-4 py-3 text-[var(--color-text)] appearance-none focus:outline-none focus:border-[var(--color-primary)] cursor-pointer"
                            >
                                <option value="">{t('createRepo.selectLicense')}</option>
                                {LICENSES.map(l => (
                                    <option key={l.value} value={l.value}>{l.label}</option>
                                ))}
                            </select>
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none">▼</div>
                        </div>
                    </div>
                )}

                {/* Space SDK Selection */}
                {formData.repo_type === 'space' && (
                    <div className="space-y-4">
                        <label className="block text-base font-semibold text-[var(--color-text)]">{t('createRepo.sdk')}</label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {SDK_OPTIONS.map(sdk => (
                                <label
                                    key={sdk.value}
                                    className={`relative flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${formData.sdk === sdk.value
                                        ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10'
                                        : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-text-muted)]'
                                        }`}
                                >
                                    <div className="text-2xl mt-0.5">{sdk.icon}</div>
                                    <div>
                                        <div className="font-bold text-[var(--color-text)] mb-0.5">{sdk.label}</div>
                                        <div className="text-xs text-[var(--color-text-muted)] leading-tight">{sdk.desc}</div>
                                    </div>
                                    <input
                                        type="radio"
                                        name="sdk"
                                        value={sdk.value}
                                        checked={formData.sdk === sdk.value}
                                        onChange={() => setFormData({ ...formData, sdk: sdk.value })}
                                        className="absolute inset-0 opacity-0 cursor-pointer"
                                    />
                                    {formData.sdk === sdk.value && (
                                        <div className="absolute top-3 right-3 w-4 h-4 rounded-full bg-indigo-500 flex items-center justify-center">
                                            <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                            </svg>
                                        </div>
                                    )}
                                </label>
                            ))}
                        </div>
                    </div>
                )}

                {/* Visibility Section */}
                <div className="space-y-4">
                    <label className="block text-base font-semibold text-[var(--color-text)]">{t('createRepo.visibility')}</label>
                    <div className="flex flex-col sm:flex-row gap-4">
                        <label className={`flex-1 flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${formData.private === false
                            ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10'
                            : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-text-muted)]'
                            }`}>
                            <div className="text-2xl mt-0.5">🌍</div>
                            <div>
                                <div className="font-bold text-[var(--color-text)] mb-0.5">{t('createRepo.public')}</div>
                                <div className="text-xs text-[var(--color-text-muted)]">{t('createRepo.publicDesc')}</div>
                            </div>
                            <input
                                type="radio"
                                name="visibility"
                                checked={formData.private === false}
                                onChange={() => setFormData({ ...formData, private: false })}
                                className="hidden"
                            />
                            {formData.private === false && (
                                <div className="ml-auto w-5 h-5 rounded-full border-4 border-indigo-500"></div>
                            )}
                        </label>

                        <label className={`flex-1 flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${formData.private === true
                            ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10'
                            : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-text-muted)]'
                            }`}>
                            <div className="text-2xl mt-0.5">🔒</div>
                            <div>
                                <div className="font-bold text-[var(--color-text)] mb-0.5">{t('createRepo.private')}</div>
                                <div className="text-xs text-[var(--color-text-muted)]">{t('createRepo.privateDesc')}</div>
                            </div>
                            <input
                                type="radio"
                                name="visibility"
                                checked={formData.private === true}
                                onChange={() => setFormData({ ...formData, private: true })}
                                className="hidden"
                            />
                            {formData.private === true && (
                                <div className="ml-auto w-5 h-5 rounded-full border-4 border-indigo-500"></div>
                            )}
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
                        {t('createRepo.cancel')}
                    </button>
                    <button
                        type="submit"
                        disabled={loading}
                        className="flex-[2] py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-white font-bold transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2"
                    >
                        {loading ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : t('createRepo.create')}
                    </button>
                </div>
            </form>
        </Modal>
    );
}

// Add some custom scrollbar styles to global css or inline here if possible?
// For now relying on tailwind.
