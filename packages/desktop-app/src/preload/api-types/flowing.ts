import type { ProjectEntry } from "./shared.js";

export interface DesktopFlowingApi {
	packFiles(projectDir: string, filePaths: string[], message?: string, senderName?: string): Promise<ArrayBuffer>;
	unpackFiles(zipBuffer: ArrayBuffer, destDir: string): Promise<string[]>;
	readMeta(projectDir: string): Promise<Record<string, unknown> | null>;
	writeMeta(projectDir: string, meta: Record<string, unknown>): Promise<void>;
	findProjectByFlowingId(flowingId: number, projects: ProjectEntry[]): Promise<string | null>;
}
