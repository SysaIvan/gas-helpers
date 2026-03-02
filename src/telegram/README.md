# Telegram

Sending notifications to Telegram via Bot API. Uses `UrlFetchApp`.

## Creating a bot

1. Message [@BotFather](https://t.me/BotFather) in Telegram
2. Create a bot, get `botToken`
3. Send a message to the bot or add it to a group
4. Get `chatId` via [@userinfobot](https://t.me/userinfobot) or API `getUpdates`

## Example

```typescript
import { TelegramNotifier } from 'gas-helpers/telegram';

const notifier = new TelegramNotifier({
	botToken:
		process.env.BOT_TOKEN ||
		PropertiesService.getScriptProperties().getProperty('BOT_TOKEN')!,
	chatId: '-1001234567890',
	spreadsheetName: 'My Sheet', // optional — prepended to messages
});

// Simple notification
notifier.sendNotification('Script completed successfully');

// With sound
notifier.sendNotification('Attention!', false);

// With different prefix
notifier.sendNotification('Error', true, 'Other sheet');
```
