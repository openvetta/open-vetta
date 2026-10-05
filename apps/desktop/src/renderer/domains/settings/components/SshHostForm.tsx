import { Button } from "@shared/components/ui/button";
import { useEffect, useId, useRef } from "react";
import { InputField } from "./SettingsFormFields";
import type { SshHostsSettingsModel } from "./useSshHostsSettingsModel";

/**
 * 新增/编辑主机的就地展开表单。
 *
 * 不做成对话框：新增主机是设置页里的常规操作，弹窗会遮住已有列表，用户没法一边填
 * 一边对照已有条目（比如确认别名有没有重复）。
 *
 * 字段只留四个。ProxyJump、跳板、IdentityAgent 这些一律交给 `~/.ssh/config`——
 * OpenSSH 会在连接时自己解析，在这里再抄一份只会与用户后续的修改漂移。
 */
export function SshHostForm({ model, heading }: { model: SshHostsSettingsModel; heading: string }): JSX.Element {
	const { labels, form, actions } = model;
	const canSubmit = form.target.trim().length > 0 && !model.saving;
	const formId = useId();
	const targetRef = useRef<HTMLInputElement>(null);
	useEffect(() => {
		targetRef.current?.focus();
	}, []);

	return (
		<form
			className="flex flex-col gap-3 border-b border-border px-5 py-4"
			onSubmit={(event) => {
				event.preventDefault();
				if (canSubmit) void actions.submit();
			}}
		>
			<p className="text-[13px] font-medium text-foreground">{heading}</p>

			<Field inputId={`${formId}-target`} label={labels.fieldTarget} hint={labels.fieldTargetHint}>
				<InputField
					id={`${formId}-target`}
					ref={targetRef}
					value={form.target}
					onChange={(value) => actions.setForm({ target: value })}
					placeholder="build-01"
					aria-label={labels.fieldTarget}
				/>
			</Field>

			<Field inputId={`${formId}-label`} label={labels.fieldLabel} hint={labels.fieldLabelHint}>
				<InputField
					id={`${formId}-label`}
					value={form.label}
					onChange={(value) => actions.setForm({ label: value })}
					placeholder={form.target}
					aria-label={labels.fieldLabel}
				/>
			</Field>

			<Field inputId={`${formId}-port`} label={labels.fieldPort}>
				<InputField
					id={`${formId}-port`}
					value={form.port}
					onChange={(value) => actions.setForm({ port: value.replace(/\D/g, "") })}
					placeholder="22"
					aria-label={labels.fieldPort}
				/>
			</Field>

			<Field inputId={`${formId}-identity`} label={labels.fieldIdentityFile} hint={labels.fieldIdentityFileHint}>
				<InputField
					id={`${formId}-identity`}
					value={form.identityFile}
					onChange={(value) => actions.setForm({ identityFile: value })}
					placeholder="~/.ssh/id_ed25519"
					aria-label={labels.fieldIdentityFile}
				/>
			</Field>

			{model.formError !== null && (
				<p role="alert" className="text-[12px] text-destructive">
					{model.formError}
				</p>
			)}

			<div className="flex items-center gap-2">
				<Button type="submit" variant="primary" size="sm" disabled={!canSubmit}>
					{labels.save}
				</Button>
				<Button type="button" variant="ghost" size="sm" onClick={actions.cancelEdit}>
					{labels.cancel}
				</Button>
			</div>
		</form>
	);
}

/** 可见 label + 可选说明。占位符不能替代 label——一开始输入它就消失了。 */
function Field({
	inputId,
	label,
	hint,
	children,
}: {
	inputId: string;
	label: string;
	hint?: string;
	children: React.ReactNode;
}): JSX.Element {
	return (
		<label htmlFor={inputId} className="flex flex-col gap-1.5">
			<span className="text-[12px] font-medium text-foreground">{label}</span>
			{children}
			{hint !== undefined && <span className="text-[11px] text-muted-foreground">{hint}</span>}
		</label>
	);
}
