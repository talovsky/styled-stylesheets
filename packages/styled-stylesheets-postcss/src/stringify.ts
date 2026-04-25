import type { Builder, Document, Root, Stringifier as PostCSSStringifier } from "postcss";

import Stringifier from "./stringifier.js";

const stringify: PostCSSStringifier = (node, builder: Builder) => {
	const str = new Stringifier(builder);

	str.stringify(node as Document | Root);
};

export default stringify;
