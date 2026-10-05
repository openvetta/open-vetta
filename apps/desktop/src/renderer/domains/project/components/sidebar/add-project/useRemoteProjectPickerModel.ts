import type { SshHostSummary } from "@preload/api-types/ssh";
import type { RemoteDirectoryEntry } from "@vetta/ssh-transport";
import { useCallback, useEffect, useRef, useState } from "react";

export interface RemoteProjectPickerModel {
	/** 已登记的主机。为空时不弹一个空对话框，而是给出去设置页登记的出口。 */
	hosts: readonly SshHostSummary[];
	hostsLoading: boolean;
	hostsError: boolean;
	selectedHostId: string | null;
	/** 当前浏览的远端绝对路径（`~` 已由主进程展开）。 */
	remotePath: string;
	entries: readonly RemoteDirectoryEntry[];
	browsing: boolean;
	/** 列目录失败的原因。连不上主机时这里是唯一能解释「为什么是空的」的地方。 */
	error: string | null;
	canSubmit: boolean;
	selectHost: (hostId: string) => void;
	enterDirectory: (name: string) => void;
	goToParent: () => void;
	back: () => void;
	retry: () => void;
}

export function useRemoteProjectPickerModel(): RemoteProjectPickerModel {
	const [hosts, setHosts] = useState<readonly SshHostSummary[]>([]);
	const [hostsLoading, setHostsLoading] = useState(true);
	const [hostsError, setHostsError] = useState(false);
	const hostsRequest = useRef(0);
	const [selectedHostId, setSelectedHostId] = useState<string | null>(null);
	const [remotePath, setRemotePath] = useState("");
	const [entries, setEntries] = useState<readonly RemoteDirectoryEntry[]>([]);
	const [browsing, setBrowsing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const browseRequest = useRef(0);
	const lastBrowse = useRef<{ hostId: string; path?: string } | null>(null);

	const loadHosts = useCallback(() => {
		const request = ++hostsRequest.current;
		setHostsLoading(true);
		setHostsError(false);
		void window.vetta.ssh
			.listHosts()
			.then(
				(result) => {
					if (request === hostsRequest.current) setHosts(result);
				},
				() => {
					if (request === hostsRequest.current) setHostsError(true);
				},
			)
			.finally(() => {
				if (request === hostsRequest.current) setHostsLoading(false);
			});
	}, []);

	useEffect(() => {
		loadHosts();
		return () => {
			hostsRequest.current += 1;
		};
	}, [loadHosts]);

	useEffect(
		() => () => {
			browseRequest.current += 1;
		},
		[],
	);

	const browse = useCallback(async (hostId: string, path: string | undefined) => {
		const request = ++browseRequest.current;
		lastBrowse.current = { hostId, path };
		setBrowsing(true);
		setError(null);
		try {
			const listing = await window.vetta.ssh.listRemoteDirectory({ hostId, remotePath: path });
			if (request !== browseRequest.current) return;
			setRemotePath(listing.remotePath);
			// 这里在选项目根，普通文件不是可选项，列出来只会让用户误点。
			// 软链接保留：指向目录的软链接很常见（项目盘挂载、家目录里的快捷方式），
			// stat 报的是链接本身而不是目标，按类型滤掉会让这些目录凭空消失。
			// 真的不是目录时，进去那一步的 `cd` 会失败并给出错误。
			setEntries(listing.entries.filter((entry) => entry.kind === "directory" || entry.kind === "symlink"));
		} catch (caught) {
			if (request !== browseRequest.current) return;
			// 保留当前路径不变，让用户能原地退回上一级重试，而不是被踢回起点。
			setEntries([]);
			setError(caught instanceof Error ? caught.message : String(caught));
		} finally {
			if (request === browseRequest.current) setBrowsing(false);
		}
	}, []);

	const selectHost = useCallback(
		(hostId: string) => {
			setSelectedHostId(hostId);
			setRemotePath("");
			setEntries([]);
			// 从远端家目录起步而不是 `/`：项目几乎总在家目录下。
			void browse(hostId, undefined);
		},
		[browse],
	);

	const enterDirectory = useCallback(
		(name: string) => {
			if (selectedHostId === null) return;
			void browse(selectedHostId, `${remotePath.replace(/\/+$/, "")}/${name}`);
		},
		[browse, remotePath, selectedHostId],
	);

	const goToParent = useCallback(() => {
		if (selectedHostId === null || remotePath === "/") return;
		const parent = remotePath.replace(/\/+$/, "").replace(/\/[^/]*$/, "");
		void browse(selectedHostId, parent.length === 0 ? "/" : parent);
	}, [browse, remotePath, selectedHostId]);

	const back = useCallback(() => {
		browseRequest.current += 1;
		lastBrowse.current = null;
		setSelectedHostId(null);
		setEntries([]);
		setRemotePath("");
		setError(null);
		setBrowsing(false);
	}, []);
	const retry = useCallback(() => {
		if (selectedHostId === null) {
			loadHosts();
		} else if (lastBrowse.current?.hostId === selectedHostId) {
			void browse(selectedHostId, lastBrowse.current.path);
		}
	}, [browse, loadHosts, selectedHostId]);

	return {
		hosts,
		hostsLoading,
		hostsError,
		selectedHostId,
		remotePath,
		entries,
		browsing,
		error,
		// 路径没拿到之前不能提交：那会登记一个空路径的项目。
		canSubmit: selectedHostId !== null && remotePath.length > 0 && !browsing && error === null,
		selectHost,
		enterDirectory,
		goToParent,
		back,
		retry,
	};
}
