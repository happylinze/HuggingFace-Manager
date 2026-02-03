import { useState, useEffect } from 'react';
import { Button } from '../Button';
import { selectFolderDialog, deleteCacheHistory, type Settings } from '../../api/client';
import { useLanguage } from '../../contexts/LanguageContext';
import { useConfirm } from '../../contexts/ConfirmContext';
import { Combobox } from '../Combobox';

interface DownloadSectionProps {
    settings: Settings;
    onUpdate: (updates: Partial<Settings>) => Promise<void>;
    refreshSettings: () => Promise<void>;
}

export function DownloadSection({ settings, onUpdate, refreshSettings }: DownloadSectionProps) {
    const { t } = useLanguage();
    const { confirm } = useConfirm();
    const [dirty, setDirty] = useState(false);

    // Local states for sliders and text inputs to prevent flickering
    const [localPythonWorkers, setLocalPythonWorkers] = useState(settings.python_max_workers || 8);
    const [localAria2Conn, setLocalAria2Conn] = useState(settings.aria2_max_connection_per_server || 16);
    const [localAria2Split, setLocalAria2Split] = useState(settings.aria2_split || 16);
    const [localProxy, setLocalProxy] = useState(settings.aria2_all_proxy || '');

    // Sync with props when they change (but not while typing/sliding)
    useEffect(() => {
        setLocalPythonWorkers(settings.python_max_workers || 8);
        setLocalAria2Conn(settings.aria2_max_connection_per_server || 16);
        setLocalAria2Split(settings.aria2_split || 16);
        setLocalProxy(settings.aria2_all_proxy || '');
    }, [settings.python_max_workers, settings.aria2_max_connection_per_server, settings.aria2_split, settings.aria2_all_proxy]);

    const handleSelectFolder = async (key: 'download_dir' | 'hf_cache_dir') => {
        const result = await selectFolderDialog();
        if (result.path) {
            onUpdate({ [key]: result.path });
        }
    };

    const handleDeleteHistory = async (path: string, type: 'cache' | 'download') => {
        confirm({
            title: t('common.delete'),
            message: `${t('confirm.delete')} ${path}?`,
            onConfirm: async () => {
                await deleteCacheHistory(path, type);
                await refreshSettings();
            }
        });
    };

    const handleAria2Change = (updates: Partial<Settings>) => {
        setDirty(true);
        onUpdate(updates);
    };

    return (
        <div className="space-y-6 animate-fade-in pb-10">
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-[var(--color-border)]">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-xl shadow-lg shadow-blue-500/20 text-white">
                        📥
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-[var(--color-text)]">{t('settingsPage.groups.downloads')}</h2>
                        <p className="text-sm text-[var(--color-text-muted)]">{t('settingsPage.groups.downloadsDesc')}</p>
                    </div>
                </div>
                {dirty && (
                    <div className="px-4 py-2 bg-yellow-500/10 text-yellow-600 border border-yellow-500/20 rounded-lg text-sm font-bold animate-bounce shadow-sm flex items-center gap-2">
                        ⚠️ {t('settingsPage.restartRequired')}
                    </div>
                )}
            </div>

            {/* 1. Storage Configuration */}
            <section className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] shadow-sm relative z-20">
                <div className="px-6 py-4 bg-[var(--color-surface-hover)]/50 border-b border-[var(--color-border)] rounded-t-2xl flex items-center justify-between">
                    <h3 className="font-bold flex items-center gap-2">💾 {t('settingsPage.downloadConfig')}</h3>
                    <div className="relative group cursor-help">
                        <div className="w-5 h-5 rounded-full border border-[var(--color-text-muted)] flex items-center justify-center text-[10px] text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors font-serif">
                            i
                        </div>
                        {/* Tooltip */}
                        <div className="absolute right-0 top-full mt-2 w-72 p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-[100] scale-95 group-hover:scale-100 text-xs leading-relaxed">
                            <div className="space-y-3">
                                <div>
                                    <div className="font-bold text-amber-500 mb-1 flex items-center gap-1.5">
                                        <span className="text-sm">🛠️</span> 开发者模式 (Developer Mode)
                                    </div>
                                    <p className="text-[var(--color-text-muted)]">
                                        开启后允许 HFManager 在无管理员权限下创建“符号链接”（Symlinks）。
                                        <a href="https://learn.microsoft.com/zh-cn/windows/apps/get-started/enable-your-device-for-development" target="_blank" rel="noopener noreferrer" className="text-[var(--color-primary)] hover:underline ml-1 inline-flex items-center gap-0.5 font-medium">
                                            查看官方说明 <span className="text-[10px]">↗</span>
                                        </a>
                                    </p>
                                </div>
                                <div className="pt-2 border-t border-[var(--color-border)]">
                                    <div className="font-bold text-amber-500 mb-1 flex items-center gap-1.5">
                                        <span className="text-sm">📏</span> 长路径支持 (Long Paths)
                                    </div>
                                    <p className="text-[var(--color-text-muted)]">
                                        Windows 默认路径上限为 260 字符。开启此项可避免路径过长导致的读写失败。
                                        <a href="https://learn.microsoft.com/zh-cn/windows/win32/fileio/maximum-file-path-limitation#enable-long-paths-in-windows-10-version-1607-and-later" target="_blank" rel="noopener noreferrer" className="text-[var(--color-primary)] hover:underline ml-1 inline-flex items-center gap-0.5 font-medium">
                                            查看官方说明 <span className="text-[10px]">↗</span>
                                        </a>
                                    </p>
                                </div>
                            </div>
                            <div className="absolute top-[-6px] right-2 w-3 h-3 bg-[var(--color-surface)] border-l border-t border-[var(--color-border)] rotate-45"></div>
                        </div>
                    </div>
                </div>
                <div className="p-6 space-y-6">
                    {/* Download Path */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-[var(--color-text)]">
                            {t('settingsPage.download.savePath')}
                        </label>
                        <div className="flex gap-3">
                            <div className="flex-1">
                                <Combobox
                                    value={settings.download_dir}
                                    onChange={(val) => onUpdate({ download_dir: val })}
                                    options={settings.download_dir_history || []}
                                    onDeleteOption={(opt) => handleDeleteHistory(opt, 'download')}
                                    placeholder="Select or enter path..."
                                    readOnly={true}
                                />
                            </div>
                            <Button variant="secondary" onClick={() => handleSelectFolder('download_dir')}>
                                {t('common.browse')}
                            </Button>
                        </div>
                    </div>

                    {/* Cache Path */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-[var(--color-text)] flex justify-between">
                            <span>{t('settingsPage.cache.path')}</span>
                            <span className="text-[var(--color-text-muted)] font-normal text-xs bg-[var(--color-surface-hover)] px-2 py-0.5 rounded">HF_HOME</span>
                        </label>
                        <div className="flex gap-3">
                            <div className="flex-1">
                                <Combobox
                                    value={settings.hf_cache_dir || settings.resolved_hf_cache_dir || ''}
                                    onChange={(val) => onUpdate({ hf_cache_dir: val })}
                                    options={settings.hf_cache_history || []}
                                    onDeleteOption={(opt) => handleDeleteHistory(opt, 'cache')}
                                    placeholder="System Default"
                                    readOnly={true}
                                />
                            </div>
                            <Button variant="secondary" onClick={() => onUpdate({ hf_cache_dir: '' })}>
                                🔄 {t('common.default')}
                            </Button>
                            <Button variant="secondary" onClick={() => handleSelectFolder('hf_cache_dir')}>
                                {t('common.manage')}
                            </Button>
                        </div>
                        <p className="text-xs text-[var(--color-text-muted)]">
                            {t('settingsPage.cache.desc')}
                        </p>
                    </div>
                </div>
            </section>

            {/* 2. Download Engine */}
            <section className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] shadow-sm relative z-10">
                <div className="px-6 py-4 bg-[var(--color-surface-hover)]/50 border-b border-[var(--color-border)] flex justify-between items-center rounded-t-2xl">
                    <h3 className="font-bold flex items-center gap-2">🚀 {t('settingsPage.download.engineTitle')}</h3>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={async () => {
                            confirm({
                                title: t('common.reset') || 'Restore Defaults',
                                message: t('common.resetDownloads') || 'Revert all download performance settings to defaults?',
                                onConfirm: async () => {
                                    const { resetDownloadSettings } = await import('../../api/client');
                                    await resetDownloadSettings();
                                    await refreshSettings();
                                }
                            });
                        }}
                    >
                        🔄 {t('common.restoreDefaults') || 'Restore Defaults'}
                    </Button>
                </div>

                <div className="p-6 space-y-8">
                    {/* Method Selection */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div
                            className={`relative p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 hover:shadow-md
                            ${settings.download_method === 'PYTHON'
                                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5'
                                    : 'border-[var(--color-border)] hover:border-[var(--color-primary)]/30'}`}
                            onClick={() => onUpdate({ download_method: 'PYTHON' })}
                        >
                            <div className="flex items-start gap-3">
                                <div className="text-2xl">🐍</div>
                                <div>
                                    <div className="font-bold text-[var(--color-text)]">{t('settingsPage.download.pythonTitle')}</div>
                                    <div className="text-xs text-[var(--color-text-muted)] mt-1">{t('settingsPage.download.pythonDesc')}</div>
                                </div>
                            </div>
                            {settings.download_method === 'PYTHON' && <div className="absolute top-3 right-3 text-[var(--color-primary)]">✅</div>}
                        </div>

                        <div
                            className={`relative p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 hover:shadow-md
                            ${settings.download_method === 'ARIA2'
                                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5'
                                    : 'border-[var(--color-border)] hover:border-[var(--color-primary)]/30'}`}
                            onClick={() => onUpdate({ download_method: 'ARIA2' })}
                        >
                            <div className="flex items-start gap-3">
                                <div className="text-2xl">⚡</div>
                                <div>
                                    <div className="font-bold text-[var(--color-text)]">{t('settingsPage.download.aria2Title')}</div>
                                    <div className="text-xs text-[var(--color-text-muted)] mt-1">{t('settingsPage.download.aria2Desc')}</div>
                                </div>
                            </div>
                            {settings.download_method === 'ARIA2' && <div className="absolute top-3 right-3 text-[var(--color-primary)]">✅</div>}
                        </div>
                    </div>

                    {/* Dynamic Details */}
                    <div className="pt-4 border-t border-[var(--color-border)] animate-fade-in">
                        {settings.download_method === 'PYTHON' ? (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="font-medium text-[var(--color-text)]">{t('settingsPage.download.hfTransfer')}</div>
                                        <div className="text-sm text-[var(--color-text-muted)]">{t('settingsPage.download.hfTransferDesc')}</div>
                                    </div>
                                    <button
                                        onClick={() => onUpdate({ use_hf_transfer: !settings.use_hf_transfer })}
                                        className={`w-12 h-6 rounded-full transition-colors relative ${settings.use_hf_transfer ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-surface-hover)] border border-[var(--color-border)]'}`}
                                    >
                                        <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${settings.use_hf_transfer ? 'translate-x-6' : ''}`} />
                                    </button>
                                </div>

                                {/* Python Threads Config */}
                                {!settings.use_hf_transfer && (
                                    <div className="p-4 bg-[var(--color-surface-hover)]/30 rounded-xl border border-[var(--color-border)]">
                                        <div className="flex justify-between mb-2">
                                            <label className="text-sm font-medium">{t('settingsPage.download.pythonThreads')}</label>
                                            <span className="text-[var(--color-primary)] font-bold">{localPythonWorkers}</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="text-xs text-[var(--color-text-muted)]">1</span>
                                            <input
                                                type="range"
                                                min="1"
                                                max="32"
                                                step="1"
                                                value={localPythonWorkers}
                                                onChange={(e) => setLocalPythonWorkers(parseInt(e.target.value))}
                                                onMouseUp={() => onUpdate({ python_max_workers: localPythonWorkers })}
                                                className="flex-1 accent-[var(--color-primary)] cursor-pointer h-1.5 bg-[var(--color-border)] rounded-lg appearance-none"
                                            />
                                            <span className="text-xs text-[var(--color-text-muted)]">32</span>
                                        </div>
                                        <div className="text-xs text-[var(--color-text-muted)] mt-2">
                                            {t('settingsPage.download.pythonThreadsHint')}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-6">
                                <div className="space-y-4">
                                    {/* Smart Optimization */}
                                    <div className="flex items-center justify-between p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-hover)]/30">
                                        <div>
                                            <div className="text-sm font-medium flex items-center gap-2">
                                                ⚡ {t('settingsPage.aria2.optimize')}
                                                <span className="text-[10px] bg-green-500/10 text-green-600 px-1.5 rounded border border-green-500/20">Recommended</span>
                                            </div>
                                            <div className="text-xs text-[var(--color-text-muted)] mt-0.5">{t('settingsPage.aria2.optimizeDesc')}</div>
                                        </div>
                                        <button
                                            onClick={() => handleAria2Change({ aria2_reuse_uri: !settings.aria2_reuse_uri })}
                                            className={`w-10 h-5 rounded-full transition-colors relative ${settings.aria2_reuse_uri ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'}`}
                                        >
                                            <div className={`absolute top-1 left-1 w-3 h-3 rounded-full bg-white transition-transform ${settings.aria2_reuse_uri ? 'translate-x-5' : ''}`} />
                                        </button>
                                    </div>

                                    {/* Config Grid */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-[var(--color-background)] p-4 rounded-xl border border-[var(--color-border)]">
                                        {/* Max Connection */}
                                        <div>
                                            <div className="flex justify-between mb-2">
                                                <label className="text-sm font-medium">{t('settingsPage.aria2.maxConn')}</label>
                                                <span className="text-[var(--color-primary)] font-bold">{localAria2Conn}</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className="text-xs text-[var(--color-text-muted)]">1</span>
                                                <input
                                                    type="range"
                                                    min="1"
                                                    max="16"
                                                    step="1"
                                                    value={localAria2Conn}
                                                    onChange={(e) => setLocalAria2Conn(parseInt(e.target.value))}
                                                    onMouseUp={() => handleAria2Change({ aria2_max_connection_per_server: localAria2Conn })}
                                                    className="flex-1 accent-[var(--color-primary)] cursor-pointer h-1.5 bg-[var(--color-border)] rounded-lg appearance-none"
                                                />
                                                <span className="text-xs text-[var(--color-text-muted)]">16</span>
                                            </div>
                                        </div>
                                        {/* Split */}
                                        <div>
                                            <div className="flex justify-between mb-2">
                                                <label className="text-sm font-medium">{t('settingsPage.aria2.split')}</label>
                                                <span className="text-[var(--color-primary)] font-bold">{localAria2Split}</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className="text-xs text-[var(--color-text-muted)]">1</span>
                                                <input
                                                    type="range"
                                                    min="1"
                                                    max="64"
                                                    step="1"
                                                    value={localAria2Split}
                                                    onChange={(e) => setLocalAria2Split(parseInt(e.target.value))}
                                                    onMouseUp={() => handleAria2Change({ aria2_split: localAria2Split })}
                                                    className="flex-1 accent-[var(--color-primary)] cursor-pointer h-1.5 bg-[var(--color-border)] rounded-lg appearance-none"
                                                />
                                                <span className="text-xs text-[var(--color-text-muted)]">64</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-col md:flex-row gap-6 pt-2">
                                    {/* SSL Certificate */}
                                    <div className="flex-1 flex items-center justify-between p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)]">
                                        <div>
                                            <div className="text-sm font-medium">{t('settingsPage.aria2.checkCert')}</div>
                                            <div className="text-xs text-[var(--color-text-muted)] mt-0.5">{t('settingsPage.aria2.checkCertDesc')}</div>
                                        </div>
                                        <button
                                            onClick={() => handleAria2Change({ aria2_check_certificate: !settings.aria2_check_certificate })}
                                            className={`w-10 h-5 rounded-full transition-colors relative ${settings.aria2_check_certificate ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'}`}
                                        >
                                            <div className={`absolute top-1 left-1 w-3 h-3 rounded-full bg-white transition-transform ${settings.aria2_check_certificate ? 'translate-x-5' : ''}`} />
                                        </button>
                                    </div>

                                    {/* Proxy */}
                                    <div className="flex-1">
                                        <label className="block text-sm font-medium mb-1">{t('settingsPage.aria2.proxy')}</label>
                                        <input
                                            type="text"
                                            value={localProxy}
                                            onChange={(e) => setLocalProxy(e.target.value)}
                                            onBlur={() => handleAria2Change({ aria2_all_proxy: localProxy })}
                                            onKeyDown={(e) => e.key === 'Enter' && handleAria2Change({ aria2_all_proxy: localProxy })}
                                            placeholder="http://127.0.0.1:7890"
                                            className="w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg focus:ring-1 focus:ring-[var(--color-primary)] outline-none text-sm"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </section>
        </div>
    );
}
