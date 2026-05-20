import preact from "@preact/preset-vite";
import { styledStylesheets } from "styled-stylesheets/vite";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [preact(), styledStylesheets()]
});
