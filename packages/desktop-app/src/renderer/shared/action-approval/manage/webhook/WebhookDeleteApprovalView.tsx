import {
	ApprovalImpactCard,
	ApprovalRawFallback,
	ApprovalTargetCard,
	ApprovalWarningCard,
} from "../ApprovalParts";
import { ManageActionApprovalFrameView } from "../ManageActionApprovalFrameView";
import type { WebhookDeleteApprovalModel } from "./useWebhookDeleteApprovalModel";

export function WebhookDeleteApprovalView(model: WebhookDeleteApprovalModel): JSX.Element {
	const { frame, input, rawInput, target, impactTitle, impactDescription, warning } = model;
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
						icon="icon-[mdi--delete-outline]"
						title={impactTitle}
						description={impactDescription}
						destructive
					/>
					<ApprovalWarningCard>{warning}</ApprovalWarningCard>
				</>
			) : (
				<ApprovalRawFallback input={rawInput} />
			)}
		</ManageActionApprovalFrameView>
	);
}
