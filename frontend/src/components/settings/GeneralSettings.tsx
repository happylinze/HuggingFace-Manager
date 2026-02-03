import { Button } from '../Button';
import { Dropdown } from '../Dropdown';
import { useTheme } from '../../contexts/ThemeContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { openLogsFolder, type Settings } from '../../api/client';

interface GeneralSettingsProps {
    settings: Settings;
    onUpdate: (updates: Partial<Settings>) => Promise<void>;
    onCleanLogs: () => Promise<void>;
    onToggleStartup: (enable: boolean) => Promise<void>;
}

export function GeneralSettings({ settings, onUpdate, onCleanLogs, onToggleStartup }: GeneralSettingsProps) {
    const { theme, setTheme } = useTheme();
    const { language, setLanguage, t } = useLanguage();

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex items-center gap-3 pb-2 border-b border-[var(--color-border)]">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-xl shadow-lg shadow-blue-500/20 text-white">
                    🖥️
                </div>
                <h2 className="text-xl font-bold text-[var(--color-text)]">{t('common.general')}</h2>
            </div>

            {/* Appearance */}
            <section className="space-y-4 bg-[var(--color-surface)] p-6 rounded-xl border border-[var(--color-border)]">
                <h3 className="text-lg font-semibold flex items-center gap-2 text-[var(--color-text)]">
                    🎨 {t('settingsPage.appearance')}
                </h3>

                <div className="grid gap-6 md:grid-cols-2">
                    <div>
                        <label className="text-sm font-medium text-[var(--color-text-muted)] mb-3 block">{t('common.theme')}</label>
                        <div className="flex bg-[var(--color-background)] p-1.5 rounded-xl border border-[var(--color-border)] w-full">
                            {(['light', 'dark', 'system'] as const).map((tMode) => (
                                <button
                                    key={tMode}
                                    onClick={() => setTheme(tMode)}
                                    className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all capitalize
                                        ${theme === tMode
                                            ? 'bg-[var(--color-surface)] text-[var(--color-primary)] shadow-sm'
                                            : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                                        }`}
                                >
                                    {tMode === 'light' ? `☀️ ${t('common.light')}` : tMode === 'dark' ? `🌙 ${t('common.dark')}` : `🖥️ ${t('common.system')}`}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="text-sm font-medium text-[var(--color-text-muted)] mb-3 block">{t('common.language')}</label>
                        <div className="flex bg-[var(--color-background)] p-1.5 rounded-xl border border-[var(--color-border)] w-full">
                            {(['zh', 'en'] as const).map((l) => (
                                <button
                                    key={l}
                                    onClick={() => setLanguage(l)}
                                    className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all capitalize
                                    ${language === l
                                            ? 'bg-[var(--color-surface)] text-[var(--color-primary)] shadow-sm'
                                            : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                                        }`}
                                >
                                    {l === 'zh' ? '中文' : 'English'}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </section>


            {/* Home Page Settings */}
            <section className="space-y-4 bg-[var(--color-surface)] p-6 rounded-xl border border-[var(--color-border)]">
                <h3 className="text-lg font-semibold flex items-center gap-2 text-[var(--color-text)]">
                    🏠 {t('settingsPage.home.title') || "Home Page"}
                </h3>

                <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                    {/* Search History */}
                    <button
                        onClick={() => onUpdate({ show_search_history: !(settings.show_search_history !== false) })}
                        className={`p-2 rounded-lg border transition-all duration-200 flex flex-row items-center gap-2 text-left group
                            ${settings.show_search_history !== false
                                ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5 text-[var(--color-primary)] shadow-sm'
                                : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)]/50 hover:bg-[var(--color-surface-hover)]'
                            }`}
                    >
                        <div className={`p-1.5 rounded-md transition-colors ${settings.show_search_history !== false ? 'bg-[var(--color-primary)]/10' : 'bg-[var(--color-background)] group-hover:scale-110'}`}>
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
                            </svg>
                        </div>
                        <div className="min-w-0">
                            <div className="text-xs font-semibold truncate">{t('settingsPage.home.showHistory') || "Search History"}</div>
                        </div>
                    </button>

                    {/* Trending Tags */}
                    <button
                        onClick={() => onUpdate({ show_trending_tags: !(settings.show_trending_tags !== false) })}
                        className={`p-2 rounded-lg border transition-all duration-200 flex flex-row items-center gap-2 text-left group
                            ${settings.show_trending_tags !== false
                                ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5 text-[var(--color-primary)] shadow-sm'
                                : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)]/50 hover:bg-[var(--color-surface-hover)]'
                            }`}
                    >
                        <div className={`p-1.5 rounded-md transition-colors ${settings.show_trending_tags !== false ? 'bg-[var(--color-primary)]/10' : 'bg-[var(--color-background)] group-hover:scale-110'}`}>
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" />
                            </svg>
                        </div>
                        <div className="min-w-0">
                            <div className="text-xs font-semibold truncate">{t('settingsPage.home.showTags') || "Trending Tags"}</div>
                        </div>
                    </button>

                    {/* Trending Repos */}
                    <button
                        onClick={() => onUpdate({ show_trending_repos: !(settings.show_trending_repos !== false) })}
                        className={`p-2 rounded-lg border transition-all duration-200 flex flex-row items-center gap-2 text-left group
                            ${settings.show_trending_repos !== false
                                ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5 text-[var(--color-primary)] shadow-sm'
                                : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)]/50 hover:bg-[var(--color-surface-hover)]'
                            }`}
                    >
                        <div className={`p-1.5 rounded-md transition-colors ${settings.show_trending_repos !== false ? 'bg-[var(--color-primary)]/10' : 'bg-[var(--color-background)] group-hover:scale-110'}`}>
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
                            </svg>
                        </div>
                        <div className="min-w-0">
                            <div className="text-xs font-semibold truncate">{t('settingsPage.home.showTrending') || "Trending Section"}</div>
                        </div>
                    </button>
                </div>
            </section>

            {/* Search Configuration */}
            <section className="space-y-4 bg-[var(--color-surface)] p-6 rounded-xl border border-[var(--color-border)]">
                <h3 className="text-lg font-semibold flex items-center gap-2 text-[var(--color-text)]">
                    🔍 {t('settingsPage.search.title') === 'settingsPage.search.title' ? "搜索设置" : t('settingsPage.search.title')}
                </h3>

                <div className="flex items-center justify-between">
                    <div>
                        <div className="font-medium text-[var(--color-text)]">{t('settingsPage.search.limit') === 'settingsPage.search.limit' ? "默认搜索结果数量" : t('settingsPage.search.limit')}</div>
                        <div className="text-sm text-[var(--color-text-muted)]">{t('settingsPage.search.limitDesc') === 'settingsPage.search.limitDesc' ? "每次搜索返回的最大结果数 (分页限制)" : t('settingsPage.search.limitDesc')}</div>
                    </div>
                    <div className="min-w-[100px]">
                        <Dropdown
                            value={(settings.default_search_limit || 10).toString()}
                            onChange={(val) => onUpdate({ default_search_limit: parseInt(val) })}
                            options={[
                                { value: "10", label: "10" },
                                { value: "20", label: "20" },
                                { value: "50", label: "50" },
                                { value: "100", label: "100" }
                            ]}
                            buttonClassName="bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg px-3 py-1.5 h-9"
                        />
                    </div>
                </div>
            </section>

            {/* System Settings */}
            <section className="space-y-4 bg-[var(--color-surface)] p-6 rounded-xl border border-[var(--color-border)]">
                <h3 className="text-lg font-semibold flex items-center gap-2 text-[var(--color-text)]">
                    ⚙️ {t('settingsPage.system.title')}
                </h3>

                {/* Auto Update */}
                <div className="flex items-center justify-between p-4 rounded-xl hover:bg-[var(--color-surface-hover)] transition-colors border border-transparent hover:border-[var(--color-border)]">
                    <div>
                        <div className="font-medium text-[var(--color-text)]">{t('settingsPage.system.autoUpdate')}</div>
                        <div className="text-sm text-[var(--color-text-muted)]">{t('settingsPage.system.autoUpdateDesc')}</div>
                    </div>
                    <button
                        onClick={() => onUpdate({ check_update_on_start: !settings.check_update_on_start })}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-2
                                ${settings.check_update_on_start ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'}`}
                    >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ease-in-out ${settings.check_update_on_start ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                </div>

                {/* Startup */}
                <div className="flex items-center justify-between p-4 rounded-xl hover:bg-[var(--color-surface-hover)] transition-colors border border-transparent hover:border-[var(--color-border)]">
                    <div>
                        <div className="font-medium text-[var(--color-text)]">{t('settingsPage.system.startup')}</div>
                        <div className="text-sm text-[var(--color-text-muted)]">{t('settingsPage.system.startupDesc')}</div>
                    </div>
                    <button
                        onClick={() => onToggleStartup(!settings.auto_start)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-2
                                ${settings.auto_start ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'}`}
                    >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ease-in-out ${settings.auto_start ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                </div>

                {/* Log Maintenance */}
                <div className="flex items-center justify-between p-4 rounded-xl hover:bg-[var(--color-surface-hover)] transition-colors border border-transparent hover:border-[var(--color-border)]">
                    <div>
                        <div className="font-medium text-[var(--color-text)]">{t('settingsPage.system.logClean')}</div>
                        <div className="text-sm text-[var(--color-text-muted)]">{t('settingsPage.system.logCleanDesc')}</div>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="secondary" size="sm" onClick={openLogsFolder}>
                            📂 {t('settingsPage.system.openLogs')}
                        </Button>
                        <Button variant="secondary" size="sm" onClick={onCleanLogs}>
                            🧹 {t('settingsPage.system.cleanBtn')}
                        </Button>
                    </div>
                </div>
            </section>



            {/* Developer options */}
            <section className="space-y-4 bg-[var(--color-surface)] p-6 rounded-xl border border-[var(--color-border)]">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold flex items-center gap-2 text-[var(--color-text)]">
                        🐛 {t('settingsPage.debug.title') === 'settingsPage.debug.title' ? "调试诊断" : t('settingsPage.debug.title')}
                    </h3>
                    <div className="group relative">
                        <div className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-primary)] cursor-help transition-colors">
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
                            </svg>
                        </div>
                        {/* Tooltip Content */}
                        <div className="absolute right-0 top-8 w-64 p-3 bg-gray-800 text-[10px] text-gray-300 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20 border border-gray-700 leading-relaxed pointer-events-none">
                            <div className="font-bold text-[var(--color-primary)] mb-1">
                                {t('settingsPage.debug.howToUse') === 'settingsPage.debug.howToUse' ? "如何使用调试模式：" : t('settingsPage.debug.howToUse')}
                            </div>
                            <ul className="list-disc pl-3 space-y-1">
                                <li><strong>{t('settingsPage.debug.panel') === 'settingsPage.debug.panel' ? '调试面板' : t('settingsPage.debug.panel')}:</strong> {t('settingsPage.debug.panelDesc') === 'settingsPage.debug.panelDesc' ? '点击右下角的 🐛 图标查看原始日志和任务数据。' : t('settingsPage.debug.panelDesc')}</li>
                                <li><strong>{t('settingsPage.debug.trace') === 'settingsPage.debug.trace' ? 'Shift-Click 诊断' : t('settingsPage.debug.trace')}:</strong> {t('settingsPage.debug.traceDesc') === 'settingsPage.debug.traceDesc' ? '按住 SHIFT 键点击下载卡片，可将其原始数据转储到日志中。' : t('settingsPage.debug.traceDesc')}</li>
                            </ul>
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-between p-4 rounded-xl hover:bg-[var(--color-surface-hover)] transition-colors border border-transparent hover:border-[var(--color-border)]">
                    <div>
                        <div className="font-medium text-[var(--color-text)]">{t('settingsPage.debug.enable') === 'settingsPage.debug.enable' ? '启用调试诊断' : t('settingsPage.debug.enable')}</div>
                        <div className="text-sm text-[var(--color-text-muted)]">{t('settingsPage.debug.enableDesc') === 'settingsPage.debug.enableDesc' ? '显示调试图标并启用开发者排错工具' : t('settingsPage.debug.enableDesc')}</div>
                    </div>
                    <button
                        onClick={() => {
                            console.log('Toggling debug_mode to:', !settings.debug_mode);
                            onUpdate({ debug_mode: !settings.debug_mode });
                        }}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-2
                                ${settings.debug_mode ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'}`}
                    >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ease-in-out ${settings.debug_mode ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                </div>

                {
                    settings.debug_mode && (
                        <>
                            <div className="p-4 rounded-xl bg-[var(--color-primary)]/5 border border-[var(--color-primary)]/10 flex items-center justify-between group/data">
                                <div>
                                    <div className="text-sm font-medium text-[var(--color-text)]">应用存档目录 (Data Folder)</div>
                                    <div className="text-[10px] font-mono text-[var(--color-text-muted)] mt-1 opacity-60 truncate max-w-[200px] sm:max-w-md italic">
                                        {settings.app_data_dir}
                                    </div>
                                </div>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={async () => {
                                        try {
                                            console.log('Opening path:', settings.app_data_dir);
                                            const res = await fetch('/api/system/open-path', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ path: settings.app_data_dir })
                                            });
                                            const data = await res.json();
                                            console.log('Open path result:', data);
                                        } catch (e) {
                                            console.error('Failed to open path:', e);
                                        }
                                    }}
                                >
                                    📂 打开
                                </Button>
                            </div>
                            <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg text-xs text-[var(--color-primary)] animate-fade-in">
                                <span className="mr-2">💡</span>
                                {t('settingsPage.debug.activeHint') === 'settingsPage.debug.activeHint' ? '调试模式已激活。你现在可以在屏幕底部找到 🐛 图标。' : t('settingsPage.debug.activeHint')}
                            </div>
                        </>
                    )
                }
            </section >

            {/* Experimental Features */}
            < section className="space-y-4 bg-[var(--color-surface)] p-6 rounded-xl border border-[var(--color-border)] relative overflow-hidden group" >
                <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                    <span className="text-4xl">🧪</span>
                </div>

                <h3 className="text-lg font-semibold flex items-center gap-2 text-[var(--color-text)]">
                    🧪 {t('settingsPage.experimental.title')}
                </h3>
                <p className="text-sm text-[var(--color-text-muted)]">
                    {t('settingsPage.experimental.desc')}
                </p>

                <div className="mt-4 p-4 rounded-xl bg-[var(--color-background)] border border-[var(--color-border)] space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="text-xl">⌨️</span>
                            <div>
                                <div className="font-medium text-[var(--color-text)] text-sm">{t('settingsPage.experimental.cliTitle')}</div>
                                <div className="text-xs text-[var(--color-text-muted)]">{t('settingsPage.experimental.cliDesc')}</div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-black/20 rounded-lg p-3 font-mono text-xs text-[var(--color-primary)] border border-[var(--color-primary)]/20 relative group/cmd">
                        <div className="text-[10px] text-[var(--color-text-muted)] mb-1 uppercase tracking-wider">{t('settingsPage.experimental.cliHint')}</div>
                        <code className="break-all select-all">python -m hfmanager --help</code>
                        <button
                            onClick={() => {
                                navigator.clipboard.writeText('python -m hfmanager --help');
                                // Could add a toast here
                            }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded hover:bg-[var(--color-primary)]/10 text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-all opacity-0 group-hover/cmd:opacity-100"
                            title={t('settingsPage.experimental.cliCopy')}
                        >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                            </svg>
                        </button>
                    </div>
                </div>
            </section >
        </div >
    );
}
