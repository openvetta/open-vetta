import type { JSX } from "react";
import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@vetta/ui";
import { InputField } from "./SettingsFormFields";

export interface BuiltinMcpSecretFieldView {
	readonly envKey: string;
	readonly label: string;
	readonly required: boolean;
	readonly optionalSuffix?: string;
	readonly helpUrl?: string;
	readonly secret?: boolean;
	readonly placeholder?: string;
}

export interface BuiltinMcpSecretsDialogViewLabels {
	readonly title: string;
	readonly lead: string;
	readonly stepOpenSite: string;
	readonly stepOpenAuth: string;
	readonly stepOpenSiteHint: string;
	readonly stepOpenAuthHint: string;
	readonly openKeyPage: string;
	readonly openAuthPage: string;
	readonly howTo: string;
	readonly stepPasteKey: string;
	readonly getKey: string;
	readonly privacy: string;
	readonly defer: string;
	readonly cancel: string;
	readonly saving: string;
	readonly finishConnect: string;
	readonly confirmAdd: string;
}

export interface BuiltinMcpSecretsDialogViewProps {
	readonly allowDefer: boolean;
	readonly canSubmit: boolean;
	readonly fields: readonly BuiltinMcpSecretFieldView[];
	readonly guideLines: readonly string[];
	readonly hasFields: boolean;
	readonly labels: BuiltinMcpSecretsDialogViewLabels;
	readonly onChangeValue: (envKey: string, value: string) => void;
	readonly onConfirm: (values: Record<string, string>) => void;
	readonly onDefer?: () => void;
	readonly onOpenChange: (open: boolean) => void;
	readonly onOpenHelp: (url: string) => void;
	readonly open: boolean;
	readonly primaryHelpUrl?: string | null;
	readonly saving: boolean;
	readonly values: Record<string, string>;
}

export function BuiltinMcpSecretsDialogView({
	allowDefer,
	canSubmit,
	fields,
	guideLines,
	hasFields,
	labels,
	onChangeValue,
	onConfirm,
	onDefer,
	onOpenChange,
	onOpenHelp,
	open,
	primaryHelpUrl,
	saving,
	values,
}: BuiltinMcpSecretsDialogViewProps): JSX.Element {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>{labels.title}</DialogTitle>
					<DialogDescription>{labels.lead}</DialogDescription>
				</DialogHeader>

				{primaryHelpUrl && (
					<div className="rounded-xl border border-border/50 bg-primary/5 px-3.5 py-3">
						<div className="mb-2 text-[12px] font-medium text-foreground">
							{hasFields ? labels.stepOpenSite : labels.stepOpenAuth}
						</div>
						<p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
							{hasFields ? labels.stepOpenSiteHint : labels.stepOpenAuthHint}
						</p>
						<Button
							variant="primary"
							size="sm"
							className="w-full"
							onClick={() => onOpenHelp(primaryHelpUrl)}
						>
							<span className="icon-[mdi--open-in-new] h-3.5 w-3.5" />
							{hasFields ? labels.openKeyPage : labels.openAuthPage}
						</Button>
					</div>
				)}

				{guideLines.length > 0 && (
					<div className="rounded-xl border border-border/50 bg-muted/40 px-3.5 py-3">
						<div className="mb-2 text-[12px] font-medium text-foreground">{labels.howTo}</div>
						<ol className="list-decimal space-y-1.5 pl-4 text-[11px] leading-relaxed text-muted-foreground">
							{guideLines.map((line) => (
								<li key={line}>{line}</li>
							))}
						</ol>
					</div>
				)}

				{hasFields && (
					<div className="flex flex-col gap-3">
						<div className="text-[12px] font-medium text-foreground">{labels.stepPasteKey}</div>
						{fields.map((field) => (
							<div key={field.envKey}>
								<div className="mb-1 flex items-center justify-between gap-2">
									<label className="text-[11px] text-muted-foreground">
										{field.label}
										{field.required ? " *" : field.optionalSuffix}
									</label>
									{field.helpUrl && field.helpUrl !== primaryHelpUrl && (
										<button
											type="button"
											className="inline-flex shrink-0 items-center gap-0.5 text-[11px] text-primary hover:underline"
											onClick={() => onOpenHelp(field.helpUrl!)}
										>
											<span className="icon-[mdi--open-in-new] h-3 w-3" />
											{labels.getKey}
										</button>
									)}
								</div>
								<InputField
									type={field.secret ? "password" : "text"}
									value={values[field.envKey] ?? ""}
									onChange={(value) => onChangeValue(field.envKey, value)}
									placeholder={field.placeholder}
								/>
							</div>
						))}
					</div>
				)}

				<p className="text-[11px] text-muted-foreground/80">{labels.privacy}</p>

				<DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
					{allowDefer && onDefer && hasFields && (
						<Button variant="ghost" size="sm" onClick={onDefer} disabled={saving} className="sm:mr-auto">
							{labels.defer}
						</Button>
					)}
					<Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
						{labels.cancel}
					</Button>
					<Button
						variant="primary"
						size="sm"
						disabled={!canSubmit || saving}
						onClick={() => onConfirm(values)}
					>
						{saving ? labels.saving : hasFields ? labels.finishConnect : labels.confirmAdd}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
