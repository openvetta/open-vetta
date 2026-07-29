import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { ExtensionContext } from "../src/core/extensions/types.js";
import { createImSendAttachmentTool } from "../src/core/tools/im-send-attachment/index.js";

describe("im_send_attachment", () => {
	it("accepts the platform-native absolute path and forwards it to the host bridge", async () => {
		const path = join(tmpdir(), `vetta-im-attachment-${crypto.randomUUID()}.txt`);
		await writeFile(path, "attachment", "utf8");
		const sendAttachment = vi.fn(async () => ({ messageId: "message-1" }));
		const tool = createImSendAttachmentTool({ sendAttachment });

		try {
			const result = await tool.execute(
				"call-1",
				{
					description: "Send test attachment",
					path,
					kind: "file",
				},
				undefined,
				undefined,
				{} as ExtensionContext,
			);

			expect(sendAttachment).toHaveBeenCalledWith({ path, kind: "file", caption: undefined });
			expect(result.details).toEqual({ path, kind: "file", messageId: "message-1" });
		} finally {
			await rm(path, { force: true });
		}
	});
});
