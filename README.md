# n8n-nodes-buzz

An n8n community node for sending signed text messages to a [Buzz](https://github.com/block/buzz) channel. It is designed as a small replacement for Telegram notification steps in self-hosted n8n workflows.

This is a self-hosted-only community integration and is not maintained by Block. It uses a Nostr signing dependency, so it is not eligible for n8n Cloud verification.

## What it supports

- Send a Markdown-capable message to a channel UUID
- Use either the `ws(s)` relay URL shown by Buzz or its `http(s)` equivalent
- Sign Buzz/Nostr kind `9` channel messages locally
- Authenticate `POST /events` requests with NIP-98
- Use ordinary community member keys or an optional NIP-OA `BUZZ_AUTH_TAG`
- Add Buzz's `broadcast` tag when needed
- Process one message per incoming n8n item with expression support

## Install

This checkout is ready to build but has not been published to npm. After publishing it, install the package from **Settings → Community Nodes** in a self-hosted n8n instance:

```text
n8n-nodes-buzz
```

For local development:

```bash
npm install
npm run dev
```

The package requires Node.js 22 or newer, matching the current n8n node-development toolchain.

## Buzz setup

The node publishes as a real Buzz/Nostr identity, not as a bot token.

1. Choose or create the Nostr identity that n8n will use.
2. Add that identity to the Buzz community.
3. Add the identity to every target channel.
4. Store its private key in the **Buzz API** n8n credential as either 64-character hex or `nsec1…`.
5. If the identity is a delegated Buzz agent, also copy its `BUZZ_AUTH_TAG` JSON value into the optional credential field.

The credential check signs a non-mutating `POST /query` request, so it verifies the relay URL, private key, and delegated auth tag without posting a message.

Keep the private key in n8n credentials. Do not place it in workflow fields or environment data returned by a node.

## Use

Add the **Buzz** node and configure:

- **Channel ID**: the channel UUID, not its display name (for example, `123e4567-e89b-12d3-a456-426614174000`)
- **Message**: static text or an expression such as `{{ $json.message }}`
- **Broadcast**: optionally add `['broadcast', '1']`

On success, the node returns the relay response (`event_id`, `accepted`, and `message`) plus the channel ID, content, public key, and event timestamp.

## Example workflow migration

Replace a Telegram **Send Message** node with Buzz, keep the existing message expression, and replace the Telegram chat ID with the Buzz channel UUID. The preceding workflow nodes do not need to change.

## Protocol notes

Buzz messages are signed Nostr events. This node follows Buzz's current upstream write path:

- event kind `9`
- channel tag `['h', '<channel-uuid>']`
- a per-send `['n8n', '<uuid>']` tag so identical notifications in the same second remain distinct events
- NIP-98 authenticated `POST <relay>/events`
- maximum message size of 64 KiB

The signing dependency is bundled in the npm package; the `buzz` CLI does not need to be installed in the n8n container.

## Development

```bash
npm test
npm run lint
npm run build
```

Before publishing, add your repository and maintainer metadata to `package.json`, then publish under the `n8n-nodes-` package name.

## License

MIT
