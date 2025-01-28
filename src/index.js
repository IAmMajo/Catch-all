export default {
	async fetch(request, env, ctx) {
		const discordWebhookUrl = env.DISCORD_WEBHOOK_URL;

		if (request.headers.get('upgrade') === 'websocket') {
			await fetch(discordWebhookUrl, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					content: 'Websocket request received',
				}),
			});

			// Handle WebSocket upgrade
			const webSocketPair = new WebSocketPair();
			const client = webSocketPair[0];
			const server = webSocketPair[1];

			server.accept();

			server.addEventListener('message', async (event) => {
				// Send received WebSocket message to Discord
				const messagePayload = {
					content: `WebSocket message received: \`${event.data}\``,
				};

				await fetch(discordWebhookUrl, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify(messagePayload),
				});

				server.send(`Echo: ${event.data}`);
			});

			server.addEventListener('close', () => {
				console.log('WebSocket connection closed.');
			});

			return new Response(null, { status: 101, webSocket: client });
		}

		try {
			// Get the request details
			const method = request.method;
			const url = request.url;
			const headers = Object.fromEntries(request.headers);
			const contentType = request.headers.get('content-type') || 'unknown';
			let body;

			// Parse the body based on Content-Type
			if (contentType.includes('application/json')) {
				try {
					body = await request.json();
				} catch (error) {
					body = {
						error: error.message,
						data: await request.text(),
					};
				}
			} else if (contentType.includes('application/x-www-form-urlencoded')) {
				const formData = await request.formData();
				body = Object.fromEntries(formData);
			} else {
				body = await request.text();
			}

			// Serialize body as JSON string
			const bodyString = JSON.stringify(body, null, 2);

			// Check if the body size exceeds Discord's message limit (2000 characters)
			let files = [];
			let bodyField = 'Body too large to include in message.';

			if (bodyString.length > 1900) {
				files.push({
					name: 'request-body.json',
					contents: bodyString,
				});
			} else {
				bodyField = '```json\n' + bodyString + '\n```';
			}

			// Prepare the message payload
			const messagePayload = {
				content: `New ${method} request received at ${url}`,
				embeds: [
					{
						title: 'Request Details',
						fields: [
							{ name: 'Method', value: method, inline: true },
							{ name: 'Content-Type', value: contentType, inline: true },
							{ name: 'Headers', value: '```json\n' + JSON.stringify(headers, null, 2) + '\n```' },
							{ name: 'Body', value: bodyField },
						],
					},
				],
			};

			// Build FormData for file uploads
			const formData = new FormData();
			formData.append('payload_json', JSON.stringify(messagePayload));

			for (const file of files) {
				formData.append('files[]', new Blob([file.contents], { type: 'application/json' }), file.name);
			}

			// Send the data to the Discord webhook
			const response = await fetch(discordWebhookUrl, {
				method: 'POST',
				body: formData,
			});

			// Return Discord's response
			if (!response.ok) {
				return new Response(`Failed to send to Discord: ${response.statusText}`, {
					status: response.status,
				});
			}

			return new Response('Message sent to Discord', { status: 200 });
		} catch (error) {
			return new Response(`Error: ${error.message}`, { status: 500 });
		}
	},
};
