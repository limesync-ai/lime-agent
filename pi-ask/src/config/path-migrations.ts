import { mkdir, readFile, rename } from "node:fs/promises";
import { dirname } from "node:path";

export interface AskConfigPathMigrationOptions {
	currentPath: string;
	legacyPaths: string[];
}

export async function migrateAskConfigPathIfNeeded({
	currentPath,
	legacyPaths,
}: AskConfigPathMigrationOptions): Promise<void> {
	if (await pathExists(currentPath)) {
		return;
	}

	const legacyPath = await findFirstExistingPath(legacyPaths);
	if (!legacyPath) {
		return;
	}

	await mkdir(dirname(currentPath), { recursive: true });
	await rename(legacyPath, currentPath);
}

async function findFirstExistingPath(
	paths: string[]
): Promise<string | undefined> {
	for (const path of paths) {
		if (await pathExists(path)) {
			return path;
		}
	}
	return;
}

async function pathExists(path: string): Promise<boolean> {
	try {
		await readFile(path, "utf-8");
		return true;
	} catch (error) {
		if (isMissingFileError(error)) {
			return false;
		}
		throw error;
	}
}

function isMissingFileError(error: unknown): boolean {
	return (
		!!error &&
		typeof error === "object" &&
		"code" in error &&
		error.code === "ENOENT"
	);
}
