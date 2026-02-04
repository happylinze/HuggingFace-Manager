const API_BASE = 'http://127.0.0.1:8000/api';

// Types
export interface SearchResult {
    id: string;
    name: string;
    author: string | null;
    last_modified: string;
    downloads: number;
    likes: number;
    tags: string[];
    private?: boolean;
    repo_type: 'model' | 'dataset' | 'space';
    avatar_url?: string;
}

export interface SearchResponse {
    results: SearchResult[];
}

export interface RepoFile {
    path: string;
    type: 'file' | 'directory';
    size: number;
    size_formatted: string;
}

export interface DownloadTask {
    id: string;
    repo_id: string;
    repo_type: string;
    status: string;
    progress: number;
    downloaded_size: number;
    total_size: number;
    speed: number;
    speed_formatted: string;
    current_file: string;
    error_message: string | null;
    result_path: string | null;
    include_patterns?: string[];
    exclude_patterns?: string[];
    total_files?: number;
    downloaded_files?: number;
    pausable?: boolean;
    use_hf_transfer?: boolean;
}

export interface Mirror {
    key: string;
    name: string;
    url: string;
    description: string;
    region: string;
}

export interface UserInfo {
    username: string | null;
    fullname?: string;
    email?: string;
    avatar_url?: string;
    is_pro?: boolean;
    token?: string; // Client-side only helpers
}

export interface Account {
    username: string;
    fullname: string;
    email?: string;
    avatar_url?: string;
    is_pro: boolean;
    token: string;
}

export interface AccountListResponse {
    accounts: Account[];
}

export interface Settings {
    mirrors: Mirror[];
    current_mirror: string;
    download_dir: string;
    max_concurrent_downloads: number;
    default_search_limit: number;
    use_hf_transfer: boolean;
    token_configured: boolean;
    hf_cache_dir: string;
    hf_cache_history: string[];
    download_dir_history: string[];
    proxy_url?: string;
    check_update_on_start?: boolean;
    auto_start?: boolean;
    user_info: UserInfo | null;
    resolved_hf_cache_dir?: string;
    llama_cpp_path?: string;
    download_method: 'PYTHON' | 'ARIA2';
    aria2_cache_structure?: boolean;
    aria2_port?: number;
    aria2_max_connection_per_server?: number;
    aria2_split?: number;
    aria2_min_split_size?: string;
    aria2_check_certificate?: boolean;
    aria2_all_proxy?: string;
    aria2_reuse_uri?: boolean;
    python_max_workers?: number;
    show_search_history: boolean;
    show_trending_tags: boolean;
    show_trending_repos: boolean;
    debug_mode: boolean;
    auto_resume_incomplete?: boolean;
    app_data_dir?: string;
}

export interface CacheRepo {
    repo_id: string;
    repo_type: string;
    size: number;
    size_formatted: string;
    last_modified: string;
    revisions_count: number;
    repo_path?: string;
    isExternal?: boolean;
}

// Search
// Search
export async function searchRepos(query: string, type: 'model' | 'dataset', sort?: string, signal?: AbortSignal): Promise<SearchResult[]> {
    try {
        const url = `${API_BASE}/search/?q=${encodeURIComponent(query)}&repo_type=${type}${sort ? `&sort=${sort}` : ''}`;
        const response = await fetch(url, { signal });
        if (!response.ok) throw new Error('搜索失败');
        const data: SearchResponse = await response.json();
        return data.results;
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') throw error;
        console.error('搜索失败:', error);
        throw new Error('搜索失败');
    }
}

export async function listRepoFiles(repoId: string, type: 'model' | 'dataset'): Promise<RepoFile[]> {
    const params = new URLSearchParams({ repo_type: type });
    const response = await fetch(`${API_BASE}/search/${repoId}/files?${params}`);
    if (!response.ok) throw new Error('获取文件列表失败');
    const data = await response.json();
    return data.files;
}

export interface ModelInfo {
    id: string;
    sha: string | null;
    lastModified: string | null;
    tags: string[];
    pipeline_tag: string | null;
    library_name: string | null;
    likes: number;
    downloads: number;
    private: boolean;
    gated?: string | boolean;
}
export async function getTrendingTags(): Promise<string[]> {
    try {
        const response = await fetch(`${API_BASE}/search/trending`);
        if (!response.ok) return [];
        const data = await response.json();
        return data.tags || [];
    } catch {
        return [];
    }
}

