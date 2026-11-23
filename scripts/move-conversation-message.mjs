/**
 * Move one chat message into another conversation.
 * Runs inside the production app container (node, pg, ioredis, DATABASE_URL).
 * The docker wrapper pipes this file into `node --input-type=module`.
 *
 * Env: MOVE_FROM, MOVE_TO, MOVE_MESSAGE, MOVE_APPLY=1
 */
import pg from "pg";
import Redis from "ioredis";

const fromId = process.env.MOVE_FROM?.trim();
const toId = process.env.MOVE_TO?.trim();
const messageId = process.env.MOVE_MESSAGE?.trim();
const apply = process.env.MOVE_APPLY === "1";

function requireUuid(value, name) {
  if (!value || !/^[0-9a-f-]{36}$/i.test(value)) {
    throw new Error(`Pass ${name}`);
  }
  return value;
}

function databaseTarget() {
  const raw = process.env.DATABASE_URL;
  if (!raw) return "(DATABASE_URL is not set)";
  try {
    const url = new URL(raw);
    return `${url.hostname}${url.pathname}`;
  } catch {
    return "(DATABASE_URL is not a URL)";
  }
}

function personLabel(row) {
  if (!row) return "—";
  const name = [row.first_name, row.last_name].filter(Boolean).join(" ");
  return name || row.email || "—";
}

function preview(content, imageUrl, messageType) {
  const text = content?.trim() ?? "";
  if (messageType === "voice") return "Голосовое сообщение";
  if (messageType === "call") return "Звонок";
  if (messageType === "video") return "Видео";
  if (messageType === "file") return "Файл";
  if (messageType === "ai_consilium") return "AI консилиум";
  if (messageType === "questionnaire" || messageType === "questionnaire_template") {
    return templateName(text) ?? "Опросник";
  }
  if (text.startsWith("{") && /"(?:templateId|instanceId)"\s*:/.test(text)) {
    return templateName(text) ?? "Опросник";
  }
  if (text) return text.length > 500 ? `${text.slice(0, 500)}…` : text;
  if (imageUrl) return "Фото";
  return null;
}

function templateName(text) {
  try {
    const parsed = JSON.parse(text);
    const name = typeof parsed.templateName === "string" ? parsed.templateName.trim() : "";
    if (name && (parsed.instanceId || parsed.templateId)) return name;
  } catch {
    const match = text.match(/"templateName"\s*:\s*"((?:\\.|[^"\\])*)"/);
    if (match) return match[1].replace(/\\"/g, '"').trim() || null;
  }
  return null;
}

async function chatLabel(client, conversation) {
  const participants = await client.query(
    `SELECT cp.display_name, u.first_name, u.last_name, u.email
     FROM conversation_participants cp
     LEFT JOIN users u ON u.id = cp.user_id
     WHERE cp.conversation_id = $1`,
    [conversation.id]
  );
  const names = participants.rows
    .map((row) => row.display_name?.trim() || personLabel(row))
    .filter((name) => name && name !== "—");
  const patient = conversation.patient_user_id
    ? (
        await client.query(
          "SELECT first_name, last_name, email FROM users WHERE id = $1",
          [conversation.patient_user_id]
        )
      ).rows[0]
    : undefined;
  return [
    conversation.type,
    conversation.deleted_at ? "deleted" : "active",
    names.length > 0 ? names.join(", ") : "(no participants)",
    `patient=${personLabel(patient)}`,
  ].join(" | ");
}

