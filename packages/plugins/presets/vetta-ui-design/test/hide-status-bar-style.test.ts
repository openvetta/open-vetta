import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it("交互模式只藏状态栏里的挖孔，不藏整条状态栏", () => {
	const styles = readFileSync(resolve(process.cwd(), "engine/src/styles.css"), "utf8");
	expect(styles).toContain("html[data-vetd-hide-cutout] [data-vetd-cutout]");
	expect(styles).not.toContain("data-vetd-hide-status-bar");
});
