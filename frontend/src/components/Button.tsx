import React, { type ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
    size?: 'sm' | 'md' | 'lg';
    icon?: React.ReactNode;
    fullWidth?: boolean;
    isLoading?: boolean;
}

export function Button({
    variant = 'primary',
    size = 'md',
    icon,
    className = "",
    children,
    fullWidth = false,
    isLoading = false,
    ...props
}: ButtonProps) {
    const baseClass = "inline-flex items-center justify-center font-medium rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";

    const sizeClasses = {
        sm: "px-3 py-1.5 text-xs",
        md: "px-4 py-2 text-sm",
        lg: "px-6 py-3 text-base"
    };

    const variantClasses = {
        primary: "bg-[var(--color-primary)] text-white hover:opacity-90 shadow-lg shadow-indigo-500/20 focus:ring-indigo-500",
        secondary: "bg-[var(--color-surface-hover)] text-[var(--color-text)] hover:bg-[var(--color-border)] focus:ring-slate-500",
        danger: "bg-[var(--color-error)] text-white hover:opacity-90 shadow-lg shadow-red-500/20 focus:ring-red-500",
        ghost: "bg-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] focus:ring-slate-500",
        outline: "bg-transparent border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] focus:ring-slate-500"
    };

    const widthClass = fullWidth ? "w-full" : "";

    return (
        <button
            className={`${baseClass} ${sizeClasses[size]} ${variantClasses[variant]} ${widthClass} ${className}`}
            disabled={isLoading || props.disabled}
            {...props}
        >
            {isLoading ? (
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
            ) : icon ? <span className="mr-2">{icon}</span> : null}
            {children}
        </button>
    );
}
