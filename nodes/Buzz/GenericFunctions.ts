import { createHash, randomUUID } from 'node:crypto';

import { finalizeEvent, kinds, nip19, utils } from 'nostr-tools';

const MAX_MESSAGE_BYTES = 64 * 1024;
const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX_PRIVATE_KEY_PATTERN = /^[0-9a-f]{64}$/i;

export interface BuildMessageEventOptions {
	channelId: string;
	content: string;
	privateKey: string;
	broadcast?: boolean;
	authTag?: string;
	createdAt?: number;
	uniqueId?: string;
}

export interface Nip98AuthorizationOptions {
	method: string;
	url: string;
	body?: string;
	privateKey: string;
	createdAt?: number;
	nonce?: string;
}

export function normalizeRelayUrl(value: string): string {
	let url: URL | undefined;
	try {
		url = new URL(value.trim());
	} catch {
		url = undefined;
	}
	if (!url)
		throw new Error('Buzz Relay URL must be a valid HTTP or WebSocket URL');

	if (url.protocol === 'ws:') url.protocol = 'http:';
	if (url.protocol === 'wss:') url.protocol = 'https:';
	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		throw new Error('Buzz Relay URL must be a valid HTTP or WebSocket URL');
	}

	url.pathname = url.pathname.replace(/\/+$/, '');
	if (url.pathname === '/') url.pathname = '';
	url.search = '';
	url.hash = '';
	return url.toString().replace(/\/$/, '');
}

function decodePrivateKey(value: string): Uint8Array {
	const trimmed = value.trim();
	if (HEX_PRIVATE_KEY_PATTERN.test(trimmed)) {
		return utils.hexToBytes(trimmed);
	}

	if (trimmed.startsWith('nsec1')) {
		try {
			const decoded = nip19.decode(trimmed);
			if (decoded.type === 'nsec' && decoded.data instanceof Uint8Array)
				return decoded.data;
		} catch {
			// Fall through to the stable validation message below.
		}
	}

	throw new Error(
		'Buzz Private Key must be a 64-character hex key or an nsec key',
	);
}

export function parseAuthTag(value?: string): string[] | undefined {
	if (!value?.trim()) return undefined;

	let parsed: unknown = undefined;
	try {
		parsed = JSON.parse(value);
	} catch {
		parsed = undefined;
	}
	if (parsed === undefined) throw new Error('Buzz auth tag must be valid JSON');

	if (
		!Array.isArray(parsed) ||
		parsed.length !== 4 ||
		parsed.some((part) => typeof part !== 'string') ||
		parsed[0] !== 'auth' ||
		!/^([0-9a-f]{64})$/i.test(parsed[1]) ||
		!/^([0-9a-f]{128})$/i.test(parsed[3])
	) {
		throw new Error(
			'Buzz auth tag must be ["auth", ownerPubkey, conditions, signature] with hex keys',
		);
	}

	return parsed;
}

export function buildMessageEvent(options: BuildMessageEventOptions) {
	const channelId = options.channelId.trim().toLowerCase();
	if (!UUID_PATTERN.test(channelId))
		throw new Error('Buzz Channel ID must be a UUID');

	const contentBytes = Buffer.byteLength(options.content, 'utf8');
	if (contentBytes > MAX_MESSAGE_BYTES) {
		throw new Error(
			`Buzz message exceeds the 64 KiB limit (${contentBytes} bytes)`,
		);
	}

	const tags: string[][] = [['h', channelId]];
	if (options.broadcast) tags.push(['broadcast', '1']);
	const authTag = parseAuthTag(options.authTag);
	if (authTag) tags.push(authTag);
	tags.push(['n8n', options.uniqueId ?? randomUUID()]);

	return finalizeEvent(
		{
			kind: kinds.ChatMessage,
			created_at: options.createdAt ?? Math.floor(Date.now() / 1000),
			tags,
			content: options.content,
		},
		decodePrivateKey(options.privateKey),
	);
}

export function createNip98Authorization(
	options: Nip98AuthorizationOptions,
): string {
	const tags: string[][] = [
		['u', options.url],
		['method', options.method.toUpperCase()],
		['nonce', options.nonce ?? randomUUID()],
	];
	if (options.body !== undefined) {
		tags.push([
			'payload',
			createHash('sha256').update(options.body).digest('hex'),
		]);
	}

	const event = finalizeEvent(
		{
			kind: kinds.HTTPAuth,
			created_at: options.createdAt ?? Math.floor(Date.now() / 1000),
			tags,
			content: '',
		},
		decodePrivateKey(options.privateKey),
	);

	return `Nostr ${Buffer.from(JSON.stringify(event)).toString('base64')}`;
}
