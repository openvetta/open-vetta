import { createInstance } from "@module-federation/enhanced/runtime";
import { describe, expect, it } from "vitest";
import { pluginFederationRemote } from "./plugin-module-loader";

const board = pluginFederationRemote({
	entryUrl: "https://example.test/github-issue-board/mf-manifest.json",
	moduleFederation: { remoteName: "github_issue_board", expose: "./plugin" },
});
const git = pluginFederationRemote({
	entryUrl: "https://example.test/git/mf-manifest.json",
	moduleFederation: { remoteName: "git", expose: "./plugin" },
});

describe("plugin federation remote registration", () => {
	it("loads the Git panel when the issue board remote is already registered", () => {
		const host = createInstance({ name: "vetta_plugin_host_git", remotes: [] });
		host.registerRemotes([board]);
		expect(() => host.registerRemotes([git])).not.toThrow();
	});

	it("rejects a git alias because it is a prefix of the issue board remote name", () => {
		const host = createInstance({ name: "vetta_plugin_host_git_alias", remotes: [] });
		host.registerRemotes([{ ...board, alias: "github-issue-board" }]);
		expect(() => host.registerRemotes([{ ...git, alias: "git" }])).toThrow(/prefix/);
	});
});
