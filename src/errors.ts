// #region Custom Errors
export class SyncError extends Error {
    constructor(message: string, public code: string) {
        super(message);
        this.name = 'SyncError';
    }
}

export class SyncConflictError extends Error {
    constructor(message: string, public localModified: string, public remoteModified: string) {
        super(message);
        this.name = 'SyncConflictError';
    }
}
// #endregion 