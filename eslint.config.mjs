import { defineConfig, globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
	globalIgnores(["node_modules", "main.js", "esbuild.config.mjs", "version-bump.mjs", "tests"]),
	...obsidianmd.configs.recommended,
	{
		languageOptions: {
			parserOptions: {
				projectService: {
					allowDefaultProject: ["eslint.config.mjs"],
				},
			},
		},
		rules: {
			"obsidianmd/ui/sentence-case": ["warn", { ignoreWords: ["WordPress"] }],
			// Settings search needs getSettingDefinitions (1.13+); minAppVersion is 1.11.4.
			"obsidianmd/settings-tab/prefer-setting-definitions": "off",
		},
	},
]);
