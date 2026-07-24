import { randomUUID } from "node:crypto";
import type { Dirent } from "node:fs";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { getVettaHomePath } from "@vetta/action-rpc";
import type { PluginPutBlobInput, PluginStoredBlob, PluginStoredBlobRef } from "@vetta-org/plugin-sdk";

interface BlobMetadata {
	mimeType: string;
	extension: string;
}

const storageRoot = join(getVettaHomePath(), "plugin-images");
const SAFE_SEGMENT = /^[a-zA-Z0-9._-]+$/;

function assertPluginId(pluginId: string): void {
	if (!SAFE_SEGMENT.test(pluginId) || pluginId === "." || pluginId === "..") {
		throw new Error("Invalid plugin id");
	}
}

function pluginRoot(pluginId: string): string {
	assertPluginId(pluginId);
	return join(storageRoot, pluginId);
}

function scopedPath(pluginId: string, path: string): string {
	if (!path || isAbsolute(path) || path.includes("\0")) {
		throw new Error("Invalid plugin storage path");
	}
	const root = resolve(pluginRoot(pluginId));
	const target = resolve(root, path);
	const relation = relative(root, target);
	if (relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
		throw new Error("Plugin storage path escapes its namespace");
	}
	return target;
}

function extensionForMime(mimeType: string): string {
	if (mimeType.includes("jpeg")) return "jpg";
	if (mimeType.includes("webp")) return "webp";
	if (mimeType.includes("gif")) return "gif";
	return "png";
}

function mediaUrl(path: string): string {
	return `vetta-media://local/stream?path=${encodeURIComponent(path)}`;
}

async function atomicWrite(path: string, data: string | Uint8Array): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	const temporaryPath = `${path}.${randomUUID()}.tmp`;
	await writeFile(temporaryPath, data);
	await rename(temporaryPath, path);
}

async function listFiles(root: string, current: string): Promise<string[]> {
	let entries: Dirent[];
	try {
		entries = await readdir(current, { withFileTypes: true });
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
		throw error;
	}
	const files: string[] = [];
	for (const entry of entries) {
		const path = join(current, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await listFiles(root, path)));
		} else if (entry.isFile()) {
			files.push(relative(root, path).split(sep).join("/"));
		}
	}
	return files;
}

export async function readPluginJson<T>(pluginId: string, key: string): Promise<T | null> {
	try {
		const raw = await readFile(scopedPath(pluginId, key), "utf8");
		return JSON.parse(raw) as T;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw error;
	}
}

export async function writePluginJson(pluginId: string, key: string, value: unknown): Promise<void> {
	await atomicWrite(scopedPath(pluginId, key), JSON.stringify(value, null, 2));
}

export async function listPluginFiles(pluginId: string, prefix = "."): Promise<string[]> {
	const root = pluginRoot(pluginId);
	return listFiles(root, scopedPath(pluginId, prefix));
}

export async function readPluginFile(pluginId: string, path: string): Promise<string | null> {
	try {
		return (await readFile(scopedPath(pluginId, path))).toString("base64");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw error;
	}
}

export async function writePluginFile(pluginId: string, path: string, data: string): Promise<void> {
	await atomicWrite(scopedPath(pluginId, path), Buffer.from(data, "base64"));
}

export async function putPluginBlob(pluginId: string, input: PluginPutBlobInput): Promise<PluginStoredBlobRef> {
	const id = input.id ?? randomUUID();
	if (!SAFE_SEGMENT.test(id) || id === "." || id === "..") {
		throw new Error("Invalid blob id");
	}
	const extension = extensionForMime(input.mimeType);
	const blobPath = scopedPath(pluginId, `blobs/${id}.${extension}`);
	await atomicWrite(blobPath, Buffer.from(input.data, "base64"));
	await writePluginJson(pluginId, `blob-metadata/${id}.json`, {
		mimeType: input.mimeType,
		extension,
	} satisfies BlobMetadata);
	return { id, url: mediaUrl(blobPath), mimeType: input.mimeType };
}

export async function readPluginBlob(pluginId: string, id: string): Promise<PluginStoredBlob | null> {
	const metadata = await readPluginJson<BlobMetadata>(pluginId, `blob-metadata/${id}.json`);
	if (!metadata) return null;
	const data = await readPluginFile(pluginId, `blobs/${id}.${metadata.extension}`);
	return data ? { data, mimeType: metadata.mimeType } : null;
}

export async function getPluginBlobRef(pluginId: string, id: string): Promise<PluginStoredBlobRef | null> {
	const metadata = await readPluginJson<BlobMetadata>(pluginId, `blob-metadata/${id}.json`);
	if (!metadata) return null;
	const blobPath = scopedPath(pluginId, `blobs/${id}.${metadata.extension}`);
	return { id, url: mediaUrl(blobPath), mimeType: metadata.mimeType };
}
