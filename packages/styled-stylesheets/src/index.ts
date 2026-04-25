/**
 * Runtime stub for the stylesheet tag.
 * Should never be called — the Vite plugin replaces all usages at build time.
 */
export function stylesheet(_template: TemplateStringsArray, ..._exprs: never[]): Record<string, string> {
	throw new Error(
		"[styled-stylesheets] stylesheet tag was not compiled away. " +
			"Make sure the styled-stylesheets Vite plugin is configured."
	);
}

export default stylesheet;
