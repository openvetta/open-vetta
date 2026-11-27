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
import spaceEditorIllustrationUrl from "./assets/space-editor-illustration.webp";
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
			{/* 宽窗口左侧放插画；窗口窄于 sm 时只留表单，避免挤压输入区。 */}
			<DialogContent className="max-w-[min(460px,calc(100%-2rem))] gap-0 overflow-hidden p-0 sm:max-w-[min(700px,calc(100%-2rem))] sm:grid-cols-[240px_minmax(0,1fr)]">
				{/* 插画绝对定位铺满左列，高度只跟表单走，不让图片的原始比例撑高对话框。 */}
				<div aria-hidden className="relative hidden sm:block">
					<img
						src={spaceEditorIllustrationUrl}
						alt=""
						draggable={false}
						decoding="async"
						className="absolute inset-0 size-full object-cover object-[50%_62%] select-none"
					/>
				</div>
				<div className="grid gap-5 p-6">
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
				</div>
			</DialogContent>
		</Dialog>
	);
}
