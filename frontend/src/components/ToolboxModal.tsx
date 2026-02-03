import { useState, useEffect, useRef } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useConfirm } from '../contexts/ConfirmContext';
import { Modal } from './Modal';
import { type PluginStatus, getPlugins, installPlugin, uninstallPlugin, convertGGUF, getQuantizationTypes, selectFileDialog } from '../api/client';
import { FolderOpenIcon, WrenchScrewdriverIcon, CommandLineIcon, CubeIcon, TrashIcon } from '@heroicons/react/24/outline';
import { Dropdown } from './Dropdown';

interface ToolboxModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialInputPath?: string;
}

type ToolType = 'gguf' | 'other';

export default function ToolboxModal({ isOpen, onClose, initialInputPath }: ToolboxModalProps) {
    const { t } = useLanguage();
    const [selectedTool, setSelectedTool] = useState<ToolType>('gguf');

    // Plugins State
    const [plugins, setPlugins] = useState<PluginStatus[]>([]);

    // GGUF State
    const [inputPath, setInputPath] = useState('');
    const [outputPath, setOutputPath] = useState(''); // Currently just output filename or dir
    const [quantization, setQuantization] = useState('Q4_K_M');
    const [quantTypes, setQuantTypes] = useState<string[]>([]);
    const [statusLog, setStatusLog] = useState<string>('');
    const [isConverting, setIsConverting] = useState(false);

    const logsEndRef = useRef<HTMLDivElement>(null);
    const wsRef = useRef<WebSocket | null>(null);

    // Initial Path
    useEffect(() => {
        if (initialInputPath) setInputPath(initialInputPath);
    }, [initialInputPath]);

    // Auto update output filename
    useEffect(() => {
        if (inputPath && !isConverting) {
            // Check if it's a full path or just a filename
            // For simple UX, we expect absolute paths from selectFileDialog
            // We'll append the quant type before the extension
            try {
                const lastDotIndex = inputPath.lastIndexOf('.');
                if (lastDotIndex > 0) {
                    const basePath = inputPath.substring(0, lastDotIndex);
                    const ext = inputPath.substring(lastDotIndex);
                    // Only update if user hasn't manually edited it significantly?
                    // For now, just simplistic auto-update to help user.
                    // To avoid overwriting if user wants custom, we could track dirty state,
                    // but for this "Toolbox" it's safer to show what will happen.
                    const newOutput = `${basePath}-${quantization}${ext}`;
                    setOutputPath(newOutput);
                }
            } catch (e) {
                // Ignore parsing errors
            }
        }
    }, [inputPath, quantization, isConverting]);

    // Load Plugins & Types
    useEffect(() => {
        if (isOpen) {
            refreshPlugins();
            getQuantizationTypes().then(setQuantTypes).catch(console.error);
        }

        // Setup WS for logs
        if (isOpen && !wsRef.current) {
            connectWebSocket();
        }

        return () => {
            if (!isOpen && wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
        };
    }, [isOpen]);

    // Auto-scroll logs
    useEffect(() => {
        logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [statusLog]);

    const refreshPlugins = async () => {
        try {
            const list = await getPlugins();
            setPlugins(list);
        } catch (err) {
            console.error(err);
        }
    };

    const connectWebSocket = () => {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.hostname}:8000/ws/progress`;

        const ws = new WebSocket(wsUrl);
        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'log' && data.task_type === 'gguf_conversion') {
                    setStatusLog(prev => prev + data.message + '\n');
                }
            } catch (e) {
                // Determine if it's plain text
                // console.log("WS Raw:", event.data);
            }
        };
        wsRef.current = ws;
    };

    const { confirm } = useConfirm();

    const handleSelectFile = async () => {
        try {
            const result = await selectFileDialog({
                title: t('toolbox.gguf.actions.selectFile'),
                filters: [{ name: 'GGUF Models', extensions: ['gguf'] }]
            });
            if (result && result.path) setInputPath(result.path);
        } catch (err) {
            console.error(err);
        }
    };

    const handleInstallPlugin = async (pluginId: string) => {
        try {
            // Optimistic update
            setPlugins(prev => prev.map(p => p.id === pluginId ? { ...p, status: 'installing' } : p));
            setStatusLog(prev => prev + `>>> Installing ${pluginId}...\n`);
            await installPlugin(pluginId);

            // Poll/Refresh
            setTimeout(refreshPlugins, 2000);
            setTimeout(refreshPlugins, 10000);
        } catch (err: any) {
            console.error(err);
            setStatusLog(prev => prev + `❌ Install failed: ${err.message}\n`);
            refreshPlugins();
        }
    };

    const handleUninstallPlugin = (pluginId: string) => {
        confirm({
            title: t('toolbox.gguf.actions.uninstall'),
            message: t('toolbox.gguf.actions.confirmUninstall'),
            confirmText: t('common.yes'),
            onConfirm: async () => {
                try {
                    await uninstallPlugin(pluginId);
                    refreshPlugins();
                    setStatusLog(prev => prev + `>>> Plugin ${pluginId} uninstalled.\n`);
                } catch (err: any) {
                    console.error(err);
                    setStatusLog(prev => prev + `❌ Uninstall failed: ${err.message}\n`);
                }
            }
        });
    };

    const handleConvert = async () => {
        if (!inputPath) return;
        setIsConverting(true);
        setStatusLog('');

        try {
            const llamacpp = plugins.find(p => p.id === 'llama_cpp');
            if (llamacpp?.status !== 'installed') {
                setStatusLog(t('toolbox.gguf.status.missing') + '\n');
                setIsConverting(false);
                return;
            }

            setStatusLog(`>>> ${t('toolbox.gguf.actions.converting')} ${inputPath} -> ${quantization}...\n`);

            const result = await convertGGUF(inputPath, quantization, outputPath);
            if (result.success) {
                setStatusLog(`\n✅ ${t('toolbox.gguf.hints.success')}\nTask ID: ${result.task_id}`);
            }
        } catch (err: any) {
            setStatusLog(`\n❌ Error: ${err.message}`);
        } finally {
            setIsConverting(false);
        }
    };

    const renderPluginStatus = (pluginId: string) => {
        const plugin = plugins.find(p => p.id === pluginId);
        const status = plugin?.status || 'unknown';

        let colorClass = 'text-gray-500';
        let statusText = t(`toolbox.gguf.status.${status}`);

        if (status === 'installed' || status === 'ready') {
            colorClass = 'text-green-500';
            statusText = t('toolbox.gguf.status.ready');
        } else if (status === 'installing') {
            colorClass = 'text-blue-500 animate-pulse';
        } else if (status === 'missing') {
            colorClass = 'text-amber-500';
        } else if (status === 'broken') {
            colorClass = 'text-red-500';
        }

        return (
            <div className="flex items-center gap-2 text-sm bg-[var(--color-background)] px-3 py-2 rounded-lg border border-[var(--color-border)]">
                <span className="font-medium text-[var(--color-text-muted)]">{t('toolbox.gguf.labels.pluginStatus')}:</span>
                <span className={`font-bold ${colorClass}`}>{statusText}</span>
                {status === 'missing' && (
                    <button
                        onClick={() => handleInstallPlugin(pluginId)}
                        className="ml-auto text-xs bg-[var(--color-primary)] text-white px-2 py-1 rounded hover:opacity-90 transition-opacity"
                    >
                        {t('toolbox.gguf.actions.install')}
                    </button>
                )}
                {(status === 'installed' || status === 'ready') && (
                    <button
                        onClick={() => handleUninstallPlugin(pluginId)}
                        className="ml-auto text-xs p-1.5 text-red-500 hover:bg-red-500/10 rounded-md transition-colors"
                        title="Uninstall"
                    >
                        <TrashIcon className="w-4 h-4" />
                    </button>
                )}
            </div>
        );
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={
                <div className="flex items-center gap-2">
                    <WrenchScrewdriverIcon className="w-6 h-6 text-[var(--color-primary)]" />
                    <span>{t('toolbox.title')}</span>
                </div>
            }
            className="max-w-5xl h-[80vh]" // Large modal
            bodyClassName="p-0 flex h-full overflow-hidden" // Flex layout for sidebar
        >
            {/* Sidebar */}
            <div className="w-64 bg-[var(--color-surface-hover)] border-r border-[var(--color-border)] flex flex-col pt-4 shrink-0">
                <div className="px-4 mb-2 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                    Tools
                </div>
                <button
                    onClick={() => setSelectedTool('gguf')}
                    className={`flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors
                        ${selectedTool === 'gguf'
                            ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)] border-r-2 border-[var(--color-primary)]'
                            : 'text-[var(--color-text)] hover:bg-[var(--color-background)]'}
                    `}
                >
                    <CubeIcon className="w-5 h-5" />
                    {t('toolbox.menu.gguf')}
                </button>
                {/* Future tools can be added here */}
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar bg-[var(--color-surface)] flex flex-col">
                {selectedTool === 'gguf' && (
                    <div className="p-6 space-y-6 max-w-3xl mx-auto w-full">
                        {/* Header */}
                        <div>
                            <h2 className="text-xl font-bold text-[var(--color-text)] flex items-center gap-2">
                                <span className="p-1 rounded bg-[var(--color-primary)]/10">⚡</span>
                                {t('toolbox.gguf.title')}
                            </h2>
                            <p className="text-[var(--color-text-muted)] mt-1 text-sm">
                                {t('toolbox.gguf.desc')}
                            </p>
                        </div>

                        {/* Status Checker */}
                        {renderPluginStatus('llama_cpp')}

                        <div className="border-t border-[var(--color-border)] my-4"></div>

                        {/* Form */}
                        <div className="space-y-4">
                            {/* Input File */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-[var(--color-text)]">{t('toolbox.gguf.labels.inputFile')}</label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={inputPath}
                                        onChange={(e) => setInputPath(e.target.value)}
                                        placeholder="/path/to/model.gguf"
                                        className="flex-1 px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg text-sm text-[var(--color-text)] focus:ring-2 focus:ring-[var(--color-primary)] outline-none"
                                    />
                                    <button
                                        onClick={handleSelectFile}
                                        className="p-2 border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-surface-hover)] text-[var(--color-text-muted)] transition-colors"
                                        title={t('toolbox.gguf.actions.selectFile')}
                                    >
                                        <FolderOpenIcon className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>

                            {/* Options Row */}
                            <div className="grid grid-cols-2 gap-4">
                                {/* Quantization Type */}
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-[var(--color-text)]">{t('toolbox.gguf.labels.quantType')}</label>
                                    <Dropdown
                                        value={quantization}
                                        onChange={setQuantization}
                                        options={quantTypes.map(q => ({ label: q, value: q, group: 'Recommended' }))} // Simple grouping for now
                                        className="w-full"
                                    />
                                </div>
                                {/* Output Name (Optional) */}
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-[var(--color-text)]">{t('toolbox.gguf.labels.outputName')}</label>
                                    <input
                                        type="text"
                                        value={outputPath}
                                        onChange={(e) => setOutputPath(e.target.value)}
                                        placeholder="model-q4_k_m.gguf"
                                        className="w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg text-sm text-[var(--color-text)] focus:ring-2 focus:ring-[var(--color-primary)] outline-none"
                                    />
                                </div>
                            </div>

                            {/* Convert Button */}
                            <button
                                onClick={handleConvert}
                                disabled={isConverting || !inputPath || plugins.find(p => p.id === 'llama_cpp')?.status !== 'installed'}
                                className={`w-full py-3 rounded-xl font-bold text-white shadow-lg transition-all
                                    ${isConverting
                                        ? 'bg-gray-500 cursor-not-allowed opacity-75'
                                        : 'bg-[var(--color-primary)] hover:opacity-90 hover:shadow-[var(--color-primary)]/30'}
                                `}
                            >
                                {isConverting ? (
                                    <div className="flex items-center justify-center gap-2">
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                        {t('toolbox.gguf.actions.converting')}
                                    </div>
                                ) : (
                                    t('toolbox.gguf.actions.convert')
                                )}
                            </button>
                        </div>

                        {/* Terminal Output */}
                        <div className="space-y-2 flex-1 flex flex-col min-h-[200px]">
                            <label className="text-sm font-medium text-[var(--color-text)] flex items-center gap-2">
                                <CommandLineIcon className="w-4 h-4" />
                                {t('toolbox.gguf.labels.logs')}
                            </label>
                            <div className="bg-black rounded-lg p-4 font-mono text-xs text-green-400 overflow-y-auto custom-scrollbar h-64 border border-gray-800 shadow-inner">
                                <pre className="whitespace-pre-wrap break-all">
                                    {statusLog || <span className="text-gray-600">...</span>}
                                </pre>
                                <div ref={logsEndRef} />
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
}
