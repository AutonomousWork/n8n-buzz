import type { ICredentialType, INodeProperties } from 'n8n-workflow';

export class BuzzApi implements ICredentialType {
	name = 'buzzApi';
	displayName = 'Buzz API';
	icon = {
		light: 'file:../nodes/Buzz/buzz.svg',
		dark: 'file:../nodes/Buzz/buzz.dark.svg',
	} as const;
	documentationUrl = 'https://github.com/block/buzz';
	properties: INodeProperties[] = [
		{
			displayName: 'Relay URL',
			name: 'relayUrl',
			type: 'string',
			default: 'ws://localhost:3000',
			placeholder: 'https://buzz.example.com',
			description:
				'The Buzz community relay URL. HTTP(S) and WebSocket URL forms are both accepted.',
			required: true,
		},
		{
			displayName: 'Private Key',
			name: 'privateKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description:
				'The Nostr private key for a Buzz identity that belongs to the community and target channel. Accepts 64-character hex or nsec.',
			required: true,
		},
		{
			displayName: 'NIP-OA Auth Tag',
			name: 'authTag',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			placeholder: '["auth","owner-pubkey","conditions","signature"]',
			description:
				'Optional BUZZ_AUTH_TAG value for a delegated agent identity. Leave empty for normal member keys.',
		},
	];
}
