import { Button } from "@shared/components/ui/button";
import { Input } from "@shared/components/ui/input";
import { cn } from "@shared/lib/utils";
import type { WebhookEndpointListView } from "@vetta-org/theme-ui/settings";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Switch,
} from "@vetta-org/ui";
import { useId, useState } from "react";
import type { WebhookFormState, WebhookSettingsModel } from "./useWebhookSettingsModel";

function WebhookTextField({
	className,
	label,
	onChange,
	placeholder,
	type = "text",
	value,
}: {
	className?: string;
	label: React.ReactNode;
	onChange: (value: string) => void;
	placeholder?: string;
	type?: "password" | "text";
	value: string;
}): JSX.Element {
	const id = useId();
	return (
		<div>
			<label htmlFor={id} className="mb-1 block text-[12px] font-medium text-foreground">
				{label}
			</label>
			<Input
				id={id}
				type={type}
				value={value}
				onChange={(event) => onChange(event.target.value)}
				placeholder={placeholder}
				className={cn("text-[12px]", className)}
			/>
		</div>
	);
}

function ProviderPicker({ model, isEdit }: { isEdit: boolean; model: WebhookSettingsModel }): JSX.Element {
	return (
		<fieldset className="min-w-0">
			<legend className="mb-1 text-[12px] font-medium text-foreground">{model.labels.channelType}</legend>
			<div className="flex gap-2">
				{model.providers.map((provider) => (
					<button
						key={provider.kind}
						type="button"
						aria-pressed={model.form.kind === provider.kind}
						disabled={isEdit && provider.kind !== model.form.kind}
						onClick={() => model.actions.updateFormField("kind", provider.kind)}
						className={cn(
							"flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-[12px] outline-none transition-colors focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring",
							model.form.kind === provider.kind
								? "border-primary bg-primary/10 text-foreground"
								: "border-input bg-secondary text-muted-foreground hover:bg-accent",
							isEdit && provider.kind !== model.form.kind && "opacity-40",
						)}
					>
						{provider.iconClass && <span className={cn(provider.iconClass, "h-4 w-4")} />}
						{provider.displayName}
					</button>
				))}
			</div>
			{isEdit && (
				<div className="mt-1 text-[11px] text-muted-foreground">
					{model.labels.channelLocked} {model.labels.channelType}
				</div>
			)}
		</fieldset>
	);
}

function SecretField({ model }: { model: WebhookSettingsModel }): JSX.Element {
	const [showSecret, setShowSecret] = useState(false);
	const id = useId();

	return (
		<div>
			<label htmlFor={id} className="mb-1 block text-[12px] font-medium text-foreground">
				{model.labels.secret} <span className="text-muted-foreground">{model.labels.secretHint}</span>
			</label>
			<div className="flex items-center gap-1.5">
				<Input
					id={id}
					type={showSecret ? "text" : "password"}
					value={model.form.signSecret}
					onChange={(event) => model.actions.updateFormField("signSecret", event.target.value)}
					placeholder={model.form.kind === "feishu" ? "secret" : "SECxxxx"}
					className="flex-1 text-[12px]"
				/>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					onClick={() => setShowSecret((value) => !value)}
					aria-label={showSecret ? model.labels.hide : model.labels.show}
				>
					<span
						className={cn(
							showSecret ? "icon-[solar--eye-closed-linear]" : "icon-[solar--eye-linear]",
							"h-3.5 w-3.5",
						)}
					/>
				</Button>
			</div>
		</div>
	);
}

function MentionOptions({ model }: { model: WebhookSettingsModel }): JSX.Element {
	if (model.form.kind === "feishu") {
		return (
			<div className="flex items-center justify-between rounded-md border border-input bg-secondary px-3 py-2">
				<div className="text-[12px] text-foreground">
					{model.labels.atAll}
					<div className="text-[11px] text-muted-foreground">{model.labels.atAllDesc}</div>
				</div>
				<Switch
					aria-label={model.labels.atAll}
					checked={model.form.feishuMentionAll}
					onCheckedChange={(value) => model.actions.updateFormField("feishuMentionAll", value)}
				/>
			</div>
		);
	}

	return (
		<>
			<div className="flex items-center justify-between rounded-md border border-input bg-secondary px-3 py-2">
				<div className="text-[12px] text-foreground">
					{model.labels.atAll}
					<div className="text-[11px] text-muted-foreground">{model.labels.atAllPerm}</div>
				</div>
				<Switch
					aria-label={model.labels.atAll}
					checked={model.form.dingtalkMentionAll}
					onCheckedChange={(value) => model.actions.updateFormField("dingtalkMentionAll", value)}
				/>
			</div>
			<WebhookTextField
				label={
					<>
						{model.labels.atPhone} <span className="text-muted-foreground">{model.labels.atPhoneSuffix}</span>
					</>
				}
				value={model.form.dingtalkAtMobiles}
				onChange={(value) => model.actions.updateFormField("dingtalkAtMobiles", value)}
				placeholder="13800138000, 13900139000"
			/>
			<WebhookTextField
				label={
					<>
						{model.labels.keyword} <span className="text-muted-foreground">{model.labels.keywordDesc}</span>
					</>
				}
				value={model.form.dingtalkKeyword}
				onChange={(value) => model.actions.updateFormField("dingtalkKeyword", value)}
				placeholder={model.labels.keywordPlaceholder}
			/>
		</>
	);
}

function webhookUrlPlaceholder(form: WebhookFormState): string {
	return form.kind === "feishu"
		? "https://open.feishu.cn/open-apis/bot/v2/hook/xxxx"
		: "https://oapi.dingtalk.com/robot/send?access_token=xxxx";
}

export function WebhookEditorDialog({ model }: { model: WebhookSettingsModel }): JSX.Element {
	const isEdit = model.editingId !== null;

	return (
		<Dialog open={model.editorOpen} onOpenChange={model.actions.closeEditor}>
			<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[480px]">
				<DialogHeader>
					<DialogTitle>{isEdit ? model.labels.editTitle : model.labels.addTitle}</DialogTitle>
					<DialogDescription>{isEdit ? model.labels.editHint : model.labels.addHint}</DialogDescription>
				</DialogHeader>

				<form
					className="space-y-3 py-2"
					onSubmit={(event) => {
						event.preventDefault();
						if (!model.saving) void model.actions.submit();
					}}
				>
					<ProviderPicker model={model} isEdit={isEdit} />
					<WebhookTextField
						label={model.labels.name}
						value={model.form.name}
						onChange={(value) => model.actions.updateFormField("name", value)}
						placeholder={model.labels.namePlaceholder}
					/>
					<WebhookTextField
						label={
							<>
								{model.labels.url}
								{isEdit && <span className="ml-1 text-muted-foreground">{model.labels.urlEditHint}</span>}
							</>
						}
						value={model.form.webhookUrl}
						onChange={(value) => model.actions.updateFormField("webhookUrl", value)}
						placeholder={webhookUrlPlaceholder(model.form)}
						className="font-mono text-[11px]"
					/>
					<SecretField model={model} />
					<MentionOptions model={model} />

					<div className="min-h-[18px] text-[12px]">
						{model.editorError && (
							<span role="alert" className="text-destructive">
								{model.editorError}
							</span>
						)}
					</div>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => model.actions.closeEditor(false)}
							disabled={model.saving}
						>
							{model.labels.cancel}
						</Button>
						<Button type="submit" variant="primary" size="sm" disabled={model.saving}>
							{model.saving ? model.labels.saving : model.labels.save}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

export type ThemeUiLink_WebhookEndpointListView = typeof WebhookEndpointListView;
