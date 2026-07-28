import { posix } from "node:path";
import { z } from "zod";

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

const metaEntrySchema = z
	.object({
		key: z.enum(["homepage", "repository", "docs", "license"]).optional(),
		label: z.string().min(1).optional(),
		value: z.string().min(1),
	})
	.passthrough();

const showcaseSchema = z
	.object({
		template: z.enum(["chat-over-canvas", "chat-thread"]),
		user_prompt: z.string(),
		assistant_reply: z.string(),
		canvas: z.enum(["design", "code", "docs", "generic"]).optional(),
		brand_icon_url: z.string().optional(),
		brand_name: z.string().optional(),
	})
	.passthrough();

const detailLocaleSchema = z
	.object({
		name: z.string().optional(),
		description: z.string().optional(),
		content: z.string().optional(),
		showcases: z.array(showcaseSchema).optional(),
		meta: z.array(metaEntrySchema).optional(),
	})
	.passthrough();

const detailSchema = detailLocaleSchema.extend({
	license: z.string().optional(),
	author: z.string().optional(),
	icon: z.string().optional(),
	tags: z.array(z.string()).optional(),
	i18n: z.record(z.string(), detailLocaleSchema).optional(),
});

export const marketplaceAbilitySchema = z
	.object({
		type: z.enum(["skill", "scene"]),
		slug: z.string().regex(SLUG_PATTERN),
		name: z.string().min(1),
		description: z.string().default(""),
		version: z.string().regex(VERSION_PATTERN),
		configVersion: z.number().int().positive().default(1),
		license: z.string().default(""),
		author: z.string().default(""),
		icon: z.string().default(""),
		category: z.string().default(""),
		tags: z.array(z.string()).default([]),
		detail: detailSchema.default({}),
		source: z.object({ path: z.string().min(1) }).passthrough(),
	})
	.passthrough();

export const marketplaceManifestSchema = z
	.object({
		schemaVersion: z.literal(1),
		name: z.string().regex(SLUG_PATTERN),
		displayName: z.string().min(1).optional(),
		marketplaceVersion: z.string().regex(VERSION_PATTERN),
		repository: z.string().url(),
		minClientVersion: z.string().min(1).optional(),
		abilities: z.array(marketplaceAbilitySchema),
	})
	.passthrough();

export type MarketplaceManifest = z.infer<typeof marketplaceManifestSchema>;
export type MarketplaceAbilityManifest = z.infer<typeof marketplaceAbilitySchema>;

export function normalizeMarketplaceSourcePath(value: string): string {
	const slashPath = value.replace(/\\/g, "/");
	if (slashPath.startsWith("/") || /^[a-zA-Z]:\//.test(slashPath)) {
		throw new Error(`Ability source path must be relative: ${value}`);
	}
	const normalized = posix.normalize(slashPath).replace(/^\.\//, "").replace(/\/$/, "");
	if (!normalized || normalized === "." || normalized === ".." || normalized.startsWith("../")) {
		throw new Error(`Ability source path escapes marketplace root: ${value}`);
	}
	return normalized;
}

export function parseMarketplaceManifest(input: unknown): MarketplaceManifest {
	const manifest = marketplaceManifestSchema.parse(input);
	const seen = new Set<string>();
	for (const ability of manifest.abilities) {
		if (seen.has(ability.slug)) throw new Error(`Duplicate ability slug in marketplace: ${ability.slug}`);
		seen.add(ability.slug);
		ability.source.path = normalizeMarketplaceSourcePath(ability.source.path);
	}
	return manifest;
}
