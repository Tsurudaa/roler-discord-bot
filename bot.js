const { EmbedBuilder } = require('discord.js');
const { fetchLatestTweet } = require('./twitterFetcher');
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, AttachmentBuilder } = require('discord.js');
require('dotenv').config();

const commandShortcuts = require('./commandShortcuts.json');
const { processTemplate } = require('./templateEngine');
const welcomeMessages = require('./welcomeMessages');

const bot = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

bot.once('ready', () => {
  const NEWS_CHANNEL_ID = '1390895505869115482';

async function checkForNewTweet() {
  const tweet = await fetchLatestTweet();
  if (!tweet) return;

  const tweetUrl = `https://x.com/BPSR_Official`;
  const embed = new EmbedBuilder()
    .setColor('#1DA1F2')
    .setTitle('📰 New Tweet from @BPSR_Official')
    .setDescription(tweet.text)
    .setURL(tweetUrl)
    .setTimestamp(new Date(tweet.created_at));

  const channel = await bot.channels.fetch(NEWS_CHANNEL_ID);
  await channel.send({ embeds: [embed] });
}


setInterval(() => checkForNewTweet(bot), 2 * 60 * 1000);
  console.log(`Logged in as ${bot.user.tag}`);
});

bot.login(process.env.DISCORD_BOT_TOKEN);

const WELCOME_CHANNEL_ID = '1390209671087915079';
const WELCOME_IMAGE_DIR = path.join(__dirname, 'welcome-images');

const reactionRoleMessageId = 'your-message-id';
const emojiRoleMap = {
  '✅': 'role-id-1',
  '🎮': 'role-id-2',
  '📚': 'role-id-3'
};

const { Server } = require('socket.io');
let io;

function setSocket(serverIO) {
  io = serverIO;
}

const { EmbedBuilder } = require('discord.js');

bot.on('guildMemberAdd', async member => {
  const channel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
  if (!channel) return;

  
  const messageTemplate = welcomeMessages[Math.floor(Math.random() * welcomeMessages.length)];
  const welcomeText = messageTemplate.replace('{user}', `<@${member.id}>`);


  let imagePath = null;
  try {
    const files = fs.readdirSync(WELCOME_IMAGE_DIR).filter(file => /\.(jpg|jpeg|png|gif)$/i.test(file));
    if (files.length > 0) {
      const randomImage = files[Math.floor(Math.random() * files.length)];
      imagePath = path.join(WELCOME_IMAGE_DIR, randomImage);
    }
  } catch (err) {
    console.error('Error reading welcome image folder:', err);
  }


  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle('⚔️ New Member!')
    .setDescription(welcomeText)
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .setTimestamp();

  if (imagePath) {
    const attachment = new AttachmentBuilder(imagePath);
    embed.setImage(`attachment://${path.basename(imagePath)}`);
    await channel.send({ embeds: [embed], files: [attachment] });
  } else {
    await channel.send({ embeds: [embed] });
  }

  if (io) io.emit('memberUpdate', { type: 'join', timestamp: new Date() });
});

bot.on('guildMemberRemove', member => {
  const channel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
  if (channel) {
    channel.send(`👋 ${member.user.tag} has left the guild.`);
  }
  if (io) io.emit('memberUpdate', { type: 'leave', timestamp: new Date() });
});

bot.on('messageReactionAdd', async (reaction, user) => {
  if (reaction.message.id !== reactionRoleMessageId || user.bot) return;
  const roleId = emojiRoleMap[reaction.emoji.name];
  if (!roleId) return;

  const member = await reaction.message.guild.members.fetch(user.id);
  member.roles.add(roleId);
});

bot.on('messageReactionRemove', async (reaction, user) => {
  if (reaction.message.id !== reactionRoleMessageId || user.bot) return;
  const roleId = emojiRoleMap[reaction.emoji.name];
  if (!roleId) return;

  const member = await reaction.message.guild.members.fetch(user.id);
  member.roles.remove(roleId);
});

bot.on('messageCreate', async message => {
  if (message.author.bot) return;

  const prefix = '!';
  if (!message.content.startsWith(prefix)) return;

  const fullCommand = message.content.slice(prefix.length).trim().toLowerCase();
  const [cmd, ...args] = fullCommand.split(/\s+/);

  if (cmd === 'clean') {
    if (!message.member.permissions.has('ManageMessages')) {
      return message.reply('❌ You don’t have permission to do that.');
    }

    const mention = message.mentions.users.first();
    const amount = parseInt(args[mention ? 1 : 0]);

    if (isNaN(amount) || amount < 1 || amount > 100) {
      return message.reply('❌ Please provide a number between 1 and 100. Example: `!clean 25` or `!clean @User 10`');
    }

    try {
      const messages = await message.channel.messages.fetch({ limit: 100 });
      const deletable = messages
        .filter(m => Date.now() - m.createdTimestamp < 14 * 24 * 60 * 60 * 1000)
        .filter(m => !mention || m.author.id === mention.id)
        .first(amount + 1);

      await message.channel.bulkDelete(deletable, true);
      const reply = await message.channel.send(
        mention
          ? `🧹 Deleted ${deletable.length - 1} messages from ${mention.tag}.`
          : `🧹 Deleted ${deletable.length - 1} recent messages.`
      );
      setTimeout(() => reply.delete().catch(() => {}), 5000);
    } catch (err) {
      console.error('Error deleting messages:', err);
      message.channel.send('❌ Failed to delete messages.');
    }

    return;
  }

  if (commandShortcuts[fullCommand]) {
    const rawResponse = commandShortcuts[fullCommand];
    const finalResponse = processTemplate(rawResponse, message, args);
    return await message.channel.send(finalResponse);
  }
});

module.exports = { bot, setSocket };
