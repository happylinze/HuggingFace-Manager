import React, { useState, useMemo } from 'react';
import { type FileNode } from '../api/client';

interface FileTreeProps {
    files: FileNode[];
    onFileClick: (path: string) => void;
    selectedFiles: Set<string>;
    onToggleFile: (path: string) => void;
    activeFile?: string | null;
    onDelete?: (path: string) => void;
}

interface TreeNode {
    name: string;
    path: string;
    type: 'file' | 'directory';
    size: number;
    children: Record<string, TreeNode>;
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function FileTree({ files, onFileClick, selectedFiles, onToggleFile, activeFile, onDelete }: FileTreeProps) {
    // 1. Convert flat list to tree
    const tree = useMemo(() => {
        const root: Record<string, TreeNode> = {};

        files.forEach(file => {
            const parts = file.path.split('/');
            let current = root;

            parts.forEach((part, index) => {
                const isLast = index === parts.length - 1;
                const path = parts.slice(0, index + 1).join('/');

                if (!current[part]) {
                    current[part] = {
                        name: part,
                        path: path,
                        type: isLast ? 'file' : 'directory',
                        size: isLast ? file.size : 0,
                        children: {}
                    };
                } else if (isLast) {
                    current[part].size = file.size; // Update size if already exists (shouldn't happen with flat paths)
                }

                if (!isLast) {
                    current = current[part].children;
                }
            });
        });

        // Helper to calculate directory sizes
        const calcSize = (nodes: Record<string, TreeNode>): number => {
            let total = 0;
            Object.values(nodes).forEach(node => {
                if (node.type === 'directory') {
                    node.size = calcSize(node.children);
                }
                total += node.size;
            });
            return total;
        };
        calcSize(root);

        return root;
    }, [files]);

    return (
        <div className="text-sm font-mono">
            <NodeList
                nodes={tree}
                level={0}
                onFileClick={onFileClick}
                selectedFiles={selectedFiles}
                onToggleFile={onToggleFile}
                activeFile={activeFile}
                allFiles={files}
                onDelete={onDelete}
            />
        </div>
    );
}

function NodeList({
    nodes,
    level,
    onFileClick,
    selectedFiles,
    onToggleFile,
    activeFile,
    allFiles,
    onDelete
}: {
    nodes: Record<string, TreeNode>,
    level: number,
    onFileClick: (path: string) => void,
    selectedFiles: Set<string>,
    onToggleFile: (path: string) => void,
    activeFile?: string | null,
    allFiles: FileNode[],
    onDelete?: (path: string) => void
}) {
    // Sort directories first, then files
    const sortedKeys = Object.keys(nodes).sort((a, b) => {
        if (nodes[a].type !== nodes[b].type) {
            return nodes[a].type === 'directory' ? -1 : 1;
        }
        return a.localeCompare(b);
    });

    return (
        <div className="flex flex-col">
            {sortedKeys.map(key => (
                <FileTreeNode
                    key={nodes[key].path}
                    node={nodes[key]}
                    level={level}
                    onFileClick={onFileClick}
                    selectedFiles={selectedFiles}
                    onToggleFile={onToggleFile}
                    activeFile={activeFile}
                    allFiles={allFiles}
                    onDelete={onDelete}
                />
            ))}
        </div>
    );
}

function FileTreeNode({
    node,
    level,
    onFileClick,
    selectedFiles,
    onToggleFile,
    activeFile,
    allFiles,
    onDelete
}: {
    node: TreeNode,
    level: number,
    onFileClick: (path: string) => void,
    selectedFiles: Set<string>,
    onToggleFile: (path: string) => void,
    activeFile?: string | null,
    allFiles: FileNode[],
    onDelete?: (path: string) => void
}) {
    const [isOpen, setIsOpen] = useState(level < 1); // Expand first level by default
    const isDir = node.type === 'directory';
    const isActive = activeFile === node.path;

    // Check if this directory or any child file is selected
    // For a folder, "selected" means all its files are selected
    const getSelectionState = () => {
        if (!isDir) return selectedFiles.has(node.path) ? 'checked' : 'unchecked';

        const childFiles = allFiles.filter(f => f.path.startsWith(node.path + '/'));
        const selectedCount = childFiles.filter(f => selectedFiles.has(f.path)).length;

        if (selectedCount === 0) return 'unchecked';
        if (selectedCount === childFiles.length) return 'checked';
        return 'partial';
    };

    const selectionState = getSelectionState();

    const handleToggle = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isDir) {
            const childFiles = allFiles.filter(f => f.path.startsWith(node.path + '/'));
            const alreadyAllSelected = selectionState === 'checked';

            childFiles.forEach(f => {
                if (alreadyAllSelected) {
                    if (selectedFiles.has(f.path)) onToggleFile(f.path);
                } else {
                    if (!selectedFiles.has(f.path)) onToggleFile(f.path);
                }
            });
        } else {
            onToggleFile(node.path);
        }
    };

    return (
        <div className="flex flex-col">
            <div
                className={`flex items-center group py-1.5 px-3 cursor-pointer hover:bg-[var(--color-surface-hover)] transition-colors ${isActive ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]' : 'text-[var(--color-text-muted)]'}`}
                style={{ paddingLeft: `${level * 18 + 12}px` }}
                onClick={() => isDir ? setIsOpen(!isOpen) : onFileClick(node.path)}
            >
                {/* Checkbox */}
                <div
                    className="mr-2.5 p-0.5"
                    onClick={handleToggle}
                >
                    <div className={`w-4 h-4 border rounded flex items-center justify-center transition-colors
                        ${selectionState === 'checked' ? 'bg-[var(--color-primary)] border-[var(--color-primary)]' :
                            selectionState === 'partial' ? 'bg-[var(--color-primary)]/50 border-[var(--color-primary)]' : 'border-[var(--color-border)]'}`}>
                        {selectionState === 'checked' && <span className="text-[11px] text-white">✓</span>}
                        {selectionState === 'partial' && <span className="text-[11px] text-white">-</span>}
                    </div>
                </div>

                {/* Arrow */}
                <span className={`w-4 h-4 flex items-center justify-center transition-transform duration-200 ${isDir ? '' : 'opacity-0'} ${isOpen ? 'rotate-90' : ''}`}>
                    ▶
                </span>

                {/* Icon */}
                <span className="mr-2 text-sm">
                    {isDir ? '📁' : '📄'}
                </span>

                {/* Name */}
                <span className="flex-1 truncate py-1 text-[13px] text-[var(--color-text)]">
                    {node.name}
                </span>

                {/* Size */}
                <span className="ml-2 text-[11px] text-[var(--color-text-muted)] group-hover:text-[var(--color-text)] whitespace-nowrap">
                    {formatBytes(node.size)}
                </span>

                {onDelete && !isDir && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onDelete(node.path); }}
                        className="ml-2 p-0.5 text-[var(--color-text-muted)] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Delete file"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                )}
            </div>

            {isDir && isOpen && (
                <NodeList
                    nodes={node.children}
                    level={level + 1}
                    onFileClick={onFileClick}
                    selectedFiles={selectedFiles}
                    onToggleFile={onToggleFile}
                    activeFile={activeFile}
                    allFiles={allFiles}
                    onDelete={onDelete}
                />
            )}
        </div>
    );
}
