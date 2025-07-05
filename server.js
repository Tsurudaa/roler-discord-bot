const fs = require('fs');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const bodyParser = require('body-parser');
require('dotenv').config();

const { bot, setSocket } = require('./bot');
const moment = require('moment');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
setSocket(io);

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

passport.use(new DiscordStrategy({
  clientID: process.env.DISCORD_CLIENT_ID,
  clientSecret: process.env.DISCORD_CLIENT_SECRET,
  callbackURL: process.env.DISCORD_CALLBACK_URL,
  scope: ['identify', 'guilds', 'guilds.members.read'],
}, (accessToken, refreshToken, profile, done) => {
  process.nextTick(() => done(null, profile));
}));

app.use(passport.initialize());
app.use(passport.session());

function checkAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect('/login');
}

// Load commands from JSON
const commandsPath = path.join(__dirname, 'commandShortcuts.json');
let commandShortcuts = {};
try {
  commandShortcuts = JSON.parse(fs.readFileSync(commandsPath, 'utf-8'));
} catch (err) {
  console.error('Failed to load commandShortcuts.json:', err);
}

// Routes
app.get('/', (req, res) => res.redirect('/menu'));
app.get('/login', passport.authenticate('discord'));
app.get('/callback', passport.authenticate('discord', { failureRedirect: '/' }), (req, res) => res.redirect('/menu'));
app.get('/logout', (req, res) => req.logout(() => res.redirect('/')));

app.get('/dashboard', checkAuth, async (req, res) => {
  const guild = await bot.guilds.fetch(process.env.GUILD_ID);
  const members = await guild.members.fetch();
  const roles = guild.roles.cache.filter(r => r.name !== '@everyone');

  res.render('dashboard', {
    user: req.user,
    members: members.map(m => ({
      id: m.id,
      tag: m.user.tag,
      displayName: m.displayName || m.user.username,
      roles: m.roles.cache.map(r => r.id)
    })),
    roles: roles.map(r => ({ id: r.id, name: r.name })),
  });
});

app.post('/assign-role', checkAuth, async (req, res) => {
  const { userId, roleId } = req.body;
  const guild = await bot.guilds.fetch(process.env.GUILD_ID);
  const member = await guild.members.fetch(userId);
  await member.roles.add(roleId);
  res.redirect('/dashboard');
});

app.post('/remove-role', checkAuth, async (req, res) => {
  const { userId, roleId } = req.body;
  const guild = await bot.guilds.fetch(process.env.GUILD_ID);
  const member = await guild.members.fetch(userId);
  await member.roles.remove(roleId);
  res.redirect('/dashboard');
});

app.get('/stats', checkAuth, async (req, res) => {
  const guild = await bot.guilds.fetch(process.env.GUILD_ID);
  const members = await guild.members.fetch({ withPresences: false });

  const now = moment();
  const oneDay = now.clone().subtract(1, 'days');
  const oneWeek = now.clone().subtract(7, 'days');
  const oneMonth = now.clone().subtract(30, 'days');

  const auditLogs = await guild.fetchAuditLogs({ type: 28, limit: 100 });
  const leaves = auditLogs.entries.map(entry => entry.createdAt);

  const joined = members.filter(m => m.joinedAt);
  const stats = {
    total: members.size,
    joinedToday: joined.filter(m => moment(m.joinedAt).isAfter(oneDay)).size,
    joinedWeek: joined.filter(m => moment(m.joinedAt).isAfter(oneWeek)).size,
    joinedMonth: joined.filter(m => moment(m.joinedAt).isAfter(oneMonth)).size,
    leftToday: leaves.filter(d => moment(d).isAfter(oneDay)).length,
    leftWeek: leaves.filter(d => moment(d).isAfter(oneWeek)).length,
    leftMonth: leaves.filter(d => moment(d).isAfter(oneMonth)).length
  };

  res.render('stats', { user: req.user, stats });
});

