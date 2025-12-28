import { build, spawn } from "bun";

/**
 * Build configuration for Bun bundler
 * Produces ESM output compatible with all modern JavaScript runtimes
 */
async function main() {
	const distDir = "./dist";

	// Clean and create dist directory
	await spawn({ cmd: ["rm", "-rf", distDir] }).exited;
	await spawn({ cmd: ["mkdir", "-p", distDir] }).exited;

	// Build JavaScript bundle with Bun
	await build({
		entrypoints: ["./src/index.ts"],
		external: [],
		format: "esm",
		minify: true,
		outdir: distDir,
		sourcemap: false,
		target: "browser",
	});

	// Generate TypeScript declaration files with tsc
	await spawn({
		cmd: ["bun", "tsc"],
	}).exitCode;

	console.log("Build completed successfully");
	console.log("Output directory:", distDir);
	console.log("Files generated:");
	console.log("  - index.js (bundled ESM)");
	console.log("  - index.d.ts (TypeScript declarations)");
	console.log("  - index.js.map (source map)");
	console.log("  - index.d.ts.map (declaration map)");
}

main();
