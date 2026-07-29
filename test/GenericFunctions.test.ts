import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { nip19, utils, verifyEvent } from 'nostr-tools';

import {
	buildMessageEvent,
	createNip98Authorization,
	normalizeRelayUrl,
} from '../nodes/Buzz/GenericFunctions';

const PRIVATE_KEY =
	'0000000000000000000000000000000000000000000000000000000000000001';
const CHANNEL_ID = '123e4567-e89b-12d3-a456-426614174000';

test('normalizeRelayUrl converts WebSocket URLs for the HTTP bridge', () => {
	assert.equal(
		normalizeRelayUrl('ws://localhost:3000/'),
		'http://localhost:3000',
	);
	assert.equal(
		normalizeRelayUrl('wss://buzz.example.test///'),
		'https://buzz.example.test',
	);
	assert.throws(
		() => normalizeRelayUrl('ftp://buzz.example.test'),
		/HTTP or WebSocket/,
	);
});

test('buildMessageEvent creates a valid Buzz kind 9 channel event', () => {
	const event = buildMessageEvent({
		channelId: CHANNEL_ID,
		content: 'Deployment finished',
		broadcast: true,
		privateKey: PRIVATE_KEY,
		createdAt: 1_700_000_000,
		uniqueId: 'fixed-message-id',
	});

	assert.equal(verifyEvent(event), true);
	assert.equal(event.kind, 9);
	assert.equal(event.content, 'Deployment finished');
	assert.equal(event.created_at, 1_700_000_000);
	assert.deepEqual(event.tags, [
		['h', CHANNEL_ID],
		['broadcast', '1'],
		['n8n', 'fixed-message-id'],
	]);
});

test('buildMessageEvent gives otherwise identical same-second events unique IDs', () => {
	const options = {
		channelId: CHANNEL_ID,
		content: 'Deployment finished',
		privateKey: PRIVATE_KEY,
		createdAt: 1_700_000_000,
	};
	const firstEvent = buildMessageEvent(options);
	const secondEvent = buildMessageEvent(options);

	assert.equal(verifyEvent(firstEvent), true);
	assert.equal(verifyEvent(secondEvent), true);
	assert.notEqual(firstEvent.id, secondEvent.id);
	assert.deepEqual(firstEvent.tags[0], ['h', CHANNEL_ID]);
	assert.deepEqual(secondEvent.tags[0], ['h', CHANNEL_ID]);
	assert.equal(firstEvent.tags[1][0], 'n8n');
	assert.equal(secondEvent.tags[1][0], 'n8n');
	assert.match(
		firstEvent.tags[1][1],
		/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
	);
	assert.match(
		secondEvent.tags[1][1],
		/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
	);
	assert.notEqual(firstEvent.tags[1][1], secondEvent.tags[1][1]);
});

test('buildMessageEvent accepts the documented nsec private key format', () => {
	const hexEvent = buildMessageEvent({
		channelId: CHANNEL_ID,
		content: 'nsec test',
		privateKey: PRIVATE_KEY,
		createdAt: 1_700_000_000,
		uniqueId: 'fixed-nsec-message-id',
	});
	const nsecEvent = buildMessageEvent({
		channelId: CHANNEL_ID,
		content: 'nsec test',
		privateKey: nip19.nsecEncode(utils.hexToBytes(PRIVATE_KEY)),
		createdAt: 1_700_000_000,
		uniqueId: 'fixed-nsec-message-id',
	});

	assert.equal(verifyEvent(nsecEvent), true);
	assert.equal(nsecEvent.pubkey, hexEvent.pubkey);
	assert.equal(nsecEvent.id, hexEvent.id);
});

test('buildMessageEvent includes a validated NIP-OA auth tag', () => {
	const authTag = ['auth', 'a'.repeat(64), 'kind=9', 'b'.repeat(128)];
	const event = buildMessageEvent({
		channelId: CHANNEL_ID,
		content: 'Hello from n8n',
		privateKey: PRIVATE_KEY,
		authTag: JSON.stringify(authTag),
		createdAt: 1_700_000_000,
		uniqueId: 'fixed-auth-message-id',
	});

	assert.deepEqual(event.tags, [
		['h', CHANNEL_ID],
		authTag,
		['n8n', 'fixed-auth-message-id'],
	]);
	assert.throws(
		() =>
			buildMessageEvent({
				channelId: CHANNEL_ID,
				content: 'invalid auth',
				privateKey: PRIVATE_KEY,
				authTag: '{"not":"a tag"}',
			}),
		/auth tag/i,
	);
});

test('buildMessageEvent validates the channel and Buzz content limit', () => {
	assert.throws(
		() =>
			buildMessageEvent({
				channelId: 'general',
				content: 'hello',
				privateKey: PRIVATE_KEY,
			}),
		/UUID/,
	);
	assert.throws(
		() =>
			buildMessageEvent({
				channelId: CHANNEL_ID,
				content: 'x'.repeat(64 * 1024 + 1),
				privateKey: PRIVATE_KEY,
			}),
		/64 KiB/,
	);
});

test('createNip98Authorization signs the exact request payload', () => {
	const body = '{"hello":"world"}';
	const url = 'https://buzz.example.test/events';
	const header = createNip98Authorization({
		method: 'POST',
		url,
		body,
		privateKey: PRIVATE_KEY,
		createdAt: 1_700_000_000,
		nonce: 'fixed-nonce',
	});

	assert.match(header, /^Nostr /);
	const event = JSON.parse(
		Buffer.from(header.slice(6), 'base64').toString('utf8'),
	);
	assert.equal(verifyEvent(event), true);
	assert.equal(event.kind, 27235);
	assert.equal(event.content, '');
	assert.deepEqual(event.tags, [
		['u', url],
		['method', 'POST'],
		['nonce', 'fixed-nonce'],
		['payload', createHash('sha256').update(body).digest('hex')],
	]);
});
