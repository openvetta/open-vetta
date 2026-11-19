import type { JSX } from "react";
import {
	Button,
	cn,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@vetta-org/ui";
import { InputField } from "./SettingsFormFields";

export interface SpaceEditorIconOption {
	readonly value: string;
	readonly label: string;
	readonly iconClassName: string;
}

export interface SpaceEditorDialogViewLabels {
	readonly title: string;
	readonly description: string;
	readonly name: string;
	readonly namePlaceholder: string;
	readonly icon: string;
	readonly cancel: string;
	readonly save: string;
}

export interface SpaceEditorDialogViewProps {
	readonly labels: SpaceEditorDialogViewLabels;
	readonly name: string;
	readonly icons: readonly SpaceEditorIconOption[];
	readonly selectedIcon: string;
	readonly canSave: boolean;
	readonly onNameChange: (name: string) => void;
	readonly onSelectIcon: (value: string) => void;
	readonly onCancel: () => void;
	readonly onSave: () => void;
}

export function SpaceEditorDialogView({
	labels,
	name,
	icons,
	selectedIcon,
	canSave,
	onNameChange,
	onSelectIcon,
	onCancel,
	onSave,
}: SpaceEditorDialogViewProps): JSX.Element {
	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open) onCancel();
			}}
		>
			<DialogContent className="sm:max-w-[460px]">
				<DialogHeader>
					<DialogTitle>{labels.title}</DialogTitle>
					<DialogDescription>{labels.description}</DialogDescription>
				</DialogHeader>
				<form
					className="grid gap-4"
					onSubmit={(event) => {
						event.preventDefault();
						if (canSave) onSave();
					}}
				>
					<div className="grid gap-1.5">
						<span className="text-[12px] font-medium text-muted-foreground">{labels.name}</span>
						<InputField
							value={name}
							onChange={onNameChange}
							placeholder={labels.namePlaceholder}
							autoFocus
							aria-label={labels.name}
						/>
					</div>
					<div className="grid gap-1.5">
						<span className="text-[12px] font-medium text-muted-foreground">{labels.icon}</span>
						<div className="grid grid-cols-10 gap-1" role="group" aria-label={labels.icon}>
							{icons.map((option) => {
								const active = option.value === selectedIcon;
								return (
									<Button
										key={option.value}
										type="button"
										size="icon-sm"
										variant="ghost"
										aria-label={option.label}
										title={option.label}
										aria-pressed={active}
										className={cn(
											"text-muted-foreground",
											active && "border border-primary bg-primary/10 text-primary hover:bg-primary/15",
										)}
										onClick={() => onSelectIcon(option.value)}
									>
										<span className={cn(option.iconClassName, "size-4")} aria-hidden="true" />
									</Button>
								);
							})}
						</div>
					</div>
					<DialogFooter>
						<Button type="button" variant="ghost" onClick={onCancel}>
							{labels.cancel}
						</Button>
						<Button type="submit" disabled={!canSave}>
							{labels.save}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