async function refreshLastMessage(client, conversationId) {
  const last = await client.query(
    `SELECT content, image_url, message_type, created_at
     FROM conversation_messages
     WHERE conversation_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [conversationId]
  );
  const row = last.rows[0];
  await client.query(
    `UPDATE conversations
     SET last_message_at = $2,
         last_message_preview = $3,
         updated_at = now()
     WHERE id = $1`,
    [
      conversationId,
      row?.created_at ?? null,
      row ? preview(row.content, row.image_url, row.message_type) : null,
    ]
  );
}

async function clearRecentCache(conversationIds) {
  const url =
    process.env.REDIS_URL ??
    (process.env.REDIS_HOST ? `redis://${process.env.REDIS_HOST}:6379` : undefined);
  if (!url) {
    console.log("Redis: not configured, recent cache left as-is");
    return;
  }
  const redis = new Redis(url, { maxRetriesPerRequest: 1, connectTimeout: 3000 });
  try {
    const keys = conversationIds.map((id) => `conversation:recent:${id}`);
    await redis.del(...keys);
    console.log(`Redis: cleared ${keys.join(", ")}`);
  } catch (err) {
    console.error("Redis: cache was not cleared", err);
  } finally {
    redis.disconnect();
  }
}

requireUuid(fromId, "MOVE_FROM");
requireUuid(toId, "MOVE_TO");
requireUuid(messageId, "MOVE_MESSAGE");
if (fromId === toId) throw new Error("MOVE_FROM and MOVE_TO are the same chat");

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  console.log(`Mode: ${apply ? "apply" : "dry-run"}`);
  console.log(`Database: ${databaseTarget()}`);

  const messageResult = await client.query(
    "SELECT * FROM conversation_messages WHERE id = $1",
    [messageId]
  );
  const message = messageResult.rows[0];
  if (!message) throw new Error(`Message ${messageId} was not found`);
  if (message.conversation_id !== fromId) {
    throw new Error(`Message is in chat ${message.conversation_id}, not ${fromId}`);
  }

  const source = (await client.query("SELECT * FROM conversations WHERE id = $1", [fromId])).rows[0];
  const target = (await client.query("SELECT * FROM conversations WHERE id = $1", [toId])).rows[0];
  if (!source) throw new Error(`Source chat ${fromId} was not found`);
  if (!target) throw new Error(`Destination chat ${toId} was not found`);
  if (target.deleted_at) throw new Error(`Destination chat ${toId} is deleted`);

  const instances = (
    await client.query(
      "SELECT id, patient_user_id FROM questionnaire_instances WHERE message_id = $1",
      [messageId]
    )
  ).rows;
  const replies = (
    await client.query(
      "SELECT id FROM conversation_messages WHERE reply_to_message_id = $1",
      [messageId]
    )
  ).rows;
  const comments = (
    await client.query(
      "SELECT id FROM conversation_message_comments WHERE message_id = $1",
      [messageId]
    )
  ).rows;

  console.log(
    `Message: ${message.id} type=${message.message_type} at=${message.created_at?.toISOString?.() ?? message.created_at}`
  );
  console.log(`From: ${fromId}`);
  console.log(`  ${await chatLabel(client, source)}`);
  console.log(`To: ${toId}`);
  console.log(`  ${await chatLabel(client, target)}`);
  if (message.message_type === "questionnaire" && instances.length === 0) {
    console.log("Questionnaire instance: none linked to this message");
  }
  for (const instance of instances) {
    console.log(
      `Questionnaire instance ${instance.id}: patient ${instance.patient_user_id ?? "unbound"} -> ${target.patient_user_id ?? "unbound"}`
    );
  }
  if (message.reply_to_message_id) {
    console.log(`Reply target ${message.reply_to_message_id} will be cleared; it stays in the source chat`);
  }
  if (replies.length > 0) {
    console.log(`Replies left behind in the source chat: ${replies.map((row) => row.id).join(", ")}`);
  }
  console.log(`Comments moved with the message: ${comments.length}`);

  if (!apply) {
    console.log("Dry-run only. Pass --apply to move the message.");
  } else {
    await client.query("BEGIN");
    await client.query(
      `UPDATE conversation_messages
       SET conversation_id = $2, reply_to_message_id = NULL
       WHERE id = $1`,
      [messageId, toId]
    );
    if (instances.length > 0) {
      await client.query(
        `UPDATE questionnaire_instances
         SET conversation_id = $2,
             patient_user_id = $3,
             updated_at = now()
         WHERE message_id = $1`,
        [messageId, toId, target.patient_user_id]
      );
    }
    if (comments.length > 0) {
      await client.query(
        `UPDATE conversation_message_comments
         SET conversation_id = $2
         WHERE message_id = $1`,
        [messageId, toId]
      );
    }
    await refreshLastMessage(client, fromId);
    await refreshLastMessage(client, toId);
    await client.query("COMMIT");
    await clearRecentCache([fromId, toId]);
    console.log("Moved.");
  }
} catch (err) {
  try {
    await client.query("ROLLBACK");
  } catch {
    // no open transaction
  }
  throw err;
} finally {
  await client.end();
}
