import { atom } from "jotai";
import type { BrowserCapture } from "../../../shared/browser-capture";

/** Working set is saved/restored with the owning conversation's in-memory draft. */
export const browserCapturesAtom = atom<BrowserCapture[]>([]);
