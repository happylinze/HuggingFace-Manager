import React, { createContext, useContext, useState, useCallback } from 'react';
import { ConfirmModal } from '../components/ConfirmModal';
import { useLanguage } from './LanguageContext';

interface ConfirmOptions {
    title: string;
    message: string;
    confirmText?: string;
    isDestructive?: boolean;
    onConfirm: () => void | Promise<void>;
}

interface ConfirmContextType {
    confirm: (options: ConfirmOptions) => void;
}

const ConfirmContext = createContext<ConfirmContextType | undefined>(undefined);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
    const { t } = useLanguage();
    const [options, setOptions] = useState<ConfirmOptions | null>(null);
    const [isOpen, setIsOpen] = useState(false);

    const confirm = useCallback((opts: ConfirmOptions) => {
        setOptions(opts);
        setIsOpen(true);
    }, []);

    const handleConfirm = async () => {
        if (options?.onConfirm) {
            await options.onConfirm();
        }
        setIsOpen(false);
    };

    return (
        <ConfirmContext.Provider value={{ confirm }}>
            {children}
            {options && (
                <ConfirmModal
                    isOpen={isOpen}
                    onClose={() => setIsOpen(false)}
                    title={options.title}
                    message={options.message}
                    confirmText={options.confirmText || t('common.confirm')}
                    isDestructive={options.isDestructive}
                    onConfirm={handleConfirm}
                />
            )}
        </ConfirmContext.Provider>
    );
}

export function useConfirm() {
    const context = useContext(ConfirmContext);
    if (!context) throw new Error('useConfirm must be used within a ConfirmProvider');
    return context;
}
