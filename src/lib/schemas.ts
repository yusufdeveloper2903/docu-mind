import { z } from "zod";

export const chatRequestSchema = z.object({
  question: z.string().trim().min(1, "Ask a question.").max(2000),
  conversationId: z.uuid().optional(),
});

export const idSchema = z.uuid();
