import MagicString from "magic-string";
import * as ts from "typescript";
import { normalizePath, type Plugin, type ViteDevServer } from "vite";

export interface StyledStylesheetsOptions {
	/**
	 * The package name to match in import declarations.
	 * @default 'styled-stylesheets'
	 */
	importSource?: string;
}

export function styledStylesheets(options: StyledStylesheetsOptions = {}): Plugin {
	const { importSource = "styled-stylesheets" } = options;

	const cssModules = new Map<string, string>();
	const cssModuleImportIds = new Map<string, string>();
	const sourceCssIds = new Map<string, Set<string>>();
	let server: ViteDevServer | undefined;

	function invalidateCssModule(id: string) {
		if (!server) return;
		for (const mod of server.moduleGraph.getModulesByFile(id) ?? []) {
			server.moduleGraph.invalidateModule(mod);
		}

		const mod = server.moduleGraph.getModuleById(id);
		if (mod) server.moduleGraph.invalidateModule(mod);
	}

	function cleanupCssModulesForSource(sourceId: string, nextCssIds = new Set<string>()) {
		const previousCssIds = sourceCssIds.get(sourceId);
		if (!previousCssIds) {
			if (nextCssIds.size > 0) sourceCssIds.set(sourceId, new Set(nextCssIds));
			return;
		}

		for (const cssId of previousCssIds) {
			if (nextCssIds.has(cssId)) continue;

			const importId = cssModuleImportIds.get(cssId);
			cssModules.delete(cssId);
			cssModuleImportIds.delete(cssId);
			invalidateCssModule(cssId);
			if (importId) invalidateCssModule(importId);
		}

		if (nextCssIds.size > 0) {
			sourceCssIds.set(sourceId, new Set(nextCssIds));
		} else {
			sourceCssIds.delete(sourceId);
		}
	}

	return {
		name: "styled-stylesheets",
		enforce: "pre",

		configureServer(_server) {
			server = _server;
			_server.watcher.on("unlink", (file) => {
				cleanupCssModulesForSource(normalizePath(file));
			});
		},

		resolveId(id) {
			if (id.startsWith("__styled-stylesheets:")) return id;
		},

		load(rawId) {
			const id = rawId.split("?")[0];
			if (cssModules.has(id)) return cssModules.get(id);
		},

		transform(code, rawId) {
			const id = normalizePath(rawId.split("?")[0]);
			if (/node_modules/.test(id)) return;
			if (!/\.[cm]?[jt]sx?$/.test(id)) return;
			if (!code.includes("stylesheet")) {
				cleanupCssModulesForSource(id);
				return;
			}
			if (!hasImportSource(code, importSource)) {
				cleanupCssModulesForSource(id);
				return;
			}

			const sourceFile = ts.createSourceFile(id, code, ts.ScriptTarget.Latest, true, scriptKindFor(id));

			const importInfo = findStyledStylesheetsImport(sourceFile, importSource);
			if (!importInfo) {
				cleanupCssModulesForSource(id);
				return;
			}

			const localNames = collectLocalNames(importInfo.specifiers);
			if (localNames.size === 0) {
				cleanupCssModulesForSource(id);
				return;
			}

			const tags = findStylesheetTags(sourceFile, localNames);
			if (tags.length === 0) {
				cleanupCssModulesForSource(id);
				return;
			}

			const magicCode = new MagicString(code);
			const fileHash = djb2(id);
			const nextCssIds = new Set<string>();

			for (const [index, tag] of tags.entries()) {
				if (tag.hasExpressions) {
					this.error("[styled-stylesheets] stylesheet tag does not support interpolations.", tag.start);
				}

				const css = stripLineComments(tag.css).trim();
				const cssId = `__styled-stylesheets:${fileHash}-${index}.module.css`;
				const importId = `${cssId}?ss=${djb2(css)}`;
				nextCssIds.add(cssId);

				if (cssModules.has(cssId) && server) {
					invalidateCssModule(cssId);
					const previousImportId = cssModuleImportIds.get(cssId);
					if (previousImportId) invalidateCssModule(previousImportId);
				}

				cssModules.set(cssId, css);
				cssModuleImportIds.set(cssId, importId);
				magicCode.append(`\nimport _at${index} from "${importId}";`);
				magicCode.update(tag.start, tag.end, `_at${index}`);
			}

			cleanupCssModulesForSource(id, nextCssIds);
			magicCode.remove(importInfo.start, importInfo.end);

			return {
				code: magicCode.toString(),
				map: magicCode.generateMap({ hires: true })
			};
		}
	};
}

