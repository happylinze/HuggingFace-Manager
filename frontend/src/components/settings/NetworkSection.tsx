import { useState, useEffect } from 'react';
import { Button } from '../Button';
import { Modal } from '../Modal';
import { getAccounts, switchAccount, deleteAccount, loginHF, validateToken, addMirror, removeMirror, type Account, type Settings } from '../../api/client';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../contexts/ConfirmContext';

interface NetworkSectionProps {
    settings: Settings;
    onUpdate: (updates: Partial<Settings>) => Promise<void>;
    refreshSettings: () => Promise<void>;
}

export function NetworkSection({ settings, onUpdate, refreshSettings }: NetworkSectionProps) {
    const { t } = useLanguage();
    const { success, error } = useToast();
    const { confirm } = useConfirm();

    // --- Account Logic ---
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [isAddAccountOpen, setIsAddAccountOpen] = useState(false);
    const [newToken, setNewToken] = useState('');
    const [isValidating, setIsValidating] = useState(false);
    const [validateMsg, setValidateMsg] = useState<string | null>(null);

    const loadAccounts = async () => {
        try {
            const list = await getAccounts();
            setAccounts(list);
        } catch (e) { console.error(e); }
    };

    useEffect(() => { loadAccounts(); }, [settings.token_configured]);

    const handleSwitchAccount = async (username: string) => {
        const res = await switchAccount(username);
        if (res.success) {
            localStorage.removeItem('hf_my_repos_cache'); // Clear cache
            await refreshSettings();
            success(t('common.success'));
        } else {
            error(res.message);
        }
    };

    const handleDeleteAccount = async (username: string) => {
        confirm({
            title: t('settingsPage.account.deleteTitle') || 'Delete Account',
            message: t('settingsPage.account.confirmDelete'),
            isDestructive: true,
            onConfirm: async () => {
                const res = await deleteAccount(username);
                if (res.success) {
                    localStorage.removeItem('hf_my_repos_cache'); // Clear cache
                    await loadAccounts();
                    await refreshSettings();
                    success(t('common.success'));
                } else {
                    error(res.message);
                }
            }
        });
    };

    const handleValidate = async () => {
        if (!newToken.trim()) return;
        setIsValidating(true);
        setValidateMsg(null);
        try {
            const res = await validateToken(newToken);
            if (res.valid) setValidateMsg(`✅ Valid: ${res.fullname || res.username}`);
            else setValidateMsg(`❌ Invalid: ${res.message}`);
        } catch (e) { setValidateMsg(`❌ Error: ${e}`); }
        finally { setIsValidating(false); }
    };

    const handleAddAccount = async () => {
        if (!newToken.trim()) return;
        setIsValidating(true);
        try {
            const res = await loginHF(newToken);
            if (res.success) {
                localStorage.removeItem('hf_my_repos_cache'); // Clear cache
                setIsAddAccountOpen(false);
                setNewToken('');
                setValidateMsg(null);
                await loadAccounts();
                await refreshSettings();
            } else setValidateMsg(`❌ ${res.message}`);
        } catch (e) { setValidateMsg(`❌ ${e}`); }
        finally { setIsValidating(false); }
    };

    // --- Mirror Logic ---
    const [customMirror, setCustomMirror] = useState({ name: '', url: '', description: '' });
    const [isAddingMirror, setIsAddingMirror] = useState(false);

    const handleAddMirror = async (e: React.FormEvent) => {
        e.preventDefault();
        if (customMirror.name && customMirror.url) {
            await addMirror(customMirror.name, customMirror.url, customMirror.description);
            setCustomMirror({ name: '', url: '', description: '' });
            setIsAddingMirror(false);
            refreshSettings();
        }
    };

    const handleRemoveMirror = async (key: string) => {
        confirm({
            title: t('settingsPage.mirror.deleteTitle') || 'Delete Mirror',
            message: t('settingsPage.mirror.deleteConfirm'),
            isDestructive: true,
            onConfirm: async () => {
                await removeMirror(key);
                refreshSettings();
                success(t('common.success'));
            }
        });
    };

    return (
        <div className="space-y-6 animate-fade-in pb-10">
            {/* Header */}
            <div className="flex items-center gap-3 pb-2 border-b border-[var(--color-border)]">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-xl shadow-lg shadow-emerald-500/20 text-white">
                    🌍
                </div>
                <div>
                    <h2 className="text-xl font-bold text-[var(--color-text)]">{t('settingsPage.groups.network')}</h2>
                    <p className="text-sm text-[var(--color-text-muted)]">{t('settingsPage.groups.networkDesc')}</p>
                </div>
            </div>

            {/* 1. Account Config */}
            <section className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] overflow-hidden shadow-sm">
                <div className="px-6 py-4 bg-[var(--color-surface-hover)]/50 border-b border-[var(--color-border)] flex justify-between items-center">
                    <h3 className="font-bold flex items-center gap-2">👤 {t('settingsPage.account.title')}</h3>
                    <Button size="sm" onClick={() => setIsAddAccountOpen(true)}>
                        + {t('settingsPage.account.add')}
                    </Button>
                </div>
                <div className="p-6">
                    {accounts.length === 0 ? (
                        <div className="text-center py-8 text-[var(--color-text-muted)] border-2 border-dashed border-[var(--color-border)] rounded-xl">
                            <p>{t('settingsPage.account.noAccounts')}</p>
                            <Button variant="secondary" className="mt-2" onClick={() => setIsAddAccountOpen(true)}>
                                {t('settingsPage.auth.login')}
                            </Button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {accounts.map(acc => {
                                const isActive = acc.username === settings.user_info?.username;
                                return (
                                    <div
                                        key={acc.username}
                                        className={`group flex items-center gap-4 p-3 rounded-xl border transition-all duration-200
                                            ${isActive
                                                ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5 shadow-sm'
                                                : 'border-[var(--color-border)] bg-[var(--color-background)] hover:border-[var(--color-primary)]/30 hover:bg-[var(--color-surface-hover)]'
                                            }`}
                                    >
                                        <img
                                            src={acc.avatar_url || 'https://huggingface.co/avatars/default.png'}
                                            className={`w-10 h-10 rounded-full bg-gray-200 transition-transform ${isActive ? 'ring-2 ring-[var(--color-primary)] ring-offset-2 ring-offset-[var(--color-surface)]' : ''}`}
                                            alt={acc.username}
                                        />

                                        <div className="flex-1 min-w-0 flex flex-col justify-center">
                                            <div className="flex items-center gap-2">
                                                <span className={`font-bold ${isActive ? 'text-[var(--color-primary)]' : 'text-[var(--color-text)]'}`}>
                                                    {acc.fullname || acc.username}
                                                </span>
                                                {isActive && (
                                                    <span className="text-[10px] font-bold bg-[var(--color-primary)] text-white px-2 py-0.5 rounded-full uppercase tracking-wider">
                                                        Current
                                                    </span>
                                                )}
                                                {acc.is_pro && (
                                                    <span className="text-[10px] font-bold bg-yellow-500/10 text-yellow-600 border border-yellow-500/20 px-1.5 rounded uppercase">
                                                        PRO
                                                    </span>
                                                )}
                                                <a
                                                    href={`https://huggingface.co/${acc.username}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-[var(--color-surface-hover)] rounded ml-1 text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
                                                    title="Open Hugging Face Profile"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    🔗
                                                </a>
                                            </div>
                                            <div className="text-xs text-[var(--color-text-muted)] font-mono truncate">
                                                @{acc.username}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                            {!isActive && (
                                                <Button
                                                    size="sm"
                                                    variant="secondary"
                                                    onClick={() => handleSwitchAccount(acc.username)}
                                                    className="whitespace-nowrap"
                                                >
                                                    {t('common.switch')}
                                                </Button>
                                            )}
                                            <button
                                                onClick={() => handleDeleteAccount(acc.username)}
                                                className="p-2 text-[var(--color-text-muted)] hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                                                title={t('settingsPage.account.deleteTitle') || "Delete account"}
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </section>

            {/* 2. Connectivity (Mirrors & Proxy) */}
            <section className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] overflow-hidden shadow-sm">
                <div className="px-6 py-4 bg-[var(--color-surface-hover)]/50 border-b border-[var(--color-border)]">
                    <h3 className="font-bold flex items-center gap-2">🌐 {t('settingsPage.mirrors')} & Proxy</h3>
                </div>
                <div className="p-6 space-y-6">
                    {/* Mirrors */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {settings.mirrors.map(mirror => (
                            <div
                                key={mirror.key}
                                onClick={() => onUpdate({ mirror_key: mirror.key } as any)}
                                className={`relative p-3 rounded-xl border-2 transition-all cursor-pointer group
                                    ${settings.current_mirror === mirror.key
                                        ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5'
                                        : 'border-[var(--color-border)] bg-[var(--color-background)] hover:border-[var(--color-primary)]/50'
                                    }`}
                            >
                                <div className="font-bold text-sm flex justify-between">
                                    {mirror.name}
                                    {settings.current_mirror === mirror.key && <span className="text-[var(--color-primary)]">✓</span>}
                                </div>
                                <div className="text-xs text-[var(--color-text-muted)] mt-1 truncate">{mirror.url}</div>
                                {mirror.key.startsWith('custom_') && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleRemoveMirror(mirror.key);
                                        }}
                                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1.5 text-red-400 hover:text-red-500 hover:bg-red-500/10 rounded transition-all"
                                        title={t('common.delete')}
                                    >
                                        🗑️
                                    </button>
                                )}
                            </div>
                        ))}
                        <button
                            onClick={() => setIsAddingMirror(true)}
                            className="p-3 rounded-xl border-2 border-dashed border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-all flex items-center justify-center gap-2 font-medium"
                        >
                            + {t('settingsPage.mirror.add')}
                        </button>
                    </div>

                    <div className="h-px bg-[var(--color-border)]"></div>

                    {/* Global Proxy */}
                    <div>
                        <label className="block text-sm font-medium mb-1">{t('settingsPage.network.proxyTitle')}</label>
                        <input
                            type="text"
                            value={settings.proxy_url || ''}
                            onChange={(e) => onUpdate({ proxy_url: e.target.value })}
                            placeholder="http://127.0.0.1:7890"
                            className="w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg focus:ring-1 focus:ring-[var(--color-primary)] outline-none text-sm"
                        />
                        <p className="text-xs text-[var(--color-text-muted)] mt-1">
                            {t('settingsPage.network.proxyDesc')}
                        </p>
                    </div>
                </div>
            </section>

            {/* Modals */}
            <Modal
                isOpen={isAddAccountOpen}
                onClose={() => setIsAddAccountOpen(false)}
                title={t('settingsPage.auth.login')}
            >
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">{t('settingsPage.network.tokenLabel')}</label>
                        <input
                            type="password"
                            value={newToken}
                            onChange={(e) => setNewToken(e.target.value)}
                            placeholder="hf_..."
                            className="w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg focus:ring-2 focus:ring-[var(--color-primary)] outline-none"
                        />
                        <div className="flex justify-between mt-1">
                            <a href="https://huggingface.co/settings/tokens" target="_blank" className="text-xs text-[var(--color-primary)] hover:underline">
                                {t('settingsPage.auth.getToken')}
                            </a>
                            <button onClick={handleValidate} disabled={isValidating} className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
                                {isValidating ? 'Checking...' : t('settingsPage.auth.verify')}
                            </button>
                        </div>
                        {validateMsg && <div className="text-sm mt-1">{validateMsg}</div>}
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="secondary" onClick={() => setIsAddAccountOpen(false)}>{t('common.cancel')}</Button>
                        <Button onClick={handleAddAccount} disabled={isValidating || !newToken}>
                            {isValidating ? 'Logging in...' : t('settingsPage.auth.login')}
                        </Button>
                    </div>
                </div>
            </Modal>

            <Modal
                isOpen={isAddingMirror}
                onClose={() => setIsAddingMirror(false)}
                title={t('settingsPage.mirror.add')}
            >
                <form onSubmit={handleAddMirror} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">{t('settingsPage.mirror.name')}</label>
                        <input
                            required
                            value={customMirror.name}
                            onChange={e => setCustomMirror({ ...customMirror, name: e.target.value })}
                            className="w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg focus:ring-2 focus:ring-[var(--color-primary)] outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">{t('settingsPage.mirror.url')}</label>
                        <input
                            required
                            value={customMirror.url}
                            onChange={e => setCustomMirror({ ...customMirror, url: e.target.value })}
                            placeholder="https://..."
                            className="w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg focus:ring-2 focus:ring-[var(--color-primary)] outline-none"
                        />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <Button type="button" variant="secondary" onClick={() => setIsAddingMirror(false)}>{t('common.cancel')}</Button>
                        <Button type="submit">{t('common.confirm')}</Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
