require('dotenv').config();

const fs = require('fs');

const ESM = {
  chatgpt: import('chatgpt'),
  discordJS: import('discord.js'),
};
const config = {
  openAIKey: process.env.OPENAI_API_KEY,
  discordToken: process.env.DISCORD_BOT_TOKEN,
  discordClientID: process.env.DISCORD_CLIENT_ID,
};

if (require.main === module) {
  main()
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = main;

async function main () {
  const {
    ChatGPTAPI, DiscordClient,
    IntentsBitField, Events,
  } = await importESM();

  const api = new ChatGPTAPI({ apiKey: config.openAIKey });
  const discord = new DiscordClient({
    intents: [
      IntentsBitField.Flags.Guilds,
      IntentsBitField.Flags.GuildMessages,
      IntentsBitField.Flags.MessageContent,
    ],
  });
  /** @type {Object<string,{ parentMessageId: string, ts: number }>} */
  const conversations = getCacheFromFile();

  discord.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) {
      return ;
    }

    if (interaction.commandName === 'chat') {
      await interaction.deferReply();

      const options = {};
      if (conversations[interaction.user.id] && conversations[interaction.user.id].parentMessageId) {
        options.parentMessageId = conversations[interaction.user.id].parentMessageId;
      }

      try {
        const result = await api.sendMessage(interaction.options.get('message').value, options);
        conversations[interaction.user.id] = { parentMessageId: result.id, ts: Date.now() };
        saveCacheToFile(conversations);

        interaction.editReply(result.text);
        return ;
      } catch (err) {
        if (err && err.error && typeof err.error.message === 'string') {
          interaction.editReply(err.error.message);
          return ;
        }
        const msg = err && typeof err.message === 'string' ? err.message : 'UNKNOWN ERROR OCCURRED';
        interaction.editReply(msg);
        return ;
      }
    }

    if (interaction.commandName === 'clear') {
      delete conversations[interaction.user.id];
      saveCacheToFile(conversations);
      interaction.reply('Conversation cleared.');
      return ;
    }
  });
  discord.on(Events.ClientReady, () => {
    console.log('[DC] Logged in.');
  });

  await registerCommands();
  await discord.login(config.discordToken);
}

async function importESM () {
  const { ChatGPTAPI } = await ESM.chatgpt;
  const {
    Client: DiscordClient,
    IntentsBitField, Events,
    SlashCommandBuilder, REST, Routes
  } = await ESM.discordJS;

  return {
    ChatGPTAPI,
    DiscordClient,
    IntentsBitField, Events,
    SlashCommandBuilder, REST, Routes
  };
}

function getCacheFromFile () {
  try {
    const str = fs.readFileSync('cache.json', 'utf-8');
    const obj = { ...JSON.parse(str) };
    return obj;
  } catch {
    return {};
  }
}

function saveCacheToFile (conversations) {
  try {
    fs.writeFileSync('cache.json', JSON.stringify(conversations, null, 2), 'utf-8');
  } catch {
    // ignore exception
  }
}

async function registerCommands () {
  const {
    SlashCommandBuilder,
    REST,
    Routes
  } = await importESM();

  const commandChat = new SlashCommandBuilder();
  commandChat.setName('chat')
    .setDescription('Chat with ChatGPT')
    .addStringOption(option =>
      option.setName('message')
        .setDescription('Chat message content')
        .setRequired(true));
  const commandClear = new SlashCommandBuilder();
  commandClear.setName('clear').setDescription('Clear conversation');

  const rest = new REST({ version: '10' }).setToken(config.discordToken);
  await rest.put(
    Routes.applicationCommands(config.discordClientID),
    {
      body: [
        commandChat.toJSON(),
        commandClear.toJSON(),
      ]
    }
  ).then(() => {
    console.log('[DC] Slash commands registered.');
  });
}
