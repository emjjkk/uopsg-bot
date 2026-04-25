import type {
  APIChatInputApplicationCommandInteraction,
  APIMessageComponentInteraction,
} from 'discord-api-types/v10'

type DiscordInteraction =
  | APIChatInputApplicationCommandInteraction
  | APIMessageComponentInteraction

const DISCORD_API_BASE = 'https://discord.com/api/v10'
const BOT_TOKEN = process.env.DISCORD_TOKEN ?? process.env.NEXT_PUBLIC_DISCORD_TOKEN
const VERIFICATION_ROLE_ID = '864028935619608587'

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function getStringOption(
  interaction: APIChatInputApplicationCommandInteraction,
  optionName: string
) {
  const option = interaction.data.options?.find((entry) => entry.name === optionName)

  if (
    !option ||
    typeof option !== 'object' ||
    !("value" in option) ||
    typeof (option as { value?: unknown }).value !== 'string'
  ) {
    return null
  }

  return (option as { value: string }).value
}

function isAdmin(interaction: APIChatInputApplicationCommandInteraction) {
  const permissions = interaction.member?.permissions

  if (!permissions) {
    return false
  }

  const adminPermission = BigInt(8)
  const memberPermissions = BigInt(permissions)

  return (memberPermissions & adminPermission) === adminPermission
}

async function sendVerificationPanel(channelId: string, roleId: string) {
  if (!BOT_TOKEN) {
    throw new Error('DISCORD_TOKEN is missing.')
  }

  const response = await fetch(`${DISCORD_API_BASE}/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      content:
        '## We\'re excited to have you here! \nPlease click the button below to get verified and access the rest of the channels. This helps us defend against raids and ensures a better experience for everyone. \n <:BLANK_ICON:1497426116070211614>',
      components: [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 3,
              label: '✔ Click to Verify',
              custom_id: `verify:${roleId}`,
            },
          ],
        },
      ],
    }),
  })

  if (!response.ok) {
    throw new Error(`Failed to send verification panel: ${response.status} ${await response.text()}`)
  }
}

async function addVerificationRole(guildId: string, userId: string, roleId: string) {
  if (!BOT_TOKEN) {
    throw new Error('DISCORD_TOKEN is missing.')
  }

  const response = await fetch(
    `${DISCORD_API_BASE}/guilds/${guildId}/members/${userId}/roles/${roleId}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bot ${BOT_TOKEN}`,
      },
    }
  )

  if (!response.ok && response.status !== 204) {
    throw new Error(`Failed to add verification role: ${response.status} ${await response.text()}`)
  }
}

export async function handleInteraction(interaction: DiscordInteraction) {
  if (interaction.type === 2) {
    const { name } = interaction.data

    if (name === 'ping') {
      return jsonResponse({
        type: 4,
        data: {
          content: '🏓 Pong!',
        },
      })
    }

    if (name === 'init-verification') {
      if (!isAdmin(interaction)) {
        return jsonResponse(
          {
            type: 4,
            data: {
              content: 'You need Administrator permission to use this command.',
              flags: 64,
            },
          },
          200
        )
      }

      const channelId = getStringOption(interaction, 'channel_id')

      if (!channelId) {
        return jsonResponse(
          {
            type: 4,
            data: {
              content: 'Please provide a valid channel id.',
              flags: 64,
            },
          },
          200
        )
      }

      if (!VERIFICATION_ROLE_ID) {
        return jsonResponse(
          {
            type: 4,
            data: {
              content:
                'Missing verification role id. Set VERIFICATION_ROLE_ID or NEXT_PUBLIC_VERIFICATION_ROLE_ID.',
              flags: 64,
            },
          },
          200
        )
      }

      await sendVerificationPanel(channelId, VERIFICATION_ROLE_ID)

      return jsonResponse({
        type: 4,
        data: {
          content: `Verification panel posted in <#${channelId}>.`,
          flags: 64,
        },
      })
    }

    return jsonResponse({
      type: 4,
      data: {
        content: 'Unknown command',
        flags: 64,
      },
    }, 400)
  }

  if (interaction.type === 3) {
    const customId = (interaction.data as { custom_id?: string }).custom_id ?? ''

    if (!customId.startsWith('verify:')) {
      return jsonResponse({
        type: 4,
        data: {
          content: 'Unknown button action.',
          flags: 64,
        },
      })
    }

    const roleId = customId.slice('verify:'.length)
    const guildId = interaction.guild_id
    const userId =
      (interaction as { member?: { user?: { id?: string } }; user?: { id?: string } }).member
        ?.user?.id ??
      (interaction as { member?: { user?: { id?: string } }; user?: { id?: string } }).user?.id

    if (!guildId || !userId) {
      return jsonResponse({
        type: 4,
        data: {
          content: 'This verification button can only be used inside a server.',
          flags: 64,
        },
      })
    }

    await addVerificationRole(guildId, userId, roleId)

    return jsonResponse({
      type: 4,
      data: {
        content: 'You are now verified.',
        flags: 64,
      },
    })
  }

  return jsonResponse('Unsupported interaction', 400)
}