import type { ComponentType } from "react";
import { useThemeModule } from "./context";

export function useThemeRegion<TProps>(id: string): ComponentType<TProps> | undefined {
	const theme = useThemeModule();
	const region = theme.regions?.[id];
	return region as ComponentType<TProps> | undefined;
}
