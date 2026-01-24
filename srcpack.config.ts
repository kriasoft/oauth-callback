/**
 * Srcpack Configuration
 *
 * Bundles source code into LLM-optimized context files (.srcpack/*.txt).
 * Each bundle creates a single file with an index header and file contents.
 *
 * Usage:
 *   bun srcpack              # Generate all bundles
 *   bun srcpack src          # Generate specific bundle
 *
 * @see https://kriasoft.com/srcpack/
 */
import { defineConfig } from "srcpack";

export default defineConfig({
  outDir: ".srcpack",
  bundles: {
    // Core library: types, implementation, and project context
    src: ["src/**/*", "README.md", "CLAUDE.md", "+CLAUDE.local.md"],
    // HTML templates for OAuth callback pages (success/error)
    templates: "templates/**/*",
    // Unit and integration tests
    test: "test/**/*",
    // Build and dev scripts
    scripts: "scripts/**/*",
    // VitePress documentation site
    docs: "docs/**/*",
    // Usage examples (GitHub, Notion OAuth demos)
    examples: "examples/**/*",
  },
});
