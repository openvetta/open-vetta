import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import AdmZip from "adm-zip";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GitHubMarketplaceOrigin } from "../../../preload/api-types/abilities";
import { OpenMarketplaceService } from "./open-marketplace-service";

const temporaryRoots: string[] = [];
const APP_VERSION = "0.5.11";

async function temporaryRoot(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "vetta-open-marketplace-test-"));
	temporaryRoots.push(root);
	return root;
}

function archive(options?: {
	marketplaceVersion?: string;
	packageVersion?: string;
	description?: string;
	minAppVersion?: string;
}): Buffer {
	const marketplaceVersion = options?.marketplaceVersion ?? "2026.07.1";
	const packageVersion = options?.packageVersion ?? "1.0.0";
	const description = options?.description ?? "Demo ability";
	const manifest = {
		schemaVersion: 1,
		name: "vetta-open-abilities",
		marketplaceVersion,
		repository: "https://github.com/example/vetta-abilities",
		minAppVersion: options?.minAppVersion ?? APP_VERSION,
		abilities: [
			{
				type: "skill",
				slug: "demo-skill",
				name: "Demo Skill",
				description,
				version: "1.0.0",
				configVersion: 2,
				license: "MIT",
				source: { path: "abilities/skills/demo-skill" },
			},
		],
	};
	const zip = new AdmZip();
	zip.addFile("vetta-abilities-main/.vetta/marketplace.json", Buffer.from(JSON.stringify(manifest)));
	zip.addFile(
		"vetta-abilities-main/abilities/skills/demo-skill/SKILL.md",
		Buffer.from(`---\nname: demo-skill\ndescription: Demo ability\nversion: ${packageVersion}\n---\n\n# Demo\n`),
	);
	return zip.toBuffer();
}

function response(buffer: Buffer): Response {
	return new Response(new Uint8Array(buffer), {
		status: 200,
		headers: { "content-type": "application/zip", "content-length": String(buffer.byteLength) },
	});
}

afterEach(async () => {
	await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("OpenMarketplaceService", () => {
	it("validates and activates a GitHub repository snapshot", async () => {
		const rootDir = await temporaryRoot();
		const service = new OpenMarketplaceService({
			appVersion: APP_VERSION,
			rootDir,
			fetchArchive: async () => response(archive()),
			now: () => new Date("2026-07-28T00:00:00.000Z"),
		});

		const snapshot = await service.refresh();

		expect(snapshot.error).toBeUndefined();
		expect(snapshot.sourceId).toBe("vetta-official");
		expect(snapshot.marketplaceVersion).toBe("2026.07.1");
		expect(snapshot.abilities[0]).toMatchObject({
			slug: "demo-skill",
			configVersion: 2,
			origin: { kind: "github-marketplace", marketplace: "vetta-open-abilities" },
		});
		const stored = await readFile(
			join(rootDir, "snapshots", "2026.07.1", "abilities", "skills", "demo-skill", "SKILL.md"),
			"utf-8",
		);
		expect(stored).toContain("name: demo-skill");
	});

	it("keeps the last usable snapshot when content changes without a marketplace version bump", async () => {
		const rootDir = await temporaryRoot();
		let body = archive({ description: "First" });
		const service = new OpenMarketplaceService({
			appVersion: APP_VERSION,
			rootDir,
			fetchArchive: async () => response(body),
		});
		await service.refresh();
		body = archive({ description: "Changed without version bump" });

		const fallback = await service.refresh();

		expect(fallback.error).toBe("sync-failed");
		expect(fallback.stale).toBe(true);
		expect(fallback.abilities[0]?.description).toBe("First");
	});

	it("activates a catalog when the desktop app meets minAppVersion", async () => {
		const service = new OpenMarketplaceService({
			rootDir: await temporaryRoot(),
			appVersion: APP_VERSION,
			fetchArchive: async () => response(archive({ minAppVersion: "0.5.11" })),
		});

		const snapshot = await service.refresh();

		expect(snapshot).toMatchObject({ marketplaceVersion: "2026.07.1", stale: false });
	});

	it("keeps the last compatible snapshot when a newer catalog requires a newer app", async () => {
		const rootDir = await temporaryRoot();
		let body = archive({ marketplaceVersion: "2026.07.1", description: "Compatible" });
		const service = new OpenMarketplaceService({
			rootDir,
			appVersion: APP_VERSION,
			fetchArchive: async () => response(body),
		});
		await service.refresh();
		body = archive({ marketplaceVersion: "2026.08.1", description: "Future", minAppVersion: "0.6.0" });

		const fallback = await service.refresh();

		expect(fallback).toMatchObject({ marketplaceVersion: "2026.07.1", stale: true, error: "sync-failed" });
		expect(fallback.abilities[0]?.description).toBe("Compatible");
	});

	it("rejects an incompatible catalog when no compatible snapshot exists", async () => {
		const service = new OpenMarketplaceService({
			rootDir: await temporaryRoot(),
			appVersion: APP_VERSION,
			fetchArchive: async () => response(archive({ minAppVersion: "0.6.0" })),
		});

		const snapshot = await service.refresh();

		expect(snapshot).toMatchObject({ abilities: [], marketplaceVersion: null, stale: true, error: "sync-failed" });
	});

	it("does not activate a catalog when SKILL.md version disagrees with the catalog", async () => {
		const rootDir = await temporaryRoot();
		const service = new OpenMarketplaceService({
			appVersion: APP_VERSION,
			rootDir,
			fetchArchive: async () => response(archive({ packageVersion: "2.0.0" })),
		});

		const snapshot = await service.refresh();

		expect(snapshot).toMatchObject({ abilities: [], marketplaceVersion: null, error: "sync-failed" });
	});

	it("serves a fresh local snapshot without downloading again", async () => {
		const rootDir = await temporaryRoot();
		const fetchArchive = vi.fn(async () => response(archive()));
		const service = new OpenMarketplaceService({
			appVersion: APP_VERSION,
			rootDir,
			fetchArchive,
			now: () => new Date("2026-07-28T00:00:00.000Z"),
		});
		await service.refresh();

		const snapshot = await service.list();

		expect(snapshot.error).toBeUndefined();
		expect(fetchArchive).toHaveBeenCalledTimes(1);
	});

	it("can read cached data without triggering a download", async () => {
		const rootDir = await temporaryRoot();
		const fetchArchive = vi.fn(async () => response(archive()));
		const service = new OpenMarketplaceService({ appVersion: APP_VERSION, rootDir, fetchArchive });

		const empty = await service.listCached();

		expect(empty).toMatchObject({ sourceId: "vetta-official", abilities: [], stale: true });
		expect(fetchArchive).not.toHaveBeenCalled();
	});

	it("installs only from the active validated snapshot", async () => {
		const rootDir = await temporaryRoot();
		const installAbility = vi.fn(
			async (_snapshotRoot: string, _ability: object, _origin: GitHubMarketplaceOrigin) => undefined,
		);
		const service = new OpenMarketplaceService({
			appVersion: APP_VERSION,
			rootDir,
			fetchArchive: async () => response(archive()),
			installAbility,
		});
		await service.refresh();

		await service.install("skill", "demo-skill");

		expect(installAbility).toHaveBeenCalledOnce();
		expect(installAbility.mock.calls[0]?.[0]).toBe(join(rootDir, "snapshots", "2026.07.1"));
		expect(installAbility.mock.calls[0]?.[1]).toMatchObject({ slug: "demo-skill", configVersion: 2 });
		expect(installAbility.mock.calls[0]?.[2]).toMatchObject({
			kind: "github-marketplace",
			marketplaceVersion: "2026.07.1",
		});
	});
});
