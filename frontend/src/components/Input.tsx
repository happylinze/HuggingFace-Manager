import React, { type InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
    icon?: React.ReactNode;
}

export function Input({ label, error, icon, className = "", id, ...props }: InputProps) {
    const inputId = id || props.name || Math.random().toString(36).substr(2, 9);

    return (
        <div className={`space-y-1.5 ${className}`}>
            {label && (
                <label htmlFor={inputId} className="block text-sm font-medium text-[var(--color-text-muted)]">
                    {label}
                </label>
            )}
            <div className="relative">
                {icon && (
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]">
                        {icon}
                    </div>
                )}
                <input
                    id={inputId}
                    className={`
                        w-full bg-[var(--color-surface)] border rounded-lg px-4 py-2 text-[var(--color-text)] placeholder-[var(--color-text-muted)]/50
                        focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] transition-colors
                        ${error
                            ? 'border-[var(--color-error)] focus:border-[var(--color-error)] focus:ring-[var(--color-error)]'
                            : 'border-[var(--color-border)] focus:border-[var(--color-primary)]'
                        }
                        ${icon ? 'pl-10' : ''}
                        disabled:opacity-50 disabled:cursor-not-allowed
                    `}
                    {...props}
                />
            </div>
            {error && <p className="text-xs text-[var(--color-error)]">{error}</p>}
        </div>
    );
}
