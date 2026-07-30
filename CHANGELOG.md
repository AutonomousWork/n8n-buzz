# Changelog

All notable changes to this project are documented here.

## [0.1.2] - 2026-07-30

### Changed

- Added current credential, send-message, and workflow screenshots to the public package documentation.
- Clarified dedicated service identity creation, channel authorization, friendly Buzz profiles, and relay URL handling.
- Aligned repository-facing headings with the `n8n-buzz` project name while retaining `n8n-nodes-buzz` as the npm package name.

## [0.1.1] - 2026-07-30

### Added

- Initial public release of the Buzz community node for self-hosted n8n.
- Signed kind `9` text and Markdown messages sent to Buzz channel UUIDs.
- NIP-98 relay authentication with support for ordinary member identities and optional NIP-OA delegation.
- Credential testing, expression support, per-item execution, broadcast tags, and n8n AI Agent tool use.
- Quickstart, identity, Docker, queue-mode, security, and contributor documentation.

### Fixed

- Restricted the credential test query to public profile events so authenticated relays do not reject an unbounded query.

[0.1.2]: https://github.com/AutonomousWork/n8n-buzz/releases/tag/v0.1.2
[0.1.1]: https://github.com/AutonomousWork/n8n-buzz/releases/tag/v0.1.1
