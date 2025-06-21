// #region Interfaces
export interface Prompt {
    id: number;
    title: string;
    content: string;
    category: string;
    tags: string[];
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface AppData {
    prompts: Prompt[];
    categories: string[];
    settings: {
        autoBackup: boolean;
        backupInterval: number; // minutes
        cloudSync: boolean;
        autoSync: boolean;
        syncProvider: 'github' | 'gitee' | 'gitlab' | 'webdav' | 'custom' | null;
        workspaceMode: boolean;
        isValidated?: boolean;
        gistId?: string; 
        gitlabUrl?: string;
        webdavUrl?: string;
        webdavUsername?: string;
        customApiUrl?: string;
    };
    metadata: {
        version: string;
        lastModified: string;
        totalPrompts: number;
    };
}

export interface GistCreateResponse {
    id: string;
}

export interface GistFile {
    content?: string;
}

export interface GistGetResponse {
    files: {
        [filename: string]: GistFile;
    };
}

// GitLab interfaces
export interface GitLabSnippetResponse {
    id: number;
    raw_url?: string;
}

// Gitee interfaces
export interface GiteeGistResponse {
    id: string;
}

// WebDAV a.d.
export interface WebDAVClientOptions {
    username?: string;
    password?: string;
    authType?: any; // from webdav package
}

export interface StorageInfo {
    mode: 'global' | 'workspace';
    location: string;
}

export interface SystemStatus {
    storageMode: 'workspace' | 'global';
    cloudSync: {
        status: string;
    };
}

export interface SyncResult {
    status: 'uploaded' | 'downloaded' | 'in_sync' | 'conflict' | 'error' | 'disabled';
    message?: string;
}

export interface BackupInfo {
    path: string;
    timestamp: string;
    size: number;
}
// #endregion 