// Shared by staging and the CLI so default release targets cannot drift.
export const linuxPackagingConfig = {
	linux: {
		target: ["AppImage", "deb", "rpm"],
		category: "Utility",
		icon: "build/icon.png",
		maintainer: "Vetta",
		vendor: "Vetta",
	},
	deb: {
		artifactName: "${name}_${version}_${arch}.${ext}",
		// Keep electron-builder's default dependencies and add Electron's audio runtime.
		fpm: ["--depends=libasound2"],
	},
	rpm: {
		artifactName: "${name}-${version}.${arch}.${ext}",
		fpm: ["--depends=libasound.so.2()(64bit)"],
	},
};
