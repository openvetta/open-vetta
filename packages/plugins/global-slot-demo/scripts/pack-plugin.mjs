import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(await readFile(join(root, "plugin.json"), "utf-8"));
const releaseDir = join(root, "release");
const outputPath = join(releaseDir, `${manifest.id}-${manifest.version}.zip`);

const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i += 1) {
	let value = i;
	for (let bit = 0; bit < 8; bit += 1) {
		value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
	}
	crcTable[i] = value >>> 0;
}

function crc32(buffer) {
	let value = 0xffffffff;
	for (const byte of buffer) {
		value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
	}
	return (value ^ 0xffffffff) >>> 0;
}

function writeUInt16(value) {
	const buffer = Buffer.allocUnsafe(2);
	buffer.writeUInt16LE(value, 0);
	return buffer;
}

function writeUInt32(value) {
	const buffer = Buffer.allocUnsafe(4);
	buffer.writeUInt32LE(value >>> 0, 0);
	return buffer;
}

async function collectFiles(dir, prefix = "") {
	const entries = await readdir(dir, { withFileTypes: true });
	const files = [];
	for (const entry of entries) {
		const fullPath = join(dir, entry.name);
		const archivePath = prefix ? `${prefix}/${entry.name}` : entry.name;
		if (entry.isDirectory()) {
			files.push(...(await collectFiles(fullPath, archivePath)));
		} else if (entry.isFile()) {
			files.push({ fullPath, archivePath });
		}
	}
	return files;
}

async function createZip(files) {
	const localParts = [];
	const centralParts = [];
	let offset = 0;

	for (const file of files) {
		const data = await readFile(file.fullPath);
		const name = Buffer.from(file.archivePath.replace(/\\/g, "/"));
		const checksum = crc32(data);
		const localHeader = Buffer.concat([
			writeUInt32(0x04034b50),
			writeUInt16(20),
			writeUInt16(0),
			writeUInt16(0),
			writeUInt16(0),
			writeUInt16(0),
			writeUInt32(checksum),
			writeUInt32(data.length),
			writeUInt32(data.length),
			writeUInt16(name.length),
			writeUInt16(0),
			name,
		]);
		localParts.push(localHeader, data);

		centralParts.push(
			Buffer.concat([
				writeUInt32(0x02014b50),
				writeUInt16(20),
				writeUInt16(20),
				writeUInt16(0),
				writeUInt16(0),
				writeUInt16(0),
				writeUInt16(0),
				writeUInt32(checksum),
				writeUInt32(data.length),
				writeUInt32(data.length),
				writeUInt16(name.length),
				writeUInt16(0),
				writeUInt16(0),
				writeUInt16(0),
				writeUInt16(0),
				writeUInt32(0),
				writeUInt32(offset),
				name,
			]),
		);
		offset += localHeader.length + data.length;
	}

	const centralDirectory = Buffer.concat(centralParts);
	const endOfCentralDirectory = Buffer.concat([
		writeUInt32(0x06054b50),
		writeUInt16(0),
		writeUInt16(0),
		writeUInt16(files.length),
		writeUInt16(files.length),
		writeUInt32(centralDirectory.length),
		writeUInt32(offset),
		writeUInt16(0),
	]);

	return Buffer.concat([...localParts, centralDirectory, endOfCentralDirectory]);
}

await rm(releaseDir, { recursive: true, force: true });
await mkdir(releaseDir, { recursive: true });

const distFiles = await collectFiles(join(root, "dist"), "dist");
const files = [{ fullPath: join(root, "plugin.json"), archivePath: "plugin.json" }, ...distFiles].sort((a, b) =>
	relative(root, a.fullPath).localeCompare(relative(root, b.fullPath)),
);
await writeFile(outputPath, await createZip(files));

console.log(`Wrote ${basename(outputPath)}`);
