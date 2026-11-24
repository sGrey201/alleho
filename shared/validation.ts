import { z } from "zod";

/** JSON stored in conversation_messages.content when message_type is `poll`. */
export const pollPayloadSchema = z
  .object({
    question: z.string().trim().min(1).max(500),
    options: z.array(z.string().trim().min(1).max(200)).min(2).max(10),
    allowMultiple: z.boolean(),
    quizMode: z.boolean().optional().default(false),
    correctOptionIndex: z.number().int().min(0).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.quizMode && data.allowMultiple) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Quiz mode cannot allow multiple answers",
        path: ["allowMultiple"],
      });
    }
    if (data.quizMode) {
      if (data.correctOptionIndex === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Correct option required in quiz mode",
          path: ["correctOptionIndex"],
        });
      } else if (data.correctOptionIndex >= data.options.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Correct option index out of range",
          path: ["correctOptionIndex"],
        });
      }
    }
  });
export type PollPayload = z.infer<typeof pollPayloadSchema>;

/**
 * JSON stored in conversation_messages.content when message_type is `voice`.
 * The audio object path itself is stored in the `image_url` column (reused as a
 * generic attachment URL) so no schema migration is required.
 */
export const voicePayloadSchema = z.object({
  durationSec: z.number().int().min(0).max(36000),
});
export type VoicePayload = z.infer<typeof voicePayloadSchema>;

/**
 * JSON stored in conversation_messages.content when message_type is `call`.
 * The recording object path, once ready, is stored in `image_url`.
 */
export const callPayloadSchema = z.object({
  durationSec: z.number().int().min(0).max(86400),
});
export type CallPayload = z.infer<typeof callPayloadSchema>;

/**
 * JSON stored in conversation_messages.content when message_type is `video`.
 * The video object path is in `image_url`; optional poster preview URL is stored here.
 */
export const videoPayloadSchema = z.object({
  posterUrl: z.string().trim().min(1).optional(),
});
export type VideoPayload = z.infer<typeof videoPayloadSchema>;

/**
 * JSON stored in conversation_messages.content when message_type is `file`.
 * The object path is stored in `image_url` (generic attachment URL).
 */
export const filePayloadSchema = z.object({
  name: z.string().trim().min(1).max(255),
  size: z.number().int().min(0).max(500 * 1024 * 1024),
  mimeType: z.string().trim().min(1).max(200).default("application/octet-stream"),
});
export type FilePayload = z.infer<typeof filePayloadSchema>;
