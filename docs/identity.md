# Create a Buzz identity for n8n

Use a dedicated standalone service identity for notification workflows. It does not need to be a managed Buzz agent. In Buzz, a Nostr keypair is the identity: the public key identifies the sender, and the private key signs its messages.

A separate identity keeps notifications recognizable and prevents a leaked n8n credential from also compromising a personal or interactive agent identity.

## Choose an identity type

| Identity                          | When to use it                                                                                           | NIP-OA Auth Tag                                      |
| --------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Dedicated service identity        | Recommended. Generate a keypair and add its public key to Buzz. No agent process is required.            | Leave empty                                          |
| Existing personal/member identity | Technically works, but lets n8n sign as that person or member.                                           | Usually empty                                        |
| Managed Buzz agent                | Use only when messages should intentionally be attributed to that agent and you control its private key. | Required when the agent uses NIP-OA owner delegation |

## Prerequisites

You need:

- access to the running Buzz relay container or a Buzz source checkout
- the public URL for the Buzz community/relay
- the `buzz` CLI on the machine where you will authorize the identity
- the UUID of every destination channel
- a channel owner or administrator who can add members
- relay-operator access if the deployment enforces a relay membership roster

## 1. Generate a dedicated keypair

`buzz-admin` is included in the official Buzz relay container. Identify the container:

```bash
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
export BUZZ_RELAY_CONTAINER='buzz-relay-container-name'
```

Generate the identity:

```bash
docker exec "$BUZZ_RELAY_CONTAINER" buzz-admin generate-key
```

The command prints two values once:

```text
Public key:  <64-character-hex-public-key>
Secret key:  <64-character-hex-private-key>
```

`buzz-admin` does not store the secret key and cannot recover it later. Save the secret directly in a password manager or the n8n credential. Save the public key for the membership steps below. Do not paste real output into documentation, issues, chat, or workflow fields.

For the remaining commands, set the non-secret public values and securely load the private key from your password manager or secret manager:

```bash
export BUZZ_RELAY_URL='wss://buzz.example.com'
export BUZZ_N8N_PUBKEY='replace-with-64-character-hex-public-key'
# Securely load the secret into BUZZ_N8N_PRIVATE_KEY without putting it in shell history.
```

Use the same public community/relay URL that you will enter in the n8n credential. Do not assume that a Docker-published `localhost` port is equivalent: Buzz deployments can route communities by hostname and reject an unrecognized host.

From a Buzz source checkout, use:

```bash
cargo run -p buzz-admin -- generate-key
```

Any offline, standards-compatible Nostr key generator can create the same keypair type, but `buzz-admin` avoids format ambiguity. Avoid online key generators for production credentials.

## 2. Add the public key to a closed relay

Skip this step when the relay does not enforce a membership roster. If relay membership is required, a relay operator can run:

```bash
docker exec "$BUZZ_RELAY_CONTAINER" \
  buzz-admin add-member --pubkey "$BUZZ_N8N_PUBKEY" --role member
```

This grants relay-level access only. It does not grant access to any channel.

## 3. Add the public key to every destination channel

The membership change must be signed by an existing channel owner or administrator, not by the new service identity. Securely load that existing identity's private key into `BUZZ_CHANNEL_ADMIN_PRIVATE_KEY`, then run:

```bash
BUZZ_PRIVATE_KEY="$BUZZ_CHANNEL_ADMIN_PRIVATE_KEY" \
  buzz channels add-member \
  --channel 'replace-with-channel-uuid' \
  --pubkey "$BUZZ_N8N_PUBKEY" \
  --role member
```

The signing identity needs the `admin:channels` capability. If that identity uses NIP-OA delegation, also provide its matching `BUZZ_AUTH_TAG` while running the command. Repeat the command for every channel to which n8n will send. Give the n8n identity the `member` role unless it genuinely needs broader permissions.

## 4. Publish a recognizable profile

Without a profile, Buzz displays the sender as a truncated public key such as `abc123…def456`. Publish a profile with the **new service identity's private key** so messages have a business-friendly sender name:

```bash
unset BUZZ_AUTH_TAG
BUZZ_PRIVATE_KEY="$BUZZ_N8N_PRIVATE_KEY" \
  buzz users set-profile \
  --name 'n8n Notifications' \
  --about 'Automated notifications from n8n'
```

The `--name` value is what Buzz shows beside messages. You can also add `--avatar 'https://…'` or `--nip05 'notifications@example.com'` when those values are available.

Verify that the relay resolves the profile:

```bash
BUZZ_PRIVATE_KEY="$BUZZ_N8N_PRIVATE_KEY" \
  buzz users get --pubkey "$BUZZ_N8N_PUBKEY"
```

The result should contain the chosen `display_name`. If the Buzz client is already open, refresh it after publishing the profile. Running `set-profile` with the channel administrator's key would rename that administrator instead, so switch to `BUZZ_N8N_PRIVATE_KEY` for this step.

## 5. Create the n8n credential

Create a **Buzz API** credential with:

- **Relay URL:** the relay's `https://`, `http://`, `wss://`, or `ws://` URL
- **Private Key:** the generated secret key as 64-character hex or `nsec1…`
- **NIP-OA Auth Tag:** empty for a standalone service identity

Select **Test credential**. The test signs a non-mutating `POST /query` request and does not post a message.

## 6. Verify the identity end to end

1. Add a **Buzz** node to a test workflow.
2. Select the new credential and enter a channel UUID from step 3.
3. Send a short test message.
4. Confirm the node returns `accepted: true` with an `event_id`.
5. Confirm the message appears under the expected Buzz identity.

If the credential test succeeds but sending fails with a membership error, the key can authenticate but its public key has not been added to that channel.

## Use an existing managed agent

A managed agent is not required for notifications. Reuse one only when attribution to that agent is intentional.

Enter the agent's private key in the n8n credential. If the agent uses NIP-OA owner delegation, also enter its exact `BUZZ_AUTH_TAG` JSON value and confirm that the relay allows NIP-OA authentication. A missing, expired, or relay-disabled owner attestation causes authentication to fail.

Do not move a managed agent's key out of its secure store merely for convenience. When the key is unavailable, create a dedicated service identity instead.

## Rotate an identity

1. Generate a new keypair.
2. Add the new public key to the relay roster when required.
3. Add it to every destination channel.
4. Update and test the n8n credential.
5. Send a test message.
6. Remove the old public key from the channels and relay roster.

The original private key cannot be recovered. Anyone with the private key can sign as the identity, so use a different key for each integration or environment.

## Troubleshooting

- **Unable to authenticate:** Confirm that **Private Key** contains the secret key, not the public key. Confirm the relay URL and leave **NIP-OA Auth Tag** empty for a standalone identity.
- **Managed agent cannot authenticate:** Verify that the private key and owner-attestation tag belong to the same agent and that the relay enables NIP-OA authentication.
- **Relay access is denied:** On a closed relay, have its operator add the public key to the relay membership roster.
- **CLI says no community is configured for this host:** Set `BUZZ_RELAY_URL` to the deployment's public community/relay URL instead of a raw Docker port or unrecognized hostname.
- **Sending reports a channel membership error:** Have a channel owner or administrator add the public key to that channel.
- **Sender appears as a public key:** Publish the profile from step 4 with the service identity's private key, verify it with `buzz users get`, and refresh Buzz.
- **Private key was lost or exposed:** Rotate the identity immediately.

See the upstream [Buzz repository](https://github.com/block/buzz), [CLI and relay testing guide](https://github.com/block/buzz/blob/main/TESTING.md), and [security policy](https://github.com/block/buzz/security) for current Buzz behavior.
