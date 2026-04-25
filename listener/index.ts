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

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
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