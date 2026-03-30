import type { FlowingTransferVO } from "@shared/lib/api";
import { atom } from "jotai";

export const flowingPendingListAtom = atom<FlowingTransferVO[]>([]);
export const flowingPendingCountAtom = atom<number>(0);
export const flowingSendDialogOpenAtom = atom<boolean>(false);
export const selectedFilesAtom = atom<string[]>([]);
