/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UpdateCheckerAction } from "./UpdateChecker";

const labels = {
	check: "检查更新",
	checking: "正在检查更新",
	checkingBtn: "检查中...",
	currentVersion: (v: string) => v,
	download: "下载",
	downloading: (p: number) => `下载中 ${p}%`,
	idle: (v: string) => v,
	newVersion: (v: string) => v,
	restart: "重启",
};

describe("UpdateCheckerAction", () => {
	afterEach(cleanup);

	it("下载中按钮禁用并显示百分比，不能再次检查", () => {
		const onCheck = vi.fn();
		render(<UpdateCheckerAction checking={false} labels={labels} onCheck={onCheck} phase="downloading" progress={0.42} />);
		const button = screen.getByTestId("updater-check") as HTMLButtonElement;
		expect(button.disabled).toBe(true);
		expect(button.textContent).toContain("下载中 42%");
	});

	it("空闲时可点击检查", () => {
		render(<UpdateCheckerAction checking={false} labels={labels} onCheck={() => {}} phase="idle" />);
		const button = screen.getByTestId("updater-check") as HTMLButtonElement;
		expect(button.disabled).toBe(false);
		expect(button.textContent).toContain("检查更新");
	});
});
