import { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: React.ReactNode;
    children: React.ReactNode;
    className?: string; // For overriding max-width etc
    showCloseButton?: boolean;
    bodyClassName?: string;
    bodyRef?: React.RefObject<HTMLDivElement | null>;
}

export function Modal({
    isOpen,
    onClose,
    title,
    children,
    className = 'max-w-2xl',
    showCloseButton = true,
    bodyClassName = 'p-6',
    bodyRef
}: ModalProps) {
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        if (isOpen) {
            document.addEventListener('keydown', handleEsc);
            document.body.style.overflow = 'hidden';
        }
        return () => {
            document.removeEventListener('keydown', handleEsc);
            document.body.style.overflow = 'unset';
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in font-sans">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            {/* Modal Content */}
            <div
                className={`relative w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-scale-in transition-colors duration-300 ${className}`}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                {title && (
                    <div className="px-6 py-4 border-b border-[var(--color-border)] flex justify-between items-center bg-[var(--color-surface)] shrink-0">
                        <div className="text-lg font-bold text-[var(--color-text)] flex items-center gap-2">{title}</div>
                        {showCloseButton && (
                            <button
                                onClick={onClose}
                                className="p-2 rounded-full text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                            </button>
                        )}
                    </div>
                )}

                {/* Body */}
                <div ref={bodyRef} className={`flex-1 overflow-y-auto custom-scrollbar ${bodyClassName}`}>
                    {children}
                </div>
            </div>
        </div>,
        document.body
    );
}
