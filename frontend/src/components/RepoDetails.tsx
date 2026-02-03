import { useState, useEffect, useRef } from 'react';
import { Modal } from './Modal';
import { Dropdown } from './Dropdown';
import { ScrollToTop } from './ScrollToTop';
import { getReadme, getModelInfo, getRepoTree, getRefs, getCacheReadme, getCacheTree, getFileContent, checkWriteAccess, uploadFile, uploadFileMultipart, selectFileDialog, deleteFile, getSettings, updateMetadata, getDatasetPreview, updateVisibility, deleteRepo, moveRepo, type ModelInfo, type FileNode, type Settings, type UpdateMetadataRequest, type DatasetPreviewResponse } from '../api/client';
import { FileTree } from './FileTree';
import { useLanguage } from '../contexts/LanguageContext';
import { useToast } from '../contexts/ToastContext';
import { useConfirm } from '../contexts/ConfirmContext';
import { ManageGitOps } from './ManageGitOps';
import { ManageSpaceOps } from './ManageSpaceOps';
import { ManageSync } from './ManageSync';
import { useFileSelection } from '../hooks/useFileSelection';
import { formatBytes, formatCompactNumber } from '../utils/format';

interface RepoDetailsProps {
    isOpen: boolean;
    onClose: () => void;
    repoId: string;
    repoType: string;
    isLocal?: boolean;
    onDownload: (patterns?: string[], revision?: string) => void;
    initialTab?: 'readme' | 'files' | 'manage';
}


