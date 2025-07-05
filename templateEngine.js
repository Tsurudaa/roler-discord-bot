const moment = require('moment');

function evaluateMath(expr) {
  try {
    return Function(`"use strict"; return (${expr})`)();
  } catch {
    return 'NaN';
  }
}

function processTemplate(template, message, args = []) {
  return template
    .replace(/{user}/gi, `<@${message.author.id}>`)
    .replace(/{username}/gi, message.author.username)
    .replace(/{tag}/gi, message.author.tag)
    .replace(/{channel}/gi, `<#${message.channel.id}>`)
    .replace(/{server}/gi, message.guild?.name || 'this server')
    .replace(/{date}/gi, moment().format('LL'))
    .replace(/{time}/gi, moment().format('LT'))
    .replace(/{args}/gi, args.join(' '))
    .replace(/{mention:(\d+)}/gi, (_, id) => `<@${id}>`)
    .replace(/{emoji:([^}]+)}/gi, (_, name) => {
      const emoji = message.guild.emojis.cache.find(e => e.name === name);
      return emoji ? `<:${emoji.name}:${emoji.id}>` : name;
    })
    .replace(/{random:([^}]+)}/gi, (_, options) => {
      const choices = options.split('|').map(s => s.trim());
      return choices[Math.floor(Math.random() * choices.length)];
    })
    .replace(/{math:([^}]+)}/gi, (_, expr) => evaluateMath(expr))
    .replace(/{if:([^|]+)\|([^|]*)\|([^}]*)}/gi, (_, condition, yes, no) => {
      const [left, right] = condition.split('=').map(s => s.trim());
      return left === right ? yes : no;
    });
}

module.exports = { processTemplate };