export type DownloadStatus = "queued" | "downloading" | "paused" | "completed" | "failed" | "canceled";

export interface DownloadItemView {
	id: string;
	url: string;
	filename: string;
	path: string;
	totalBytes: number;
	receivedBytes: number;
	status: DownloadStatus;
	error?: string;
	createdAt: number;
	completedAt?: number;
	speedBytesPerSec?: number;
}
