import { defineConfig } from "oxfmt";

export default defineConfig({
	useTabs: true,
	arrowParens: "avoid",
	trailingComma: "none",
	printWidth: 120,
	sortImports: true,
	ignorePatterns: ["node_modules", "dist"]
});
