import { useState, useEffect } from 'react';
import { getCompatibility, type SystemCompatibility } from '../api/client';

export function CompatibilityWarning({ variant = 'banner' }: { variant?: 'banner' | 'inline' }) {
    const [comp, setComp] = useState<SystemCompatibility | null>(null);
    const [dismissed, setDismissed] = useState(() => {
        return localStorage.getItem('compatibility_warning_dismissed') === 'true';
    });

    useEffect(() => {
        checkCompatibility();
    }, []);

    const handleDismiss = () => {
        setDismissed(true);
        localStorage.setItem('compatibility_warning_dismissed', 'true');
    };

    const checkCompatibility = async () => {
        try {
            const data = await getCompatibility();
            setComp(data);
        } catch (err) {
            console.error('Failed to check compatibility:', err);
        }
    };

    if (dismissed || !comp || !comp.is_windows) return null;

    const hasIssues = !comp.dev_mode_enabled || !comp.long_paths_enabled;
    if (!hasIssues) return null;

    if (variant === 'inline') {
        return (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-start gap-3 mt-4 relative group">
                <span className="text-xl">⚠️</span>
                <div className="flex-1">
                    <h4 className="font-bold text-amber-400 mb-1">Windows 兼容性预警</h4>
                    <p className="text-sm text-slate-300 mb-2">
                        {(!comp.dev_mode_enabled && !comp.long_paths_enabled)
                            ? '检测到“开发者模式”和“长路径支持”均未开启。'
                            : !comp.dev_mode_enabled
                                ? '未开启“开发者模式”，同步功能可能会受限。'
                                : '未开启“系统长路径支持”，部分超长文件名的模型可能下载失败。'}
                    </p>
                    <a
                        href="https://learn.microsoft.com/zh-cn/windows/apps/get-started/enable-your-device-for-development"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-amber-400 hover:text-amber-300 underline underline-offset-2"
                    >
                        查看修复指南
                    </a>
                </div>
                <button
                    onClick={handleDismiss}
                    className="p-1.5 hover:bg-amber-500/20 rounded-lg text-amber-500/50 hover:text-amber-400 transition-colors"
                    title="不再显示"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                    </svg>
                </button>
            </div>
        );
    }

    return (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 flex items-center justify-between animate-fade-in-down">
            <div className="flex items-center gap-3 text-sm">
                <span className="text-xl">⚠️</span>
                <div>
                    <span className="font-bold text-amber-400">Windows 兼容性预警:</span>
                    <span className="ml-2 text-slate-300">
                        {(!comp.dev_mode_enabled && !comp.long_paths_enabled)
                            ? '检测到“开发者模式”和“长路径支持”均未开启。'
                            : !comp.dev_mode_enabled
                                ? '未开启“开发者模式”，同步功能可能会受限。'
                                : '未开启“系统长路径支持”，部分超长文件名的模型可能下载失败。'}
                    </span>
                    <a
                        href="https://learn.microsoft.com/zh-cn/windows/apps/get-started/enable-your-device-for-development"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 text-amber-400 hover:text-amber-300 underline underline-offset-2"
                    >
                        查看修复指南
                    </a>
                </div>
            </div>
            <button
                onClick={handleDismiss}
                className="p-1 hover:bg-white/10 rounded-full transition-colors"
                title="忽略"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                </svg>
            </button>
        </div>
    );
}
