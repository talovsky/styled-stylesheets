import { parse } from "acorn";
import { describe, expect, it } from "vitest";

import { styledStylesheets } from "./vite.js";

function makeCtx() {
	return {
		parse(code: string) {
			return parse(code, { ecmaVersion: 2020, sourceType: "module" });
		},
		error(msg: string) {
			throw new Error(typeof msg === "object" ? (msg as any).message : msg);
		}
	};
}

function transform(code: string, id = "test.tsx") {
	const plugin = styledStylesheets();
	const ctx = makeCtx();
	const result = (plugin.transform as Function).call(ctx, code, id);
	const cssId = extractCssId(result?.code ?? "");
	const css = cssId ? ((plugin.load as Function).call(ctx, cssId) as string) : null;
	return { result, css, cssId };
}

/** Pulls the virtual module ID out of the generated import statement */
function extractCssId(code: string): string | null {
	const match = code.match(/import _at\d+ from "(__styled-stylesheets:[^"?]+)/);
	return match ? match[1] : null;
}

function extractCssIds(code: string): string[] {
	return [...code.matchAll(/import _at\d+ from "(__styled-stylesheets:[^"?]+)/g)].map((match) => match[1]);
}

function makeServer() {
	const handlers = new Map<string, (file: string) => void>();

	return {
		handlers,
		server: {
			watcher: {
				on(event: string, handler: (file: string) => void) {
					handlers.set(event, handler);
					return this;
				}
			},
			moduleGraph: {
				getModulesByFile() {
					return undefined;
				},
				getModuleById() {
					return undefined;
				},
				invalidateModule() {}
			}
		}
	};
}

