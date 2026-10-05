// @vitest-environment jsdom

import type { SshHostSummary, SshRemoteListing } from "@preload/api-types/ssh";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RemoteProjectPickerDialog } from "./RemoteProjectPickerDialog";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
const listHosts = vi.fn<() => Promise<SshHostSummary[]>>();
const listRemoteDirectory = vi.fn<(input: { hostId: string; remotePath?: string }) => Promise<SshRemoteListing>>();

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((yes) => {
		resolve = yes;
	});
	return { promise, resolve };
}
function listing(remotePath: string, names: string[] = []): SshRemoteListing {
	return {
		remotePath,
		entries: names.map((name) => ({ name, kind: "directory", sizeBytes: 0, modifiedAtSeconds: 0 })),
	};
}

beforeEach(() => {
	listHosts.mockReset().mockResolvedValue([
		{ id: "a", label: "Host A", target: "host-a", source: "manual", status: "disconnected" },
		{ id: "b", label: "Host B", target: "host-b", source: "manual", status: "disconnected" },
	]);
	listRemoteDirectory.mockReset().mockResolvedValue(listing("/home/a", ["project"]));
	vi.stubGlobal("vetta", { ssh: { listHosts, listRemoteDirectory } });
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("remote project picker", () => {
	it("selects a host, opens a directory and confirms its actual path", async () => {
		const onConfirm = vi.fn();
		render(<RemoteProjectPickerDialog onConfirm={onConfirm} onCancel={vi.fn()} />);
		await userEvent.click(await screen.findByRole("button", { name: /Host A/ }));
		listRemoteDirectory.mockResolvedValueOnce(listing("/home/a/project"));
		await userEvent.click(await screen.findByRole("button", { name: "project" }));
		await screen.findByText("/home/a/project");
		await userEvent.click(screen.getByRole("button", { name: "remotePicker.confirm" }));
		expect(onConfirm).toHaveBeenCalledWith("a", "/home/a/project");
	});

	it("ignores a previous host's delayed response after switching hosts", async () => {
		const a = deferred<SshRemoteListing>();
		const b = deferred<SshRemoteListing>();
		listRemoteDirectory.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
		const onConfirm = vi.fn();
		render(<RemoteProjectPickerDialog onConfirm={onConfirm} onCancel={vi.fn()} />);
		await userEvent.click(await screen.findByRole("button", { name: /Host A/ }));
		await userEvent.click(screen.getByRole("button", { name: "remotePicker.backToHosts" }));
		await userEvent.click(screen.getByRole("button", { name: /Host B/ }));
		await act(async () => a.resolve(listing("/home/a", ["only-on-a"])));
		expect(screen.queryByRole("button", { name: "only-on-a" })).toBeNull();
		expect((screen.getByRole("button", { name: "remotePicker.confirm" }) as HTMLButtonElement).disabled).toBe(true);
		await act(async () => b.resolve(listing("/home/b")));
		await userEvent.click(screen.getByRole("button", { name: "remotePicker.confirm" }));
		expect(onConfirm).toHaveBeenCalledWith("b", "/home/b");
	});

	it("keeps failed directory navigation from submitting the previous directory and retries the requested path", async () => {
		const onConfirm = vi.fn();
		render(<RemoteProjectPickerDialog onConfirm={onConfirm} onCancel={vi.fn()} />);
		await userEvent.click(await screen.findByRole("button", { name: /Host A/ }));
		listRemoteDirectory.mockRejectedValueOnce(new Error("Directory unavailable"));
		await userEvent.click(await screen.findByRole("button", { name: "project" }));
		expect(await screen.findByRole("alert")).toBeTruthy();
		expect((screen.getByRole("button", { name: "remotePicker.confirm" }) as HTMLButtonElement).disabled).toBe(true);
		listRemoteDirectory.mockResolvedValueOnce(listing("/home/a/project"));
		await userEvent.click(screen.getByRole("button", { name: "remotePicker.retry" }));
		await screen.findByText("/home/a/project");
		expect(listRemoteDirectory).toHaveBeenLastCalledWith({ hostId: "a", remotePath: "/home/a/project" });
		await userEvent.click(screen.getByRole("button", { name: "remotePicker.confirm" }));
		expect(onConfirm).toHaveBeenCalledWith("a", "/home/a/project");
	});

	it("reports a failed host list separately from an empty list and offers recovery", async () => {
		listHosts.mockRejectedValueOnce(new Error("Host registry unavailable"));
		render(<RemoteProjectPickerDialog onConfirm={vi.fn()} onCancel={vi.fn()} />);
		expect((await screen.findByRole("alert")).textContent).toBe("remotePicker.hostsFailed");
		expect(screen.queryByText("remotePicker.noHosts")).toBeNull();
		await userEvent.click(screen.getByRole("button", { name: "remotePicker.retry" }));
		expect(await screen.findByRole("button", { name: /Host A/ })).toBeTruthy();
		expect(screen.queryByRole("alert")).toBeNull();
	});
});
