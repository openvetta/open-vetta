import { useAtomValue } from "jotai";
import { useCallback, useEffect, useState } from "react";
import { authTokenAtom } from "@shared/store/atoms";
import {
	createTeam,
	fetchMyTeams,
	fetchTeamDetail,
	joinTeam,
	leaveTeam,
	removeTeamMember,
	resetTeamInviteCode,
	type TeamDetailVO,
	type TeamVO,
} from "@shared/lib/api";
import { Button } from "@shared/components/ui/button";
import { Input } from "@shared/components/ui/input";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@shared/components/ui/dialog";
import { SettingSection } from "./shared";

export function TeamSettings(): JSX.Element {
	const token = useAtomValue(authTokenAtom);
	const [teams, setTeams] = useState<TeamVO[]>([]);
	const [selectedTeam, setSelectedTeam] = useState<TeamDetailVO | null>(null);
	const [createOpen, setCreateOpen] = useState(false);
	const [joinOpen, setJoinOpen] = useState(false);
	const [loading, setLoading] = useState(false);

	const refresh = useCallback(async () => {
		if (!token) return;
		const list = await fetchMyTeams(token);
		setTeams(list);
	}, [token]);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	const handleSelectTeam = async (teamId: number) => {
		if (!token) return;
		const detail = await fetchTeamDetail(token, teamId);
		setSelectedTeam(detail);
	};

	if (!token) {
		return (
			<div className="p-6 text-center text-[13px] text-muted-foreground">
				请先登录后管理团队
			</div>
		);
	}

	return (
		<div className="mx-auto w-full max-w-2xl space-y-6 px-8 pb-12">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-[18px] font-bold text-foreground">团队管理</h2>
					<p className="mt-1 text-[12px] text-muted-foreground">创建或加入团队，与成员协作</p>
				</div>
				<div className="flex gap-2">
					<Button variant="outline" size="sm" onClick={() => setJoinOpen(true)}>
						<span className="icon-[mdi--account-plus-outline] mr-1.5 h-3.5 w-3.5" />
						加入团队
					</Button>
					<Button size="sm" onClick={() => setCreateOpen(true)}>
						<span className="icon-[mdi--plus] mr-1.5 h-3.5 w-3.5" />
						创建团队
					</Button>
				</div>
			</div>

			{/* Team list or detail */}
			{selectedTeam ? (
				<TeamDetail
					detail={selectedTeam}
					token={token}
					onBack={() => setSelectedTeam(null)}
					onRefresh={async () => {
						await refresh();
						const updated = await fetchTeamDetail(token, selectedTeam.id);
						setSelectedTeam(updated);
					}}
				/>
			) : (
				<TeamList
					teams={teams}
					loading={loading}
					onSelect={handleSelectTeam}
				/>
			)}

			{/* Create dialog */}
			<CreateTeamDialog
				open={createOpen}
				onOpenChange={setCreateOpen}
				token={token}
				onCreated={refresh}
			/>

			{/* Join dialog */}
			<JoinTeamDialog
				open={joinOpen}
				onOpenChange={setJoinOpen}
				token={token}
				onJoined={refresh}
			/>
		</div>
	);
}

function TeamList({
	teams,
	loading,
	onSelect,
}: {
	teams: TeamVO[];
	loading: boolean;
	onSelect: (id: number) => void;
}): JSX.Element {
	if (teams.length === 0) {
		return (
			<SettingSection title="我的团队">
				<div className="px-5 py-8 text-center text-[13px] text-muted-foreground">
					暂无团队，创建一个或通过邀请码加入
				</div>
			</SettingSection>
		);
	}

	return (
		<SettingSection title="我的团队">
			{teams.map((team, i) => (
				<button
					key={team.id}
					type="button"
					onClick={() => onSelect(team.id)}
					className={`flex w-full items-center justify-between px-5 py-3.5 text-left transition-colors hover:bg-accent/50 ${i < teams.length - 1 ? "border-b border-border" : ""}`}
				>
					<div className="flex items-center gap-3">
						<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-[13px] font-bold text-primary">
							{team.name[0]}
						</div>
						<div>
							<div className="text-[13px] font-medium text-foreground">{team.name}</div>
							<div className="text-[11px] text-muted-foreground">
								{team.role === "owner" ? "所有者" : team.role === "admin" ? "管理员" : "成员"}
							</div>
						</div>
					</div>
					<span className="icon-[mdi--chevron-right] h-4 w-4 text-muted-foreground/50" />
				</button>
			))}
		</SettingSection>
	);
}

