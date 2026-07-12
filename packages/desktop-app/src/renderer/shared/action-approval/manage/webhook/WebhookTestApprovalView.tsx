import {
	ApprovalImpactCard,
	ApprovalRawFallback,
	ApprovalTargetCard,
} from "../ApprovalParts";
import { ManageActionApprovalFrameView } from "../ManageActionApprovalFrameView";
import type { WebhookTestApprovalModel } from "./useWebhookTestApprovalModel";

export function WebhookTestApprovalView(model: WebhookTestApprovalModel): JSX.Element {
	const { frame, input, rawInput, target, impactTitle, impactDescription } = model;
	return (
		<ManageActionApprovalFrameView {...frame}>
			{input ? (
				<>
					<ApprovalTargetCard
						icon="icon-[mdi--webhook]"
						title={target.title}
						subtitle={target.subtitle}
					/>
					<ApprovalImpactCard
						icon="icon-[mdi--test-tube]"
						title={impactTitle}
						description={impactDescription}
					/>
				</>
			) : (
				<ApprovalRawFallback input={rawInput} />
			)}
		</ManageActionApprovalFrameView>
	);
}
