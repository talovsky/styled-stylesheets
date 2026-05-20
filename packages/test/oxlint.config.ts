import { defineConfig } from "oxlint"

import config from "../../oxlint.config"

export default defineConfig({
	extends: [config],
	plugins: ["jsx-a11y", "react", "react-perf"]
})
