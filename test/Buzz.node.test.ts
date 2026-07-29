import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import type {
	ICredentialsDecrypted,
	ICredentialTestFunctions,
	IExecuteFunctions,
} from 'n8n-workflow';
import { verifyEvent } from 'nostr-tools';

import { Buzz } from '../nodes/Buzz/Buzz.node';

const PRIVATE_KEY =
	'0000000000000000000000000000000000000000000000000000000000000001';
const CHANNEL_ID = '123e4567-e89b-12d3-a456-426614174000';

test('Buzz node sends an authenticated event and returns the relay receipt', async () => {
	let requestedCredential = '';
	let request: Record<string, unknown> = {};
	const authTag = ['auth', 'a'.repeat(64), 'kind=9', 'b'.repeat(128)];
	const parameters: Record<string, unknown> = {
		channelId: CHANNEL_ID,
		content: 'Build completed',
		broadcast: true,
	};
	const executionContext = {
		getInputData: () => [{ json: { source: 'test' } }],
		getCredentials: async () => ({
			relayUrl: 'wss://buzz.example.test/',
			privateKey: PRIVATE_KEY,
			authTag: JSON.stringify(authTag),
		}),
		getNodeParameter: (name: string) => parameters[name],
		continueOnFail: () => false,
		getNode: () => ({
			name: 'Buzz',
			type: 'buzz',
			typeVersion: 1,
			position: [0, 0],
		}),
		helpers: {
			httpRequestWithAuthentication: async (
				credentialType: string,
				options: Record<string, unknown>,
			) => {
				requestedCredential = credentialType;
				request = options;
				const event = JSON.parse(options.body as string);
				return JSON.stringify({
					event_id: event.id,
					accepted: true,
					message: 'stored',
				});
			},
		},
	} as unknown as IExecuteFunctions;

	const result = await new Buzz().execute.call(executionContext);

	assert.equal(requestedCredential, 'buzzApi');
	assert.equal(request.url, 'https://buzz.example.test/events');
	assert.equal(request.method, 'POST');
	const body = request.body as string;
	const event = JSON.parse(body);
	assert.equal(verifyEvent(event), true);
	assert.equal(event.kind, 9);
	assert.deepEqual(event.tags, [
		['h', CHANNEL_ID],
		['broadcast', '1'],
		authTag,
		['n8n', event.tags[3][1]],
	]);
	assert.match(
		event.tags[3][1],
		/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
	);

	const headers = request.headers as Record<string, string>;
	assert.equal(headers['x-auth-tag'], JSON.stringify(authTag));
	const authEvent = JSON.parse(
		Buffer.from(
			headers.Authorization.replace(/^Nostr /, ''),
			'base64',
		).toString('utf8'),
	);
	assert.equal(verifyEvent(authEvent), true);
	assert.ok(
		authEvent.tags.some(
			(tag: string[]) =>
				tag[0] === 'payload' &&
				tag[1] === createHash('sha256').update(body).digest('hex'),
		),
	);
	assert.equal(result[0][0].json.accepted, true);
	assert.equal(result[0][0].json.event_id, event.id);
	assert.equal(result[0][0].json.channelId, CHANNEL_ID);
	assert.equal(result[0][0].pairedItem, 0);
});

test('Buzz node throws when the relay rejects the event', async () => {
	const executionContext = {
		getInputData: () => [{ json: {} }],
		getCredentials: async () => ({
			relayUrl: 'https://buzz.example.test',
			privateKey: PRIVATE_KEY,
			authTag: '',
		}),
		getNodeParameter: (name: string) =>
			({ channelId: CHANNEL_ID, content: 'Build failed', broadcast: false })[
				name
			],
		continueOnFail: () => false,
		getNode: () => ({
			name: 'Buzz',
			type: 'buzz',
			typeVersion: 1,
			position: [0, 0],
		}),
		helpers: {
			httpRequestWithAuthentication: async (
				_credentialType: string,
				options: Record<string, unknown>,
			) => {
				const event = JSON.parse(options.body as string);
				return JSON.stringify({
					event_id: event.id,
					accepted: false,
					message: 'blocked by relay policy',
				});
			},
		},
	} as unknown as IExecuteFunctions;

	await assert.rejects(
		() => new Buzz().execute.call(executionContext),
		/Relay rejected event .*: blocked by relay policy/,
	);
});

test('Buzz node throws when the relay receipt event ID does not match', async () => {
	const executionContext = {
		getInputData: () => [{ json: {} }],
		getCredentials: async () => ({
			relayUrl: 'https://buzz.example.test',
			privateKey: PRIVATE_KEY,
			authTag: '',
		}),
		getNodeParameter: (name: string) =>
			({ channelId: CHANNEL_ID, content: 'Build completed', broadcast: false })[
				name
			],
		continueOnFail: () => false,
		getNode: () => ({
			name: 'Buzz',
			type: 'buzz',
			typeVersion: 1,
			position: [0, 0],
		}),
		helpers: {
			httpRequestWithAuthentication: async (
				_credentialType: string,
				options: Record<string, unknown>,
			) => {
				const event = JSON.parse(options.body as string);
				const mismatchedEventId = `${event.id.slice(0, -1)}${
					event.id.endsWith('0') ? '1' : '0'
				}`;
				return JSON.stringify({
					event_id: mismatchedEventId,
					accepted: true,
					message: 'stored another event',
				});
			},
		},
	} as unknown as IExecuteFunctions;

	await assert.rejects(
		() => new Buzz().execute.call(executionContext),
		/Relay receipt event ID mismatch: .*: stored another event/,
	);
});

