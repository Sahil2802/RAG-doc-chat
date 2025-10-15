/**
 * AI Service
 * Handles streaming responses from OpenAI (GPT) providers.
 *
 * Notes:
 * - This module requires an OPENAI_API_KEY environment variable.
 * - Errors from the OpenAI client are propagated to callers; the controller
 *   should handle and notify clients accordingly.
 */

import OpenAI from "openai";

/**
 * Type for SSE streaming chunks sent to client
 */
export interface StreamChunk {
  type: "token" | "done" | "error";
  content?: string;
  messageId?: string;
  error?: string;
}

/**
 * Options for AI streaming
 */
export interface StreamOptions {
  conversationId: string;
  prompt: string;
  messageHistory?: Array<{ role: string; content: string }>;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Stream AI response with real-time token delivery using OpenAI
 *
 * @param options - Configuration for AI request
 * @param sendEvent - Callback to send SSE events to client
 * @returns Complete AI response text
 *
 * @example
 * ```typescript
 * const fullResponse = await streamAIResponse(
 *   { prompt: "Hello", conversationId: "123" },
 *   (chunk) => res.write(`data: ${JSON.stringify(chunk)}\n\n`)
 * );
 * ```
 */
export async function streamAIResponse(
  options: StreamOptions,
  sendEvent: (data: StreamChunk) => void
): Promise<string> {
  // Require OpenAI API key for production streaming
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  // Let errors propagate to the caller; controller should handle and notify client
  return await openAIStreamResponse(options, sendEvent);
}

/**
 * OpenAI streaming implementation
 */
async function openAIStreamResponse(
  options: StreamOptions,
  sendEvent: (data: StreamChunk) => void
): Promise<string> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // Build messages array with history
  const messages: Array<{ role: string; content: string }> = [
    ...(options.messageHistory || []),
    { role: "user", content: options.prompt },
  ];

  const stream = await openai.chat.completions.create({
    model: options.model || "gpt-4o-mini", // Using gpt-4o-mini for faster/cheaper responses
    messages: messages as any,
    stream: true,
    max_tokens: options.maxTokens,
    temperature: options.temperature || 0.7,
  });

  let fullResponse = "";

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || "";
    if (content) {
      fullResponse += content;
      sendEvent({ type: "token", content });
    }
  }

  return fullResponse;
}
