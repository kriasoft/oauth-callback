/**
 * Build script to bundle HTML/CSS assets for OAuth callback pages
 * Simple minification without external dependencies
 */

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Simple CSS minification
function minifyCSS(css: string): string {
  return (
    css
      // Remove comments
      .replace(/\/\*[\s\S]*?\*\//g, "")
      // Remove unnecessary whitespace
      .replace(/\s+/g, " ")
      // Remove space around selectors
      .replace(/\s*([{}:;,>~+])\s*/g, "$1")
      // Remove trailing semicolon before closing brace
      .replace(/;}/g, "}")
      // Remove quotes from urls when possible
      .replace(/url\(["']?([^"')]+)["']?\)/g, "url($1)")
      // Remove unnecessary units from zero values
      .replace(/:\s*0(px|em|%|rem)/g, ":0")
      // Trim
      .trim()
  );
}

// Process HTML with minification
function processHTML(htmlPath: string, inlineCSS: string): string {
  let html = readFileSync(htmlPath, "utf-8");

  // Replace CSS link with inlined styles
  html = html
    .replace(
      '<link rel="stylesheet" href="./styles.css" />',
      `<style>${inlineCSS}</style>`,
    )
    .replace(
      '<link rel="stylesheet" href="./styles.css">',
      `<style>${inlineCSS}</style>`,
    );

  // Extract script content to preserve it
  const scripts: string[] = [];
  const scriptPlaceholder = "___SCRIPT_PLACEHOLDER___";

  // Extract and preserve script tags
  html = html.replace(
    /<script[^>]*>([\s\S]*?)<\/script>/g,
    (match, content) => {
      // Remove single-line comments from JavaScript
      const cleanedContent = content
        .split("\n")
        .map((line: string) => {
          // Remove // comments but preserve the code
          const commentIndex = line.indexOf("//");
          if (commentIndex !== -1) {
            return line.substring(0, commentIndex).trimEnd();
          }
          return line;
        })
        .filter((line: string) => line.trim()) // Remove empty lines
        .join(" ");

      scripts.push(`<script>${cleanedContent}</script>`);
      return scriptPlaceholder;
    },
  );

  // Minify HTML while preserving important elements
  html = html
    .replace(/<!--[\s\S]*?-->/g, "") // Remove HTML comments
    .replace(/\n\s*/g, " ") // Replace newlines and indentation with single space
    .replace(/>\s+</g, "><") // Remove spaces between tags
    .replace(/\s{2,}/g, " ") // Replace multiple spaces with single space
    .trim();

  // Restore script tags
  scripts.forEach((script) => {
    html = html.replace(scriptPlaceholder, script);
  });

  return html;
}

// Main build process
async function build() {
  try {
    // Read and minify CSS
    const css = readFileSync(join(__dirname, "styles.css"), "utf-8");
    const minifiedCSS = minifyCSS(css);

    // Process HTML templates
    const successTemplate = processHTML(
      join(__dirname, "success.html"),
      minifiedCSS,
    );
    const errorTemplate = processHTML(
      join(__dirname, "error.html"),
      minifiedCSS,
    );

    // Escape backticks in the templates for proper TypeScript output
    const escapedSuccessTemplate = successTemplate.replace(/`/g, "\\`");
    const escapedErrorTemplate = errorTemplate.replace(/`/g, "\\`");

    // Generate TypeScript module with the templates
    const output = `/**
 * Auto-generated OAuth callback HTML templates
 * Generated from templates/*.html and templates/*.css
 *
 * To regenerate: bun run templates/build.ts
 */

export const successTemplate = \`${escapedSuccessTemplate}\`;

export const errorTemplate = \`${escapedErrorTemplate}\`;

export function renderError(params: {
  error: string;
  error_description?: string;
  error_uri?: string;
}): string {
  // Determine error title and message based on error type
  let errorTitle = "Authorization Failed";
  let errorMessage = "The authorization process could not be completed.";
  let helpText = "If the problem persists, please contact support.";
  let errorSvgIcon = "";

  switch (params.error) {
    case "access_denied":
      errorTitle = "Access Denied";
      errorMessage = "You have denied access to the application.";
      helpText = 'Click "Try Again" to restart the authorization process.';
      errorSvgIcon = \`
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Access denied icon">
          <path d="M8 8l8 8M16 8l-8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>\`;
      break;
    case "invalid_request":
      errorTitle = "Invalid Request";
      errorMessage =
        "The authorization request was malformed or missing required parameters.";
      errorSvgIcon = \`
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Invalid request icon">
          <path d="M12 8v4M12 16h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>\`;
      break;
    case "unauthorized_client":
      errorTitle = "Unauthorized Client";
      errorMessage =
        "This application is not authorized to use this authentication method.";
      errorSvgIcon = \`
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Unauthorized icon">
          <path d="M12 11V7a3 3 0 00-6 0v4m-1 0h8a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6a1 1 0 011-1z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>\`;
      break;
    case "server_error":
      errorTitle = "Server Error";
      errorMessage =
        "The authorization server encountered an unexpected error.";
      helpText = "Please wait a moment and try again.";
      errorSvgIcon = \`
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Server error icon">
          <path d="M12 9v6m0 4h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>\`;
      break;
    default:
      errorSvgIcon = \`
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Warning icon">
          <path d="M12 9v4m0 4h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>\`;
  }

  let errorDetails = "";
  if (params.error_description || params.error) {
    errorDetails = \`
      <div class="minimal-error-details">
        <strong>Error Code</strong>
        <code>\${params.error}</code>
        \${params.error_description ? \`<p>\${params.error_description}</p>\` : ""}
        \${params.error_uri ? \`<p><a href="\${params.error_uri}" target="_blank">More information →</a></p>\` : ""}
      </div>\`;
  }

  return errorTemplate
    .replace(/{{ERROR_TITLE}}/g, errorTitle)
    .replace("{{ERROR_ICON}}", "⚠️") // Fallback for old template
    .replace("{{ERROR_SVG_ICON}}", errorSvgIcon)
    .replace("{{ERROR_MESSAGE}}", errorMessage)
    .replace("{{ERROR_DETAILS}}", errorDetails)
    .replace("{{HELP_TEXT}}", helpText);
}
`;

    // Write the generated module
    writeFileSync(join(__dirname, "../src/templates.ts"), output);

    console.log("✓ Templates bundled successfully to src/templates.ts");
    console.log(
      `  - Success template: ${(successTemplate.length / 1024).toFixed(2)}KB`,
    );
    console.log(
      `  - Error template: ${(errorTemplate.length / 1024).toFixed(2)}KB`,
    );
  } catch (error) {
    console.error("✗ Build failed:", error);
    process.exit(1);
  }
}

// Run the build
await build();
