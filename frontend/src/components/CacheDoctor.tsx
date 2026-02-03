import { useState, useEffect } from 'react';
import { getCacheAnalysis, cleanIncomplete, cleanOrphans, type CacheAnalysisReport } from '../api/client';
import { ConfirmModal } from './ConfirmModal';
import { useLanguage } from '../contexts/LanguageContext';

interface CacheDoctorProps {
    onCleanComplete?: () => void;
    filter?: 'all' | 'model' | 'dataset';
}

export function CacheDoctor({ onCleanComplete, filter = 'all' }: CacheDoctorProps) {
    const { t } = useLanguage();
    const [report, setReport] = useState<CacheAnalysisReport | null>(null);
    const [loading, setLoading] = useState(false);
    const [cleaning, setCleaning] = useState(false);

    // Modal state
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        onConfirm: () => void;
        confirmText?: string;
    }>({
        isOpen: false, title: '', message: '', onConfirm: () => { }
    });

    const loadAnalysis = async () => {
        setLoading(true);
        try {
            const data = await getCacheAnalysis(filter);
            setReport(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadAnalysis();
    }, [filter]);


    const handleCleanIncomplete = () => {
        if (!report || report.reclaimable.incomplete.size === 0) return;

        setConfirmModal({
            isOpen: true,
            title: t('cache.doctor.incomplete.confirmTitle'),
            message: t('cache.doctor.incomplete.confirmMsg', { count: report.reclaimable.incomplete.count, size: report.reclaimable.incomplete.size_formatted }),
            confirmText: t('cache.doctor.incomplete.confirmBtn'),
            onConfirm: async () => {
                setCleaning(true);
                try {
                    await cleanIncomplete();
                    await loadAnalysis();
                    if (onCleanComplete) onCleanComplete();
                } finally {
                    setCleaning(false);
                }
            }
        });
    };

    const handleCleanOrphans = () => {
        if (!report || report.reclaimable.old_revisions.size === 0) return;

        setConfirmModal({
            isOpen: true,
            title: t('cache.doctor.revisions.confirmTitle'),
            message: t('cache.doctor.revisions.confirmMsg', { count: report.reclaimable.old_revisions.count, size: report.reclaimable.old_revisions.size_formatted }),
            confirmText: t('cache.doctor.revisions.confirmBtn'),
            onConfirm: async () => {
                setCleaning(true);
                try {
                    await cleanOrphans();
                    await loadAnalysis();
                    if (onCleanComplete) onCleanComplete();
                } finally {
                    setCleaning(false);
                }
            }
        });
    };

    if (loading && !report) {
        return (
            <div className="p-8 text-center text-[var(--color-text-muted)] animate-pulse">
                {t('cache.doctor.analyzing')}
            </div>
        );
    }

    if (!report) return null;

    // Calculate colors for chart
    const colors = [
        'bg-indigo-500', 'bg-blue-500', 'bg-sky-500', 'bg-cyan-500', 'bg-teal-500',
        'bg-emerald-500', 'bg-green-500', 'bg-lime-500', 'bg-yellow-500', 'bg-orange-500'
    ];

    return (
        <div className="space-y-6">
            <ConfirmModal
                isOpen={confirmModal.isOpen}
                onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })}
                onConfirm={confirmModal.onConfirm}
                title={confirmModal.title}
                message={confirmModal.message}
                isDestructive={true}
                confirmText={confirmModal.confirmText}
            />

            {/* Storage Bar */}
            <div className="bg-[var(--color-surface)] rounded-xl p-6 border border-[var(--color-border)]">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-[var(--color-text)]">
                    <span>💾</span> {t('cache.doctor.storageAnalysis')}
                    <div className="flex gap-4 ml-6 items-center">
                        <span className="text-xs px-2 py-0.5 bg-indigo-500/20 text-indigo-400 rounded-full border border-indigo-500/30">
                            {report.summary.models_count} {t('cache.doctor.models')}
                        </span>
                        <span className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded-full border border-blue-500/30">
                            {report.summary.datasets_count} {t('cache.doctor.datasets')}
                        </span>
                    </div>
                    <span className="text-sm font-normal text-[var(--color-text-muted)] ml-auto">
                        {t('cache.doctor.totalUsage')}: <span className="text-[var(--color-text)] font-bold">{report.summary.total_size_formatted}</span>
                    </span>
                </h3>


                {/* Bar Chart */}
                <div className="h-4 w-full bg-[var(--color-surface-hover)] rounded-full overflow-hidden flex mb-4">
                    {report.chart_data.map((item, index) => (
                        <div
                            key={item.name}
                            className={`h-full ${colors[index % colors.length]} hover:brightness-110 transition-all cursor-help relative group`}
                            style={{ width: `${Math.max(item.percentage, 0.5)}%` }}
                        >
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block bg-[var(--color-background)] border border-[var(--color-border)] p-2 rounded text-xs whitespace-nowrap z-10 shadow-xl text-[var(--color-text)]">
                                {item.name}: {item.size_formatted} ({item.percentage.toFixed(1)}%)
                            </div>
                        </div>
                    ))}
                </div>

                {/* Legend */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-[var(--color-text-muted)]">
                    {report.chart_data.slice(0, 8).map((item, index) => (
                        <div key={item.name} className="flex items-center gap-2 truncate">
                            <div className={`w-2 h-2 rounded-full ${colors[index % colors.length]}`}></div>
                            <span className="truncate flex-1" title={item.name}>{item.name}</span>
                            <span className="text-[var(--color-text-muted)]">{item.size_formatted}</span>
                        </div>
                    ))}
                    {report.chart_data.length > 8 && (
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-[var(--color-text-muted)]"></div>
                            <span>{t('cache.doctor.others')}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Cleanup Tools */}
            <div className="grid md:grid-cols-2 gap-4">
                {/* Incomplete Files */}
                <div className="bg-[var(--color-surface)] rounded-xl p-5 border border-[var(--color-border)] flex flex-col justify-between">
                    <div>
                        <div className="text-[var(--color-text-muted)] text-sm mb-1">{t('cache.doctor.incomplete.title')}</div>
                        <div className="text-2xl font-bold text-[var(--color-text)] mb-2">{report.reclaimable.incomplete.size_formatted}</div>
                        <p className="text-xs text-[var(--color-text-muted)] mb-4">
                            {t('cache.doctor.incomplete.desc', { count: report.reclaimable.incomplete.count })}
                        </p>
                    </div>
                    <button
                        onClick={handleCleanIncomplete}
                        disabled={loading || cleaning || report.reclaimable.incomplete.size === 0}
                        className="w-full py-2 bg-[var(--color-surface-hover)] hover:bg-[var(--color-surface)] disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 border border-[var(--color-border)]"
                    >
                        {cleaning ? <span className="animate-spin">⏳</span> : '🧹'}
                        {t('cache.doctor.incomplete.btn')}
                    </button>
                </div>

                {/* Old Revisions */}
                <div className="bg-[var(--color-surface)] rounded-xl p-5 border border-[var(--color-border)] flex flex-col justify-between">
                    <div>
                        <div className="text-[var(--color-text-muted)] text-sm mb-1">{t('cache.doctor.revisions.title')}</div>
                        <div className="text-2xl font-bold text-[var(--color-text)] mb-2">{report.reclaimable.old_revisions.size_formatted}</div>
                        <p className="text-xs text-[var(--color-text-muted)] mb-4">
                            {t('cache.doctor.revisions.desc', { count: report.reclaimable.old_revisions.count })}
                        </p>
                    </div>
                    <button
                        onClick={handleCleanOrphans}
                        disabled={loading || cleaning || report.reclaimable.old_revisions.size === 0}
                        className="w-full py-2 bg-[var(--color-surface-hover)] hover:bg-[var(--color-surface)] disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 border border-[var(--color-border)]"
                    >
                        {cleaning ? <span className="animate-spin">⏳</span> : '♻️'}
                        {t('cache.doctor.revisions.btn')}
                    </button>
                </div>
            </div>
        </div>
    );
}