function TeamDetail({
	detail,
	token,
	onBack,
	onRefresh,
}: {
	detail: TeamDetailVO;
	token: string;
	onBack: () => void;
	onRefresh: () => Promise<void>;
}): JSX.Element {
	const [copied, setCopied] = useState(false);
	const currentUser = useAtomValue(authTokenAtom);

	const handleCopyInviteCode = async () => {
		await navigator.clipboard.writeText(detail.invite_code);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	const handleResetCode = async () => {
		await resetTeamInviteCode(token, detail.id);
		await onRefresh();
	};

	const handleRemoveMember = async (userId: number) => {
		await removeTeamMember(token, detail.id, userId);
		await onRefresh();
	};

	const handleLeave = async () => {
		await leaveTeam(token, detail.id);
		onBack();
	};

	// Parse current user ID from token (stored in atom)
	const currentMember = detail.members.find((m) => m.role === "owner");
	const isOwner = currentMember !== undefined;

	return (
		<div className="space-y-4">
			{/* Back button */}
			<button
				type="button"
				onClick={onBack}
				className="flex items-center gap-1 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
			>
				<span className="icon-[mdi--arrow-left] h-3.5 w-3.5" />
				返回团队列表
			</button>

			{/* Team info */}
			<SettingSection title={detail.name}>
				{/* Invite code */}
				<div className="flex items-center justify-between border-b border-border px-5 py-3.5">
					<div>
						<div className="text-[13px] font-medium text-foreground">邀请码</div>
						<div className="mt-0.5 font-mono text-[11px] text-muted-foreground">{detail.invite_code}</div>
					</div>
					<div className="flex gap-1.5">
						<Button variant="ghost" size="xs" onClick={handleCopyInviteCode}>
							{copied ? (
								<span className="icon-[mdi--check] h-3.5 w-3.5 text-emerald-400" />
							) : (
								<span className="icon-[mdi--content-copy] h-3.5 w-3.5" />
							)}
						</Button>
						<Button variant="ghost" size="xs" onClick={handleResetCode} title="重置邀请码">
							<span className="icon-[mdi--refresh] h-3.5 w-3.5" />
						</Button>
					</div>
				</div>

				{/* Member count */}
				<div className="flex items-center justify-between px-5 py-3.5">
					<div className="text-[13px] font-medium text-foreground">成员</div>
					<div className="text-[12px] text-muted-foreground">{detail.members.length} 人</div>
				</div>
			</SettingSection>

			{/* Members */}
			<SettingSection title="成员列表">
				{detail.members.map((member, i) => (
					<div
						key={member.id}
						className={`flex items-center justify-between px-5 py-3 ${i < detail.members.length - 1 ? "border-b border-border" : ""}`}
					>
						<div className="flex items-center gap-3">
							{member.avatar ? (
								<img src={member.avatar} alt="" className="h-7 w-7 rounded-full" />
							) : (
								<div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-[11px] font-medium text-muted-foreground">
									{member.username[0]}
								</div>
							)}
							<div>
								<span className="text-[13px] text-foreground">{member.username}</span>
								<span className="ml-2 text-[11px] text-muted-foreground">
									{member.role === "owner" ? "所有者" : member.role === "admin" ? "管理员" : "成员"}
								</span>
							</div>
						</div>
						{member.role !== "owner" && (
							<Button
								variant="ghost"
								size="xs"
								className="text-muted-foreground hover:text-destructive"
								onClick={() => handleRemoveMember(member.user_id)}
							>
								<span className="icon-[mdi--close] h-3.5 w-3.5" />
							</Button>
						)}
					</div>
				))}
			</SettingSection>

			{/* Leave team */}
			{detail.members.some((m) => m.role !== "owner") && (
				<div className="flex justify-end">
					<Button variant="outline" size="sm" className="text-destructive" onClick={handleLeave}>
						退出团队
					</Button>
				</div>
			)}
		</div>
	);
}

function CreateTeamDialog({
	open,
	onOpenChange,
	token,
	onCreated,
}: {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	token: string;
	onCreated: () => Promise<void>;
}): JSX.Element {
	const [name, setName] = useState("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");

	const handleCreate = async () => {
		if (!name.trim()) return;
		setLoading(true);
		setError("");
		try {
			await createTeam(token, name.trim());
			await onCreated();
			setName("");
			onOpenChange(false);
		} catch (e: unknown) {
			setError(e instanceof Error ? e.message : "创建失败");
		} finally {
			setLoading(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>创建团队</DialogTitle>
				</DialogHeader>
				<div className="space-y-3">
					<Input
						placeholder="团队名称"
						value={name}
						onChange={(e) => setName(e.target.value)}
						onKeyDown={(e) => e.key === "Enter" && handleCreate()}
						autoFocus
					/>
					{error && <p className="text-[12px] text-destructive">{error}</p>}
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						取消
					</Button>
					<Button onClick={handleCreate} disabled={loading || !name.trim()}>
						{loading ? "创建中..." : "创建"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function JoinTeamDialog({
	open,
	onOpenChange,
	token,
	onJoined,
}: {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	token: string;
	onJoined: () => Promise<void>;
}): JSX.Element {
	const [code, setCode] = useState("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");

	const handleJoin = async () => {
		if (!code.trim()) return;
		setLoading(true);
		setError("");
		try {
			await joinTeam(token, code.trim());
			await onJoined();
			setCode("");
			onOpenChange(false);
		} catch (e: unknown) {
			setError(e instanceof Error ? e.message : "加入失败");
		} finally {
			setLoading(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>加入团队</DialogTitle>
				</DialogHeader>
				<div className="space-y-3">
					<Input
						placeholder="输入邀请码"
						value={code}
						onChange={(e) => setCode(e.target.value)}
						onKeyDown={(e) => e.key === "Enter" && handleJoin()}
						autoFocus
					/>
					{error && <p className="text-[12px] text-destructive">{error}</p>}
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						取消
					</Button>
					<Button onClick={handleJoin} disabled={loading || !code.trim()}>
						{loading ? "加入中..." : "加入"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
