# Install n8n-buzz manually

The recommended installation is **Settings → Community Nodes → Install** with the package name `n8n-nodes-buzz`. Use this guide for queue-mode deployments, installations without the Community Nodes screen, private package mirrors, or local unreleased builds.

## Requirements

- A self-hosted n8n instance
- Docker access when n8n runs in a container
- A persistent n8n user-folder mount, normally `/home/node/.n8n`
- Node.js 22 or newer on the build host when packaging from source

## Install the published package in a Docker container

Identify the n8n container:

```bash
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
export N8N_CONTAINER='n8n-container-name'
```

Confirm that the active n8n user folder is persistent:

```bash
docker inspect "$N8N_CONTAINER" \
  --format '{{range .Mounts}}{{println .Destination " <- " .Source}}{{end}}'
docker exec "$N8N_CONTAINER" sh -lc \
  'printf "user=%s\nhome=%s\nuser-folder=%s\n" "$(id -un)" "$HOME" "${N8N_USER_FOLDER:-$HOME/.n8n}"'
```

Install the package as the container's configured user:

```bash
docker exec "$N8N_CONTAINER" sh -lc '
  node_dir="${N8N_USER_FOLDER:-$HOME/.n8n}/nodes"
  mkdir -p "$node_dir"
  cd "$node_dir"
  npm install n8n-nodes-buzz
'
docker restart "$N8N_CONTAINER"
```

Do not install the package globally. n8n discovers manually installed community packages from the `nodes` directory inside its user folder.

Verify the installed version and inspect startup logs:

```bash
docker exec "$N8N_CONTAINER" sh -lc '
  node_dir="${N8N_USER_FOLDER:-$HOME/.n8n}/nodes"
  cd "$node_dir"
  npm ls n8n-nodes-buzz
'
docker logs --since 2m "$N8N_CONTAINER"
```

## Package and install an unreleased checkout

Run these commands from the repository root:

```bash
npm ci
npm test
npm run lint
npm run build
export BUZZ_TARBALL="$(npm pack --silent)"
printf 'Created %s\n' "$BUZZ_TARBALL"
```

Copy and install the tarball:

```bash
docker cp "$BUZZ_TARBALL" \
  "${N8N_CONTAINER}:/tmp/n8n-nodes-buzz.tgz"
docker exec "$N8N_CONTAINER" sh -lc '
  node_dir="${N8N_USER_FOLDER:-$HOME/.n8n}/nodes"
  mkdir -p "$node_dir"
  cd "$node_dir"
  npm install /tmp/n8n-nodes-buzz.tgz
'
docker restart "$N8N_CONTAINER"
```

The tarball contains compiled node files and package metadata. It does not contain saved Buzz credentials or private keys.

## Upgrade

From the Community Nodes screen, use the package's update action. For a manual Docker installation:

```bash
docker exec "$N8N_CONTAINER" sh -lc '
  node_dir="${N8N_USER_FOLDER:-$HOME/.n8n}/nodes"
  cd "$node_dir"
  npm update n8n-nodes-buzz
'
docker restart "$N8N_CONTAINER"
```

To install a specific version, use `npm install n8n-nodes-buzz@0.1.1` in the same directory.

## Uninstall

```bash
docker exec "$N8N_CONTAINER" sh -lc '
  node_dir="${N8N_USER_FOLDER:-$HOME/.n8n}/nodes"
  cd "$node_dir"
  npm uninstall n8n-nodes-buzz
'
docker restart "$N8N_CONTAINER"
```

Existing workflows retain their Buzz node configuration, but the node remains unavailable until the package is installed again.

## Queue mode and multiple containers

Install the same package version in the n8n main container and every worker container, then restart each one. A repeatable production alternative is to bake the package into the common n8n image used by all services.

## Persistent volume example

A typical Compose service persists the official n8n user folder:

```yaml
services:
  n8n:
    image: docker.n8n.io/n8nio/n8n
    volumes:
      - n8n_data:/home/node/.n8n

volumes:
  n8n_data:
```

If `N8N_USER_FOLDER` is set, persist that directory instead.

## Troubleshooting

- **Buzz is missing from the node picker:** Run the `npm ls` verification, inspect startup logs, restart n8n, and reload the editor.
- **Package disappears after recreating the container:** Persist the active n8n user folder.
- **Installation fails with `EACCES`:** Check the container user and ownership of the mounted user folder. The official image normally runs as `node`.
- **`npm` is unavailable:** Use the official n8n image or a derived image with npm available during installation.
- **Only some executions recognize Buzz:** Confirm the same version is installed on every queue worker and the main process.

See n8n's [community-node installation documentation](https://docs.n8n.io/integrations/community-nodes/installation/) for platform-level installation behavior.
