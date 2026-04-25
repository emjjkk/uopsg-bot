// app/api/purge/route.ts
import { NextResponse } from "next/server";

const DISCORD_API = "https://discord.com/api/v10";
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

// small helper sleep
function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

// Parse retry after from either headers or body (seconds or ms)
async function parseRetryAfter(res: Response) {
  // header might be in seconds (string)
  const header = res.headers.get("retry-after") || res.headers.get("Retry-After");
  if (header) {
    const v = parseFloat(header);
    if (!Number.isNaN(v)) return v * 1000;
  }

  // fallback to body JSON
  try {
    const body = await res.clone().json();
    if (body && typeof body.retry_after === "number") {
      // discord returns seconds usually (float)
      return body.retry_after * 1000;
    } else if (body && typeof body.retry_after === "string") {
      const v = parseFloat(body.retry_after);
      if (!Number.isNaN(v)) return v * 1000;
    }
  } catch {
    // ignore JSON parse errors
  }
  // default backoff when unknown
  return 1000;
}

// make a request and handle 429s with waits + retries
async function fetchWithRateLimitAware(url: string, opts: RequestInit = {}, maxRetries = 6) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, opts);

    if (res.status !== 429) {
      // pass through other statuses (caller handles non-2xx)
      return res;
    }

    // 429 => read retry time and wait
    const waitMs = await parseRetryAfter(res);
    // small jitter
    const jitter = Math.random() * 200;
    await sleep(waitMs + jitter);

    // then retry
  }

  throw new Error("Exceeded retries due to repeated 429s");
}

// delete a single message with retries + small spacing
async function deleteMessage(channelId: string, messageId: string) {
  const url = `${DISCORD_API}/channels/${channelId}/messages/${messageId}`;
  const opts: RequestInit = {
    method: "DELETE",
    headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
  };

  const res = await fetchWithRateLimitAware(url, opts, 6);

  // if still non-ok, throw or ignore depending on status
  if (res.ok || res.status === 204) return true;

  // if 403 or 404 (forbidden / not found), ignore
  if (res.status === 403 || res.status === 404) return false;

  // otherwise log and false
  const txt = await res.text().catch(() => "");
  console.warn("delete message failed", res.status, txt);
  return false;
}

// Bulk-delete list of up to 100 ids (only for messages <14d old)
async function bulkDelete(channelId: string, ids: string[]) {
  if (ids.length < 2 || ids.length > 100) return { ok: false, status: 400 };

  const url = `${DISCORD_API}/channels/${channelId}/messages/bulk-delete`;
  const opts: RequestInit = {
    method: "POST",
    headers: {
      Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messages: ids }),
  };

  const res = await fetchWithRateLimitAware(url, opts, 6);
  return { ok: res.ok, status: res.status, text: await res.text().catch(() => "") };
}

async function fetchBatch(channelId: string) {
  const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages?limit=100`, {
    headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Failed to fetch messages: ${txt}`);
  }

  const messages = await res.json();
  if (!Array.isArray(messages)) return [];
  return messages;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const channelId = body?.channel_id;
    if (!channelId) {
      return NextResponse.json({ error: "channel_id is required" }, { status: 400 });
    }

    let totalDeleted = 0;
    let iterations = 0;

    // loop until channel empty or safety cap reached
    while (true) {
      iterations++;
      if (iterations > 200) break; // safety cap to avoid infinite loops

      const messages = await fetchBatch(channelId);
      if (!messages.length) break;

      // divide messages into "bulkable" (<14 days) and "old" (>=14 days)
      const now = Date.now();
      const bulkableIds: string[] = [];
      const oldMessages: { id: string }[] = [];

      for (const m of messages) {
        // message timestamp field is usually 'timestamp'
        const ts = new Date(m.timestamp).getTime();
        if (now - ts < FOURTEEN_DAYS_MS) {
          bulkableIds.push(m.id);
        } else {
          oldMessages.push({ id: m.id });
        }
      }

      // 1) Bulk delete in chunks of up to 100 (only if >=2 ids)
      if (bulkableIds.length >= 2) {
        // may be up to 100 already, but just chunk to be safe
        for (let i = 0; i < bulkableIds.length; i += 100) {
          const chunk = bulkableIds.slice(i, i + 100);
          const resp = await bulkDelete(channelId, chunk);
          if (resp.ok) {
            totalDeleted += chunk.length;
          } else {
            // if bulk failed (403/400) try fallback to single deletes for chunk
            for (const id of chunk) {
              const ok = await deleteMessage(channelId, id);
              if (ok) totalDeleted++;
              // small spacing to avoid hitting rate limits too hard
              await sleep(250);
            }
          }
          // after each bulk, small cooldown
          await sleep(250);
        }
      } else if (bulkableIds.length === 1) {
        // single bulkable item can't be bulk-deleted, delete individually
        const ok = await deleteMessage(channelId, bulkableIds[0]);
        if (ok) totalDeleted++;
        await sleep(250);
      }

      // 2) Delete old messages one-by-one (be gentle)
      for (const m of oldMessages) {
        const ok = await deleteMessage(channelId, m.id);
        if (ok) totalDeleted++;
        // careful spacing (Discord typical safe rate is ~5/s). Use 250-300ms gap
        await sleep(300);
      }

      // check if we should loop again (fetchBatch at top will verify)
      // small delay between batches
      await sleep(300);
    }

    return NextResponse.json({ success: true, total_deleted: totalDeleted });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}