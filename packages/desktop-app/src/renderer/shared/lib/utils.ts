import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
	return twMerge(clsx(inputs));
}

/** Extract display name from a project path, handling both / and \ separators */
export function pathBasename(path: string): string {
	return path.split(/[/\\]/).filter(Boolean).pop() ?? path;
}
