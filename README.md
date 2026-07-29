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

## How to package and install in a running n8n Docker container

Use this method while the package is not published to npm. It creates a local npm tarball, copies it into the running container, and installs it in n8n's community-node directory. n8n loads the node after a restart; there is no separate enable switch.

### Prerequisites

- Node.js 22 or newer and npm on the host
- Docker access to the running, self-hosted n8n container
- A persistent n8n user-folder mount, normally `/home/node/.n8n`

Run all host commands from this repository's root.

### 1. Build and package the node

```bash
npm ci
npm test
npm run lint
npm run build
export BUZZ_TARBALL="$(npm pack --silent)"
printf 'Created %s\n' "$BUZZ_TARBALL"
```

For version `0.1.0`, the resulting archive is `n8n-nodes-buzz-0.1.0.tgz`. The archive contains the compiled `dist` files and runtime package metadata. It does not contain Buzz credentials or private keys.

### 2. Identify the n8n container

List running containers:

```bash
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
```

Set the name or ID shown for n8n:

```bash
export N8N_CONTAINER=n8n
```

For Docker Compose, you can obtain the ID from the service name instead:

```bash
export N8N_CONTAINER="$(docker compose ps -q n8n)"
```

### 3. Confirm the n8n data directory is persistent

```bash
docker inspect "$N8N_CONTAINER" \
  --format '{{range .Mounts}}{{println .Destination " <- " .Source}}{{end}}'
docker exec "$N8N_CONTAINER" sh -lc \
  'printf "user=%s\nhome=%s\nuser-folder=%s\n" "$(id -un)" "$HOME" "${N8N_USER_FOLDER:-$HOME/.n8n}"'
```

With the official image, the mount list should normally include `/home/node/.n8n`. A typical Compose service contains:

```yaml
services:
  n8n:
    image: docker.n8n.io/n8nio/n8n
    volumes:
      - n8n_data:/home/node/.n8n

volumes:
  n8n_data:
```

The package is installed below this directory. It survives container replacement only when the directory is backed by a Docker volume or bind mount. If `N8N_USER_FOLDER` is set, persist that directory instead.

### 4. Copy and install the package

Copy the tarball to a stable temporary name in the container:

```bash
docker cp "$BUZZ_TARBALL" \
  "${N8N_CONTAINER}:/tmp/n8n-nodes-buzz.tgz"
```

Install it as the container's configured user:

```bash
docker exec "$N8N_CONTAINER" sh -lc '
  node_dir="${N8N_USER_FOLDER:-$HOME/.n8n}/nodes"
  mkdir -p "$node_dir"
  cd "$node_dir"
  npm install /tmp/n8n-nodes-buzz.tgz
'
```

Do not install the package globally. n8n discovers manually installed community packages from the `nodes` directory inside its user folder.

### 5. Restart n8n and verify the install

```bash
docker restart "$N8N_CONTAINER"
docker exec "$N8N_CONTAINER" sh -lc '
  node_dir="${N8N_USER_FOLDER:-$HOME/.n8n}/nodes"
  cd "$node_dir"
  npm ls n8n-nodes-buzz
'
docker logs --since 2m "$N8N_CONTAINER"
```

The `npm ls` output should contain `n8n-nodes-buzz@0.1.0`, and the startup log should not contain a package-loading error.

In the n8n editor:

1. Reload the page and search the node picker for **Buzz**.
2. Add a **Buzz API** credential with the relay URL and Nostr private key.
3. Use **Test credential**.
4. Add the **Buzz** node, enter a channel UUID and message, and run it once against a test channel.

### Upgrade the installed package

Give every changed build a new package version so npm and n8n can distinguish it. From the repository root:

```bash
npm version patch --no-git-tag-version
npm test
npm run lint
npm run build
export BUZZ_TARBALL="$(npm pack --silent)"
docker cp "$BUZZ_TARBALL" \
  "${N8N_CONTAINER}:/tmp/n8n-nodes-buzz.tgz"
docker exec "$N8N_CONTAINER" sh -lc '
  node_dir="${N8N_USER_FOLDER:-$HOME/.n8n}/nodes"
  cd "$node_dir"
  npm install /tmp/n8n-nodes-buzz.tgz
'
docker restart "$N8N_CONTAINER"
```

Commit the `package.json` and `package-lock.json` version change with the code when preparing a release.

### Uninstall the package

```bash
docker exec "$N8N_CONTAINER" sh -lc '
  node_dir="${N8N_USER_FOLDER:-$HOME/.n8n}/nodes"
  cd "$node_dir"
  npm uninstall n8n-nodes-buzz
'
docker restart "$N8N_CONTAINER"
```

Existing workflows retain their Buzz node configuration, but the node will be unavailable until the package is installed again.

### Queue mode and multiple containers

For queue-mode or multi-container deployments, copy and install the same tarball in the n8n main container and every n8n worker container, then restart each one. A repeatable production alternative is to bake the tarball into the common n8n image used by all of those services.

### Troubleshooting

- **Buzz is missing from the node picker:** Run the `npm ls` verification command, inspect the startup log, restart n8n, and hard-refresh the editor.
- **The package disappears after recreating the container:** Persist the active n8n user folder. For the official image this is `/home/node/.n8n` unless `N8N_USER_FOLDER` overrides it.
- **Installation fails with `EACCES`:** Check the user printed in step 3 and the ownership of the mounted user folder. The default user in the official image is `node`; the mount must be writable by the container's configured user.
- **`npm` is unavailable:** Use the official n8n image or create a derived image that has npm available during the package-install layer.
- **Only some executions recognize Buzz:** In queue mode, confirm that the same package version is installed on every worker as well as the main container.

This process follows n8n's [manual community-node installation guide](https://docs.n8n.io/integrations/community-nodes/installation-and-management/manual-installation/) and its [official Docker volume layout](https://github.com/n8n-io/n8n/blob/master/docker/images/n8n/README.md).

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
