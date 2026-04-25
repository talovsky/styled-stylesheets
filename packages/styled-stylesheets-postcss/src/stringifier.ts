import type { Builder, Document, Root } from "postcss";
import BaseStringifier from "postcss/lib/stringifier";

const PostCSSStringifier = BaseStringifier.default || BaseStringifier;

type StringifierConstructor = new (builder: Builder) => {
	builder: Builder;
	body(node: unknown): void;
	stringify(node: unknown): void;
};

type StyledRootRaws = Root["raws"] & {
	codeBefore?: string;
	codeAfter?: string;
};

class Stringifier extends (PostCSSStringifier as StringifierConstructor) {
	document(node: Document): void {
		if (node.nodes.length === 0) {
			this.builder(node.source?.input.css ?? "");
			return;
		}

		this.body(node);
	}

	root(node: Root): void {
		const raws = node.raws as StyledRootRaws;

		if (raws.codeBefore) {
			this.builder(raws.codeBefore);
		}

		this.body(node);

		if (raws.after) {
			this.builder(raws.after);
		}

		if (raws.codeAfter) {
			this.builder(raws.codeAfter);
		}
	}
}

export default Stringifier;