// Simple in-memory cache for trending repos
const trendingCache: Record<string, SearchResult[]> = {};

export async function getTrendingRepos(type: 'model' | 'dataset' | 'space', forceRefresh: boolean = false): Promise<SearchResult[]> {
    if (!forceRefresh && trendingCache[type] && trendingCache[type].length > 0) {
        return trendingCache[type];
    }

    try {
        const response = await fetch(`${API_BASE}/search/trending/repos?type=${type}`);
        if (!response.ok) return [];
        const data = await response.json();
        const results = data.results || [];

        // Update cache
        if (results.length > 0) {
            trendingCache[type] = results;
        }

        return results;
    } catch {
        return [];
    }
}

export async function getReadme(repoId: string, repoType: string = 'model', revision: string = 'main'): Promise<string> {
    const params = new URLSearchParams({ repo_type: repoType, revision });
    const response = await fetch(`${API_BASE}/search/readme/${repoId}?${params}`);
    const data = await response.json();
    return data.content;
}

export async function getModelInfo(repoId: string, repoType: string = 'model'): Promise<ModelInfo> {
    const params = new URLSearchParams({ repo_type: repoType });
    const response = await fetch(`${API_BASE}/search/info/${repoId}?${params}`);
    if (!response.ok) throw new Error('获取模型信息失败');
    return response.json();
}

export interface FileNode {
    path: string;
    size: number;
    lfs: boolean;
}

export interface RepoTreeResponse {
    files: FileNode[];
    count: number;
    total_size: number;
}

export async function getRepoTree(repoId: string, repoType: string = 'model', revision: string = 'main'): Promise<RepoTreeResponse> {
    const params = new URLSearchParams({ repo_type: repoType, revision: revision });
    const response = await fetch(`${API_BASE}/search/tree/${repoId}?${params}`);
    if (!response.ok) throw new Error('获取文件树失败');
    return response.json();
}

export async function getRefs(repoId: string, repoType: string = 'model'): Promise<{ branches: string[], tags: string[] }> {
    const response = await fetch(`${API_BASE}/search/refs/${repoId}?type=${repoType}`);
    return response.json();
}

export interface DatasetPreviewResponse {
    file: string;
    columns: string[];
    rows: any[][];
    total_rows_in_file: number;
    success?: boolean;
    error?: string;
    dependency_missing?: boolean;
}

export async function getDatasetPreview(repoId: string, repoType: string, revision: string = 'main', rows: number = 50): Promise<DatasetPreviewResponse> {
    const params = new URLSearchParams({
        repo_id: repoId,
        repo_type: repoType,
        revision: revision,
        rows: rows.toString()
    });
    const response = await fetch(`${API_BASE}/repos/preview?${params}`);
    if (!response.ok) {
        let errorMsg = 'Failed to load preview';
        try {
            const data = await response.json();
            if (data.detail) errorMsg = data.detail;
        } catch { }
        throw new Error(errorMsg);
    }
    return response.json();
}

export async function convertRepo(repoId: string, revision: string = 'main', quantization: string = 'q8_0', outputDir?: string): Promise<{ success: boolean; message: string; url?: string }> {
    const response = await fetch(`${API_BASE}/repos/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            repo_id: repoId,
            revision: revision,
            quantization: quantization,
            output_dir: outputDir
        })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || data.message || 'Conversion failed');
    return data;
}

// Download
// Download
export async function startDownload(
    repoId: string,
    repoType: string,
    patterns?: string[],
    revision?: string,
    duplicateAction: string = 'check'
): Promise<{ success: boolean; message: string; error_code?: string; path?: string }> {
    const response = await fetch(`${API_BASE}/downloads/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            repo_id: repoId,
            repo_type: repoType,
            allow_patterns: patterns,
            revision: revision,
            duplicate_action: duplicateAction
        })
    });
    return response.json();
}

export async function getDownloadQueue(): Promise<DownloadTask[]> {
    const response = await fetch(`${API_BASE}/downloads/`);
    if (!response.ok) throw new Error('获取下载队列失败');
    const data = await response.json();
    return data.tasks;
}

