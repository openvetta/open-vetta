import { type CapabilityDetailDocument, capabilityDetailDocumentSchema } from "../document-schema";
import figmaSource from "./figma.json";
import githubSource from "./github.json";
import notionSource from "./notion.json";

const documentSources: ReadonlyArray<{ name: string; value: unknown }> = [
	{ name: "figma.json", value: figmaSource },
	{ name: "github.json", value: githubSource },
	{ name: "notion.json", value: notionSource },
];

function parseDocument(source: { name: string; value: unknown }): CapabilityDetailDocument | null {
	const result = capabilityDetailDocumentSchema.safeParse(source.value);
	if (result.success) return result.data;
	console.error(`[capability-detail] Invalid document ${source.name}`, result.error.issues);
	return null;
}

export const capabilityDetailDocuments = documentSources
	.map(parseDocument)
	.filter((document): document is CapabilityDetailDocument => document !== null);

const documentsByCapabilityId = new Map<string, CapabilityDetailDocument>();

for (const document of capabilityDetailDocuments) {
	if (documentsByCapabilityId.has(document.capabilityId)) {
		console.error(`[capability-detail] Duplicate capabilityId: ${document.capabilityId}`);
		continue;
	}
	documentsByCapabilityId.set(document.capabilityId, document);
}

export function getCapabilityDetailDocument(capabilityId: string): CapabilityDetailDocument | null {
	return documentsByCapabilityId.get(capabilityId) ?? null;
}
