import { useState, useRef, useEffect } from 'react';

interface Option {
    value: string;
    label: string;
    group?: string;
}

interface DropdownProps {
    value: string;
    options: Option[];
    onChange: (value: string) => void;
    placeholder?: string;
    icon?: React.ReactNode;
    className?: string; // Wrapper class
    buttonClassName?: string; // Trigger button class
}

export function Dropdown({ value, options, onChange, placeholder, icon, className = "", buttonClassName = "" }: DropdownProps) {
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

    const selectedOption = options.find(o => o.value === value);

    // Group options
    const groups: { [key: string]: Option[] } = {};
    const noGroup: Option[] = [];

    options.forEach(opt => {
        if (opt.group) {
            if (!groups[opt.group]) groups[opt.group] = [];
            groups[opt.group].push(opt);
        } else {
            noGroup.push(opt);
        }
    });

    return (
        <div className={`relative ${className}`} ref={containerRef}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center justify-between w-full text-left transition-all duration-200 px-4 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] hover:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] focus:border-[var(--color-primary)] ${buttonClassName} ${isOpen ? 'ring-1 ring-[var(--color-primary)] border-[var(--color-primary)]' : ''}`}
            >
                <div className="flex items-center gap-2 truncate">
                    {icon && <span className="text-[var(--color-text-muted)] flex-shrink-0">{icon}</span>}
                    <span className={`truncate ${!selectedOption ? 'text-[var(--color-text-muted)]' : 'text-[var(--color-text)]'}`}>
                        {selectedOption ? selectedOption.label : placeholder || 'Select...'}
                    </span>
                </div>
                <svg
                    className={`w-4 h-4 text-[var(--color-text-muted)] transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                >
                    <path d="m6 9 6 6 6-6" />
                </svg>
            </button>

            {isOpen && (
                <div className="absolute z-[1000] w-full mt-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-xl max-h-60 overflow-y-auto custom-scrollbar animate-fade-in-down origin-top-right">
                    <div className="py-1">
                        {/* No Group Options */}
                        {noGroup.map(opt => (
                            <button
                                key={opt.value}
                                onClick={() => {
                                    onChange(opt.value);
                                    setIsOpen(false);
                                }}
                                className={`w-full text-left px-4 py-2 text-sm transition-colors flex items-center justify-between
                                    ${opt.value === value
                                        ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                                        : 'text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]'}
                                `}
                            >
                                {opt.label}
                                {opt.value === value && <span>✓</span>}
                            </button>
                        ))}

                        {/* Grouped Options */}
                        {Object.entries(groups).map(([groupName, groupOptions]) => (
                            <div key={groupName}>
                                <div className="px-4 py-1.5 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider bg-[var(--color-background)]/50">
                                    {groupName}
                                </div>
                                {groupOptions.map(opt => (
                                    <button
                                        key={opt.value}
                                        onClick={() => {
                                            onChange(opt.value);
                                            setIsOpen(false);
                                        }}
                                        className={`w-full text-left px-4 py-2 text-sm transition-colors pl-8 flex items-center justify-between
                                            ${opt.value === value
                                                ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                                                : 'text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]'}
                                        `}
                                    >
                                        {opt.label}
                                        {opt.value === value && <span>✓</span>}
                                    </button>
                                ))}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
