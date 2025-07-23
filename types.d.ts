interface Task {
    id: string;
    method: 'photo.file' | 'photo.url' | 'gif';
    endpoint: string;
    url: string | null;
    file: string | null;
    retries: number;
    status: 'queued' | 'processing' | 'completed' | 'duplicate' | 'failed' | 'removed';
}
