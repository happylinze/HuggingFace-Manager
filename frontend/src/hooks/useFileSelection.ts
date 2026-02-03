import { useState, useMemo, useCallback } from 'react';
import { type FileNode } from '../api/client';

export interface FilterPreset {
    id: string;
    label: string;
    description?: string;
    pattern?: string; // Simple glob
    regex?: string;   // Advanced regex
    group?: string;
    exclude?: boolean;
}

export const SMART_PRESETS: FilterPreset[] = [
    { id: 'all', label: 'All Files', pattern: '*', group: 'General' },
    // GGUF Special
    { id: 'gguf_all', label: 'All GGUF Models', pattern: '*.gguf', group: 'GGUF' },
    { id: 'gguf_q2', label: 'GGUF Q2 (Smallest)', pattern: '*[qQ]2_*.gguf', group: 'GGUF' },
    { id: 'gguf_q3', label: 'GGUF Q3 (Squeezed)', pattern: '*[qQ]3_*.gguf', group: 'GGUF' },
    { id: 'gguf_q4', label: 'GGUF Q4 (Recommended)', pattern: '*[qQ]4_*.gguf', group: 'GGUF' },
    { id: 'gguf_q5', label: 'GGUF Q5 (High Quality)', pattern: '*[qQ]5_*.gguf', group: 'GGUF' },
    { id: 'gguf_q6', label: 'GGUF Q6 (Near Lossless)', pattern: '*[qQ]6_*.gguf', group: 'GGUF' },
    { id: 'gguf_q8', label: 'GGUF Q8 (Archival)', pattern: '*[qQ]8_*.gguf', group: 'GGUF' },
    { id: 'gguf_k', label: 'GGUF K-Quants', pattern: '*_K_*.gguf', group: 'GGUF' },
    // Formats
    { id: 'safetensors', label: 'SafeTensors', pattern: '*.safetensors', group: 'Formats' },
    { id: 'pytorch', label: 'PyTorch (.bin/.pt)', regex: '.*\\.(bin|pt|pth)$', group: 'Formats' },
    { id: 'onnx', label: 'ONNX', pattern: '*.onnx', group: 'Formats' },
    // Configs
    { id: 'configs', label: 'Configs & Tokenizers', regex: '.*(config\\.json|tokenizer|preprocessor).*', group: 'Misc' },
];

export function useFileSelection(files: FileNode[]) {
    const [filterText, setFilterText] = useState('');
    const [selectedPreset, setSelectedPreset] = useState<string>('all');
    const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());

    // Basic Glob->Regex converter
    // Supports * (wildcard) and ? (single char)
    const globToRegex = (pattern: string) => {
        let regex = pattern
            .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape regex chars
            .replace(/\*/g, '.*')
            .replace(/\?/g, '.');
        return new RegExp(`^${regex}$`, 'i'); // Case insensitive
    };

    const filteredFiles = useMemo(() => {
        if (!filterText && selectedPreset === 'all') return files;

        let result = files;

        // 1. Preset Filtering
        // Note: Presets populate the filterText or are handled separately?
        // To allow "Custom Filter" combined with regex, let's say filterText overrides preset visual
        // BUT the user plan says "Compound Filter".
        // Let's implement: filterText IS the master filter. Presets just shortcut to set filterText.
        // Wait, current UI design has a separate dropdown.
        // If I select "Q4", does the input box fill with "*q4*"?
        // Yes, that's the most transparent way and allows editing.

        // HOWEVER, if the user manually types, preset should act as "Custom".

        let pattern = filterText;
        if (!pattern) return result; // Empty filter = show all? Or just default behavior

        // Advanced Filtering Logic
        // Check for negation "!"
        const isNegative = pattern.startsWith('!');
        const cleanPattern = isNegative ? pattern.slice(1) : pattern;

        // Determine if regex or glob
        let regex: RegExp;
        if (cleanPattern.startsWith('regex:')) {
            try {
                regex = new RegExp(cleanPattern.replace('regex:', ''), 'i');
            } catch (e) {
                regex = /.*/; // Invalid regex fallback
            }
        } else {
            // Treat as glob-like substring match if no * present?
            // User habits: "q4" -> means "*q4*" usually.
            // "model.bin" -> means "model.bin" (exact) or "*model.bin*"?
            // Let's infer: if contains *, treat as glob. If not, treat as substring.
            if (cleanPattern.includes('*') || cleanPattern.includes('?')) {
                regex = globToRegex(cleanPattern);
            } else {
                regex = new RegExp(cleanPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            }
        }

        return result.filter(f => {
            const match = regex.test(f.path);
            return isNegative ? !match : match;
        });

    }, [files, filterText, selectedPreset]); // selectedPreset actually just updates filterText via handler

    const applyPreset = useCallback((presetId: string) => {
        const preset = SMART_PRESETS.find(p => p.id === presetId);
        if (preset) {
            setSelectedPreset(presetId);
            if (preset.pattern) {
                setFilterText(preset.pattern);
            } else if (preset.regex) {
                setFilterText(`regex:${preset.regex}`);
            } else {
                setFilterText(''); // All
            }
        } else {
            setSelectedPreset('');
        }
    }, []);

    const toggleFile = useCallback((path: string) => {
        setSelectedFiles(prev => {
            const newSet = new Set(prev);
            if (newSet.has(path)) newSet.delete(path);
            else newSet.add(path);
            return newSet;
        });
    }, []);

    const toggleSelectAll = useCallback(() => {
        // If all *filtered* files are selected, deselect them.
        // Otherwise, select ALL filtered files.
        const allFilteredSelected = filteredFiles.every(f => selectedFiles.has(f.path));

        setSelectedFiles(prev => {
            const newSet = new Set(prev);
            if (allFilteredSelected) {
                // Deselect filtered files ONLY
                filteredFiles.forEach(f => newSet.delete(f.path));
            } else {
                // Select filtered files (additive)
                filteredFiles.forEach(f => newSet.add(f.path));
            }
            return newSet;
        });
    }, [filteredFiles, selectedFiles]);

    const selectMatching = useCallback(() => {
        // Force select all currently filtered files
        setSelectedFiles(prev => {
            const newSet = new Set(prev);
            filteredFiles.forEach(f => newSet.add(f.path));
            return newSet;
        });
    }, [filteredFiles]);

    // Clear selection and filters
    const clearSelection = useCallback(() => setSelectedFiles(new Set()), []);

    // Reset Everything
    const reset = useCallback(() => {
        setFilterText('');
        setSelectedPreset('all');
        setSelectedFiles(new Set());
    }, []);

    // Helper: Stats
    const selectedSize = useMemo(() => {
        return files.reduce((acc, f) => selectedFiles.has(f.path) ? acc + f.size : acc, 0);
    }, [files, selectedFiles]);

    return {
        filterText,
        setFilterText,
        selectedPreset,
        applyPreset,
        filteredFiles,
        selectedFiles,
        setSelectedFiles,
        toggleFile,
        toggleSelectAll,
        selectMatching,
        clearSelection,
        reset,
        selectedSize,
        presets: SMART_PRESETS
    };
}