app.get('/api/stats', checkAuth, async (req, res) => {
  const guild = await bot.guilds.fetch(process.env.GUILD_ID);
  const members = await guild.members.fetch({ withPresences: false });

  const now = moment();
  const oneDay = now.clone().subtract(1, 'days');
  const oneWeek = now.clone().subtract(7, 'days');
  const oneMonth = now.clone().subtract(30, 'days');

  const auditLogs = await guild.fetchAuditLogs({ type: 28, limit: 100 });
  const leaves = auditLogs.entries.map(entry => entry.createdAt);

  const joined = members.filter(m => m.joinedAt);
  const stats = {
    joinedToday: joined.filter(m => moment(m.joinedAt).isAfter(oneDay)).size,
    joinedWeek: joined.filter(m => moment(m.joinedAt).isAfter(oneWeek)).size,
    joinedMonth: joined.filter(m => moment(m.joinedAt).isAfter(oneMonth)).size,
    leftToday: leaves.filter(d => moment(d).isAfter(oneDay)).length,
    leftWeek: leaves.filter(d => moment(d).isAfter(oneWeek)).length,
    leftMonth: leaves.filter(d => moment(d).isAfter(oneMonth)).length
  };

  res.json(stats);
});

app.get('/terminal', checkAuth, (req, res) => {
  res.render('terminal', { output: null });
});

app.post('/terminal', checkAuth, async (req, res) => {
  const command = req.body.command;
  let output = '';

  try {
    if (command.startsWith('say ')) {
      const channel = await bot.channels.fetch(process.env.TERMINAL_CHANNEL_ID);
      await channel.send(command.slice(4));
      output = '✅ Message sent.';
    } else {
      output = '❌ Unknown command.';
    }
  } catch (err) {
    output = `❌ Error: ${err.message}`;
  }

  res.render('terminal', { output });
});

app.get('/commands', checkAuth, (req, res) => {
  res.render('commands', { commands: commandShortcuts });
});

app.post('/commands/add', checkAuth, (req, res) => {
  const { trigger, response } = req.body;
  commandShortcuts[trigger.toLowerCase()] = response;
  fs.writeFileSync(commandsPath, JSON.stringify(commandShortcuts, null, 2));
  res.redirect('/commands');
});

app.post('/commands/delete', checkAuth, (req, res) => {
  delete commandShortcuts[req.body.trigger.toLowerCase()];
  fs.writeFileSync(commandsPath, JSON.stringify(commandShortcuts, null, 2));
  res.redirect('/commands');
});

app.get('/menu', checkAuth, (req, res) => {
  res.render('menu');
});

app.post('/roles/create', checkAuth, async (req, res) => {
  const { name, color, hoist, mentionable } = req.body;
  const guild = await bot.guilds.fetch(process.env.GUILD_ID);

  try {
    await guild.roles.create({
      name,
      color,
      hoist: hoist === 'on',
      mentionable: mentionable === 'on'
    });
    res.redirect('/dashboard');
  } catch (err) {
    console.error('Error creating role:', err);
    res.status(500).send('Failed to create role');
  }
});

