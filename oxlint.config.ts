import { defineConfig } from "oxlint";

export default defineConfig({
	plugins: ["eslint", "typescript", "vitest", "oxc"],
	ignores: ["node_modules", "dist", "build", "coverage"],
	categories: {
		correctness: "error",
		style: "warn"
	},
	options: {
		typeAware: true,
		typeCheck: true
	},
	env: {
		builtin: true
	},

	rules: {
		"no-console": "error"
	}
});
