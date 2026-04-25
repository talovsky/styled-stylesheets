import rawPatternFile from "../syntaxes/styled-stylesheets.json";

export const patterns = rawPatternFile.patterns;

/**
 * Converts POSIX bracket expressions to JavaScript-compatible regex character classes.
 */
export const normalizeRegex = (regex: string) =>
	regex
		.replace(/\[:alnum:\]/g, "a-zA-Z0-9")
		.replace(/\[:alpha:\]/g, "a-zA-Z")
		.replace(/\[:ascii:\]/g, "\\x00-\\x7F")
		.replace(/\[:blank:\]/g, " \\t")
		.replace(/\[:digit:\]/g, "0-9")
		.replace(/\[:lower:\]/g, "a-z")
		.replace(/\[:upper:\]/g, "A-Z")
		.replace(/\[:word:\]/g, "a-zA-Z0-9_")
		.replace(/\[:space:\]/g, " \\t\\r\\n\\v\\f");
