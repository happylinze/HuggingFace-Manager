import React, { createContext, useContext, useEffect, useState } from 'react';
import { zh } from '../i18n/locales/zh';
import { en } from '../i18n/locales/en';

type Language = 'zh' | 'en';
type Translations = typeof zh; // Assume zh is the source of truth for shape

interface LanguageContextType {
    language: Language;
    setLanguage: (lang: Language) => void;
    t: (key: string, params?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const translations: Record<Language, Translations> = {
    zh,
    en
};

export function LanguageProvider({ children }: { children: React.ReactNode }) {
    const [language, setLanguage] = useState<Language>(() => {
        const saved = localStorage.getItem('language');
        if (saved === 'en' || saved === 'zh') return saved;
        // Detect browser language
        const browserLang = navigator.language.toLowerCase();
        return browserLang.startsWith('zh') ? 'zh' : 'en';
    });

    useEffect(() => {
        localStorage.setItem('language', language);
    }, [language]);

    const t = (key: string, params?: Record<string, string | number>): string => {
        const keys = key.split('.');
        let value: any = translations[language];

        for (const k of keys) {
            value = value?.[k];
            if (value === undefined) break;
        }

        if (value === undefined || typeof value !== 'string') {
            // console.warn(`Translation missing for key: ${key} in language: ${language}`);
            return key;
        }

        if (params) {
            return Object.entries(params).reduce((acc, [k, v]) => {
                return acc.replace(new RegExp(`{${k}}`, 'g'), String(v));
            }, value);
        }

        return value;
    };

    return (
        <LanguageContext.Provider value={{ language, setLanguage, t }}>
            {children}
        </LanguageContext.Provider>
    );
}

export function useLanguage() {
    const context = useContext(LanguageContext);
    if (context === undefined) {
        throw new Error('useLanguage must be used within a LanguageProvider');
    }
    return context;
}