export async function pauseDownload(taskId: string): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE}/downloads/${taskId}/pause`, { method: 'POST' });
    return response.json();
}

export async function resumeDownload(taskId: string): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE}/downloads/${taskId}/resume`, { method: 'POST' });
    return response.json();
}

export async function cancelDownload(taskId: string): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE}/downloads/${taskId}/cancel`, { method: 'POST' });
    return response.json();
}

export async function removeDownload(id: string, deleteFiles: boolean = false): Promise<ActionResponse> {
    const response = await fetch(`${API_BASE}/downloads/${id}?delete_files=${deleteFiles}`, { method: 'DELETE' });
    return response.json();
}

export async function openDownloadFolder(): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_BASE}/downloads/open-folder`, { method: 'POST' });
    return response.json();
}



// Settings
export async function getSettings(): Promise<Settings> {
    const response = await fetch(`${API_BASE}/settings/`);
    if (!response.ok) throw new Error('获取设置失败');
    return response.json();
}

export async function updateSettings(settings: {
    mirror_key?: string;
    download_dir?: string;
    use_hf_transfer?: boolean;
    hf_cache_dir?: string;
    max_concurrent_downloads?: number;
    default_search_limit?: number;
    proxy_url?: string;
    check_update_on_start?: boolean;
    auto_start?: boolean;
    llama_cpp_path?: string;
    download_method?: 'PYTHON' | 'ARIA2';
    aria2_cache_structure?: boolean;
    aria2_port?: number;
    python_max_workers?: number;
    aria2_max_connection_per_server?: number;
    aria2_split?: number;
    aria2_check_certificate?: boolean;
    aria2_all_proxy?: string;
    aria2_reuse_uri?: boolean;
    show_search_history?: boolean;
    show_trending_tags?: boolean;
    show_trending_repos?: boolean;
    debug_mode?: boolean;
    auto_resume_incomplete?: boolean;
    language?: string;
}): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_BASE}/settings/`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
    });
    return response.json();
}

export async function resetDownloadSettings(): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_BASE}/settings/reset-downloads`, {
        method: 'POST'
    });
    return response.json();
}

export async function loginHF(token: string): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
    });
    return response.json();
}

export async function logoutHF(): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_BASE}/auth/logout`, { method: 'POST' });
    return response.json();
}

/** Account Management */
export async function getAccounts(): Promise<Account[]> {
    const response = await fetch(`${API_BASE}/auth/accounts`);
    if (!response.ok) return [];
    const data: AccountListResponse = await response.json();
    return data.accounts;
}

export async function switchAccount(username: string): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_BASE}/auth/switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
    });
    return response.json();
}

export async function deleteAccount(username: string): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_BASE}/auth/accounts/${encodeURIComponent(username)}`, {
        method: 'DELETE'
    });
    return response.json();
}

export async function deleteCacheHistory(path: string, type: 'cache' | 'download' = 'cache'): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_BASE}/settings/delete-history?path=${encodeURIComponent(path)}&type=${type}`, {
        method: 'POST'
    });
    return response.json();
}

// Cache
export interface CacheData {
    repos: CacheRepo[];
    root_path: string;
    total_size: number;
    total_size_formatted: string;
}

export async function getCacheRepos(forceRefresh: boolean = false): Promise<CacheData> {
    const url = forceRefresh ? `${API_BASE}/cache/?refresh=true` : `${API_BASE}/cache/`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('获取缓存失败');
    const data = await response.json();
    return {
        repos: data.repos.map((r: any) => ({
            repo_id: r.repo_id,
            repo_type: r.repo_type,
            size: r.size_on_disk || 0,
            size_formatted: r.size_formatted,
            last_modified: r.last_modified,
            revisions_count: r.revisions_count,
            repo_path: r.repo_path
        })),
        root_path: data.root_path,
        total_size: data.total_size || 0,
        total_size_formatted: data.total_size_formatted
    };
}

export async function deleteCacheRepo(repoId: string, repoType: string): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_BASE}/cache/${repoType}/${encodeURIComponent(repoId)}`, { method: 'DELETE' });
    return response.json();
}