interface ImportInfo {
	start: number;
	end: number;
	specifiers: Map<string, "default" | "stylesheet">;
}

interface StylesheetTag {
	start: number;
	end: number;
	css: string;
	hasExpressions: boolean;
}

function findStyledStylesheetsImport(sourceFile: ts.SourceFile, importSource: string): ImportInfo | null {
	for (const node of sourceFile.statements) {
		if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === importSource) {
			const specifiers = new Map<string, "default" | "stylesheet">();
			if (node.importClause?.name) {
				specifiers.set(node.importClause.name.text, "default");
			}

			const namedBindings = node.importClause?.namedBindings;
			if (namedBindings && ts.isNamedImports(namedBindings)) {
				for (const specifier of namedBindings.elements) {
					if (!specifier.isTypeOnly) {
						const imported = (specifier.propertyName ?? specifier.name).text;
						if (imported === "stylesheet") {
							specifiers.set(specifier.name.text, "stylesheet");
						}
					}
				}
			}

			return {
				start: node.getStart(sourceFile),
				end: node.getEnd(),
				specifiers
			};
		}
	}
	return null;
}

function collectLocalNames(specifiers: Map<string, "default" | "stylesheet">): Set<string> {
	return new Set(specifiers.keys());
}

function hasImportSource(code: string, importSource: string): boolean {
	const source = importSource.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`\\bfrom\\s+["']${source}["']`).test(code);
}

function findStylesheetTags(sourceFile: ts.SourceFile, localNames: Set<string>): StylesheetTag[] {
	const nodes: StylesheetTag[] = [];

	function visit(node: ts.Node): void {
		if (ts.isTaggedTemplateExpression(node) && ts.isIdentifier(node.tag) && localNames.has(node.tag.text)) {
			const hasExpressions = ts.isTemplateExpression(node.template) && node.template.templateSpans.length > 0;
			nodes.push({
				start: node.getStart(sourceFile),
				end: node.getEnd(),
				css: ts.isNoSubstitutionTemplateLiteral(node.template) ? node.template.getText(sourceFile).slice(1, -1) : "",
				hasExpressions
			});
		}
		ts.forEachChild(node, visit);
	}

	visit(sourceFile);

	return nodes;
}

function scriptKindFor(id: string): ts.ScriptKind {
	if (id.endsWith(".tsx")) return ts.ScriptKind.TSX;
	if (id.endsWith(".jsx")) return ts.ScriptKind.JSX;
	if (id.endsWith(".js") || id.endsWith(".mjs") || id.endsWith(".cjs")) return ts.ScriptKind.JS;
	return ts.ScriptKind.TS;
}

function stripLineComments(css: string): string {
	let result = "";
	let quote: '"' | "'" | null = null;
	let inBlockComment = false;

	for (let i = 0; i < css.length; i++) {
		const char = css[i];
		const next = css[i + 1];

		if (inBlockComment) {
			result += char;
			if (char === "*" && next === "/") {
				result += next;
				i += 1;
				inBlockComment = false;
			}
			continue;
		}

		if (quote) {
			result += char;
			if (char === "\\" && i + 1 < css.length) {
				result += css[i + 1];
				i += 1;
				continue;
			}
			if (char === quote) quote = null;
			continue;
		}

		if (char === '"' || char === "'") {
			quote = char;
			result += char;
			continue;
		}

		if (char === "/" && next === "*") {
			inBlockComment = true;
			result += char;
			continue;
		}

		if (char === "/" && next === "/" && css[i - 1] !== ":") {
			while (i < css.length && css[i] !== "\n" && css[i] !== "\r") {
				i += 1;
			}
			if (i < css.length) result += css[i];
			continue;
		}

		result += char;
	}

	return result;
}

function djb2(str: string): string {
	let hash = 5381;
	for (let i = 0; i < str.length; i++) {
		hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
	}
	return (hash >>> 0).toString(36);
}