test('Buzz node throws when the relay receipt is malformed', async () => {
	const executionContext = {
		getInputData: () => [{ json: {} }],
		getCredentials: async () => ({
			relayUrl: 'https://buzz.example.test',
			privateKey: PRIVATE_KEY,
			authTag: '',
		}),
		getNodeParameter: (name: string) =>
			({ channelId: CHANNEL_ID, content: 'Build completed', broadcast: false })[
				name
			],
		continueOnFail: () => false,
		getNode: () => ({
			name: 'Buzz',
			type: 'buzz',
			typeVersion: 1,
			position: [0, 0],
		}),
		helpers: {
			httpRequestWithAuthentication: async () =>
				JSON.stringify({ accepted: true, message: 'event ID missing' }),
		},
	} as unknown as IExecuteFunctions;

	await assert.rejects(
		() => new Buzz().execute.call(executionContext),
		/Relay returned a malformed receipt: event ID missing/,
	);
});

test('Buzz credential test sends an authenticated public profile query', async () => {
	const authTag = ['auth', 'a'.repeat(64), 'kind=9', 'b'.repeat(128)];
	let request: Record<string, unknown> = {};
	const credentialTestContext = {
		helpers: {
			request: async (options: Record<string, unknown>) => {
				request = options;
				return [];
			},
		},
	} as unknown as ICredentialTestFunctions;
	const credential: ICredentialsDecrypted = {
		id: 'buzz-test',
		name: 'Buzz test',
		type: 'buzzApi',
		data: {
			relayUrl: 'wss://buzz.example.test/',
			privateKey: PRIVATE_KEY,
			authTag: JSON.stringify(authTag),
		},
	};

	const result =
		await new Buzz().methods!.credentialTest!.buzzApiCredentialTest.call(
			credentialTestContext,
			credential,
		);

	assert.deepEqual(result, { status: 'OK', message: 'Connection successful' });
	assert.equal(request.method, 'POST');
	assert.equal(request.url, 'https://buzz.example.test/query');
	assert.equal(request.body, '[{"kinds":[0],"limit":1}]');
	assert.equal(request.json, false);

	const headers = request.headers as Record<string, string>;
	assert.equal(headers['Content-Type'], 'application/json');
	assert.equal(headers['x-auth-tag'], JSON.stringify(authTag));
	assert.match(headers.Authorization, /^Nostr /);
	const authEvent = JSON.parse(
		Buffer.from(
			headers.Authorization.replace(/^Nostr /, ''),
			'base64',
		).toString('utf8'),
	);
	assert.equal(verifyEvent(authEvent), true);
	assert.ok(
		authEvent.tags.some(
			(tag: string[]) =>
				tag[0] === 'u' && tag[1] === 'https://buzz.example.test/query',
		),
	);
	assert.ok(
		authEvent.tags.some(
			(tag: string[]) => tag[0] === 'method' && tag[1] === 'POST',
		),
	);
	assert.ok(
		authEvent.tags.some(
			(tag: string[]) =>
				tag[0] === 'payload' &&
				tag[1] ===
					createHash('sha256')
						.update('[{"kinds":[0],"limit":1}]')
						.digest('hex'),
		),
	);
});

test('Buzz credential test returns an Error for an invalid private key', async () => {
	let requestAttempted = false;
	const credentialTestContext = {
		helpers: {
			request: async () => {
				requestAttempted = true;
			},
		},
	} as unknown as ICredentialTestFunctions;
	const credential: ICredentialsDecrypted = {
		id: 'buzz-test',
		name: 'Buzz test',
		type: 'buzzApi',
		data: {
			relayUrl: 'https://buzz.example.test',
			privateKey: 'not-a-private-key',
			authTag: '',
		},
	};

	const result =
		await new Buzz().methods!.credentialTest!.buzzApiCredentialTest.call(
			credentialTestContext,
			credential,
		);

	assert.equal(requestAttempted, false);
	assert.deepEqual(result, {
		status: 'Error',
		message: 'Buzz Private Key must be a 64-character hex key or an nsec key',
	});
	assert.doesNotMatch(result.message, /not-a-private-key/);
});

test('Buzz node continues after a rejected item when Continue On Fail is enabled', async () => {
	let requestIndex = 0;
	const executionContext = {
		getInputData: () => [{ json: {} }, { json: {} }],
		getCredentials: async () => ({
			relayUrl: 'https://buzz.example.test',
			privateKey: PRIVATE_KEY,
			authTag: '',
		}),
		getNodeParameter: (name: string, itemIndex: number) => {
			if (name === 'channelId') return CHANNEL_ID;
			if (name === 'content') return `Item ${itemIndex}`;
			return false;
		},
		continueOnFail: () => true,
		getNode: () => ({
			name: 'Buzz',
			type: 'buzz',
			typeVersion: 1,
			position: [0, 0],
		}),
		helpers: {
			httpRequestWithAuthentication: async (
				_credentialType: string,
				options: Record<string, unknown>,
			) => {
				const event = JSON.parse(options.body as string);
				const accepted = requestIndex++ === 1;
				return JSON.stringify({
					event_id: event.id,
					accepted,
					message: accepted ? 'stored' : 'rejected first item',
				});
			},
		},
	} as unknown as IExecuteFunctions;

	const result = await new Buzz().execute.call(executionContext);

	assert.equal(result[0].length, 2);
	assert.match(result[0][0].json.error as string, /rejected first item/);
	assert.equal(result[0][0].pairedItem, 0);
	assert.equal(result[0][1].json.accepted, true);
	assert.equal(result[0][1].json.content, 'Item 1');
	assert.equal(result[0][1].pairedItem, 1);
});