export async function verifyRepo(repoId: string, repoType: string): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_BASE}/cache/${repoType}/${encodeURIComponent(repoId)}/verify`, { method: 'POST' });
    if (!response.ok) throw new Error('触发校验失败');
    return response.json();
}

export async function getCacheReadme(repoId: string, repoType: string): Promise<string> {
    const response = await fetch(`${API_BASE}/cache/${repoType}/${encodeURIComponent(repoId)}/readme`);
    if (!response.ok) throw new Error('获取本地 README 失败');
    const data = await response.json();
    return data.content;
}

type ActionResponse = { success: boolean; message: string };

export async function cleanOldRevisions(repoId: string, repoType: string): Promise<ActionResponse> {
    const response = await fetch(`${API_BASE}/cache/revisions/${repoId}?type=${repoType}`, {
        method: 'DELETE'
    });
    if (!response.ok) throw new Error('清理旧版本失败');
    return response.json();
}

// External Library
export async function getLibraryPaths(): Promise<string[]> {
    const response = await fetch(`${API_BASE}/library/paths`);
    if (!response.ok) throw new Error('Failed to fetch library paths');
    return response.json();
}

export async function addLibraryPath(path: string): Promise<string[]> {
    const response = await fetch(`${API_BASE}/library/paths`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path })
    });
    if (!response.ok) throw new Error('Failed to add path');
    return response.json();
}

export async function removeLibraryPath(path: string): Promise<string[]> {
    const response = await fetch(`${API_BASE}/library/paths`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path })
    });
    if (!response.ok) throw new Error('Failed to remove path');
    return response.json();
}

export async function scanLibrary(): Promise<CacheRepo[]> {
    const response = await fetch(`${API_BASE}/library/scan`);
    if (!response.ok) throw new Error('Failed to scan library');
    const data = await response.json();
    return data.map((r: any) => ({
        repo_id: r.repo_id,
        repo_type: r.repo_type,
        size: r.size_on_disk || 0,
        size_formatted: r.size_formatted,
        last_modified: r.last_modified,
        revisions_count: r.revisions_count || 0,
        repo_path: r.repo_path,
        isExternal: true
    }));
}

export async function getCacheTree(repoId: string, repoType: string): Promise<RepoTreeResponse> {
    const response = await fetch(`${API_BASE}/cache/${repoType}/${encodeURIComponent(repoId)}/tree`);
    if (!response.ok) throw new Error('获取本地文件树失败');
    return response.json();
}

export async function getFileContent(repoId: string, path: string, repoType: string = 'model', revision: string = 'main'): Promise<string> {
    const params = new URLSearchParams({ repo_type: repoType, path, revision });
    const response = await fetch(`${API_BASE}/search/content/${repoId}?${params}`);
    if (!response.ok) throw new Error('获取文件内容失败');
    const data = await response.json();
    return data.content;
}

// System
export async function selectFolderDialog(): Promise<{ path: string | null }> {
    const response = await fetch(`${API_BASE}/system/select-folder`, { method: 'POST' });
    if (!response.ok) throw new Error('打开文件夹选择框失败');
    return response.json();
}

export async function selectFileDialog(_options?: any): Promise<{ path: string | null }> {
    const response = await fetch(`${API_BASE}/system/select-file`, { method: 'POST' });
    if (!response.ok) throw new Error('打开文件选择框失败');
    return response.json();
}

export async function openPath(path: string): Promise<{ success: boolean; message?: string }> {
    const response = await fetch(`${API_BASE}/system/open-path`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path })
    });
    return response.json();
}

export async function openLogsFolder(): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_BASE}/system/open-logs-folder`, { method: 'POST' });
    return response.json();
}

export async function setSystemTheme(isDark: boolean): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_BASE}/system/theme`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_dark: isDark })
    });
    return response.json();
}

export async function validateToken(token: string): Promise<{ valid: boolean; message?: string; username?: string; fullname?: string }> {
    const response = await fetch(`${API_BASE}/settings/validate-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
    });
    return response.json();
}

export async function addMirror(name: string, url: string, description?: string): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_BASE}/settings/mirrors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, url, description })
    });
    return response.json();
}

