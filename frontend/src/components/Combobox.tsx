import { useState, useRef, useEffect } from 'react';

interface ComboboxProps {
    value: string;
    onChange: (value: string) => void;
    onDeleteOption?: (value: string) => void;
    options: string[];
    placeholder?: string;
    className?: string; // Container class
    readOnly?: boolean; // New prop
}

export function Combobox({ value, onChange, onDeleteOption, options, placeholder, className = "", readOnly = false }: ComboboxProps) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Close on click outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    return (
        <div className={`relative ${className}`} ref={containerRef}>
            <div className={`relative flex items-center ${readOnly ? 'cursor-pointer' : ''}`} onClick={() => readOnly && setIsOpen(!isOpen)}>
                <input
                    type="text"
                    value={value}
                    onChange={(e) => !readOnly && onChange(e.target.value)}
                    onFocus={() => !readOnly && setIsOpen(true)}
                    readOnly={readOnly}
                    placeholder={placeholder}
                    className={`w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg py-2.5 px-3 pr-10 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-colors ${readOnly ? 'cursor-pointer select-none' : ''}`}
                />

                {options.length > 0 && (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsOpen(!isOpen);
                        }}
                        className="absolute right-2 p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
                        tabIndex={-1}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}>
                            <path d="m6 9 6 6 6-6" />
                        </svg>
                    </button>
                )}
            </div>

            {isOpen && options.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-xl max-h-60 overflow-y-auto custom-scrollbar animate-fade-in-down origin-top">
                    {options.map((option, idx) => (
                        <div key={`${option}-${idx}`} className="group relative flex items-center">
                            <button
                                type="button"
                                onClick={() => {
                                    onChange(option);
                                    setIsOpen(false);
                                }}
                                className="w-full text-left px-3 py-2 text-xs md:text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] transition-colors truncate pr-10"
                                title={option}
                            >
                                <span className="flex items-center gap-2">
                                    <span className="opacity-50 text-xs">🕒</span>
                                    <span className="truncate flex-1">{option}</span>
                                </span>
                            </button>
                            {onDeleteOption && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onDeleteOption(option);
                                    }}
                                    className="absolute right-2 p-1 text-[var(--color-text-muted)] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all rounded"
                                    title="删除记录"
                                >
                                    ✕
                                </button>
                            )}
                        </div>
                    ))}
                    <div className="px-2 py-1 border-t border-[var(--color-border)] text-[10px] text-[var(--color-text-muted)] text-center">
                        历史记录
                    </div>
                </div>
            )}
        </div>
    );
}