app.get('/roles/edit/:id', checkAuth, async (req, res) => {
  const guild = await bot.guilds.fetch(process.env.GUILD_ID);
  const role = guild.roles.cache.get(req.params.id);

  if (!role) return res.status(404).send('Role not found');

  const { PermissionsBitField } = require('discord.js');

  const permissionCategories = {
  'General Server Permissions': [
    'Administrator', 'ViewAuditLog', 'ManageGuild', 'ManageRoles', 'ManageWebhooks', 'ManageEmojisAndStickers'
  ],
  'Membership Permissions': [
    'CreateInstantInvite', 'KickMembers', 'BanMembers', 'ModerateMembers'
  ],
  'Text Channel Permissions': [
    'ManageChannels', 'ManageMessages', 'ReadMessageHistory', 'SendMessages', 'SendTTSMessages',
    'EmbedLinks', 'AttachFiles', 'MentionEveryone', 'UseExternalEmojis', 'UseExternalStickers'
  ],
  'Voice Channel Permissions': [
    'Connect', 'Speak', 'MuteMembers', 'DeafenMembers', 'MoveMembers', 'UseVAD', 'PrioritySpeaker', 'Stream'
  ],
  'Apps Permissions': [
    'UseApplicationCommands', 'ManageEvents', 'ManageThreads', 'CreatePublicThreads',
    'CreatePrivateThreads', 'SendMessagesInThreads'
  ],
  'Event Permissions': [
    'RequestToSpeak', //'StartEmbeddedActivities'
  ],
  'Advanced Permissions': [
    'ViewChannel', 'ManageNicknames', 'ChangeNickname'
  ]
};

  res.render('edit-role', {
    user: req.user,
    role: {
      id: role.id,
      name: role.name,
      color: role.hexColor,
      hoist: role.hoist,
      mentionable: role.mentionable,
      permissions: role.permissions.toArray()
    },
    permissionCategories
  });
});

app.post('/roles/edit/:id', async (req, res) => {
  const roleId = req.params.id;
  const { name, color, hoist, mentionable, permissions } = req.body;

  try {
    const guild = await bot.guilds.fetch(process.env.GUILD_ID);
    const role = await guild.roles.fetch(roleId);

    const resolvedPermissions = permissions
      ? Array.isArray(permissions)
        ? permissions
        : [permissions]
      : [];

    console.log('Updating role with:', {
      name,
      color,
      hoist: !!hoist,
      mentionable: !!mentionable,
      permissions: resolvedPermissions
    });

    const { PermissionsBitField } = require('discord.js');

    await role.edit({
      name,
      color,
      hoist: !!hoist,
      mentionable: !!mentionable,
      permissions: new PermissionsBitField(resolvedPermissions)
    });

    res.redirect('/dashboard');
  } catch (err) {
    console.error('Failed to update role:', err);
    res.status(500).send(`Failed to update role: ${err.message}`);
  }
});

app.get('/roles', checkAuth, async (req, res) => {
  const guild = await bot.guilds.fetch(process.env.GUILD_ID);
  const roles = guild.roles.cache.filter(r => r.name !== '@everyone');

  res.render('roles', {
    user: req.user,
    roles: roles.map(r => ({
      id: r.id,
      name: r.name,
      color: r.hexColor
    }))
  });
});

app.get('/users', checkAuth, async (req, res) => {
  const guild = await bot.guilds.fetch(process.env.GUILD_ID);
  const members = await guild.members.fetch();

  res.render('users', {
    user: req.user,
    members: members.map(m => ({
      id: m.id,
      tag: m.user.tag,
      avatar: m.user.displayAvatarURL({ dynamic: true }),
      nickname: m.displayName,
      roles: m.roles.cache.map(r => r.name).filter(r => r !== '@everyone'),
      isBannable: m.bannable,
      isKickable: m.kickable
    }))
  });
});


app.post('/users/action', checkAuth, async (req, res) => {
  const { userId, action } = req.body;
  const guild = await bot.guilds.fetch(process.env.GUILD_ID);
  const member = await guild.members.fetch(userId);

  try {
    if (action === 'kick') {
      await member.kick('Kicked via dashboard');
    } else if (action === 'ban') {
      await member.ban({ reason: 'Banned via dashboard' });
    } else if (action === 'timeout') {
      const ms = 10 * 60 * 1000; // 10 minutes
      await member.timeout(ms, 'Silenced via dashboard');
    }
    res.redirect('/users');
  } catch (err) {
    console.error('Action failed:', err);
    res.status(500).send('Failed to perform action');
  }
});

server.listen(3000, () => console.log('Dashboard running on http://localhost:3000'));