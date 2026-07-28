import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import AdmZip from "adm-zip";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenMarketplaceService } from "./open-marketplace-service";

const temporaryRoots: string[] = [];

async function temporaryRoot(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "vetta-open-marketplace-test-"));
	temporaryRoots.push(root);
	return root;
}

function archive(options?: { marketplaceVersion?: string; packageVersion?: string; description?: string }): Buffer {
	const marketplaceVersion = options?.marketplaceVersion ?? "2026.07.1";
	const packageVersion = options?.packageVersion ?? "1.0.0";
	const description = options?.description ?? "Demo ability";
	const manifest = {
		schemaVersion: 1,
		name: "vetta-open-abilities",
		marketplaceVersion,
		repository: "https://github.com/example/vetta-abilities",
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
			rootDir,
			fetchArchive: async () => response(archive()),
			now: () => new Date("2026-07-28T00:00:00.000Z"),
		});

		const snapshot = await service.refresh();

		expect(snapshot.error).toBeUndefined();
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

	it("does not activate a catalog when SKILL.md version disagrees with the catalog", async () => {
		const rootDir = await temporaryRoot();
		const service = new OpenMarketplaceService({
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
			rootDir,
			fetchArchive,
			now: () => new Date("2026-07-28T00:00:00.000Z"),
		});
		await service.refresh();

		const snapshot = await service.list();

		expect(snapshot.error).toBeUndefined();
		expect(fetchArchive).toHaveBeenCalledTimes(1);
	});

	it("installs only from the active validated snapshot", async () => {
		const rootDir = await temporaryRoot();
		const installAbility = vi.fn(async () => undefined);
		const service = new OpenMarketplaceService({
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