export async function removeMirror(key: string): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_BASE}/settings/mirrors/${key}`, { method: 'DELETE' });
    return response.json();
}

export interface CacheAnalysisReport {
    summary: {
        total_size: number;
        total_size_formatted: string;
        models_count: number;
        datasets_count: number;
        spaces_count: number;
    };
    chart_data: {
        name: string;
        size: number;
        size_formatted: string;
        percentage: number;
    }[];
    reclaimable: {
        incomplete: {
            count: number;
            size: number;
            size_formatted: string;
        };
        old_revisions: {
            count: number;
            size: number;
            size_formatted: string;
        };
        total_size: number;
        total_size_formatted: string;
    };
}

export async function getCacheAnalysis(repoType?: string): Promise<CacheAnalysisReport> {
    const url = repoType && repoType !== 'all'
        ? `${API_BASE}/cache/analysis?repo_type=${repoType}`
        : `${API_BASE}/cache/analysis`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to get cache analysis');
    return response.json();
}


export async function cleanIncomplete(): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_BASE}/cache/clean-incomplete`, { method: 'POST' });
    return response.json();
}

export async function cleanOrphans(): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_BASE}/cache/clean-orphans`, { method: 'POST' });
    return response.json();
}

// Repository Management
export interface CreateRepoRequest {
    repo_id: string;
    repo_type: 'model' | 'dataset' | 'space';
    private: boolean;
    sdk?: string;
    license?: string;
}

export async function createRepo(data: CreateRepoRequest): Promise<{ success: boolean; message: string; url?: string }> {
    const response = await fetch(`${API_BASE}/repos/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || '创建仓库失败');
    return result;
}

export interface ImportRepoRequest {
    repo_id: string;
    repo_type: 'model' | 'dataset' | 'space';
    folder_path: string;
    private: boolean;
    license?: string;
}

export async function importRepo(data: ImportRepoRequest): Promise<{ success: boolean; message: string; url?: string }> {
    const response = await fetch(`${API_BASE}/repos/import-folder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || '导入仓库失败');
    return result;
}

export interface UploadFileRequest {
    repo_id: string;
    repo_type: 'model' | 'dataset' | 'space';
    file_path: string;
    path_in_repo?: string;
    commit_message?: string;
}

export async function uploadFile(data: UploadFileRequest): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_BASE}/repos/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || '上传文件失败');
    return result;
}

export async function uploadFileMultipart(
    repoId: string,
    repoType: string,
    pathInRepo: string,
    file: File,
    commitMessage: string = "Upload file"
): Promise<{ success: boolean; message: string }> {
    const formData = new FormData();
    formData.append('repo_id', repoId);
    formData.append('repo_type', repoType);
    formData.append('path_in_repo', pathInRepo);
    formData.append('commit_message', commitMessage);
    formData.append('file', file);

    const response = await fetch(`${API_BASE}/repos/upload-multipart`, {
        method: 'POST',
        body: formData, // No Content-Type header (browser sets it with boundary)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || '上传文件失败');
    return result;
}

export async function checkWriteAccess(repoId: string, repoType: string): Promise<{ username: string; orgs: string[] }> {
    const response = await fetch(`${API_BASE}/repos/check-access/${repoType}/${repoId}`);
    if (!response.ok) throw new Error('Failed to check access');
    return response.json();
}


export async function getUserInfo(): Promise<UserInfo> {
    const response = await fetch(`${API_BASE}/auth/user`);
    if (!response.ok) return { username: null };
    return response.json();
}

// Repo Ops
export interface RepoCheckRequest {
    repo_id: string;
    repo_type: string;
}

export interface RepoStatusResponse {
    repo_id: string;
    downloaded: boolean;
    path?: string;
    size_on_disk?: number;
    last_modified?: string;
}

export async function checkLocalStatus(repos: RepoCheckRequest[]): Promise<Record<string, RepoStatusResponse>> {
    const response = await fetch(`${API_BASE}/repos/check-local-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(repos)
    });
    if (!response.ok) throw new Error('Failed to check local status');
    return response.json();
}

export async function getLocalRepos(): Promise<RepoStatusResponse[]> {
    const response = await fetch(`${API_BASE}/repos/local`);
    if (!response.ok) throw new Error('Failed to get local repos');
    return response.json();
}

export interface UpdateMetadataRequest {
    repo_id: string;
    repo_type: 'model' | 'dataset' | 'space';
    license?: string;
    tags?: string[];
    pipeline_tag?: string;
    sdk?: string;
    gated?: string;
}

