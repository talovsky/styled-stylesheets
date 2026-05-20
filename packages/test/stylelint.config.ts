import type { Config } from "stylelint";

export default {
	extends: ["stylelint-config-standard", "stylelint-config-clean-order"],
	customSyntax: "@styled-stylesheets/postcss",
	rules: {
		"color-function-notation": "modern",
		"hue-degree-notation": "number",
		"no-descending-specificity": undefined,
		"number-max-precision": undefined,
		"custom-property-pattern": undefined,
		"selector-class-pattern": "^[a-z][a-zA-Z0-9]*(_[a-z][a-zA-Z0-9]*)*$"
	},

	validate: true
} satisfies Config;
