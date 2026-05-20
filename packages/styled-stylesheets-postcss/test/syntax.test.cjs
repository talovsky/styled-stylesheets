const assert = require("node:assert/strict");
const test = require("node:test");
const postcss = require("postcss");
const syntax = require("../dist/index.cjs");

test("parses stylesheet templates as CSS roots", () => {
	const document = syntax.parse("const styles = stylesheet`.body { color: red; }`;", {
		from: "example.tsx"
	});

	assert.equal(document.nodes.length, 1);
	assert.equal(document.first.first.selector, ".body");
	assert.equal(document.first.first.first.prop, "color");
	assert.equal(document.first.first.first.value, "red");
	assert.equal(document.first.raws.codeBefore, "const styles = stylesheet`");
	assert.equal(document.first.raws.codeAfter, "`;");
});

test("ignores non-stylesheet tagged templates", () => {
	const document = syntax.parse("const styles = styled.div`.body { color: red; }`;", {
		from: "example.tsx"
	});

	assert.equal(document.nodes.length, 0);
});

test("parses real CSS files as regular CSS", () => {
	const root = syntax.parse(".body { color: red; }", {
		from: "example.css"
	});

	assert.equal(root.nodes.length, 1);
	assert.equal(root.first.selector, ".body");
	assert.equal(root.first.first.prop, "color");
	assert.equal(root.first.first.value, "red");
});

test("preserves source around transformed CSS", async () => {
	const result = await postcss([
		root => {
			root.first.first.append({
				prop: "background",
				value: "blue"
			});
		}
	]).process("const styles = stylesheet`.body { color: red; }`;", {
		from: "example.tsx",
		syntax
	});

	assert.equal(result.css, "const styles = stylesheet`.body { color: red; background: blue; }`;");
});

test("rejects stylesheet interpolations", () => {
	assert.throws(() => {
		syntax.parse("const styles = stylesheet`.body { color: ${red}; }`;", {
			from: "example.tsx"
		});
	}, /stylesheet tag does not support interpolations/);
});

test("supports stylesheet type arguments", () => {
	const document = syntax.parse("const styles = stylesheet<{ body: string }>`\n.body { color: red; }\n`;", {
		from: "example.tsx"
	});

	assert.equal(document.nodes.length, 1);
	assert.equal(document.first.first.selector, ".body");
	assert.deepEqual(document.first.first.source.start, {
		offset: 45,
		line: 2,
		column: 1
	});
});

test("supports stylesheet imported as css", () => {
	const document = syntax.parse(
		"import { stylesheet as css } from 'styled-stylesheets';\nconst styles = css`.body { color: red; }`;",
		{
			from: "example.tsx"
		}
	);

	assert.equal(document.nodes.length, 1);
	assert.equal(document.first.first.selector, ".body");
});

test("supports css named import", () => {
	const document = syntax.parse("import { css } from 'styled-stylesheets';\nconst styles = css`.body { color: red; }`;", {
		from: "example.tsx"
	});

	assert.equal(document.nodes.length, 1);
	assert.equal(document.first.first.selector, ".body");
});
