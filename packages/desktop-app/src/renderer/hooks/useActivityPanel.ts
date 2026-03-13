import { useAtom } from "jotai";
import { useCallback, useEffect } from "react";
import { activityPanelOpenAtom, selectedFilePathAtom } from "../store/atoms";

export function useActivityPanel() {
	const [selectedPath, setSelectedPath] = useAtom(selectedFilePathAtom);
	const [isOpen, setIsOpen] = useAtom(activityPanelOpenAtom);

	// Auto-open panel when a file is selected
	useEffect(() => {
		if (selectedPath) {
			setIsOpen(true);
		}
	}, [selectedPath, setIsOpen]);

	const close = useCallback(() => {
		setIsOpen(false);
		setSelectedPath(null);
	}, [setIsOpen, setSelectedPath]);

	return { isOpen, selectedPath, close };
}
