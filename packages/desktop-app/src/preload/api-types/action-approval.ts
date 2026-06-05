export type DesktopActionJsonPrimitive = string | number | boolean | null;
export type DesktopActionJsonValue =
	| DesktopActionJsonPrimitive
	| DesktopActionJsonValue[]
	| { [key: string]: DesktopActionJsonValue };

export interface DesktopActionApprovalRequest {
	approvalId: string;
	actionId: string;
	input: DesktopActionJsonValue;
	title: string;
	summary: string;
	permission: string;
}

export interface DesktopActionApprovalApi {
	onRequest(handler: (request: DesktopActionApprovalRequest) => void): () => void;
	respond(approvalId: string, approved: boolean): Promise<boolean>;
}
