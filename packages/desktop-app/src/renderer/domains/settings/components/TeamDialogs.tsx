import { useState } from "react";
import { Button } from "@shared/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@shared/components/ui/dialog";
import { Input } from "@shared/components/ui/input";
import type { TeamSettingsLabels } from "./useTeamSettingsModel";

export function CreateTeamDialog({
	open,
	labels,
	onOpenChange,
	onCreate,
}: {
	open: boolean;
	labels: TeamSettingsLabels;
	onOpenChange: (open: boolean) => void;
	onCreate: (name: string) => Promise<void>;
}): JSX.Element {
	const [name, setName] = useState("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");

	const handleCreate = async () => {
		if (!name.trim()) return;
		setLoading(true);
		setError("");
		try {
			await onCreate(name.trim());
			setName("");
		} catch (e: unknown) {
			setError(e instanceof Error ? e.message : labels.createFailed);
		} finally {
			setLoading(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{labels.createTitle}</DialogTitle>
				</DialogHeader>
				<div className="space-y-3">
					<Input
						placeholder={labels.createPlaceholder}
						value={name}
						onChange={(e) => setName(e.target.value)}
						onKeyDown={(e) => e.key === "Enter" && handleCreate()}
						autoFocus
					/>
					{error && <p className="text-[12px] text-destructive">{error}</p>}
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						{labels.cancel}
					</Button>
					<Button onClick={handleCreate} disabled={loading || !name.trim()}>
						{loading ? labels.creating : labels.createButton}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export function JoinTeamDialog({
	open,
	labels,
	onOpenChange,
	onJoin,
}: {
	open: boolean;
	labels: TeamSettingsLabels;
	onOpenChange: (open: boolean) => void;
	onJoin: (code: string) => Promise<void>;
}): JSX.Element {
	const [code, setCode] = useState("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");

	const handleJoin = async () => {
		if (!code.trim()) return;
		setLoading(true);
		setError("");
		try {
			await onJoin(code.trim());
			setCode("");
		} catch (e: unknown) {
			setError(e instanceof Error ? e.message : labels.joinFailed);
		} finally {
			setLoading(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{labels.joinTitle}</DialogTitle>
				</DialogHeader>
				<div className="space-y-3">
					<Input
						placeholder={labels.joinPlaceholder}
						value={code}
						onChange={(e) => setCode(e.target.value)}
						onKeyDown={(e) => e.key === "Enter" && handleJoin()}
						autoFocus
					/>
					{error && <p className="text-[12px] text-destructive">{error}</p>}
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						{labels.cancel}
					</Button>
					<Button onClick={handleJoin} disabled={loading || !code.trim()}>
						{loading ? labels.joining : labels.joinButton}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
