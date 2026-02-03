import { useState, useEffect, useRef } from 'react';

interface DebugLog {
    timestamp: string;
    type: 'ws' | 'api' | 'info' | 'error';
    message: string;
}

// Global log storage
const logs: DebugLog[] = [];
const debugContexts: Record<string, any> = {};
const listeners: Set<() => void> = new Set();

export function addDebugLog(type: DebugLog['type'], message: string) {
    const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    logs.push({ timestamp, type, message });
    if (logs.length > 100) logs.shift();
    listeners.forEach(fn => fn());
}

export function setDebugContext(key: string, data: any) {
    debugContexts[key.toUpperCase()] = data;
    listeners.forEach(fn => fn());
}

export function DebugPanel({ tasks = [] }: { tasks?: any[] }) {
    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<string>('LOGS');
    const [, forceUpdate] = useState({});
    const logContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const update = () => forceUpdate({});
        listeners.add(update);
        return () => { listeners.delete(update); };
    }, []);

    // Auto-scroll to bottom for logs
    useEffect(() => {
        if (activeTab === 'logs' && logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [logs.length, activeTab]);

    const typeColors = {
        ws: 'text-purple-400',
        api: 'text-blue-400',
        info: 'text-green-400',
        error: 'text-red-400',
    };

    const typeLabels = {
        ws: 'WS',
        api: 'API',
        info: 'INFO',
        error: 'ERR',
    };

    return (
        <>
            {/* Toggle Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="fixed bottom-4 right-4 z-50 w-12 h-12 rounded-full bg-gray-800 border border-gray-600 text-white font-mono text-xs hover:bg-gray-700 transition-colors shadow-lg flex items-center justify-center group"
                title="Toggle Debug Panel"
            >
                {isOpen ? '✕' : <span className="group-hover:animate-spin">🐛</span>}
            </button>

            {/* Debug Panel */}
            {isOpen && (
                <div className="fixed bottom-20 right-4 z-50 w-[600px] h-[400px] bg-gray-900/95 backdrop-blur border border-gray-700 rounded-lg shadow-2xl flex flex-col">
                    {/* Header */}
                    <div className="flex items-center justify-between px-3 py-1 border-b border-gray-700 bg-gray-800/50 rounded-t-lg">
                        <div className="flex gap-4 overflow-x-auto no-scrollbar max-w-[500px]">
                            <button
                                onClick={() => setActiveTab('LOGS')}
                                className={`text-[10px] font-bold py-2 border-b-2 transition-colors whitespace-nowrap ${activeTab === 'LOGS' ? 'text-[var(--color-primary)] border-[var(--color-primary)]' : 'text-gray-500 border-transparent hover:text-gray-300'}`}
                            >
                                📜 LOGS ({logs.length})
                            </button>
                            <button
                                onClick={() => setActiveTab('TASKS')}
                                className={`text-[10px] font-bold py-2 border-b-2 transition-colors whitespace-nowrap ${activeTab === 'TASKS' ? 'text-[var(--color-primary)] border-[var(--color-primary)]' : 'text-gray-500 border-transparent hover:text-gray-300'}`}
                            >
                                📥 TASKS ({tasks.length})
                            </button>
                            {Object.keys(debugContexts).map(key => (
                                <button
                                    key={key}
                                    onClick={() => setActiveTab(key)}
                                    className={`text-[10px] font-bold py-2 border-b-2 transition-colors whitespace-nowrap ${activeTab === key ? 'text-[var(--color-primary)] border-[var(--color-primary)]' : 'text-gray-500 border-transparent hover:text-gray-300'}`}
                                >
                                    🔍 {key}
                                </button>
                            ))}
                        </div>
                        <div className="flex gap-2">
                            {activeTab === 'logs' && (
                                <button
                                    onClick={() => { logs.length = 0; forceUpdate({}); }}
                                    className="text-xs text-gray-400 hover:text-white px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600"
                                >
                                    Clear
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Content */}
                    <div
                        ref={logContainerRef}
                        className="flex-1 overflow-y-auto p-2 font-mono text-xs space-y-1 select-text"
                    >
                        {activeTab === 'LOGS' ? (
                            logs.length === 0 ? (
                                <div className="text-gray-500 text-center py-4 italic">No logs yet...</div>
                            ) : (
                                logs.map((log, i) => (
                                    <div key={i} className="flex gap-2 hover:bg-gray-800/50 px-1 rounded animate-fade-in">
                                        <span className="text-gray-500 flex-shrink-0">{log.timestamp}</span>
                                        <span className={`${typeColors[log.type as keyof typeof typeColors]} flex-shrink-0 w-8`}>
                                            [{typeLabels[log.type as keyof typeof typeLabels]}]
                                        </span>
                                        <span className="text-gray-300 break-all">{log.message}</span>
                                    </div>
                                ))
                            )
                        ) : activeTab === 'TASKS' ? (
                            <div className="space-y-4">
                                {tasks.length === 0 ? (
                                    <div className="text-gray-500 text-center py-4 italic">No active download tasks.</div>
                                ) : (
                                    tasks.map(task => (
                                        <div key={task.id} className="p-3 bg-gray-800/50 border border-gray-700 rounded-lg space-y-2">
                                            <div className="flex justify-between items-center border-b border-gray-700 pb-1">
                                                <span className="text-blue-400 font-bold">{task.id}</span>
                                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${task.status === 'downloading' ? 'bg-indigo-500/20 text-indigo-400' :
                                                    task.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                                                        'bg-gray-700 text-gray-400'
                                                    }`}>
                                                    {task.status.toUpperCase()}
                                                </span>
                                            </div>
                                            <pre className="text-[10px] text-gray-400 max-h-40 overflow-y-auto whitespace-pre-wrap">
                                                {JSON.stringify(task, null, 2)}
                                            </pre>
                                        </div>
                                    ))
                                )}
                            </div>
                        ) : (
                            <div className="p-2 bg-black/30 rounded border border-gray-800 animate-fade-in">
                                <pre className="text-[10px] text-gray-400 overflow-x-auto whitespace-pre">
                                    {JSON.stringify(debugContexts[activeTab], (key, value) => {
                                        // Filter out potentially huge or circularly referenced data if needed
                                        if (key === 'results' && Array.isArray(value)) return `[Array: ${value.length} items]`;
                                        return value;
                                    }, 2)}
                                </pre>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}
