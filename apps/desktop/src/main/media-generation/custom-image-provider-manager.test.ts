import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type CredentialCryptography, CredentialVault } from "../credentials/credential-vault.js";
import { JobManager } from "../jobs/job-manager.js";
import { CustomImageProviderManager } from "./custom-image-provider-manager.js";
import { MediaArtifactStore } from "./media-artifact-store.js";
import { MediaProviderRegistry } from "./media-provider-registry.js";

vi.mock("../logger.js", () => ({
	getAppLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const API_KEY = "sk-test-secret-key-123456";
const PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";
const ownerId = "image-gen";
const signal = new AbortController().signal;

class TestCryptography implements CredentialCryptography {
	readonly backend = "test";
	isAvailable(): boolean {
		return true;
	}
	encrypt(plainText: string): string {
		return Buffer.from(plainText, "utf8").reverse().toString("base64");
	}
	decrypt(cipherText: string): string {
		return Buffer.from(cipherText, "base64").reverse().toString("utf8");
	}
}

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function readAllFiles(directory: string): string {
	return readdirSync(directory, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) => readFileSync(join(entry.parentPath, entry.name), "utf8"))
		.join("\n");
}

describe("CustomImageProviderManager", () => {
	let directory: string;
	let artifacts: MediaArtifactStore;
	let registry: MediaProviderRegistry;
	let fetchMock: ReturnType<typeof vi.fn>;
	let vaultDirectory: string;

	function createManager(): CustomImageProviderManager {
		return new CustomImageProviderManager(registry, artifacts, {
			storePath: join(directory, "custom-image-providers.json"),
			vault: new CredentialVault(vaultDirectory, new TestCryptography()),
			fetch: fetchMock as unknown as (url: string, init: RequestInit) => Promise<Response>,
		});
	}

	beforeEach(() => {
		directory = mkdtempSync(join(tmpdir(), "vetta-custom-image-"));
		vaultDirectory = join(directory, "credentials");
		artifacts = new MediaArtifactStore();
		registry = new MediaProviderRegistry(new JobManager());
		fetchMock = vi.fn();
	});

	afterEach(() => {
		artifacts.dispose();
		rmSync(directory, { recursive: true, force: true });
	});

	const input = {
		name: "My Images",
		baseUrl: "https://img.example.com/v1/",
		model: "gpt-image-1",
		supportsTextToImage: true,
		supportsImageToImage: true,
		apiKey: API_KEY,
	};

	it("publishes saved services to the provider list with per-mode models", () => {
		const manager = createManager();
		const saved = manager.save(input);

		const providers = registry.listProviders();
		expect(providers).toHaveLength(1);
		expect(providers[0]).toMatchObject({ id: `custom-openai:${saved.id}`, displayName: "My Images" });
		const capability = providers[0]?.capabilities[0];
		expect(capability).toMatchObject({
			operation: "generate",
			kind: "image",
			modes: ["text-to-image", "image-to-image"],
			defaultModelId: "gpt-image-1",
			models: [{ id: "gpt-image-1", sourceDisplayName: "My Images", modes: ["text-to-image", "image-to-image"] }],
		});
		expect(JSON.stringify(providers)).not.toContain(API_KEY);
	});

	it("only offers the modes the user marked", () => {
		createManager().save({ ...input, supportsImageToImage: false });
		expect(registry.listProviders()[0]?.capabilities[0]).toMatchObject({ modes: ["text-to-image"] });
	});

	it("keeps the API key in the vault only — never in the store file, list result or logs of saved state", () => {
		const manager = createManager();
		manager.save(input);

		expect(readFileSync(join(directory, "custom-image-providers.json"), "utf8")).not.toContain(API_KEY);
		expect(readAllFiles(vaultDirectory)).not.toContain(API_KEY);
		expect(JSON.stringify(manager.list())).not.toContain(API_KEY);
		expect(manager.list()[0]).toMatchObject({ name: "My Images", hasApiKey: true });
	});

	it("restores services (and their keys) after a restart", async () => {
		createManager().save(input);
		const secondRegistry = new MediaProviderRegistry(new JobManager());
		registry = secondRegistry;
		fetchMock.mockResolvedValue(jsonResponse({ data: [{ b64_json: PNG_BASE64 }] }));
		const restored = createManager();

		expect(secondRegistry.listProviders()).toHaveLength(1);
		const job = await secondRegistry.submit(
			{
				operation: "generate",
				ownerId,
				providerId: secondRegistry.listProviders()[0]!.id,
				kind: "image",
				mode: "text-to-image",
				prompt: "a cat",
				inputs: [],
			},
			signal,
		);
		expect(job.status).toBe("succeeded");
		expect((fetchMock.mock.calls[0]?.[1] as RequestInit).headers).toMatchObject({
			Authorization: `Bearer ${API_KEY}`,
		});
		restored.dispose();
	});

	it("sends text-to-image to {baseUrl}/images/generations with model, prompt, size and bearer auth", async () => {
		fetchMock.mockResolvedValue(jsonResponse({ data: [{ b64_json: PNG_BASE64 }] }));
		const saved = createManager().save(input);

		const job = await registry.submit(
			{
				operation: "generate",
				ownerId,
				providerId: `custom-openai:${saved.id}`,
				kind: "image",
				mode: "text-to-image",
				prompt: "a red fox",
				dimensions: { width: 1024, height: 1536 },
				inputs: [],
			},
			signal,
		);

		expect(job.status).toBe("succeeded");
		expect(job.artifacts[0]).toMatchObject({ kind: "image", mimeType: "image/png" });
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("https://img.example.com/v1/images/generations");
		expect(init.method).toBe("POST");
		expect(init.headers).toMatchObject({ Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" });
		expect(JSON.parse(init.body as string)).toEqual({
			model: "gpt-image-1",
			prompt: "a red fox",
			n: 1,
			size: "1024x1536",
		});
	});

	it("sends image-to-image as multipart to {baseUrl}/images/edits", async () => {
		fetchMock.mockResolvedValue(jsonResponse({ data: [{ b64_json: PNG_BASE64 }] }));
		const saved = createManager().save(input);
		vi.spyOn(artifacts, "resolveInput").mockResolvedValue({ data: Buffer.from("png-bytes"), mimeType: "image/png" });

		const job = await registry.submit(
			{
				operation: "generate",
				ownerId,
				providerId: `custom-openai:${saved.id}`,
				kind: "image",
				mode: "image-to-image",
				prompt: "make it blue",
				inputs: [{ kind: "image", source: { type: "workspace-file", path: "/tmp/in.png" } }],
			},
			signal,
		);

		expect(job.status).toBe("succeeded");
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("https://img.example.com/v1/images/edits");
		expect(init.headers).toEqual({ Authorization: `Bearer ${API_KEY}` });
		const form = init.body as FormData;
		expect(form.get("model")).toBe("gpt-image-1");
		expect(form.get("prompt")).toBe("make it blue");
		expect(form.get("image")).toBeInstanceOf(Blob);
	});

	it("downloads url results and only sends auth to the same origin", async () => {
		fetchMock
			.mockResolvedValueOnce(jsonResponse({ data: [{ url: "https://cdn.other.example/out.png" }] }))
			.mockResolvedValueOnce(
				new Response(Buffer.from(PNG_BASE64, "base64"), { headers: { "content-type": "image/png" } }),
			);
		const saved = createManager().save(input);

		const job = await registry.submit(
			{
				operation: "generate",
				ownerId,
				providerId: `custom-openai:${saved.id}`,
				kind: "image",
				mode: "text-to-image",
				prompt: "x",
				inputs: [],
			},
			signal,
		);

		expect(job.status).toBe("succeeded");
		const [downloadUrl, downloadInit] = fetchMock.mock.calls[1] as [string, RequestInit];
		expect(downloadUrl).toBe("https://cdn.other.example/out.png");
		expect(JSON.stringify(downloadInit.headers)).not.toContain(API_KEY);
	});

	it("redacts the key if the upstream error echoes it", async () => {
		fetchMock.mockResolvedValue(jsonResponse({ error: { message: `bad key ${API_KEY}` } }, 401));
		const saved = createManager().save(input);

		const job = await registry.submit(
			{
				operation: "generate",
				ownerId,
				providerId: `custom-openai:${saved.id}`,
				kind: "image",
				mode: "text-to-image",
				prompt: "x",
				inputs: [],
			},
			signal,
		);

		expect(job.status).toBe("failed");
		expect(job.error?.code).toBe("unauthenticated");
		expect(job.error?.message).toContain("***");
		expect(JSON.stringify(job)).not.toContain(API_KEY);
	});

	it("keeps the stored key on edit when left blank, but demands a new one if the host changes", () => {
		const manager = createManager();
		const saved = manager.save(input);

		const renamed = manager.save({ ...input, id: saved.id, name: "Renamed", apiKey: undefined });
		expect(renamed.hasApiKey).toBe(true);
		expect(registry.listProviders()[0]?.displayName).toBe("Renamed");

		expect(() =>
			manager.save({ ...input, id: saved.id, baseUrl: "https://evil.example.com/v1", apiKey: undefined }),
		).toThrow(/API key is required/);
	});

	it("removes the provider, its record and its key", () => {
		const manager = createManager();
		const saved = manager.save(input);

		manager.remove(saved.id);

		expect(registry.listProviders()).toEqual([]);
		expect(manager.list()).toEqual([]);
		expect(readAllFiles(vaultDirectory)).toBe("");
	});

	it("rejects invalid configuration", () => {
		const manager = createManager();
		expect(() => manager.save({ ...input, baseUrl: "ftp://x" })).toThrow(/http/);
		expect(() => manager.save({ ...input, baseUrl: "https://user:pass@x.example/v1" })).toThrow(/credentials/);
		expect(() => manager.save({ ...input, supportsTextToImage: false, supportsImageToImage: false })).toThrow(
			/at least one/i,
		);
		expect(() => manager.save({ ...input, apiKey: "" })).toThrow(/API key/);
		expect(() => manager.save({ ...input, model: " " })).toThrow(/Model/);
		expect(registry.listProviders()).toEqual([]);
	});
});