describe("transform", () => {
	it("replaces stylesheet tag with a virtual module import", () => {
		const { result } = transform(`
      import { stylesheet } from 'styled-stylesheets';
      const styles = stylesheet\`.button { color: blue; }\`;
    `);

		expect(result).not.toBeNull();
		expect(result!.code).toMatch(/import _at0 from "__styled-stylesheets:.+\.module\.css\?ss=[a-z0-9]+"/);
		expect(result!.code).toContain("const styles = _at0");
	});

	it("removes the styled-stylesheets import declaration", () => {
		const { result } = transform(`
      import { stylesheet } from 'styled-stylesheets';
      const styles = stylesheet\`.foo { color: red; }\`;
    `);

		expect(result!.code).not.toContain("from 'styled-stylesheets'");
	});

	it("stores the extracted CSS in the virtual module", () => {
		const { css } = transform(`
      import { stylesheet } from 'styled-stylesheets';
      const styles = stylesheet\`
        .button { color: blue; }
        .text { font-size: 14px; }
      \`;
    `);

		expect(css).toContain(".button { color: blue; }");
		expect(css).toContain(".text { font-size: 14px; }");
	});

	it("changes the virtual import URL when extracted CSS changes", () => {
		const first = transform(`
      import { stylesheet } from 'styled-stylesheets';
      const styles = stylesheet\`.button { color: red; }\`;
    `);
		const second = transform(
			`
      import { stylesheet } from 'styled-stylesheets';
      const styles = stylesheet\`.button { color: blue; }\`;
    `,
			"test.tsx"
		);

		expect(first.result!.code).not.toBe(second.result!.code);
		expect(first.cssId).toBe(second.cssId);
	});

	it("removes stale virtual CSS modules when a stylesheet tag is removed", () => {
		const plugin = styledStylesheets();
		const ctx = makeCtx();
		const first = (plugin.transform as Function).call(
			ctx,
			`
      import { stylesheet } from 'styled-stylesheets';
      const a = stylesheet\`.foo { color: red; }\`;
      const b = stylesheet\`.bar { color: blue; }\`;
    `,
			"test.tsx"
		);
		const [firstCssId, staleCssId] = extractCssIds(first.code);

		(plugin.transform as Function).call(
			ctx,
			`
      import { stylesheet } from 'styled-stylesheets';
      const a = stylesheet\`.foo { color: red; }\`;
    `,
			"test.tsx"
		);

		expect((plugin.load as Function).call(ctx, firstCssId)).toContain(".foo");
		expect((plugin.load as Function).call(ctx, staleCssId)).toBeUndefined();
	});

	it("removes virtual CSS modules when styled-stylesheets is no longer used", () => {
		const plugin = styledStylesheets();
		const ctx = makeCtx();
		const first = (plugin.transform as Function).call(
			ctx,
			`
      import { stylesheet } from 'styled-stylesheets';
      const styles = stylesheet\`.foo { color: red; }\`;
    `,
			"test.tsx"
		);
		const cssId = extractCssId(first.code);

		const second = (plugin.transform as Function).call(ctx, "const styles = { foo: 'foo' };", "test.tsx");

		expect(second).toBeUndefined();
		expect((plugin.load as Function).call(ctx, cssId)).toBeUndefined();
	});

	it("removes virtual CSS modules when the source file is deleted", () => {
		const plugin = styledStylesheets();
		const ctx = makeCtx();
		const { server, handlers } = makeServer();
		(plugin.configureServer as Function)(server);

		const first = (plugin.transform as Function).call(
			ctx,
			`
      import { stylesheet } from 'styled-stylesheets';
      const styles = stylesheet\`.foo { color: red; }\`;
    `,
			"/project/src/test.tsx"
		);
		const cssId = extractCssId(first.code);

		expect((plugin.load as Function).call(ctx, cssId)).toContain(".foo");

		handlers.get("unlink")?.("/project/src/test.tsx");

		expect((plugin.load as Function).call(ctx, cssId)).toBeUndefined();
	});

	it("strips line comments from extracted CSS", () => {
		const { css } = transform(`
      import { stylesheet } from 'styled-stylesheets';
      const styles = stylesheet\`
        // .disabled { color: red; }
        .button {
          color: blue;
          // color: red;
          background-image: url(https://example.com/image.png);
        }
      \`;
    `);

		expect(css).not.toContain(".disabled");
		expect(css).not.toContain("color: red");
		expect(css).toContain("color: blue");
		expect(css).toContain("https://example.com/image.png");
	});

	it("handles multiple stylesheet tags in one file", () => {
		const code = `
      import { stylesheet } from 'styled-stylesheets';
      const a = stylesheet\`.foo { color: red; }\`;
      const b = stylesheet\`.bar { color: blue; }\`;
    `;
		const plugin = styledStylesheets();
		const ctx = makeCtx();
		const result = (plugin.transform as Function).call(ctx, code, "test.tsx");

		expect(result.code).toContain("_at0");
		expect(result.code).toContain("_at1");

		const ids = [...result.code.matchAll(/import _at\d+ from "(__styled-stylesheets:[^"]+)"/g)].map(
			(m: RegExpMatchArray) => m[1]
		);
		expect(ids).toHaveLength(2);
		expect(ids[0]).not.toBe(ids[1]);
	});

	it("supports renamed import", () => {
		const { result } = transform(`
      import { stylesheet as css } from 'styled-stylesheets';
      const styles = css\`.foo { color: red; }\`;
    `);

		expect(result).not.toBeNull();
		expect(result!.code).toContain("_at0");
	});

	it("supports default import", () => {
		const { result } = transform(`
      import stylesheet from 'styled-stylesheets';
      const styles = stylesheet\`.foo { color: red; }\`;
    `);

		expect(result).not.toBeNull();
		expect(result!.code).toContain("_at0");
	});

	it("supports css named import", () => {
		const { result } = transform(`
      import { css } from 'styled-stylesheets';
      const styles = css\`.foo { color: red; }\`;
    `);

		expect(result).not.toBeNull();
		expect(result!.code).toContain("_at0");
	});

	it("throws on interpolations", () => {
		expect(() =>
			transform(`
        import { stylesheet } from 'styled-stylesheets';
        const color = 'blue';
        const styles = stylesheet\`.foo { color: \${color}; }\`;
      `)
		).toThrow("does not support interpolations");
	});

	it("returns nothing for files without an styled-stylesheets import", () => {
		const { result } = transform(`
      const styles = { button: 'btn' };
    `);
		expect(result).toBeUndefined();
	});

	it("returns nothing for node_modules", () => {
		const { result } = transform(`import { stylesheet } from 'styled-stylesheets';`, "node_modules/some-pkg/index.tsx");
		expect(result).toBeUndefined();
	});

	it("returns nothing for non-JS files", () => {
		const { result } = transform(`import { stylesheet } from 'styled-stylesheets';`, "styles.css");
		expect(result).toBeUndefined();
	});
});

describe("resolveId / load", () => {
	it("resolves virtual styled-stylesheets module IDs", () => {
		const plugin = styledStylesheets();
		const resolved = (plugin.resolveId as Function).call({}, "__styled-stylesheets:abc-0.module.css");
		expect(resolved).toBe("__styled-stylesheets:abc-0.module.css");
	});

	it("returns null for unrelated IDs", () => {
		const plugin = styledStylesheets();
		const resolved = (plugin.resolveId as Function).call({}, "./styles.css");
		expect(resolved).toBeUndefined();
	});
});
