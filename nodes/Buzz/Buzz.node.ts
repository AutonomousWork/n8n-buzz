import type {
	ICredentialTestFunction,
	IExecuteFunctions,
	IDataObject,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import {
	buildMessageEvent,
	createNip98Authorization,
	normalizeRelayUrl,
	parseAuthTag,
} from './GenericFunctions';

const CREDENTIAL_TEST_BODY = '[{"kinds":[0],"limit":1}]';
const SAFE_CREDENTIAL_VALIDATION_MESSAGES = new Set([
	'Buzz Relay URL must be a valid HTTP or WebSocket URL',
	'Buzz Private Key must be a 64-character hex key or an nsec key',
	'Buzz auth tag must be valid JSON',
	'Buzz auth tag must be ["auth", ownerPubkey, conditions, signature] with hex keys',
]);

function getCredentialTestErrorMessage(error: unknown): string {
	if (
		error instanceof Error &&
		SAFE_CREDENTIAL_VALIDATION_MESSAGES.has(error.message)
	) {
		return error.message;
	}
	return 'Unable to authenticate with the Buzz relay';
}

const buzzApiCredentialTest: ICredentialTestFunction = async function (
	credential,
) {
	try {
		const credentials = credential.data ?? {};
		const relayUrlValue =
			typeof credentials.relayUrl === 'string' ? credentials.relayUrl : '';
		const privateKey =
			typeof credentials.privateKey === 'string' ? credentials.privateKey : '';
		const authTagValue =
			typeof credentials.authTag === 'string' ? credentials.authTag : undefined;
		const relayUrl = normalizeRelayUrl(relayUrlValue);
		const authTag = parseAuthTag(authTagValue);
		const url = relayUrl + '/query';
		const headers: Record<string, string> = {
			Authorization: createNip98Authorization({
				method: 'POST',
				url,
				body: CREDENTIAL_TEST_BODY,
				privateKey,
			}),
			'Content-Type': 'application/json',
		};
		if (authTag) headers['x-auth-tag'] = JSON.stringify(authTag);

		// ICredentialTestFunctions only exposes request in n8n-workflow 2.x.
		// eslint-disable-next-line @n8n/community-nodes/no-deprecated-workflow-functions
		await this.helpers.request({
			method: 'POST',
			url,
			headers,
			body: CREDENTIAL_TEST_BODY,
			json: false,
		});

		return { status: 'OK', message: 'Connection successful' };
	} catch (error) {
		return { status: 'Error', message: getCredentialTestErrorMessage(error) };
	}
};

function getRelayMessage(receipt: unknown): string | undefined {
	if (typeof receipt === 'string') return receipt;
	if (
		receipt !== null &&
		!Array.isArray(receipt) &&
		typeof receipt === 'object' &&
		typeof (receipt as IDataObject).message === 'string'
	) {
		return (receipt as IDataObject).message as string;
	}
	return undefined;
}

function relayReceiptError(reason: string, receipt: unknown): Error {
	const relayMessage = getRelayMessage(receipt);
	return new Error(relayMessage ? `${reason}: ${relayMessage}` : reason);
}

function parseRelayResponse(response: unknown, eventId: string): IDataObject {
	let receipt = response;
	if (typeof response === 'string') {
		try {
			receipt = JSON.parse(response) as unknown;
		} catch {
			throw relayReceiptError('Relay returned a malformed receipt', response);
		}
	}

	if (
		receipt === null ||
		Array.isArray(receipt) ||
		typeof receipt !== 'object'
	) {
		throw relayReceiptError('Relay returned a malformed receipt', receipt);
	}

	const parsedReceipt = receipt as IDataObject;
	if (parsedReceipt.accepted === false) {
		throw relayReceiptError(`Relay rejected event ${eventId}`, parsedReceipt);
	}
	if (
		parsedReceipt.accepted !== true ||
		typeof parsedReceipt.event_id !== 'string'
	) {
		throw relayReceiptError(
			'Relay returned a malformed receipt',
			parsedReceipt,
		);
	}
	if (parsedReceipt.event_id !== eventId) {
		throw relayReceiptError(
			`Relay receipt event ID mismatch: expected ${eventId}, received ${parsedReceipt.event_id}`,
			parsedReceipt,
		);
	}

	return parsedReceipt;
}

export class Buzz implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Buzz',
		name: 'buzz',
		icon: { light: 'file:buzz.svg', dark: 'file:buzz.dark.svg' },
		group: ['output'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Send messages to Buzz channels',
		defaults: {
			name: 'Buzz',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [
			{
				name: 'buzzApi',
				required: true,
				testedBy: 'buzzApiCredentialTest',
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [{ name: 'Message', value: 'message' }],
				default: 'message',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['message'] } },
				options: [
					{
						name: 'Send',
						value: 'send',
						action: 'Send a message to a channel',
						description: 'Send a signed text message to a Buzz channel',
					},
				],
				default: 'send',
			},
			{
				displayName: 'Channel ID',
				name: 'channelId',
				type: 'string',
				default: '',
				placeholder: '123e4567-e89b-12d3-a456-426614174000',
				description:
					'The UUID of the Buzz channel that should receive the message',
				required: true,
				displayOptions: {
					show: { resource: ['message'], operation: ['send'] },
				},
			},
			{
				displayName: 'Message',
				name: 'content',
				type: 'string',
				typeOptions: { rows: 4 },
				default: '',
				description:
					'The message text. Buzz supports Markdown and a maximum of 64 KiB.',
				required: true,
				displayOptions: {
					show: { resource: ['message'], operation: ['send'] },
				},
			},
			{
				displayName: 'Broadcast',
				name: 'broadcast',
				type: 'boolean',
				default: false,
				description: "Whether to add Buzz's broadcast tag to the message",
				displayOptions: {
					show: { resource: ['message'], operation: ['send'] },
				},
			},
		],
	};

	methods = {
		credentialTest: {
			buzzApiCredentialTest,
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const credentials = await this.getCredentials('buzzApi');
		const relayUrl = normalizeRelayUrl(credentials.relayUrl as string);
		const privateKey = credentials.privateKey as string;
		const authTagValue = (credentials.authTag as string | undefined)?.trim();
		const url = `${relayUrl}/events`;

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const channelId = this.getNodeParameter(
					'channelId',
					itemIndex,
				) as string;
				const content = this.getNodeParameter('content', itemIndex) as string;
				const broadcast = this.getNodeParameter(
					'broadcast',
					itemIndex,
					false,
				) as boolean;
				const event = buildMessageEvent({
					channelId,
					content,
					broadcast,
					privateKey,
					authTag: authTagValue,
				});
				const body = JSON.stringify(event);
				const headers: Record<string, string> = {
					Authorization: createNip98Authorization({
						method: 'POST',
						url,
						body,
						privateKey,
					}),
					'Content-Type': 'application/json',
				};
				const authTag = event.tags.find((tag) => tag[0] === 'auth');
				if (authTag) headers['x-auth-tag'] = JSON.stringify(authTag);
				const canonicalChannelId = event.tags.find((tag) => tag[0] === 'h')![1];

				const response = await this.helpers.httpRequestWithAuthentication.call(
					this,
					'buzzApi',
					{
						method: 'POST',
						url,
						headers,
						body,
						json: false,
					},
				);
				returnData.push({
					json: {
						...parseRelayResponse(response, event.id),
						channelId: canonicalChannelId,
						content,
						pubkey: event.pubkey,
						createdAt: event.created_at,
					},
					pairedItem: itemIndex,
				});
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: error instanceof Error ? error.message : String(error),
						},
						pairedItem: itemIndex,
					});
					continue;
				}
				throw new NodeOperationError(this.getNode(), error as Error, {
					itemIndex,
				});
			}
		}

		return [returnData];
	}
}
