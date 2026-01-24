# Contributing

## Setup

```bash
git clone https://github.com/kriasoft/oauth-callback.git
cd oauth-callback
bun install
```

## Development

```bash
bun run build         # Build the package
bun run test          # Run unit tests
bun run typecheck     # Check TypeScript types
bun run validate      # Run all checks (format, typecheck, test, publint)
```

## Testing Locally

```bash
bun run example:demo  # Interactive demo with mock OAuth server
bun run test:login    # Manual browser test for page rendering
```

## Pull Requests

- Keep changes focused and minimal
- Run `bun run validate` before submitting
- Use clear commit messages that explain the "why"

## Project Structure

- `src/` - Source code
- `templates/` - HTML templates (run `bun run build:templates` after changes)
- `examples/` - Usage examples
- `docs/` - Documentation site (VitePress)

## Questions?

Open an issue or join us on [Discord](https://discord.gg/bSsv7XM).

## Maintainers Wanted

We're looking for project maintainers! If you're interested in helping maintain this project, reach out on Discord or open an issue.
