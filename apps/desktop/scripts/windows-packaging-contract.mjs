export const WINDOWS_RELEASE_TARGETS = Object.freeze(["inno", "msi", "zip"]);

export const WINDOWS_SUPPLEMENTAL_EXTENSIONS = Object.freeze([".msi", ".zip"]);

export const WINDOWS_RELEASE_ARCHS = Object.freeze(["x64", "arm64"]);

export function windowsSupplementalArtifactNames(version, arch = "x64") {
	return WINDOWS_SUPPLEMENTAL_EXTENSIONS.map((extension) => `Vetta-${version}-win-${arch}${extension}`);
}
