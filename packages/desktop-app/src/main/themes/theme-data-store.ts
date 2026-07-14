import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getVettaHomePath } from "@vetta/action-rpc";
import { atomicWriteJSONAsync } from "@vetta/toolkit/atomic-write";
import {
	assertThemeStorageWritable,
	isThemeStorageJson,
	isValidThemeStorageKey,
	isValidThemeStorageThemeId,
	THEME_STORAGE_FILE_VERSION,
	type ThemeStorageFile,
	type ThemeStorageJson,
} from "../../shared/theme-storage.js";
import { getAppLogger } from "../logger.js";

const log = getAppLogger("theme-data-store");

const memoryCache = new Map<string, Record<string, ThemeStorageJson>>();
const writeQueues = new Map<string, Promise<void>>();

function themesDataRoot(): string {
	return join(getVettaHomePath(), "desktop-app", "themes");
}

function themeDataPath(themeId: string): string {
	return join(themesDataRoot(), themeId, "data.json");
}

function enqueueWrite<T>(themeId: string, task: () => Promise<T>): Promise<T> {
	const previous = writeQueues.get(themeId) ?? Promise.resolve();
	const next = previous.then(task, task);
	writeQueues.set(
		themeId,
		next.then(
			() => undefined,
			() => undefined,
		),
	);
	return next;
}

function emptyData(): Record<string, ThemeStorageJson> {
	return {};
}

function parseFile(raw: string): Record<string, ThemeStorageJson> {
	const parsed = JSON.parse(raw) as Partial<ThemeStorageFile>;
	if (
		parsed === null ||
		typeof parsed !== "object" ||
		typeof parsed.version !== "number" ||
		parsed.data === null ||
		typeof parsed.data !== "object" ||
		Array.isArray(parsed.data)
	) {
		throw new Error("Invalid theme storage file shape");
	}
	const data: Record<string, ThemeStorageJson> = {};
	for (const [key, value] of Object.entries(parsed.data)) {
		if (!isValidThemeStorageKey(key) || !isThemeStorageJson(value)) continue;
		data[key] = value;
	}
	return data;
}

async function readFromDisk(themeId: string): Promise<Record<string, ThemeStorageJson>> {
	const path = themeDataPath(themeId);
	if (!existsSync(path)) return emptyData();
	try {
		const raw = await readFile(path, "utf8");
		return parseFile(raw);
	} catch (error) {
		log.warn(
			`Failed to read theme storage for "${themeId}": ${error instanceof Error ? error.message : String(error)}`,
		);
		return emptyData();
	}
}

async function ensureLoaded(themeId: string): Promise<Record<string, ThemeStorageJson>> {
	if (!isValidThemeStorageThemeId(themeId)) {
		throw new Error(`Invalid theme storage themeId: ${themeId}`);
	}
	const cached = memoryCache.get(themeId);
	if (cached) return cached;
	const data = await readFromDisk(themeId);
	memoryCache.set(themeId, data);
	return data;
}

async function persist(themeId: string, data: Record<string, ThemeStorageJson>): Promise<void> {
	const file: ThemeStorageFile = {
		version: THEME_STORAGE_FILE_VERSION,
		data,
	};
	await atomicWriteJSONAsync(themeDataPath(themeId), file);
}

function cloneData(data: Record<string, ThemeStorageJson>): Record<string, ThemeStorageJson> {
	return { ...data };
}

export async function getThemeStorageData(themeId: string): Promise<Record<string, ThemeStorageJson>> {
	const data = await ensureLoaded(themeId);
	return cloneData(data);
}

export async function setThemeStorageValue(
	themeId: string,
	key: string,
	value: unknown,
): Promise<Record<string, ThemeStorageJson>> {
	return enqueueWrite(themeId, async () => {
		const current = await ensureLoaded(themeId);
		if (!isThemeStorageJson(value)) {
			throw new Error(`Theme storage value for "${key}" is not JSON-serializable`);
		}
		const next = { ...current, [key]: value };
		assertThemeStorageWritable(themeId, key, value, next);
		memoryCache.set(themeId, next);
		await persist(themeId, next);
		return cloneData(next);
	});
}

export async function removeThemeStorageValue(themeId: string, key: string): Promise<Record<string, ThemeStorageJson>> {
	return enqueueWrite(themeId, async () => {
		if (!isValidThemeStorageThemeId(themeId)) {
			throw new Error(`Invalid theme storage themeId: ${themeId}`);
		}
		if (!isValidThemeStorageKey(key)) {
			throw new Error(`Invalid theme storage key: ${key}`);
		}
		const current = await ensureLoaded(themeId);
		if (!(key in current)) return cloneData(current);
		const next = { ...current };
		delete next[key];
		memoryCache.set(themeId, next);
		await persist(themeId, next);
		return cloneData(next);
	});
}

export async function clearThemeStorage(themeId: string): Promise<Record<string, ThemeStorageJson>> {
	return enqueueWrite(themeId, async () => {
		if (!isValidThemeStorageThemeId(themeId)) {
			throw new Error(`Invalid theme storage themeId: ${themeId}`);
		}
		const next = emptyData();
		memoryCache.set(themeId, next);
		await persist(themeId, next);
		return cloneData(next);
	});
}
