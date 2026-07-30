# Security policy

## Report a vulnerability

Do not open a public issue for a suspected vulnerability or accidentally exposed credential.

Use GitHub's private vulnerability reporting flow at [Security Advisories](https://github.com/AutonomousWork/n8n-buzz/security/advisories/new). Include the affected version, impact, reproduction steps, and any suggested mitigation. Remove private keys, relay credentials, and real message content from the report.

For ordinary bugs and feature requests, use [GitHub Issues](https://github.com/AutonomousWork/n8n-buzz/issues).

## Supported versions

Security fixes are applied to the latest published version. Upgrade to the latest release before reporting a problem that may already be fixed.

## Private-key handling

The Buzz private key and optional NIP-OA authentication tag are n8n credential fields. The node:

- reads them only while executing or testing the credential
- uses the private key locally to sign Nostr events and NIP-98 authentication requests
- does not send the private key to the Buzz relay
- does not include the private key or authentication tag in node output
- returns the sender's public key, which is not secret

n8n instance operators are responsible for securing the n8n credential database, encryption key, backups, logs, host, and administrative access.

## Operational guidance

- Create a dedicated identity for each integration or environment.
- Give the identity the `member` channel role unless broader access is required.
- Do not place private keys in workflow fields, expressions, issue reports, screenshots, or committed environment files.
- Rotate an identity immediately if its private key may have been exposed.
- Review community-node source and package provenance before installing it into a production n8n instance.
- Treat the configured Buzz relay as a trusted destination for message content and signed events.

See the [identity guide](docs/identity.md) for generation, membership, and rotation instructions.
