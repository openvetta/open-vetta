import { cn } from "@shared/lib/utils";
import { Switch } from "@shared/components/ui/switch";
import type { WebhookEndpointPublic } from "@preload/api";
import type { WebhookSettingsModel } from "./useWebhookSettingsModel";

function WebhookEndpointRow({
	endpoint,
	model,
}: {
	endpoint: WebhookEndpointPublic;
	model: WebhookSettingsModel;
}): JSX.Element {
	const provider = model.providerByKind.get(endpoint.kind);
	const message = model.rowMessage[endpoint.id];
	const controls = (
		<div className="flex shrink-0 items-center gap-2">
			<Switch
				checked={endpoint.enabled}
				onCheckedChange={(value) => void model.actions.toggleEndpoint(endpoint, value)}
			/>
			<button
				type="button"
				onClick={() => void model.actions.testEndpoint(endpoint)}
				disabled={model.testingId === endpoint.id}
				className="whitespace-nowrap rounded-md border border-input bg-secondary px-2.5 py-1 text-[11px] text-foreground transition-colors hover:bg-accent disabled:opacity-50"
				title={model.labels.test}
			>
				{model.testingId === endpoint.id ? model.labels.testing : model.labels.test}
			</button>
			<button
				type="button"
				onClick={() => model.actions.openEdit(endpoint)}
				className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
				title={model.labels.edit}
			>
				<span className="icon-[mdi--pencil-outline] h-3.5 w-3.5" />
			</button>
			<button
				type="button"
				onClick={() => void model.actions.deleteEndpoint(endpoint)}
				className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500"
				title={model.labels.delete}
			>
				<span className="icon-[mdi--trash-can-outline] h-3.5 w-3.5" />
			</button>
		</div>
	);

	return (
		<div className="flex flex-col gap-2 px-5 py-3">
			<div className="flex items-center gap-3">
				<span className={cn(provider?.iconClass ?? "icon-[mdi--webhook]", "h-5 w-5 shrink-0 text-foreground")} />
				<div className="min-w-0 flex-1">
					<div className="flex min-w-0 items-center gap-2">
						<span className="truncate text-[13px] font-medium text-foreground">{endpoint.name}</span>
						<span className="shrink-0 whitespace-nowrap rounded-full bg-muted-foreground/15 px-1.5 py-0.5 text-[10px] text-muted-foreground">
							{provider?.displayName ?? endpoint.kind}
						</span>
						{endpoint.hasSignSecret && (
							<span className="shrink-0 whitespace-nowrap rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">
								{model.labels.sign}
							</span>
						)}
					</div>
					<div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
						{endpoint.urlMask ?? "—"}
					</div>
				</div>
				{!model.narrow && controls}
			</div>
			{model.narrow && <div className="flex justify-end">{controls}</div>}
			{message && (
				<div className={cn("pl-8 text-[11px]", message.ok ? "text-muted-foreground" : "text-red-500")}>
					{message.text}
				</div>
			)}
		</div>
	);
}

export function WebhookEndpointList({ model }: { model: WebhookSettingsModel }): JSX.Element {
	if (model.endpoints.length === 0) {
		return <div className="px-5 py-10 text-center text-[12px] text-muted-foreground">{model.labels.empty}</div>;
	}

	return (
		<div className="divide-y divide-border">
			{model.endpoints.map((endpoint) => (
				<WebhookEndpointRow key={endpoint.id} endpoint={endpoint} model={model} />
			))}
		</div>
	);
}
