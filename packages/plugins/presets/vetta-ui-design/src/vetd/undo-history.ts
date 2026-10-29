import type { VetdFrameEntry } from "./manifest-types";

/**
 * 画布上用户操作的撤销 / 重做栈（纯逻辑，不碰文件系统）。
 *
 * 只撤销用户自己的操作，不回滚 agent 的改动（Figma 的做法）：每条记录带着「这一步之后」
 * 的状态，执行撤销前先核对 frame 现在是否还是那个状态，不是（agent 在中间改过）就放弃这
 * 一条并提示，而不是静默覆盖。agent 的改动由版本历史兜底。
 */

/** 一次用户操作的类别；界面据此显示「撤销 xxx」。 */
export type UndoKind = "move" | "resize" | "arrange" | "radius" | "size" | "expand" | "create" | "delete" | "rename";

/** manifest 里属于「用户在画布上调的」那几个字段。radius 缺省 = 默认圆角，expanded 缺省 = 收起。 */
export interface FrameFields {
	x: number;
	y: number;
	width: number;
	height: number;
	radius?: number;
	expanded?: true;
}

export type UndoEntry =
	| {
			type: "patch";
			kind: UndoKind;
			changes: { id: string; before: FrameFields; after: FrameFields }[];
	  }
	| { type: "create"; id: string; source: string; fields: FrameFields }
	| { type: "delete"; id: string; source: string; fields: FrameFields }
	| { type: "rename"; id: string; before: string; after: string };

export function entryKind(entry: UndoEntry): UndoKind {
	return entry.type === "patch" ? entry.kind : entry.type;
}

/** 栈深上限：够用，也限制了删除记录里保存的源码占多少内存。 */
export const UNDO_LIMIT = 100;

export function fieldsOf(frame: Pick<VetdFrameEntry, "x" | "y" | "width" | "height" | "radius" | "expanded">): FrameFields {
	return {
		x: frame.x,
		y: frame.y,
		width: frame.width,
		height: frame.height,
		...(frame.radius !== undefined ? { radius: frame.radius } : {}),
		...(frame.expanded === true ? { expanded: true as const } : {}),
	};
}

export function sameFields(a: FrameFields, b: FrameFields): boolean {
	return (
		a.x === b.x &&
		a.y === b.y &&
		a.width === b.width &&
		a.height === b.height &&
		a.radius === b.radius &&
		(a.expanded === true) === (b.expanded === true)
	);
}

export class UndoHistory {
	private undoStack: UndoEntry[] = [];
	private redoStack: UndoEntry[] = [];

	/** 新的用户操作：入撤销栈，重做栈作废。 */
	record(entry: UndoEntry): void {
		this.undoStack.push(entry);
		if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
		this.redoStack = [];
	}

	get undoTop(): UndoEntry | undefined {
		return this.undoStack.at(-1);
	}

	get redoTop(): UndoEntry | undefined {
		return this.redoStack.at(-1);
	}

	get canUndo(): boolean {
		return this.undoStack.length > 0;
	}

	get canRedo(): boolean {
		return this.redoStack.length > 0;
	}

	/** 撤销成功：这条从撤销栈挪到重做栈。 */
	markUndone(): void {
		const entry = this.undoStack.pop();
		if (entry) this.redoStack.push(entry);
	}

	/** 重做成功：挪回撤销栈（不清重做栈里剩下的）。 */
	markRedone(): void {
		const entry = this.redoStack.pop();
		if (entry) this.undoStack.push(entry);
	}

	/** 冲突：放弃栈顶这一条，两个栈都不留。 */
	dropUndoTop(): void {
		this.undoStack.pop();
	}

	dropRedoTop(): void {
		this.redoStack.pop();
	}

	clear(): void {
		this.undoStack = [];
		this.redoStack = [];
	}
}
