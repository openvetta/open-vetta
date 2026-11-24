import { useTranslation } from "@vetta-org/plugin-sdk";
import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Input,
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@vetta-org/ui";
import { useCallback, useEffect, useState } from "react";
import { listBranches } from "../git/log";
import { checkoutBranch, createBranch, currentBranch } from "../git/run";
import { emitRefreshSignal, notifyError, onRefreshSignal } from "../git/runtime";
import type { BranchRef } from "../git/types";
import { BranchIcon } from "./icons";

/** Branch names git itself rejects; validated up front for a clearer message. */
export function invalidBranchName(name: string, existing: readonly string[]): "empty" | "chars" | "taken" | null {
	const trimmed = name.trim();
	if (trimmed.length === 0) return "empty";
	if (/[\s~^:?*[\\]/.test(trimmed) || trimmed.startsWith("-") || trimmed.endsWith(".") || trimmed.includes("..")) return "chars";
	if (existing.includes(trimmed)) return "taken";
	return null;
}

/**
 * Select 的值带上作用域，本地 `dev` 与远程 `origin/dev` 永不撞车；Radix 也不允许
 * 两个条目同值。
 */
function refValue(scope: "local" | "remote", name: string): string {
	return `${scope}:${name}`;
}

/** 下拉里的「新建分支…」入口：它打开对话框，而不是切分支。 */
const CREATE_VALUE = "create";

/**
 * Current branch plus the switcher, at the top of the change column.
 *
 * "Which branch am I on" is more basic than anything else in this panel and was
 * previously nowhere to be found in it.
 */
export function BranchBar({ root }: { root: string }): JSX.Element {
	const { t } = useTranslation();
	const [branch, setBranch] = useState<string | null>(null);
	const [locals, setLocals] = useState<BranchRef[]>([]);
	const [remotes, setRemotes] = useState<BranchRef[]>([]);
	const [creating, setCreating] = useState(false);
	const [newName, setNewName] = useState("");
	const [busy, setBusy] = useState(false);

	const reload = useCallback(() => {
		void currentBranch(root).then(setBranch).catch(() => setBranch(null));
		void listBranches(root, "local").then(setLocals).catch(() => setLocals([]));
		void listBranches(root, "remote").then(setRemotes).catch(() => setRemotes([]));
	}, [root]);

	useEffect(() => {
		reload();
		return onRefreshSignal(reload);
	}, [reload]);

	const run = useCallback((task: () => Promise<void>) => {
		setBusy(true);
		task()
			.then(() => emitRefreshSignal())
			// 切换失败最常见的原因是本地改动会被覆盖，git 的原话已经说清，附上一句该怎么办。
			.catch((err: unknown) => notifyError(`${err instanceof Error ? err.message : String(err)}\n\n${t("branch.switchFailedHint")}`, err))
			.finally(() => setBusy(false));
	}, []);

	// 切换分支是可逆操作，不加确认弹窗，失败时直接把 git 的原话摆出来。
	const switchTo = (name: string): void => run(() => checkoutBranch(root, name));

	const nameError = invalidBranchName(newName, locals.map((item) => item.name));

	const submitCreate = (): void => {
		if (nameError) return;
		const name = newName.trim();
		setCreating(false);
		setNewName("");
		run(() => createBranch(root, name));
	};

	return (
		// 不再自占一条通栏：分支是个标识，挤在工具栏里就够，省下一条分隔线和 8px 高度。
		<div className="flex min-w-0 items-center">
			<Select
				// 当前分支必须真的在列表里才算选中：空仓库（还没有任何提交）git 会报出分支名，
				// 但 `git branch` 一个都列不出来；此时回落成空值（走 placeholder），否则触发器会空白一片。
				// 始终传字符串而不是 undefined：Radix 从非受控切到受控会告警。
				value={branch && locals.some((item) => item.name === branch) ? refValue("local", branch) : ""}
				onValueChange={(value) => {
					if (value === CREATE_VALUE) {
						setCreating(true);
						return;
					}
					switchTo(value.slice(value.indexOf(":") + 1));
				}}
			>
				<SelectTrigger
					size="sm"
					className="min-w-0 max-w-[180px] gap-1 px-1.5"
					disabled={busy}
					title={t("branch.switch")}
				>
					<BranchIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
					<SelectValue placeholder={branch ?? t("branch.detached")} />
				</SelectTrigger>
				{/*
				 * 分支名可以很长，浮层给一档固定宽度并让名字自己截断（悬停看全名），
				 * 否则面板会被最长的那个远程分支撑到很宽。分组靠标签和留白区分，
				 * 不用横贯整块的分割线——那种线在这种密度的列表里显得很硬。
				 */}
				<SelectContent className="max-h-72 w-56 p-1 [&_[data-slot=select-item-text]]:min-w-0 [&_[data-slot=select-item-text]]:truncate">
					<SelectItem value={CREATE_VALUE}>{t("branch.create")}</SelectItem>
					{locals.length > 0 && (
						<SelectGroup>
							<SelectLabel className="px-2 pb-0.5 pt-1.5 text-[10.5px] font-medium tracking-wide">
								{t("branch.scopeLocal")}
							</SelectLabel>
							{locals.map((item) => (
								<SelectItem
									key={refValue("local", item.name)}
									value={refValue("local", item.name)}
									title={item.name}
									disabled={item.name === branch}
									className="py-[3px]"
								>
									{item.name}
								</SelectItem>
							))}
						</SelectGroup>
					)}
					{remotes.length > 0 && (
						<SelectGroup>
							<SelectLabel className="px-2 pb-0.5 pt-1.5 text-[10.5px] font-medium tracking-wide">
								{t("branch.scopeRemote")}
							</SelectLabel>
							{remotes.map((item) => (
								<SelectItem
									key={refValue("remote", item.name)}
									value={refValue("remote", item.name)}
									title={item.name}
									className="py-[3px]"
								>
									{item.name}
								</SelectItem>
							))}
						</SelectGroup>
					)}
				</SelectContent>
			</Select>

			<Dialog open={creating} onOpenChange={(open) => !open && setCreating(false)}>
				<DialogContent data-vetta-plugin-root="git" className="max-w-sm">
					<DialogHeader>
						<DialogTitle>{t("branch.createTitle")}</DialogTitle>
						<DialogDescription>{t("branch.createDescription")}</DialogDescription>
					</DialogHeader>
					<Input
						value={newName}
						autoFocus
						placeholder={t("branch.namePlaceholder")}
						onChange={(event) => setNewName(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter") submitCreate();
						}}
					/>
					{newName.trim().length > 0 && nameError && <p className="text-[11px] text-rose-500">{t(`branch.error.${nameError}`)}</p>}
					<DialogFooter>
						<Button type="button" variant="ghost" size="sm" onClick={() => setCreating(false)}>
							{t("confirm.cancel")}
						</Button>
						<Button type="button" size="sm" disabled={nameError !== null} onClick={submitCreate}>
							{t("branch.createConfirm")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
