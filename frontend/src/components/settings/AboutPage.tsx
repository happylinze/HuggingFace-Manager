import { useState } from 'react';
import { Button } from '../Button';
import { checkUpdate } from '../../api/client';
import { useLanguage } from '../../contexts/LanguageContext';

export function AboutPage() {
    const { t } = useLanguage();
    const [checking, setChecking] = useState(false);
    const [updateMsg, setUpdateMsg] = useState<string | null>(null);

    const handleCheckUpdate = async () => {
        setChecking(true);
        setUpdateMsg(null);
        try {
            const result = await checkUpdate();
            if (result.has_update) {
                setUpdateMsg(`✨ ${t('settingsPage.about.newVersion').replace('{version}', result.latest_version)}`);
            } else {
                setUpdateMsg(`✅ ${t('settingsPage.about.latest')} (${result.current_version})`);
            }
        } catch (e) {
            setUpdateMsg('❌ Failed to check updates');
        } finally {
            setChecking(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto py-12 animate-fade-in">
            <div className="flex flex-col items-center space-y-8">
                {/* Logo & Version */}
                <div className="text-center space-y-4">
                    <div className="w-32 h-32 rounded-3xl mx-auto flex items-center justify-center mb-4 animate-float overflow-hidden shadow-2xl shadow-indigo-500/20">
                        <img src="/logo.png" alt="Hugging Face Manager" className="w-full h-full object-cover" />
                    </div>
                    <h2 className="text-3xl font-bold text-[var(--color-text)]">Hugging Face Manager</h2>
                    <p className="text-lg text-[var(--color-text-muted)] mt-1 font-mono bg-[var(--color-surface)] py-1 px-3 rounded-full border border-[var(--color-border)] inline-block">v0.1.0 Beta</p>
                </div>

                {/* Description */}
                <p className="text-center text-[var(--color-text-muted)] max-w-lg text-lg">
                    {t('settingsPage.about.appDesc')}
                </p>

                {/* Tech Stack Badges */}
                <div className="flex flex-wrap gap-3 justify-center">
                    <span className="px-3 py-1.5 bg-blue-500/10 text-blue-400 text-sm font-medium rounded-lg border border-blue-500/20 shadow-sm">Python</span>
                    <span className="px-3 py-1.5 bg-cyan-500/10 text-cyan-400 text-sm font-medium rounded-lg border border-cyan-500/20 shadow-sm">React 19</span>
                    <span className="px-3 py-1.5 bg-teal-500/10 text-teal-400 text-sm font-medium rounded-lg border border-teal-500/20 shadow-sm">FastAPI</span>
                    <span className="px-3 py-1.5 bg-orange-500/10 text-orange-400 text-sm font-medium rounded-lg border border-orange-500/20 shadow-sm">Rust Core</span>
                    <span className="px-3 py-1.5 bg-purple-500/10 text-purple-400 text-sm font-medium rounded-lg border border-purple-500/20 shadow-sm">Vite</span>
                </div>

                {/* Actions */}
                <div className="w-full max-w-md space-y-4 pt-4">
                    <div className="p-6 bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] text-center shadow-lg space-y-4">

                        <Button
                            variant="primary"
                            size="lg"
                            fullWidth
                            onClick={handleCheckUpdate}
                            isLoading={checking}
                            className="shadow-lg shadow-indigo-500/20"
                        >
                            <div className="flex items-center gap-2 justify-center">
                                {checking ? (
                                    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3" />
                                    </svg>
                                )}
                                <span>{checking ? t('settingsPage.about.checking') : t('settingsPage.about.checkUpdate')}</span>
                            </div>
                        </Button>

                        {updateMsg && (
                            <div className={`text-sm font-medium p-2 rounded-lg ${updateMsg.includes('New') ? 'bg-emerald-500/10 text-emerald-400' : 'bg-[var(--color-background)] text-[var(--color-text-muted)]'}`}>
                                {updateMsg}
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-4 mt-6">
                            <a
                                href="https://github.com/happylinze/HuggingFace-Manager"
                                target="_blank"
                                rel="noreferrer"
                                className="flex flex-col items-center justify-center p-4 rounded-xl bg-[var(--color-background)] hover:bg-[var(--color-surface-hover)] border border-[var(--color-border)] hover:border-[var(--color-primary)]/50 transition-all group"
                            >
                                <svg className="w-8 h-8 mb-2 text-[var(--color-text)] group-hover:text-[var(--color-primary)] transition-colors" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" /></svg>
                                <span className="text-sm font-medium text-[var(--color-text)] group-hover:text-[var(--color-primary)]">{t('settingsPage.about.github')}</span>
                            </a>
                            <a
                                href="mailto:linze.cv@gmail.com"
                                className="flex flex-col items-center justify-center p-4 rounded-xl bg-[var(--color-background)] hover:bg-[var(--color-surface-hover)] border border-[var(--color-border)] hover:border-[var(--color-primary)]/50 transition-all group"
                            >
                                <span className="text-3xl mb-1 group-hover:scale-110 transition-transform">📨</span>
                                <span className="text-sm font-medium text-[var(--color-text)] group-hover:text-[var(--color-primary)]">{t('settingsPage.about.contact')}</span>
                            </a>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="text-center text-sm text-[var(--color-text-muted)] space-y-2 pt-8 border-t border-[var(--color-border)] w-full max-w-2xl">
                    <p>{t('settingsPage.about.copyright')}</p>
                </div>
            </div>
        </div>
    );
}
