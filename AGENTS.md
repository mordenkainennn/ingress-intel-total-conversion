# Repository Guidelines

## Project Structure & Module Organization
- `core/`: main IITC application code (browser userscript core).
- `plugins/`: bundled plugins shipped with IITC. Avoid editing these directly for custom changes.
- `local-plugins/`: home for custom or modified plugins; prefer copying a bundled plugin here and editing the copy.
- `mobile/`: Android wrapper app for IITC.
- `assets/` and `screenshots/`: static assets and reference images.
- `test/`: Mocha test suite; files end in `.spec.js` and load shared setup from `test/_mocks.js`.
- Build scripts live at the repo root: `build.py`, `build_mobile.py`, `build_plugin.py`, `web_server_local.py`.

## Build, Test, and Development Commands
- `npm run build:local`: build core + plugins for local use via `build.py local`.
- `npm run build:mobile`: build the Android package via `build.py mobile` (requires Android SDK/JDK).
- `npm run fileserver`: run a local dev server with `web_server_local.py local`.
- `npm test`: run the Mocha suite with the project mocks.

## Coding Style & Naming Conventions
- Indentation: JavaScript uses 2 spaces; Python uses 4 spaces (see `.editorconfig`).
- Formatting: Prettier is configured in `.prettierrc.json` (160 print width, single quotes, semicolons).
- Linting: ESLint config lives in `eslint.config.js` and enforces rules like `eqeqeq` and `spaced-comment`.
- Plugin files typically live in `plugins/*.js` or `local-plugins/*.js`; keep plugin headers and metadata aligned with changes.

## Testing Guidelines
- Framework: Mocha + Chai + Sinon (declared in `package.json`).
- Naming: add new tests as `test/<feature>.spec.js`.
- No explicit coverage target is defined; focus on new or changed behavior.

## Commit & Pull Request Guidelines
- Commit messages generally follow Conventional Commit style like `feat(scope): ...`, `docs: ...`, or `fix(plugin): ...`.
- PRs should include a clear summary, list of tests run, and screenshots for UI changes.
- Link related issues and note any plugin version or changelog updates when behavior changes.

## Security & Configuration Tips
- Local build configuration lives in `buildsettings.py` and `settings.py`; keep secrets out of version control.
- Mobile builds require a local Android toolchain; avoid committing generated `build/` artifacts.
