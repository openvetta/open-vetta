import type { WorkflowInstance } from "@shared/lib/api";
import { atom } from "jotai";

export const workflowInstanceAtom = atom<WorkflowInstance | null>(null);
export const workflowLoadingAtom = atom(false);