export async function updateMetadata(data: UpdateMetadataRequest): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_BASE}/repos/metadata`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    return response.json();
}

export async function deleteRepo(repoId: string, repoType: string): Promise<{ success: boolean; message: string }> {
    const params = new URLSearchParams({ repo_id: repoId, repo_type: repoType });
    const response = await fetch(`${API_BASE}/repos/delete?${params}`, { method: 'DELETE' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || '删除仓库失败');
    return result;
}

export async function updateVisibility(repoId: string, repoType: string, isPrivate: boolean): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_BASE}/repos/visibility`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo_id: repoId, repo_type: repoType, private: isPrivate })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || '修改可见性失败');
    return result;
}

export async function moveRepo(fromRepo: string, toRepo: string, repoType: string): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_BASE}/repos/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from_repo: fromRepo, to_repo: toRepo, repo_type: repoType })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || '移动仓库失败');
    return result;
}

export async function deleteFile(repoId: string, path: string, repoType: string): Promise<{ success: boolean; message: string }> {
    const params = new URLSearchParams({ repo_id: repoId, repo_type: repoType, path: path });
    const response = await fetch(`${API_BASE}/repos/file?${params}`, { method: 'DELETE' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || '删除文件失败');
    return result;
}

// Git Ops
export interface Commit {
    commit_id: string;
    summary: string;
    message: string;
    authors: string[];
    date: string;
    parents: string[];
}

export interface Ref {
    name: string;
    ref: string;
    target_commit: string;
}

export async function getCommits(repoId: string, repoType: string): Promise<Commit[]> {
    const response = await fetch(`${API_BASE}/git/${repoType}/${encodeURIComponent(repoId)}/commits`);
    if (!response.ok) throw new Error('Failed to fetch commits');
    return response.json();
}

export async function getBranches(repoId: string, repoType: string): Promise<Ref[]> {
    const response = await fetch(`${API_BASE}/git/${repoType}/${encodeURIComponent(repoId)}/branches`);
    if (!response.ok) throw new Error('Failed to fetch branches');
    return response.json();
}

export async function getTags(repoId: string, repoType: string): Promise<Ref[]> {
    const response = await fetch(`${API_BASE}/git/${repoType}/${encodeURIComponent(repoId)}/tags`);
    if (!response.ok) throw new Error('Failed to fetch tags');
    return response.json();
}

// Space Ops
export interface RuntimeStatus {
    stage: string;
    hardware?: any;
}

export async function getSpaceSecrets(repoId: string): Promise<string[]> {
    const response = await fetch(`${API_BASE}/spaces/${encodeURIComponent(repoId)}/secrets`);
    if (!response.ok) throw new Error('Failed to fetch secrets');
    return response.json();
}

export async function addSpaceSecret(repoId: string, key: string, value: string): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE}/spaces/${encodeURIComponent(repoId)}/secrets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value })
    });
    if (!response.ok) throw new Error('Failed to add secret');
    return response.json();
}

export async function deleteSpaceSecret(repoId: string, key: string): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE}/spaces/${encodeURIComponent(repoId)}/secrets/${encodeURIComponent(key)}`, {
        method: 'DELETE'
    });
    if (!response.ok) throw new Error('Failed to delete secret');
    return response.json();
}

export async function getSpaceRuntime(repoId: string): Promise<RuntimeStatus> {
    const response = await fetch(`${API_BASE}/spaces/${encodeURIComponent(repoId)}/runtime`);
    if (!response.ok) throw new Error('Failed to fetch runtime');
    return response.json();
}

export async function restartSpace(repoId: string, factoryReboot: boolean = false): Promise<{ success: boolean }> {
    const endpoint = factoryReboot ? 'reboot' : 'restart';
    const response = await fetch(`${API_BASE}/spaces/${encodeURIComponent(repoId)}/${endpoint}`, {
        method: 'POST'
    });
    if (!response.ok) throw new Error('Failed to restart space');
    return response.json();
}

// Sync Ops
export interface SyncStatus {
    is_workspace: boolean;
    sync_status: 'synced' | 'ahead' | 'behind' | 'conflict' | 'out_of_sync' | 'unknown';
    local_commit?: string;
    remote_commit?: string;
}


export async function getSyncStatus(repoId: string, repoType: string, localPath: string): Promise<SyncStatus> {
    const response = await fetch(`${API_BASE}/sync/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo_id: repoId, repo_type: repoType, local_path: localPath })
    });
    if (!response.ok) throw new Error('Failed to check sync status');
    return response.json();
}

