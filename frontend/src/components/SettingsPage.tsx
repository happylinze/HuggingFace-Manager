import { useState, useEffect } from 'react';
import { getSettings, updateSettings, cleanLogs, toggleStartup, type Settings } from '../api/client';
import { useLanguage } from '../contexts/LanguageContext';
import { useToast } from '../contexts/ToastContext';
import { useConfirm } from '../contexts/ConfirmContext';
import { GeneralSettings } from './settings/GeneralSettings';
import { DownloadSection } from './settings/DownloadSection';
import { NetworkSection } from './settings/NetworkSection';
import { AboutPage } from './settings/AboutPage';

type SettingsSection = 'general' | 'downloads' | 'network' | 'about';

export function SettingsPage({ onSettingsChanged }: { onSettingsChanged?: () => void }) {
    const { t } = useLanguage();
    const { success: toastSuccess, error: toastError } = useToast();
    const { confirm } = useConfirm();
    const [settings, setSettingsState] = useState<Settings | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeSection, setActiveSection] = useState<SettingsSection>('general');

    const refreshSettings = async () => {
        try {
            const data = await getSettings();
            setSettingsState(data);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        refreshSettings();
    }, []);

    const handleUpdate = async (updates: Partial<Settings>) => {
        if (!settings) return;

        // Optimistic update
        setSettingsState({ ...settings, ...updates });

        try {
            const result = await updateSettings(updates);
            if (!result.success) {
                // Revert on failure
                refreshSettings();
                toastError(`Failed to update settings: ${result.message}`);
            } else {
                // Refresh to ensure sync (side effects like environment vars)
                await refreshSettings();
                onSettingsChanged?.();
            }
        } catch (err) {
            refreshSettings();
            toastError(`${t('common.error')}: ${(err as Error).message}`);
        }
    };

    const handleCleanLogs = async () => {
        confirm({
            title: t('settingsPage.system.logClean'),
            message: t('confirm.cleanLogs') || 'Are you sure?',
            onConfirm: async () => {
                try {
                    const res = await cleanLogs();
                    if (res.success) toastSuccess(res.message);
                    else toastError(res.message);
                } catch (e) {
                    toastError(`${t('common.error')}: ${e}`);
                }
            }
        });
    };

    const handleToggleStartup = async (enable: boolean) => {
        try {
            const res = await toggleStartup(enable);
            if (res.success) {
                await refreshSettings();
                toastSuccess(res.message);
            } else {
                toastError(res.message);
            }
        } catch (e) {
            toastError(`${t('common.error')}: ${e}`);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="w-8 h-8 border-4 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-8 text-center bg-red-500/10 rounded-2xl border border-red-500/30">
                <h3 className="text-xl font-bold text-red-500 mb-2">Failed to load settings</h3>
                <p className="text-red-400 mb-4">{error}</p>
                <button
                    onClick={refreshSettings}
                    className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                >
                    Retry
                </button>
            </div>
        );
    }

    if (!settings) return null;

    const navItems: { id: SettingsSection; label: string; icon: string }[] = [
        { id: 'general', label: t('settingsPage.groups.general'), icon: '🎨' },
        { id: 'downloads', label: t('settingsPage.groups.downloads') || 'Downloads', icon: '📥' },
        { id: 'network', label: t('settingsPage.groups.network'), icon: '🌐' },
        { id: 'about', label: t('settingsPage.groups.about'), icon: 'ℹ️' },
    ];

    return (
        <div className="flex flex-col md:flex-row gap-8 items-start min-h-[600px]">
            {/* Sidebar Navigation */}
            <div className="md:w-64 w-full flex-shrink-0 space-y-2 sticky top-24">
                {navItems.map(item => (
                    <button
                        key={item.id}
                        onClick={() => setActiveSection(item.id)}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group font-medium
                            ${activeSection === item.id
                                ? 'bg-[var(--color-surface)] text-[var(--color-primary)] shadow-sm border border-[var(--color-border)]'
                                : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]'}`}
                    >
                        <span className={`text-xl transition-transform duration-300 ${activeSection === item.id ? 'scale-110' : 'grayscale opacity-70 group-hover:grayscale-0 group-hover:opacity-100'}`}>
                            {item.icon}
                            {/* item.icon */}
                        </span>
                        {item.label}
                        {activeSection === item.id && (
                            <div className="ml-auto w-1.5 h-1.5 rounded-full bg-[var(--color-primary)]" />
                        )}
                    </button>
                ))}
            </div>

            {/* Main Content Area */}
            <div className="flex-1 w-full min-w-0">
                {activeSection === 'general' && (
                    <GeneralSettings
                        settings={settings}
                        onUpdate={handleUpdate}
                        onCleanLogs={handleCleanLogs}
                        onToggleStartup={handleToggleStartup}
                    />
                )}
                {activeSection === 'downloads' && (
                    <DownloadSection
                        settings={settings}
                        onUpdate={handleUpdate}
                        refreshSettings={refreshSettings}
                    />
                )}
                {activeSection === 'network' && (
                    <NetworkSection
                        settings={settings}
                        onUpdate={handleUpdate}
                        refreshSettings={refreshSettings}
                    />
                )}
                {activeSection === 'about' && (
                    <AboutPage />
                )}
            </div>
        </div>
    );
}