export function RepoDetails({ isOpen, onClose, repoId, repoType, isLocal = false, onDownload, initialTab = 'readme' }: RepoDetailsProps) {
    const { t } = useLanguage();
    const scrollRef = useRef<HTMLDivElement>(null);
    const { success, error: toastError, info: toastInfo } = useToast();
    const { confirm } = useConfirm();
    const [activeTab, setActiveTab] = useState<'readme' | 'files' | 'manage' | 'data'>(initialTab as any);
    const [viewMode, setViewMode] = useState<'local' | 'remote'>(isLocal ? 'local' : 'remote');
    const [canWrite, setCanWrite] = useState(false);

    // Readme & Info
    const [readme, setReadme] = useState<string>('');
    const [info, setInfo] = useState<ModelInfo | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Files
    const [files, setFiles] = useState<FileNode[]>([]);
    const [filesLoading, setFilesLoading] = useState(false);

    // Preview
    const [previewContent, setPreviewContent] = useState<string | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewFile, setPreviewFile] = useState<string | null>(null);

    // Revision & Snippet
    const [revision, setRevision] = useState('main');
    const [branches, setBranches] = useState<string[]>([]);
    const [tags, setTags] = useState<string[]>([]);
    const [showSnippetModal, setShowSnippetModal] = useState(false);
    const [branchSelectorOpen, setBranchSelectorOpen] = useState(false);
    const [settings, setSettings] = useState<Settings | null>(null);
    const [snippetTab, setSnippetTab] = useState<'code' | 'local'>('code');

    // Manage Sub-tab State
    const [manageSubTab, setManageSubTab] = useState<'upload' | 'metadata' | 'sync' | 'history' | 'space' | 'settings'>('upload');

    // Dataset Preview
    const [previewData, setPreviewData] = useState<DatasetPreviewResponse | null>(null);
    const [previewDataLoading, setPreviewDataLoading] = useState(false);
    const [previewDataError, setPreviewDataError] = useState<string | null>(null);



    // Manage
    const [_newName, _setNewName] = useState('');
    const [_deleteConfirm, _setDeleteConfirm] = useState('');

    useEffect(() => {
        getSettings().then(setSettings).catch(console.error);
    }, []);

    // Files & Selection (Using Hook)
    const {
        filterText, setFilterText,
        selectedPreset, applyPreset,
        filteredFiles, selectedFiles,
        toggleFile, toggleSelectAll, selectMatching,
        selectedSize: totalSelectedSize,
        presets,
        reset
    } = useFileSelection(files);

    useEffect(() => {
        if (isOpen && repoId) {
            // Reset states
            setActiveTab(initialTab);
            setFiles([]);
            reset(); // Reset hook state
            setLoading(true);
            setRevision('main'); // Reset revision
            setCanWrite(false); // Reset permission
            setPreviewContent(null);
            setPreviewFile(null);
            setPreviewData(null); // Reset dataset preview
            setViewMode(isLocal ? 'local' : 'remote'); // Reset view mode based on how it was opened
            setManageSubTab('upload');
            loadBasicData(isLocal ? 'local' : 'remote');
            if (!isLocal) {
                loadRefs();
                checkPermission();
            }
        }
    }, [isOpen, repoId, isLocal]);

    // Reload when viewMode or revision changes
    useEffect(() => {
        if (isOpen) {
            loadBasicData(viewMode);
            if (activeTab === 'files') {
                loadFiles(viewMode);
            }
        }
    }, [viewMode, revision]);

    // Reload files when tab changes
    useEffect(() => {
        if (isOpen && activeTab === 'files' && files.length === 0) {
            loadFiles(viewMode);
        }
        if (isOpen && activeTab === 'data' && !previewData) {
            loadDatasetPreview();
        }
    }, [activeTab]);



    const loadDatasetPreview = async () => {
        if (!repoId || repoType !== 'dataset') return;
        setPreviewDataLoading(true);
        setPreviewDataError(null);
        try {
            const data = await getDatasetPreview(repoId, repoType, revision);
            setPreviewData(data);
        } catch (e: any) {
            console.error("Preview failed", e);
            setPreviewDataError(e.message || 'Failed to load preview');
        } finally {
            setPreviewDataLoading(false);
        }
    };

    const loadBasicData = async (mode: 'local' | 'remote') => {
        setLoading(true);
        setError(null);
        try {
            if (mode === 'local') {
                const [readmeData, infoData] = await Promise.allSettled([
                    getCacheReadme(repoId, repoType),
                    getModelInfo(repoId, repoType)
                ]);

                if (readmeData.status === 'fulfilled') {
                    setReadme(readmeData.value);
                } else {
                    setReadme('# 无本地 README\n该模型可能尚未由于某种原因未成功下载 README.md。');
                }

                if (infoData.status === 'fulfilled') {
                    setInfo(infoData.value);
                }
            } else {
                const [readmeData, infoData] = await Promise.allSettled([
                    getReadme(repoId, repoType, revision),
                    getModelInfo(repoId, repoType)
                ]);

                if (readmeData.status === 'fulfilled') {
                    setReadme(readmeData.value);
                } else {
                    setReadme('# Error loading README');
                }

                if (infoData.status === 'fulfilled') {
                    setInfo(infoData.value);
                }
            }
        } catch (err) {
            setError('Failed to load details');
        } finally {
            setLoading(false);
        }
    };

    const loadRefs = async () => {
        try {
            const data = await getRefs(repoId, repoType);
            const brs = data.branches || [];
            const tgs = data.tags || [];
            setBranches(brs);
            setTags(tgs);

            // Auto-detect default branch if 'main' not found
            if (brs.length > 0 && !brs.includes('main')) {
                const defaultBranch = brs.includes('master') ? 'master' : brs[0];
                setRevision(defaultBranch);
            }
        } catch (e) {
            console.error('Failed to load refs', e);
        }
    };

    const checkPermission = async () => {
        try {
            const { username, orgs } = await checkWriteAccess(repoId, repoType);
            if (username && repoId.startsWith(`${username}/`)) {
                setCanWrite(true);
            } else {
                for (const org of orgs) {
                    if (repoId.startsWith(`${org}/`)) {
                        setCanWrite(true);
                        break;
                    }
                }
            }
        } catch (e) {
            console.error("Permission check failed", e);
            setCanWrite(false);
        }
    };

    const loadFiles = async (mode: 'local' | 'remote') => {
        setFilesLoading(true);
        try {
            let data;
            if (mode === 'local') {
                data = await getCacheTree(repoId, repoType);
            } else {
                data = await getRepoTree(repoId, repoType, revision);
            }
            setFiles(data.files);
        } catch (e) {
            console.error(e);
            toastError(t('repoDetails.loadFilesError') || 'Failed to load file list');
        } finally {
            setFilesLoading(false);
        }
    };



    const handlePreview = async (path: string) => {
        const ext = path.split('.').pop()?.toLowerCase() || '';
        const viewableExts = ['py', 'md', 'json', 'txt', 'yaml', 'yml', 'config', 'sh', 'js', 'ts'];

        const fileNode = files.find(f => f.path === path);
        if (fileNode && fileNode.size > 2 * 1024 * 1024) { // 2MB Limit
            setPreviewContent("File too large to preview (Max 2MB). Please download to view.");
            setPreviewFile(path);
            return;
        }

        if (!viewableExts.includes(ext)) {
            toastInfo('该文件格式不支持直接预览（仅支持文本/代码文件）');
            return;
        }

        setPreviewLoading(true);
        setPreviewFile(path);
        try {
            const content = await getFileContent(repoId, path, repoType, isLocal ? 'local' : revision);
            setPreviewContent(content);
        } catch (err) {
            console.error(err);
            setPreviewContent('预览内容获取失败');
        } finally {
            setPreviewLoading(false);
        }
    };

    const handleDownloadSelected = () => {
        onDownload(Array.from(selectedFiles), revision);
    };

    const getSnippet = () => {
        if (snippetTab === 'local') {
            if (!settings?.hf_cache_dir) return "Loading settings or cache directory not configured...";
            // Sanitize repoId for folder name: models--author--repo
            const safeId = repoId.replace(/\//g, '--');
            // Construct path: cache_dir/models--author--repo/snapshots/revision
            // Using forward slashes for consistency, usually works on Windows too in many contexts, 
            // but could use backslashes if strictly needed. Keeping simple for now.
            return `${settings.hf_cache_dir}/models--${safeId}/snapshots/${revision}`;
        }

        if (repoType === 'dataset') {
            return `from datasets import load_dataset\n\ndataset = load_dataset("${repoId}", revision="${revision}")`;
        }
        const libName = info?.library_name || 'transformers';
        if (libName === 'transformers') {
            return `from transformers import AutoModel, AutoTokenizer\n\nmodel = AutoModel.from_pretrained("${repoId}", revision="${revision}")\ntokenizer = AutoTokenizer.from_pretrained("${repoId}", revision="${revision}")`;
        }
        if (libName === 'diffusers') {
            return `from diffusers import DiffusionPipeline\n\npipeline = DiffusionPipeline.from_pretrained("${repoId}", revision="${revision}")`;
        }
        return `# Library: ${libName}\n# Please check documentation for loading instructions.`;
    };

    const handleDeleteFile = async (path: string) => {
        confirm({
            title: t('repoDetails.deleteFileTitle') || 'Delete File',
            message: t('repoDetails.deleteConfirm').replace('{path}', path),
            isDestructive: true,
            onConfirm: async () => {
                try {
                    await deleteFile(repoId, path, repoType);
                    // Refresh files
                    loadFiles(viewMode);
                    success(t('common.success'));
                } catch (err) {
                    toastError('Failed to delete file: ' + (err instanceof Error ? err.message : String(err)));
                }
            }
        });
    };

    if (!isOpen) return null;

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={null}
            showCloseButton={false}
            className="max-w-6xl h-[90vh]"
            bodyClassName="p-0 flex flex-col h-full"
            bodyRef={scrollRef}
        >
            <ScrollToTop containerRef={scrollRef} />

            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg shrink-0 ${repoType === 'model' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                        {repoType === 'model' ? '📦' : repoType === 'dataset' ? '📊' : '🚀'}
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-[var(--color-text)] flex items-center gap-2">
                            {repoId}
                            <a
                                href={`https://huggingface.co/${repoType === 'dataset' ? 'datasets/' : ''}${repoId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors p-1 rounded-full hover:bg-[var(--color-surface-hover)]"
                                title={t('search.openInBrowser') || "Open in Hugging Face"}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                                </svg>
                            </a>
                            {isLocal && <span className="bg-blue-500/20 text-blue-400 text-xs px-2 py-0.5 rounded border border-blue-500/30">{t('repoDetails.local')}</span>}
                        </h2>
                        {info && (
                            <div className="mt-1 space-y-1">
                                <div className="flex items-center gap-3 text-xs text-slate-400">
                                    <span>⭐ {formatCompactNumber(info.likes)}</span>
                                    <span>⬇️ {formatCompactNumber(info.downloads)}</span>
                                    <span>{t('repoDetails.updated')}: {info.lastModified?.split(' ')[0]}</span>
                                </div>

                                {/* Dependency Hint */}
                                <div className="flex items-center gap-2">
                                    <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-[var(--color-surface)] border border-[var(--color-border)] text-[10px] text-[var(--color-text-muted)] font-mono hover:border-emerald-500/30 transition-colors group cursor-copy"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            const deps = new Set(['torch']);
                                            if (info.library_name) deps.add(info.library_name);
                                            if (info.tags?.includes('safetensors')) deps.add('safetensors');
                                            if (info.pipeline_tag?.includes('text-generation')) deps.add('accelerate');
                                            if (info.library_name === 'diffusers') { deps.add('transformers'); deps.add('accelerate'); }
                                            const cmd = `pip install ${Array.from(deps).join(' ')}`;
                                            navigator.clipboard.writeText(cmd);
                                            success('Command copied!');
                                        }}
                                        title="Click to copy install command"
                                    >
                                        <span className="text-emerald-500">➜</span>
                                        <span>
                                            pip install {(() => {
                                                const deps = new Set(['torch']);
                                                if (info.library_name) deps.add(info.library_name);
                                                else if (repoType === 'model') deps.add('transformers'); // default fallback

                                                if (info.tags?.includes('safetensors')) deps.add('safetensors');
                                                if (info.pipeline_tag?.includes('text-generation')) deps.add('accelerate');
                                                if (info.library_name === 'diffusers') { deps.add('transformers'); deps.add('accelerate'); }
                                                return Array.from(deps).join(' ');
                                            })()}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    {/* Branch/Tag Selector (Remote only) - Custom Styled Dropdown */}
                    {!isLocal && (branches.length > 0 || tags.length > 0) && (
                        <div className="relative group z-20">
                            <button
                                onClick={() => setBranchSelectorOpen(!branchSelectorOpen)}
                                className="flex items-center justify-between gap-2 min-w-[140px] px-3 py-1.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-xs font-mono text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] hover:border-[var(--color-primary)] transition-all shadow-sm"
                            >
                                <div className="flex items-center gap-2 overflow-hidden">
                                    <span className="truncate max-w-[100px]">{revision}</span>
                                </div>
                                <span className={`text-[10px] text-[var(--color-text-muted)] transition-transform ${branchSelectorOpen ? 'rotate-180' : ''}`}>▼</span>
                            </button>

                            {branchSelectorOpen && (
                                <>
                                    <div className="fixed inset-0 z-10" onClick={() => setBranchSelectorOpen(false)} />
                                    <div className="absolute top-full right-0 mt-2 w-56 max-h-[300px] overflow-y-auto custom-scrollbar bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-xl flex flex-col py-2 z-20 animate-fade-in-down">
                                        {branches.length > 0 && (
                                            <div className="mb-2">
                                                <div className="px-3 py-1.5 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider flex items-center gap-1 bg-[var(--color-background)]/50 mx-2 rounded mb-1">
                                                    {t('repoDetails.branches')}
                                                </div>
                                                {branches.map(b => (
                                                    <button
                                                        key={b}
                                                        onClick={() => { setRevision(b); setBranchSelectorOpen(false); }}
                                                        className={`w-full text-left px-4 py-2 text-xs font-mono transition-colors flex items-center justify-between group/item
                                                            ${revision === b ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]' : 'text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]'}`}
                                                    >
                                                        <span className="truncate">{b}</span>
                                                        {revision === b && <span>✓</span>}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                        {tags.length > 0 && (
                                            <div>
                                                <div className="px-3 py-1.5 text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider flex items-center gap-1 bg-[var(--color-background)]/50 mx-2 rounded mb-1">
                                                    {t('repoDetails.tags')}
                                                </div>
                                                {tags.map(t => (
                                                    <button
                                                        key={t}
                                                        onClick={() => { setRevision(t); setBranchSelectorOpen(false); }}
                                                        className={`w-full text-left px-4 py-2 text-xs font-mono transition-colors flex items-center justify-between group/item
                                                            ${revision === t ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]' : 'text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]'}`}
                                                    >
                                                        <span className="truncate">{t}</span>
                                                        {revision === t && <span>✓</span>}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    <div className="flex bg-[var(--color-surface)] rounded-lg p-1 border border-[var(--color-border)]">
                        <button onClick={() => setActiveTab('readme')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'readme' ? 'bg-[var(--color-primary)] text-white shadow' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}>{t('repoDetails.readme')}</button>
                        <button onClick={() => setActiveTab('files')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'files' ? 'bg-[var(--color-primary)] text-white shadow' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}>{t('repoDetails.files')}</button>
                        {repoType === 'dataset' && (
                            <button onClick={() => setActiveTab('data')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'data' ? 'bg-[var(--color-primary)] text-white shadow' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}>
                                {t('repoDetails.dataPreview') || "Data"}
                            </button>
                        )}

                        {(!isLocal && canWrite) && (
                            <button onClick={() => { setActiveTab('manage'); setManageSubTab('upload'); }} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'manage' && manageSubTab === 'upload' ? 'bg-[var(--color-primary)] text-white shadow' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}>
                                {t('repoDetails.uploadBtn') || "Upload"}
                            </button>
                        )}

                        {(!isLocal && canWrite) && (
                            <button onClick={() => { setActiveTab('manage'); setManageSubTab('metadata'); }} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'manage' && manageSubTab !== 'upload' ? 'bg-indigo-600 text-white shadow' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}>{t('repoDetails.manage')}</button>
                        )}
                    </div>

                    <button onClick={onClose} className="p-2 hover:bg-[var(--color-surface-hover)] rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors">
                        ✕
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden flex flex-col bg-[var(--color-background)]">
                {error && (
                    <div className="p-3 bg-red-500/10 border-b border-red-500/20 text-red-400 text-xs text-center">
                        ⚠️ {error}
                    </div>
                )}
                {activeTab === 'readme' && (
                    <div className="flex-1 relative flex flex-col overflow-hidden">
                        {/* Floating Translate Button */}
                        {!loading && readme && (
                            <a
                                href={`https://translate.google.com/translate?sl=auto&tl=zh-CN&u=${encodeURIComponent(`https://huggingface.co/${repoType === 'dataset' ? 'datasets/' : ''}${repoId}`)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="absolute top-4 right-8 z-10 px-3 py-1.5 bg-[var(--color-surface)]/90 backdrop-blur border border-[var(--color-border)] rounded-full shadow-sm text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-primary)] hover:border-[var(--color-primary)]/50 transition-all flex items-center gap-2 group shadow-lg"
                                title="Translate to Chinese via Google"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-70 group-hover:opacity-100">
                                    <path d="m5 8 6 6" /><path d="m4 14 6-6 2-3" /><path d="M2 5h12" /><path d="M7 2h1" /><path d="m22 22-5-10-5 10" /><path d="M14 18h6" />
                                </svg>
                                <span>Translate</span>
                            </a>
                        )}
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-8">
                            {loading ? (
                                <div className="flex flex-col items-center justify-center h-full text-[var(--color-text-muted)]">
                                    <div className="w-8 h-8 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin mb-4"></div>
                                    <p>{t('repoDetails.loading')}</p>
                                </div>
                            ) : (
                                <div className="prose prose-invert prose-slate max-w-none markdown-body">
                                    <div
                                        dangerouslySetInnerHTML={{
                                            __html: (window as any).marked
                                                ? (window as any).marked.parse(readme || '')
                                                : `<pre class="whitespace-pre-wrap font-mono text-xs bg-[var(--color-surface)] p-4 rounded-lg border border-[var(--color-border)] text-[var(--color-text-muted)]">${readme || t('repoDetails.noContent')}</pre>`
                                        }}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                )}
                {activeTab === 'files' && (
                    <div className="flex-1 flex overflow-hidden">
                        {/* Left: File List */}
                        <div className={`flex flex-col border-r border-[var(--color-border)] transition-all duration-300 ${previewFile ? 'w-1/3' : 'w-full'}`}>
                            {/* Toolbar */}
                            <div className="p-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] flex items-center gap-3">
                                <div
                                    className="flex items-center gap-2 px-2 py-1.5 hover:bg-[var(--color-surface-hover)] rounded-lg cursor-pointer transition-colors shrink-0"
                                    onClick={toggleSelectAll}
                                    title={t('repoDetails.selectAll') || "Select Visible"}
                                >
                                    <div className={`w-4 h-4 border rounded flex items-center justify-center transition-colors
                                            ${filteredFiles.length > 0 && selectedFiles.size >= filteredFiles.length ? 'bg-indigo-500 border-indigo-500' :
                                            selectedFiles.size > 0 ? 'bg-indigo-500/50 border-indigo-500' : 'border-slate-600'}`}>
                                        {selectedFiles.size >= filteredFiles.length && filteredFiles.length > 0 && <span className="text-[11px] text-white">✓</span>}
                                    </div>
                                    <span className="text-xs font-medium text-[var(--color-text-muted)]">{t('repoDetails.selectAll') || "Select Visible"}</span>
                                </div>

                                <div className="w-px h-6 bg-[var(--color-border)] shrink-0 mx-1" />

                                {/* Smart Presets */}
                                <div className="min-w-[160px]">
                                    <Dropdown
                                        value={selectedPreset}
                                        onChange={applyPreset}
                                        options={presets.map(p => ({
                                            value: p.id,
                                            label: p.label,
                                            group: p.group
                                        }))}
                                        placeholder="Smart Filter"
                                        className="w-48"
                                        buttonClassName="py-1.5 text-xs font-medium border-slate-700 bg-[var(--color-surface)]"
                                    />
                                </div>

                                <div className="w-px h-6 bg-[var(--color-border)] shrink-0 mx-1" />

                                {/* Filter Input with Advanced Help */}
                                <div className="flex-1 relative group/help">
                                    <input
                                        type="text"
                                        placeholder={t('repoDetails.filter') + " (Glob/Regex supported)"}
                                        value={filterText}
                                        onChange={(e) => setFilterText(e.target.value)}
                                        className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[var(--color-primary)] text-[var(--color-text)] font-mono"
                                    />
                                    {/* Tooltip */}
                                    <div className="absolute top-full left-0 mt-2 w-64 p-3 bg-slate-800 text-slate-200 text-xs rounded-lg shadow-xl hidden group-hover/help:block z-50 border border-slate-700">
                                        <div className="font-bold mb-1">Advanced Filtering:</div>
                                        <ul className="list-disc pl-4 space-y-1 opacity-80">
                                            <li>Glob: <code className="bg-slate-900 px-1 rounded">*.gguf</code></li>
                                            <li>Regex: <code className="bg-slate-900 px-1 rounded">regex:^model.*\d$</code></li>
                                            <li>Exclude: <code className="bg-slate-900 px-1 rounded">!*.bin</code></li>
                                        </ul>
                                    </div>
                                </div>

                                {/* Select Matching Button */}
                                {filterText && filteredFiles.length > 0 && (
                                    <button
                                        onClick={selectMatching}
                                        className="px-3 py-1.5 bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 border border-indigo-500/30 rounded-lg text-xs font-medium transition-colors whitespace-nowrap"
                                        title="Select all files matching the current filter"
                                    >
                                        Select All {filteredFiles.length}
                                    </button>
                                )}
                            </div>

                            {/* File List - Tree View */}
                            <div className="flex-1 overflow-y-auto custom-scrollbar text-[var(--color-text)]">
                                {filesLoading ? (
                                    <div className="flex items-center justify-center h-full text-[var(--color-text-muted)]">
                                        <div className="w-6 h-6 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin mr-2"></div>
                                        {t('repoDetails.itemsLoading')}
                                    </div>
                                ) : files.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-full text-[var(--color-text-muted)] p-6 text-center">
                                        <div className="text-4xl mb-2 opacity-50">📂</div>
                                        <p>{t('repoDetails.noFiles')}</p>
                                        <p className="text-xs mt-1 opacity-70">
                                            {viewMode === 'local' ? t('repoDetails.noFilesDescLocal') : t('repoDetails.noFilesDescRemote')}
                                        </p>
                                    </div>
                                ) : (
                                    <FileTree
                                        files={filteredFiles}
                                        onFileClick={handlePreview}
                                        selectedFiles={selectedFiles}
                                        onToggleFile={toggleFile}
                                        activeFile={previewFile}
                                        onDelete={(!isLocal && canWrite) ? handleDeleteFile : undefined}
                                    />
                                )}
                            </div>

                            {/* Footer / Action Bar (Only for remote selection) */}
                            {viewMode === 'remote' && selectedFiles.size > 0 && (
                                <div className="p-4 border-t border-[var(--color-border)] bg-[var(--color-surface)]/30 flex items-center justify-between animate-fade-in-up">
                                    <div className="text-sm">
                                        <span className="text-[var(--color-text)] font-medium">{t('repoDetails.selected').replace('{count}', String(selectedFiles.size))}</span>
                                        <span className="text-[var(--color-text-muted)] mx-2">|</span>
                                        <span className="text-[var(--color-text-muted)]">{formatBytes(totalSelectedSize)}</span>
                                    </div>
                                    <button
                                        onClick={handleDownloadSelected}
                                        className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white rounded-lg font-medium shadow-lg shadow-indigo-500/20 active:scale-95 transition-all"
                                    >
                                        {t('repoDetails.download')}
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Right: Preview Panel */}
                        {previewFile && (
                            <div className="flex-1 flex flex-col bg-[var(--color-background)] animate-fade-in">
                                <div className="flex items-center justify-between p-3 border-b border-[var(--color-border)] bg-[var(--color-surface)]/50">
                                    <div className="flex items-center gap-2 overflow-hidden">
                                        <span className="text-xs text-[var(--color-text-muted)] font-mono">{t('repoDetails.filePreview')}:</span>
                                        <span className="text-sm text-[var(--color-text)] font-mono truncate">{previewFile}</span>
                                    </div>
                                    <button onClick={() => setPreviewFile(null)} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]">✕</button>
                                </div>
                                <div className="flex-1 overflow-auto custom-scrollbar p-0">
                                    {previewLoading ? (
                                        <div className="flex items-center justify-center h-full text-[var(--color-text-muted)]">
                                            <div className="w-6 h-6 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin mr-2"></div>
                                            {t('repoDetails.reading')}
                                        </div>
                                    ) : (
                                        <pre className="p-4 text-xs font-mono text-[var(--color-text)] leading-relaxed whitespace-pre-wrap">
                                            {previewContent}
                                        </pre>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}
                {activeTab === 'data' && (
                    <div className="flex-1 overflow-auto custom-scrollbar p-6">
                        {previewDataLoading ? (
                            <div className="flex flex-col items-center justify-center h-full text-[var(--color-text-muted)]">
                                <div className="w-8 h-8 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin mb-4"></div>
                                <p>{t('repoDetails.loading')}</p>
                            </div>
                        ) : previewDataError ? (
                            <div className="flex flex-col items-center justify-center h-full text-red-500 p-6 text-center">
                                <p className="font-bold mb-2">Preview Failed</p>
                                <p className="text-sm opacity-80 mb-4">{previewDataError}</p>
                                {previewDataError.includes("Missing dependency") && (
                                    <div className="p-3 bg-slate-800 rounded text-xs font-mono text-slate-300">
                                        pip install pyarrow
                                    </div>
                                )}
                            </div>
                        ) : previewData ? (
                            <div className="h-full flex flex-col">
                                <div className="mb-4 flex items-center justify-between">
                                    <h3 className="text-lg font-medium text-[var(--color-text)] flex items-center gap-2">
                                        📊 Data Preview
                                        <span className="text-xs font-mono bg-[var(--color-surface-hover)] px-2 py-0.5 rounded text-[var(--color-text-muted)] border border-[var(--color-border)]">
                                            {previewData.file}
                                        </span>
                                    </h3>
                                    <span className="text-xs text-[var(--color-text-muted)]">
                                        Showing first {previewData.rows.length} rows
                                    </span>
                                </div>
                                <div className="flex-1 overflow-auto border border-[var(--color-border)] rounded-lg bg-[var(--color-surface)]/30 backdrop-blur-sm">
                                    <table className="min-w-full text-sm text-left">
                                        <thead className="bg-[var(--color-surface-hover)] text-[var(--color-text-muted)] font-medium sticky top-0 z-10 shadow-sm">
                                            <tr>
                                                {previewData.columns.map((col, i) => (
                                                    <th key={i} className="px-4 py-3 whitespace-nowrap border-b border-[var(--color-border)] font-semibold">{col}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[var(--color-border)]">
                                            {previewData.rows.map((row, i) => (
                                                <tr key={i} className="hover:bg-[var(--color-surface-hover)] transition-colors group">
                                                    {row.map((cell, j) => (
                                                        <td key={j} className="px-4 py-2 whitespace-nowrap max-w-[300px] truncate text-[var(--color-text)] opacity-90 group-hover:opacity-100" title={typeof cell === 'object' ? JSON.stringify(cell) : String(cell)}>
                                                            {typeof cell === 'object' ? JSON.stringify(cell) : String(cell)}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ) : null}
                    </div>
                )}
                {activeTab === 'manage' && (
                    <ManageTab
                        repoId={repoId}
                        repoType={repoType}
                        isPrivate={info?.private || false}
                        activeSubTab={manageSubTab}
                        onSubTabChange={setManageSubTab}
                    />
                )}
            </div>

            {/* Snippet Modal */}
            <Modal
                isOpen={showSnippetModal}
                onClose={() => setShowSnippetModal(false)}
                title={t('repoDetails.snippetTitle')}
                className="max-w-3xl"
            >
                <div className="space-y-4">
                    <div className="flex border-b border-[var(--color-border)] mb-2">
                        <button
                            onClick={() => setSnippetTab('code')}
                            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${snippetTab === 'code' ? 'border-[var(--color-primary)] text-[var(--color-primary)]' : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}
                        >
                            {t('repoDetails.tabs.code') || "Python Code"}
                        </button>
                        <button
                            onClick={() => setSnippetTab('local')}
                            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${snippetTab === 'local' ? 'border-[var(--color-primary)] text-[var(--color-primary)]' : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}
                        >
                            {t('repoDetails.tabs.localPath') || "Local Path"}
                        </button>
                    </div>
                    <p className="text-sm text-[var(--color-text-muted)]">
                        {snippetTab === 'code' ? t('repoDetails.snippetDesc') : 'Absolute path to the model snapshot (based on current revision).'}
                    </p>
                    <div className="relative">
                        <pre className="bg-[var(--color-background)] p-4 rounded-lg text-sm text-[var(--color-text)] font-mono overflow-x-auto border border-[var(--color-border)]">
                            {getSnippet()}
                        </pre>
                        <button
                            onClick={() => {
                                navigator.clipboard.writeText(getSnippet());
                                success(t('repoDetails.copied'));
                            }}
                            className="absolute top-2 right-2 p-1.5 bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)] rounded text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors border border-[var(--color-border)]"
                        >
                            {t('repoDetails.copy')}
                        </button>
                    </div>
                    <div className="flex justify-end">
                        <button
                            onClick={() => setShowSnippetModal(false)}
                            className="px-4 py-2 bg-[var(--color-surface-hover)] hover:bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] text-sm"
                        >
                            {t('repoDetails.close')}
                        </button>
                    </div>
                </div>
            </Modal>
        </Modal>
    );
}


// Import necessary components and constants



const LICENSES = [
    { value: "mit", label: "MIT" },
    { value: "apache-2.0", label: "Apache 2.0" },
    { value: "cc-by-4.0", label: "CC-BY 4.0" },
    { value: "cc-by-nc-4.0", label: "CC-BY-NC 4.0" },
    { value: "bsd-3-clause", label: "BSD 3-Clause" },
    { value: "mpl-2.0", label: "MPL 2.0" },
    { value: "unlicense", label: "Unlicense" },
    { value: "gpl-3.0", label: "GPL 3.0" },
    { value: "afl-3.0", label: "AFL 3.0" },
];

const PIPELINE_TAGS = [
    "text-generation", "text-classification", "token-classification", "question-answering",
    "summarization", "translation", "image-classification", "object-detection",
    "text-to-image", "image-to-text", "audio-classification", "automatic-speech-recognition"
].sort();

interface ManageTabProps {
    repoId: string;
    repoType: string;
    isPrivate: boolean;
    activeSubTab: 'upload' | 'metadata' | 'sync' | 'history' | 'space' | 'settings';
    onSubTabChange: (tab: 'upload' | 'metadata' | 'sync' | 'history' | 'space' | 'settings') => void;
}

function ManageTab({ repoId, repoType, isPrivate, activeSubTab, onSubTabChange }: ManageTabProps) {
    const { t } = useLanguage();
    const { success, error: toastError } = useToast();
    // Sub-tabs state is now controlled by parent

    // Upload State
    const [filePath, setFilePath] = useState('');
    const [targetPath, setTargetPath] = useState('');
    const [commitMsg, setCommitMsg] = useState(`Upload file to ${repoId}`);
    const [uploading, setUploading] = useState(false);
    const [status, setStatus] = useState<{ type: 'success' | 'error', msg: string } | null>(null);
    const [dragActive, setDragActive] = useState(false);
    const [droppedFile, setDroppedFile] = useState<File | null>(null);

    // Metadata State
    const [metaLoading, setMetaLoading] = useState(false);
    const [formData, setFormData] = useState<UpdateMetadataRequest>({
        repo_id: repoId,
        repo_type: repoType as any,
        license: '',
        tags: [],
        pipeline_tag: '',
        sdk: '',
        gated: ''
    });
    const [tagInput, setTagInput] = useState('');
    const [appSettings, setAppSettings] = useState<{ download_dir: string } | null>(null);

    useEffect(() => {
        if (activeSubTab === 'metadata') {
            loadMetadata();
        }
        if (activeSubTab === 'sync') {
            getSettings().then(setAppSettings).catch(console.error);
        }
    }, [activeSubTab, repoId]);

    const loadMetadata = async () => {
        try {
            const info = await getModelInfo(repoId, repoType);
            setFormData({
                repo_id: repoId,
                repo_type: repoType as any,
                license: '', // Info doesn't always have license in easy format?
                tags: info.tags || [],
                pipeline_tag: info.pipeline_tag || '',
                sdk: '',
                gated: typeof info.gated === 'boolean' ? (info.gated ? 'auto' : '') : (info.gated || '')
            });
        } catch (e) {
            console.error("Failed to load metadata", e);
        }
    };

    const handleMetadataSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setMetaLoading(true);
        try {
            const result = await updateMetadata(formData);
            if (result.success) {
                success('Metadata updated successfully!');
            }
        } catch (err) {
            toastError(err instanceof Error ? err.message : 'Update failed');
        } finally {
            setMetaLoading(false);
        }
    };

    const addTag = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && tagInput.trim()) {
            e.preventDefault();
            if (!formData.tags?.includes(tagInput.trim())) {
                setFormData(prev => ({ ...prev, tags: [...(prev.tags || []), tagInput.trim()] }));
            }
            setTagInput('');
        }
    };

    const removeTag = (tagToRemove: string) => {
        setFormData(prev => ({ ...prev, tags: prev.tags?.filter(t => t !== tagToRemove) }));
    };


    const handleSelectFile = async () => {
        try {
            const result = await selectFileDialog();
            if (result.path) {
                setFilePath(result.path);
                setDroppedFile(null); // Clear dropped file if selecting locally
                const filename = result.path.split(/[\\/]/).pop();
                if (filename) setTargetPath(filename);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true);
        } else if (e.type === 'dragleave') {
            setDragActive(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            const file = e.dataTransfer.files[0];
            setDroppedFile(file);
            setFilePath(''); // Clear local path if dropping
            setTargetPath(file.name);
        }
    };

    const handleUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if ((!filePath && !droppedFile) || !targetPath) return;

        setUploading(true);
        setStatus(null);
        try {
            let result;
            if (droppedFile) {
                result = await uploadFileMultipart(repoId, repoType, targetPath, droppedFile, commitMsg);
            } else {
                result = await uploadFile({
                    repo_id: repoId,
                    repo_type: repoType as any,
                    file_path: filePath,
                    path_in_repo: targetPath,
                    commit_message: commitMsg
                });
            }
            setStatus({ type: 'success', msg: result.message });
            setFilePath('');
            setDroppedFile(null);
            setTargetPath('');
        } catch (err) {
            setStatus({ type: 'error', msg: err instanceof Error ? err.message : 'Upload failed' });
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
            <div className="max-w-xl mx-auto space-y-8">
                <div>
                    {/* Tabs for Sub-navigation */}
                    <div className="flex border-b border-[var(--color-border)] mb-6 overflow-x-auto no-scrollbar gap-2">
                        <button
                            onClick={() => onSubTabChange('upload')}
                            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeSubTab === 'upload' ? 'border-[var(--color-primary)] text-[var(--color-primary)]' : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}
                        >
                            {t('repoDetails.uploadFile')}
                        </button>
                        <button
                            onClick={() => onSubTabChange('metadata')}
                            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeSubTab === 'metadata' ? 'border-[var(--color-primary)] text-[var(--color-primary)]' : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}
                        >
                            {t('repoDetails.tabs.metadata')}
                        </button>
                        <button
                            onClick={() => onSubTabChange('sync')}
                            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeSubTab === 'sync' ? 'border-[var(--color-primary)] text-[var(--color-primary)]' : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}
                        >
                            {t('repoDetails.tabs.sync')}
                        </button>
                        <button
                            onClick={() => onSubTabChange('history')}
                            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeSubTab === 'history' ? 'border-[var(--color-primary)] text-[var(--color-primary)]' : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}
                        >
                            {t('repoDetails.tabs.history')}
                        </button>
                        {repoType === 'space' && (
                            <button
                                onClick={() => onSubTabChange('space')}
                                className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeSubTab === 'space' ? 'border-[var(--color-primary)] text-[var(--color-primary)]' : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}
                            >
                                {t('repoDetails.tabs.space')}
                            </button>
                        )}
                        <button
                            onClick={() => onSubTabChange('settings')}
                            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeSubTab === 'settings' ? 'border-red-500 text-red-500' : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}
                        >
                            {t('repoDetails.tabs.settings')}
                        </button>
                    </div>

                    {activeSubTab === 'metadata' && (
                        <div className="animate-fade-in">
                            <form onSubmit={handleMetadataSubmit} className="space-y-6">
                                <div className="flex items-center justify-between pb-4 border-b border-[var(--color-border)]">
                                    <h3 className="text-xl font-bold text-[var(--color-text)]">{t('repoDetails.metadata.title')}</h3>
                                    <button
                                        type="submit"
                                        disabled={metaLoading}
                                        className="bg-indigo-600 hover:bg-indigo-500 rounded-lg px-4 py-2 text-white text-sm font-bold transition-colors disabled:opacity-50"
                                    >
                                        {metaLoading ? t('repoDetails.metadata.saving') : t('repoDetails.metadata.save')}
                                    </button>
                                </div>

                                {repoType !== 'space' && (
                                    <div className="space-y-2">
                                        <label className="block text-sm font-semibold text-[var(--color-text)]">{t('repoDetails.metadata.license')}</label>
                                        <select
                                            value={formData.license || ""}
                                            onChange={e => setFormData({ ...formData, license: e.target.value })}
                                            className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2.5 text-[var(--color-text)]"
                                        >
                                            <option value="">{t('repoDetails.metadata.keepCurrent')}</option>
                                            {LICENSES.map(l => (
                                                <option key={l.value} value={l.value}>{l.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {repoType === 'model' && (
                                    <div className="space-y-2">
                                        <label className="block text-sm font-semibold text-[var(--color-text)]">{t('repoDetails.metadata.task')}</label>
                                        <select
                                            value={formData.pipeline_tag || ""}
                                            onChange={e => setFormData({ ...formData, pipeline_tag: e.target.value })}
                                            className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2.5 text-[var(--color-text)]"
                                        >
                                            <option value="">{t('repoDetails.metadata.none')}</option>
                                            {PIPELINE_TAGS.map(t => (
                                                <option key={t} value={t}>{t}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <label className="block text-sm font-semibold text-[var(--color-text)]">{t('repoDetails.metadata.tags')}</label>
                                    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 flex flex-wrap gap-2">
                                        {formData.tags?.map(tag => (
                                            <span key={tag} className="bg-[var(--color-primary)]/20 text-[var(--color-primary)] text-xs px-2 py-1 rounded-md flex items-center gap-1 border border-[var(--color-primary)]/30">
                                                {tag}
                                                <button type="button" onClick={() => removeTag(tag)} className="hover:text-[var(--color-text)]">×</button>
                                            </span>
                                        ))}
                                        <input
                                            type="text"
                                            value={tagInput}
                                            onChange={e => setTagInput(e.target.value)}
                                            onKeyDown={addTag}
                                            placeholder={t('repoDetails.metadata.addTagPlaceholder')}
                                            className="bg-transparent border-none focus:ring-0 text-sm text-[var(--color-text)] flex-1 min-w-[100px] outline-none"
                                        />
                                    </div>
                                </div>
                            </form>
                        </div>
                    )}

                    {activeSubTab === 'sync' && appSettings && (
                        <ManageSync
                            repoId={repoId}
                            repoType={repoType}
                            defaultPath={`${appSettings.download_dir}\\${repoId.replace('/', '--')}`}
                        />
                    )}

                    {activeSubTab === 'history' && (
                        <ManageGitOps repoId={repoId} repoType={repoType} />
                    )}

                    {activeSubTab === 'space' && (
                        <ManageSpaceOps repoId={repoId} />
                    )}

                    {activeSubTab === 'upload' && (
                        <>
                            <div>
                                <h3 className="text-xl font-bold text-[var(--color-text)] mb-2">{t('repoDetails.uploadFile')}</h3>
                                <p className="text-[var(--color-text-muted)] text-sm">
                                    {t('repoDetails.uploadDesc')}
                                </p>
                            </div>

                            <form onSubmit={handleUpload} className="space-y-6 mt-6">
                                {/* File Selection Area */}
                                <div>
                                    <label className="block text-sm font-medium text-[var(--color-text)] mb-2">
                                        {t('repoDetails.selectFile')}
                                    </label>
                                    <div
                                        className={`relative group border-2 border-dashed rounded-xl p-8 transition-colors text-center ${dragActive ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10' : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-border)]'}`}
                                        onDragEnter={handleDrag}
                                        onDragLeave={handleDrag}
                                        onDragOver={handleDrag}
                                        onDrop={handleDrop}
                                    >
                                        <input
                                            type="file"
                                            className="hidden"
                                            id="file-upload"
                                            onChange={(e) => {
                                                if (e.target.files?.[0]) {
                                                    setDroppedFile(e.target.files[0]);
                                                    setFilePath('');
                                                    setTargetPath(e.target.files[0].name);
                                                }
                                            }}
                                        />

                                        {droppedFile ? (
                                            <div className="flex flex-col items-center">
                                                <div className="w-12 h-12 bg-indigo-500/20 text-indigo-400 rounded-lg flex items-center justify-center text-2xl mb-2">
                                                    📄
                                                </div>
                                                <p className="text-[var(--color-text)] font-medium">{droppedFile.name}</p>
                                                <p className="text-xs text-[var(--color-text-muted)] mt-1">{formatBytes(droppedFile.size)}</p>
                                                <button
                                                    type="button"
                                                    onClick={(e) => { e.stopPropagation(); setDroppedFile(null); }}
                                                    className="mt-3 text-xs text-red-400 hover:text-red-300"
                                                >
                                                    {t('repoDetails.remove')}
                                                </button>
                                            </div>
                                        ) : filePath ? (
                                            <div className="flex flex-col items-center">
                                                <div className="w-12 h-12 bg-blue-500/20 text-blue-400 rounded-lg flex items-center justify-center text-2xl mb-2">
                                                    🖥️
                                                </div>
                                                <p className="text-[var(--color-text)] font-medium">Local File Selected</p>
                                                <p className="text-xs text-[var(--color-text-muted)] mt-1 break-all px-4">{filePath}</p>
                                                <button
                                                    type="button"
                                                    onClick={() => setFilePath('')}
                                                    className="mt-3 text-xs text-red-400 hover:text-red-300"
                                                >
                                                    {t('repoDetails.clear')}
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col items-center">
                                                <div className="w-12 h-12 bg-[var(--color-surface-hover)] text-[var(--color-text-muted)] rounded-lg flex items-center justify-center text-2xl mb-3">
                                                    ☁️
                                                </div>
                                                <p className="text-[var(--color-text-muted)] font-medium mb-1">{t('repoDetails.dragHere')}</p>
                                                <p className="text-xs text-[var(--color-text-muted)] mb-4">{t('repoDetails.orClick')}</p>
                                                <div className="flex gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={handleSelectFile}
                                                        className="px-3 py-1.5 bg-[var(--color-surface-hover)] hover:bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-xs text-[var(--color-text)] transition-colors"
                                                    >
                                                        {t('repoDetails.systemBrowse')}
                                                    </button>
                                                    <label
                                                        htmlFor="file-upload"
                                                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs text-white transition-colors cursor-pointer"
                                                    >
                                                        {t('repoDetails.browserUpload')}
                                                    </label>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Target Path */}
                                <div>
                                    <label className="block text-sm font-medium text-[var(--color-text)] mb-2">
                                        {t('repoDetails.pathInRepo')}
                                    </label>
                                    <input
                                        type="text"
                                        value={targetPath}
                                        onChange={e => setTargetPath(e.target.value)}
                                        placeholder={t('repoDetails.pathPlaceholder')}
                                        className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-primary)] text-[var(--color-text)]"
                                    />
                                </div>

                                {/* Commit Message */}
                                <div>
                                    <label className="block text-sm font-medium text-[var(--color-text)] mb-2">
                                        {t('repoDetails.commitMsg')}
                                    </label>
                                    <input
                                        type="text"
                                        value={commitMsg}
                                        onChange={e => setCommitMsg(e.target.value)}
                                        className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-primary)] text-[var(--color-text)]"
                                    />
                                </div>

                                {status && (
                                    <div className={`p-3 rounded-lg text-sm ${status.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                                        {status.type === 'success' ? '✅ ' : '❌ '}
                                        {status.msg}
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={uploading || (!filePath && !droppedFile) || !targetPath}
                                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white font-medium transition-colors flex items-center justify-center gap-2"
                                >
                                    {uploading ? <span className="animate-spin">⏳</span> : '📤'}
                                    {t('repoDetails.uploadBtn')}
                                </button>
                            </form>

                            <div className="p-4 bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)] text-xs text-[var(--color-text-muted)] mt-8">
                                <p>{t('repoDetails.uploadNote')}</p>
                            </div>
                        </>
                    )}

                    {activeSubTab === 'settings' && (
                        <RepoSettings repoId={repoId} repoType={repoType} initialPrivate={isPrivate} />
                    )}
                </div>
            </div>
        </div>
    );
}



function RepoSettings({ repoId, repoType, initialPrivate }: { repoId: string, repoType: string, initialPrivate: boolean }) {
    const { t } = useLanguage();
    const { success, error: toastError } = useToast();
    const { confirm } = useConfirm();
    const [loading, setLoading] = useState(false);

    // Visibility
    const [isPrivate, setIsPrivate] = useState(initialPrivate);
    // Rename
    const [newName, setNewName] = useState('');
    // Delete
    const [deleteConfirm, setDeleteConfirm] = useState('');

    const handleVisibility = async (priv: boolean) => {
        confirm({
            title: t('repoDetails.settings.visibility'),
            message: priv ? (t('repoDetails.settings.makePrivate') + '?') : (t('repoDetails.settings.makePublic') + '?'),
            onConfirm: async () => {
                setLoading(true);
                try {
                    await updateVisibility(repoId, repoType, priv);
                    setIsPrivate(priv);
                    success(t('repoDetails.settings.updateSuccess'));
                } catch (e) {
                    toastError(String(e));
                } finally {
                    setLoading(false);
                }
            }
        });
    };

    const handleRename = async () => {
        if (!newName) return;
        setLoading(true);
        try {
            // Check if full name provided or just name
            let toRepo = newName;
            if (!newName.includes('/')) {
                const user = repoId.split('/')[0];
                toRepo = `${user}/${newName}`;
            }
            await moveRepo(repoId, toRepo, repoType);
            success(t('repoDetails.settings.updateSuccess') + '\nPage will reload.');
            window.setTimeout(() => window.location.reload(), 1500);
        } catch (e) {
            toastError(String(e));
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (deleteConfirm !== repoId) {
            toastError('Please type the repo ID correctly to confirm.');
            return;
        }
        confirm({
            title: t('repoDetails.settings.delete'),
            message: t('common.confirm') || 'Are you sure?',
            isDestructive: true,
            confirmText: t('repoDetails.settings.deleteBtn'),
            onConfirm: async () => {
                setLoading(true);
                try {
                    await deleteRepo(repoId, repoType);
                    success(t('repoDetails.settings.deleteSuccess'));
                    window.setTimeout(() => window.location.reload(), 1500);
                } catch (e) {
                    toastError(String(e));
                    setLoading(false);
                }
            }
        });
    };

    return (
        <div className="space-y-8 animate-fade-in">
            {/* Visibility */}
            <div className="p-5 border border-[var(--color-border)] rounded-xl bg-[var(--color-surface)]">
                <h3 className="text-lg font-bold text-[var(--color-text)] mb-2">{t('repoDetails.settings.visibility')}</h3>
                <p className="text-sm text-[var(--color-text-muted)] mb-4">{t('repoDetails.settings.visibilityDesc')}</p>
                <div className="flex gap-3">
                    <button
                        onClick={() => handleVisibility(false)}
                        disabled={loading || !isPrivate}
                        className={`px-4 py-2 border border-[var(--color-border)] rounded-lg text-sm transition-colors ${!isPrivate ? 'bg-[var(--color-primary)] text-white border-transparent' : 'hover:bg-[var(--color-surface-hover)] text-[var(--color-text)]'}`}
                    >
                        {t('repoDetails.settings.makePublic')}
                    </button>
                    <button
                        onClick={() => handleVisibility(true)}
                        disabled={loading || isPrivate}
                        className={`px-4 py-2 border border-[var(--color-border)] rounded-lg text-sm transition-colors ${isPrivate ? 'bg-[var(--color-primary)] text-white border-transparent' : 'hover:bg-[var(--color-surface-hover)] text-[var(--color-text)]'}`}
                    >
                        {t('repoDetails.settings.makePrivate')}
                    </button>
                </div>
            </div>

            {/* Rename */}
            <div className="p-5 border border-[var(--color-border)] rounded-xl bg-[var(--color-surface)]">
                <h3 className="text-lg font-bold text-[var(--color-text)] mb-2">{t('repoDetails.settings.rename')}</h3>
                <p className="text-sm text-[var(--color-text-muted)] mb-4">{t('repoDetails.settings.renameDesc')}</p>
                <div className="flex gap-3">
                    <input
                        type="text"
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        placeholder={t('repoDetails.settings.renamePlaceholder')}
                        className="flex-1 px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] outline-none"
                    />
                    <button
                        onClick={handleRename}
                        disabled={loading || !newName}
                        className="px-4 py-2 bg-[var(--color-surface-hover)] border border-[var(--color-border)] hover:bg-[var(--color-border)] rounded-lg text-sm text-[var(--color-text)]"
                    >
                        {t('repoDetails.settings.renameBtn')}
                    </button>
                </div>
            </div>

            {/* Delete */}
            <div className="p-5 border border-red-500/20 rounded-xl bg-red-500/5">
                <h3 className="text-lg font-bold text-red-500 mb-2">{t('repoDetails.settings.delete')}</h3>
                <p className="text-sm text-red-400 mb-4">{t('repoDetails.settings.deleteDesc')}</p>

                <div className="space-y-3">
                    <p className="text-xs text-[var(--color-text-muted)]">
                        {t('repoDetails.settings.deleteConfirm').replace('{id}', repoId)}
                    </p>
                    <div className="flex gap-3">
                        <input
                            type="text"
                            value={deleteConfirm}
                            onChange={e => setDeleteConfirm(e.target.value)}
                            placeholder={repoId}
                            className="flex-1 px-3 py-2 bg-[var(--color-background)] border border-red-500/30 rounded-lg text-sm text-[var(--color-text)] focus:border-red-500 outline-none"
                        />
                        <button
                            onClick={handleDelete}
                            disabled={loading || deleteConfirm !== repoId}
                            className="px-4 py-2 bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm text-white font-medium"
                        >
                            {t('repoDetails.settings.deleteBtn')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
