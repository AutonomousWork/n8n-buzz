# Contributing

Contributions, bug reports, and focused feature requests are welcome.

## Development requirements

- Node.js 22 or newer
- npm
- git
- A local n8n instance for interactive node testing
- A Buzz relay and disposable test identity for live integration testing

Never use a production Buzz private key in tests, fixtures, screenshots, or issue reports.

## Set up the project

```bash
git clone https://github.com/AutonomousWork/n8n-buzz.git
cd n8n-buzz
npm ci
```

Start n8n with the local node loaded:

```bash
npm run dev
```

## Validate a change

Run the complete local check before opening a pull request:

```bash
npm test
npm run lint
npm run build
npm pack --dry-run
```

Tests use deterministic non-production keys and mocked relay requests. Add or update tests for changes to signing, authentication, validation, or relay receipt handling.

## Project structure

- `credentials/` contains the Buzz credential definition.
- `nodes/Buzz/` contains the n8n node, signing helpers, and icons.
- `test/` contains unit and node-execution tests.
- `docs/` contains task-focused user guides.
- `.github/workflows/` contains CI and provenance publishing automation.

## Pull requests

Keep pull requests focused and explain:

- what changed
- why users need it
- how it was tested
- whether credential, membership, protocol, or compatibility behavior changed

Do not commit generated tarballs, `node_modules`, `dist`, private keys, or real NIP-OA authentication tags.

## Releases

Maintainers release from a clean `main` branch. Version tags matching `v*.*.*` trigger `.github/workflows/publish.yml`, which validates and publishes the package from GitHub Actions with npm provenance.

The first publication requires a package-scoped npm token stored as the `NPM_TOKEN` GitHub Actions secret. After the package exists, configure npm Trusted Publishing for `AutonomousWork/n8n-buzz` and `publish.yml`, then remove the long-lived secret.

Update [CHANGELOG.md](CHANGELOG.md) before tagging a release.
