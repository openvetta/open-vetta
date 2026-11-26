import { describe, expect, it } from "vitest";
import { withPresetDefaultHeaders } from "./preset-provider-headers.js";

describe("withPresetDefaultHeaders", () => {
	const defaults = { "User-Agent": "Vetta" };

	it("没有任何请求头时补上默认头", () => {
		expect(withPresetDefaultHeaders(undefined, defaults)).toEqual({ "User-Agent": "Vetta" });
	});

	it("保留用户已有的其它请求头", () => {
		expect(withPresetDefaultHeaders({ "X-Trace": "1" }, defaults)).toEqual({ "User-Agent": "Vetta", "X-Trace": "1" });
	});

	it("用户设过同名头(大小写不同也算)时不覆盖,并原样返回同一个对象", () => {
		const headers = { "user-agent": "MyClient/2" };
		expect(withPresetDefaultHeaders(headers, defaults)).toBe(headers);
	});

	it("预设没有默认头时原样返回", () => {
		const headers = { "X-Trace": "1" };
		expect(withPresetDefaultHeaders(headers, undefined)).toBe(headers);
		expect(withPresetDefaultHeaders(undefined, undefined)).toBeUndefined();
	});
});
