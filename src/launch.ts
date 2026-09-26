/* SPDX-FileCopyrightText: 2025-present Kriasoft */
/* SPDX-License-Identifier: MIT */

/**
 * Default launcher: the system browser. `open` is bundled into a lazily loaded chunk,
 * so the package keeps zero runtime dependencies and flows with a custom launcher never load it.
 */
export async function openBrowser(url: URL): Promise<void> {
  const { default: open } = await import("open");
  await open(url.href, { wait: false });
}
