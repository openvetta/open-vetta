import { useSetAtom } from "jotai";
import { useEffect } from "react";
import { enqueueActionApprovalAtom } from "../store/action-approval-atoms";

export function ActionApprovalCenter(): null {
	const enqueue = useSetAtom(enqueueActionApprovalAtom);

	useEffect(() => {
		return window.vetta.actionApproval.onRequest((request) => {
			enqueue(request);
		});
	}, [enqueue]);

	return null;
}
