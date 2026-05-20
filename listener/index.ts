import express from "express";
import "dotenv/config";
import {
  Client,
  GatewayIntentBits,
  ActivityType,
  PermissionFlagsBits,
  type Guild,
} from "discord.js";

const WATCH_CHANNEL_ID = "1497431258274332702";
const WELCOME_CHANNEL_ID = "812056538650378311";
const INVITE_LINK_REGEX = /https?:\/\/(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/[A-Za-z0-9-]+/i;
const SHORTENED_URL_REGEX = /https?:\/\/(bit\.ly|tinyurl\.com|short\.link|goo\.gl|ow\.ly|rebrand\.ly|t\.co|buff\.ly|adf\.ly|is\.gd|tni\.li|bitly\.com|shorturl\.at|cutt\.us)\//i;


// Scam detection patterns
const SCAM_KEYWORDS = [
  "verify your account",
  "claim your reward",
  "limited time offer",
  "confirm identity",
  "urgent action required",
  "verify now",
  "confirm now",
  "update payment",
  "suspended account",
  "verify email",
];

const SUSPICIOUS_DOMAINS = [
  "steam-community.com",
  "steamcommunity-verification.com",
  "nitro-gift.com",
  "discord-nitro.me",
  "steam-gifts.com",
  "discord-verification.com",
  "nitro-codes.com",
];

function isViolatingMessage(content: string): boolean {
  // Check for Discord invite links
  if (INVITE_LINK_REGEX.test(content)) {
    return true;
  }

  // Check for shortened URLs
  if (SHORTENED_URL_REGEX.test(content)) {
    return true;
  }

  // Check for suspicious domains
  if (SUSPICIOUS_DOMAINS.some(domain => content.toLowerCase().includes(domain))) {
    return true;
  }

  // Check for scam keywords
  const lowerContent = content.toLowerCase();
  if (SCAM_KEYWORDS.some(keyword => lowerContent.includes(keyword))) {
    return true;
  }

  return false;
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

async function getAdminMentions(guild: Guild) {
  const members = await guild.members.fetch();
  const adminMentions = members
    .filter((member) => member.permissions.has(PermissionFlagsBits.Administrator))
    .map((member) => `<@${member.id}>`)
    .join(" ");

  return adminMentions || "@here";
}

client.once("clientReady", () => {
  console.log(`✅ Logged in as ${client?.user?.tag}`);

  client.user?.setPresence({
    status: 'idle', // 'online', 'idle', 'dnd', 'invisible'
    activities: [
      {
        name: 'the UoPeople Study Group Discord Server', // The activity's name
        type: ActivityType.Watching, // Playing, Listening, Watching, Competing
      },
    ],
  });
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) {
    return;
  }

  // Check for policy violations (scams, invite links, etc.)
  if (isViolatingMessage(message.content) && message.guild) {
    try {
      const member = await message.guild.members.fetch(message.author.id);
      
      // Mute the user for 24 hours (86400000 milliseconds)
      await member.timeout(86400000, "Posted prohibited content");
      
      // Delete the message
      await message.delete();
      
      // Send the warning message
      await message.channel.send(
        `Hi, <@${message.author.id}> - Your message was deleted and you're currently on mute because your message appeared to violate our rules. If you think this is a mistake, please dm <@382826892321726465> or <@248393071620177920> with your concerns.`
      );
    } catch (error) {
      console.error("Failed to moderate message:", error);
      await message.channel.send(
        `⚠️ Violation detected from <@${message.author.id}> but moderation action could not be taken (likely due to permissions).`
      );
    }
    return;
  }

  if (message.channelId !== WATCH_CHANNEL_ID || !message.guild) {
    return;
  }

  const adminMentions = await getAdminMentions(message.guild);

  try {
    await message.guild.members.ban(message.author.id, {
      reason: `Posted in restricted channel ${WATCH_CHANNEL_ID}`,
    });

    await message.channel.send(
      `@${message.author.username} (${message.author.id}) was banned.`
    );
  } catch (error) {
    console.error("Failed to auto-ban user:", error);
    await message.channel.send(
      `Failed to ban ${message.author.username} (${message.author.id}). Please review manually.`
    );
  }
});

client.on("guildMemberAdd", async (member) => {
  try {
    const channel = await member.guild.channels.fetch(WELCOME_CHANNEL_ID);

    if (!channel || !channel.isTextBased()) {
      console.error(`Welcome channel ${WELCOME_CHANNEL_ID} is not available or not text-based.`);
      return;
    }

    await channel.send(
      `Welcome ${member} to ${member.guild.name}! Feel free to introduce yourself in this channel. Be sure to read the rules at <#812051994901741588> and get yourself some roles at <#812097807212216361>.`
    );
  } catch (error) {
    console.error("Failed to send welcome message:", error);
  }
});

const token = process.env.DISCORD_TOKEN?.trim();

if (!token) {
  throw new Error("DISCORD_TOKEN is missing. Add it to listener/.env");
}

client.login(token);

const app = express();

app.get("/", (req, res) => {
  res.status(200).send("Bot is alive");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🌐 Keep-alive server running on port ${PORT}`);
});
