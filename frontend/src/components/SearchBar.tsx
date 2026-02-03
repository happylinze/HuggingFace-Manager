import { useState } from 'react';

interface SearchBarProps {
    onSearch: (query: string, type: 'model' | 'dataset') => void;
    isLoading?: boolean;
}

export function SearchBar({ onSearch, isLoading }: SearchBarProps) {
    const [query, setQuery] = useState('');
    const [type, setType] = useState<'model' | 'dataset'>('model');

    const parseHFUrl = (input: string) => {
        if (!input.includes('huggingface.co/')) return null;
        try {
            const url = new URL(input.startsWith('http') ? input : `https://${input}`);
            const parts = url.pathname.split('/').filter(p => p);

            if (parts[0] === 'datasets' && parts.length >= 3) {
                return { type: 'dataset' as const, id: `${parts[1]}/${parts[2]}` };
            } else if (parts.length >= 2 && parts[0] !== 'spaces' && parts[0] !== 'datasets') {
                return { type: 'model' as const, id: `${parts[0]}/${parts[1]}` };
            }
        } catch { }
        return null;
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        const parsed = parseHFUrl(val);

        if (parsed) {
            setQuery(parsed.id);
            setType(parsed.type);
        } else {
            setQuery(val);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (query.trim()) {
            onSearch(query.trim(), type);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="w-full">
            <div className="flex gap-3">
                {/* Search Input */}
                <div className="flex-1 relative">
                    <input
                        type="text"
                        value={query}
                        onChange={handleChange}
                        placeholder="搜索模型或数据集... (例如: meta-llama/Llama-2-7b)"
                        className="w-full px-4 py-3 pr-10 bg-[var(--color-surface)] border border-[var(--color-border)] 
                       rounded-lg text-[var(--color-text)] placeholder:text-[var(--color-text-muted)]
                       focus:outline-none focus:border-[var(--color-primary)] focus:ring-2 
                       focus:ring-[var(--color-primary)]/20 transition-all duration-200"
                    />
                    {/* Clear Button */}
                    {query && !isLoading && (
                        <button
                            type="button"
                            onClick={() => setQuery('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text)] rounded-full hover:bg-[var(--color-background)] transition-colors z-10"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                            </svg>
                        </button>
                    )}
                    {isLoading && (
                        <div className="absolute right-4 top-1/2 -translate-y-1/2">
                            <div className="w-5 h-5 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
                        </div>
                    )}
                </div>

                {/* Type Selector */}
                <div className="flex bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)] p-1">
                    <button
                        type="button"
                        onClick={() => setType('model')}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200
              ${type === 'model'
                                ? 'bg-[var(--color-primary)] text-white'
                                : 'text-[var(--color-text-muted)] hover:text-white'
                            }`}
                    >
                        模型
                    </button>
                    <button
                        type="button"
                        onClick={() => setType('dataset')}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200
              ${type === 'dataset'
                                ? 'bg-[var(--color-primary)] text-white'
                                : 'text-[var(--color-text-muted)] hover:text-white'
                            }`}
                    >
                        数据集
                    </button>
                </div>

                {/* Search Button */}
                <button
                    type="submit"
                    disabled={isLoading || !query.trim()}
                    className="px-6 py-3 gradient-primary rounded-lg text-white font-medium
                     hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed
                     transition-all duration-200 animate-pulse-glow"
                >
                    搜索
                </button>
            </div>
        </form>
    );
}
