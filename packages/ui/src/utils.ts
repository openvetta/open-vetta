export type ClassValue = string | false | null | undefined;

export function cn(...parts: ClassValue[]): string {
	return parts.filter(Boolean).join(" ");
}
