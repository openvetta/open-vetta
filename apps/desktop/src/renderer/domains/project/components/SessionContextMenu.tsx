import type { SessionContextMenuSession } from "@shared/store/atoms";
import { SessionContextMenuView } from "@vetta-org/theme-ui/project/SessionContextMenuView";
import { createPortal } from "react-dom";
import { useSessionContextMenuModel } from "../hooks/useSessionContextMenuModel";

import { useMoveSpaceMenu } from "../hooks/useMoveSpaceMenu";

interface SessionContextMenuProps {
	x: number;
	y: number;
	session: SessionContextMenuSession;
	allowMutations: boolean;
	canTag: boolean;
	independent?: boolean;
	onClose: () => void;
	onDelete: (session: SessionContextMenuSession) => void;
}

export function SessionContextMenu({
	x,
	y,
	session,
	allowMutations,
	canTag,
	independent,
	onClose,
	onDelete,
}: SessionContextMenuProps): JSX.Element {
	const model = useSessionContextMenuModel(session, allowMutations, canTag, onClose, onDelete);
	const move = useMoveSpaceMenu(independent ? { kind: "conversation", key: "teamSessionId" in session ? session.teamSessionId : session.path } : undefined, onClose);
	return createPortal(<SessionContextMenuView {...model} extraItems={move ? [...(model.extraItems ?? []), move] : model.extraItems} x={x} y={y} />, document.body);
}
