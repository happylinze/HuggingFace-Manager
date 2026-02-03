import { Modal } from './Modal';

interface ConfirmModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    message: string;
    onConfirm: () => void;
    isDestructive?: boolean;
    confirmText?: string;
    extraContent?: React.ReactNode;
    secondaryText?: string;
    onSecondary?: () => void;
}

export function ConfirmModal({
    isOpen,
    onClose,
    title,
    message,
    onConfirm,
    isDestructive = false,
    confirmText = 'Confirm',
    extraContent,
    secondaryText,
    onSecondary
}: ConfirmModalProps) {
    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={title}
            className="max-w-md"
        >
            <div className="space-y-4">
                <p className="text-[var(--color-text-muted)]">
                    {message}
                </p>
                {extraContent}
                <div className="flex justify-end gap-3 mt-6 flex-wrap">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-xl text-[var(--color-text)] font-bold transition-colors"
                    >
                        Cancel
                    </button>
                    {secondaryText && onSecondary && (
                        <button
                            onClick={() => {
                                onSecondary();
                                onClose();
                            }}
                            className="px-4 py-2 bg-[var(--color-surface-hover)] hover:bg-[var(--color-surface)] border border-[var(--color-primary)] text-[var(--color-primary)] rounded-xl font-bold transition-colors"
                        >
                            {secondaryText}
                        </button>
                    )}
                    <button
                        onClick={() => {
                            onConfirm();
                            onClose();
                        }}
                        className={`px-6 py-2 rounded-xl text-white font-bold transition-all shadow-lg ${isDestructive
                            ? 'bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 shadow-red-500/20'
                            : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 shadow-indigo-500/20'
                            }`}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