export async function pullRepo(repoId: string, repoType: string, localPath: string, force: boolean = false): Promise<{ success: boolean; path: string }> {
    const response = await fetch(`${API_BASE}/sync/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo_id: repoId, repo_type: repoType, local_path: localPath, force })
    });
    if (!response.ok) throw new Error('Pull failed');
    return response.json();
}

export async function pushRepo(repoId: string, repoType: string, localPath: string, message: string, force: boolean = false): Promise<{ success: boolean; commit_url: string }> {
    const response = await fetch(`${API_BASE}/sync/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo_id: repoId, repo_type: repoType, local_path: localPath, commit_message: message, force })
    });
    if (!response.ok) throw new Error('Push failed');
    return response.json();
}


export interface SystemCompatibility {
    os: string;
    is_windows: boolean;
    is_admin: boolean;
    dev_mode_enabled: boolean;
    long_paths_enabled: boolean;
    platform_node: string;
}

export async function getCompatibility(): Promise<SystemCompatibility> {
    const response = await fetch(`${API_BASE}/system/compatibility`);
    if (!response.ok) throw new Error('Failed to get system compatibility');
    return response.json();
}

export async function toggleStartup(enable: boolean): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_BASE}/system/toggle-startup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enable })
    });
    return response.json();
}

export interface UpdateInfo {
    has_update: boolean;
    current_version: string;
    latest_version: string;
    release_notes: string;
}

export async function checkUpdate(): Promise<UpdateInfo> {
    const response = await fetch(`${API_BASE}/system/check-update`);
    return response.json();
}

export async function cleanLogs(): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_BASE}/system/clean-logs`, { method: 'POST' });
    return response.json();
}

export async function selectSystemFolder(): Promise<string | null> {
    const response = await fetch(`${API_BASE}/system/select-folder`, { method: 'POST' });
    if (!response.ok) throw new Error('Failed to open folder selector');
    const data = await response.json();
    return data.path;
}



// Upload Ops
export interface ScanFile {
    path: string;
    size: number;
    lfs: boolean;
}

export interface ScanResponse {
    root_path: string;
    files: ScanFile[];
    total_files: number;
    total_size: number;
    lfs_files: string[];
}

export async function scanLocalFolder(path: string): Promise<ScanResponse> {
    const response = await fetch(`${API_BASE}/upload/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path })
    });
    if (!response.ok) throw new Error('Scan failed');
    return response.json();
}

export async function commitFiles(
    repoId: string,
    repoType: string,
    localPath: string,
    files: string[],
    message: string,
    revision: string = 'main',
    createPr: boolean = false
): Promise<{ success: boolean; commit_hash?: string; url?: string }> {
    const response = await fetch(`${API_BASE}/upload/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            path: localPath,
            repo_id: repoId,
            repo_type: repoType,
            files: files,
            commit_message: message,
            revision: revision,
            create_pr: createPr
        })
    });
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Upload failed');
    }
    return response.json();
}

/** Plugins & GGUF Tools */
export interface PluginStatus {
    id: string;
    name: string;
    description: string;
    status: 'installed' | 'missing' | 'broken' | 'unknown' | 'installing' | 'ready';
    version: string;
}

export async function getPlugins(): Promise<PluginStatus[]> {
    const response = await fetch(`${API_BASE}/plugins/`);
    if (!response.ok) return [];
    return response.json();
}

export async function installPlugin(pluginId: string): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_BASE}/plugins/${pluginId}/install`, { method: 'POST' });
    if (!response.ok) throw new Error('Installation failed');
    return response.json();
}

export async function uninstallPlugin(pluginId: string): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_BASE}/plugins/${pluginId}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('Uninstallation failed');
    return response.json();
}

export async function convertGGUF(
    inputPath: string,
    outputPath: string,
    quantization: string,
    repoId: string = 'local'
): Promise<{ success: boolean; task_id: string }> {
    const response = await fetch(`${API_BASE}/plugins/tools/gguf/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            repo_id: repoId,
            input_path: inputPath,
            output_path: outputPath,
            quantization: quantization
        })
    });
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Conversion failed');
    }
    return response.json();
}

export async function getQuantizationTypes(): Promise<string[]> {
    const response = await fetch(`${API_BASE}/plugins/tools/gguf/types`);
    if (!response.ok) return [];
    return response.json();
}
