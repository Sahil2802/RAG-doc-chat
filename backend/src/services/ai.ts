import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

// Initialize Gemini 2.0 Flash (Experimental)
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || "");

// Type definitions for streaming
export interface StreamChunk {
  type: "token" | "done" | "error";
  content?: string;
  messageId?: string;
  error?: string;
}

export interface StreamOptions {
  conversationId: string;
  prompt: string;
  signal?: AbortSignal;
  messageHistory?: Array<{ role: string; content: string }>;
}

/**
 * Generate AI response using Google Gemini 2.0 Flash
 * @param prompt - The user's message/prompt
 * @param context - Optional context from previous messages or documents
 * @returns AI generated response
 */
export async function generateAIResponse(
  prompt: string,
  context?: string
): Promise<string> {
  try {
    // Validate API key
    if (!process.env.GOOGLE_API_KEY) {
      throw new Error(
        "GOOGLE_API_KEY is not configured in environment variables"
      );
    }

    // Get the generative model (using gemini-2.0-flash-exp - latest experimental model)
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

    // Construct the full prompt with context if provided
    let fullPrompt = prompt;
    if (context) {
      fullPrompt = `Context:\n${context}\n\nUser Question:\n${prompt}\n\nPlease provide a helpful and accurate response based on the context provided.`;
    }

    // Generate content
    const result = await model.generateContent(fullPrompt);
    const response = await result.response;
    const text = response.text();

    return text;
  } catch (error: any) {
    console.error("Error generating AI response:", error);

    // Provide more specific error messages
    if (error.message?.includes("API key")) {
      throw new Error(
        "Invalid or missing Google API key. Please check your GOOGLE_API_KEY in .env file"
      );
    }

    if (error.message?.includes("quota")) {
      throw new Error(
        "API quota exceeded. Please check your Google Cloud billing settings"
      );
    }

    throw new Error(`Failed to generate AI response: ${error.message}`);
  }
}

/**
 * Stream AI response with callback for each chunk
 * This function is used by the SSE endpoint to stream responses to clients
 *
 * @param options - Streaming options including prompt and abort signal
 * @param onChunk - Callback function to send each chunk to the client
 * @returns Complete AI response as a string
 */
export async function streamAIResponse(
  options: StreamOptions,
  onChunk: (chunk: StreamChunk) => Promise<void>
): Promise<string> {
  try {
    // Validate API key
    if (!process.env.GOOGLE_API_KEY) {
      throw new Error(
        "GOOGLE_API_KEY is not configured in environment variables"
      );
    }

    const { prompt, signal, messageHistory } = options;

    // Get the generative model
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

    // Build context from message history if provided
    let fullPrompt = prompt;
    if (messageHistory && messageHistory.length > 0) {
      let context = "Previous conversation:\n";
      messageHistory.forEach((msg) => {
        context += `${msg.role === "user" ? "User" : "Assistant"}: ${
          msg.content
        }\n`;
      });
      fullPrompt = `${context}\n\nCurrent message: ${prompt}`;
    }

    // Check if already aborted
    if (signal?.aborted) {
      throw new Error("Request aborted before streaming started");
    }

    // Generate content with streaming
    const result = await model.generateContentStream(fullPrompt);

    let completeResponse = "";

    // Stream the response chunk by chunk
    for await (const chunk of result.stream) {
      // Check for abort signal
      if (signal?.aborted) {
        throw new Error("Request aborted during streaming");
      }

      const chunkText = chunk.text();
      completeResponse += chunkText;

      // Send token chunk to client via SSE
      await onChunk({
        type: "token",
        content: chunkText,
      });
    }

    return completeResponse;
  } catch (error: any) {
    console.error("Error streaming AI response:", error);

    // Send error to client if possible
    try {
      await onChunk({
        type: "error",
        error: error.message || "AI streaming failed",
      });
    } catch (sendError) {
      console.error("Failed to send error chunk:", sendError);
    }

    throw new Error(`Failed to stream AI response: ${error.message}`);
  }
}

/**
 * Generate AI response with streaming support (Generator function)
 * This is a simpler version that yields chunks directly
 *
 * @param prompt - The user's message/prompt
 * @param context - Optional context from previous messages or documents
 * @returns Async generator that yields text chunks
 */
export async function* streamAIResponseGenerator(
  prompt: string,
  context?: string
): AsyncGenerator<string, void, unknown> {
  try {
    // Validate API key
    if (!process.env.GOOGLE_API_KEY) {
      throw new Error(
        "GOOGLE_API_KEY is not configured in environment variables"
      );
    }

    // Get the generative model (using gemini-2.0-flash-exp - latest experimental model)
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

    // Construct the full prompt with context if provided
    let fullPrompt = prompt;
    if (context) {
      fullPrompt = `Context:\n${context}\n\nUser Question:\n${prompt}\n\nPlease provide a helpful and accurate response based on the context provided.`;
    }

    // Generate content with streaming
    const result = await model.generateContentStream(fullPrompt);

    // Stream the response
    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      yield chunkText;
    }
  } catch (error: any) {
    console.error("Error streaming AI response:", error);
    throw new Error(`Failed to stream AI response: ${error.message}`);
  }
}

/**
 * Generate AI response for document-based question answering
 * @param question - The user's question
 * @param documentContext - The relevant document content/context
 * @param conversationHistory - Optional previous messages for context
 * @returns AI generated answer
 */
export async function answerFromDocument(
  question: string,
  documentContext: string,
  conversationHistory?: Array<{ role: string; content: string }>
): Promise<string> {
  try {
    // Build conversation context
    let contextPrompt = "";

    if (conversationHistory && conversationHistory.length > 0) {
      contextPrompt += "Previous conversation:\n";
      conversationHistory.forEach((msg) => {
        contextPrompt += `${msg.role === "user" ? "User" : "Assistant"}: ${
          msg.content
        }\n`;
      });
      contextPrompt += "\n";
    }

    contextPrompt += `Document Content:\n${documentContext}\n\n`;
    contextPrompt += `Current Question:\n${question}\n\n`;
    contextPrompt += `Instructions: Please provide a comprehensive answer based on the document content. If the answer cannot be found in the document, clearly state that.`;

    return await generateAIResponse(question, contextPrompt);
  } catch (error: any) {
    console.error("Error answering from document:", error);
    throw new Error(`Failed to answer from document: ${error.message}`);
  }
}

/**
 * Test the AI service connection
 * @returns Test result with status and response
 */
export async function testAIService(): Promise<{
  success: boolean;
  message: string;
  response?: string;
}> {
  try {
    const testPrompt =
      'Say "Hello! Gemini Pro is working correctly." in a friendly way.';
    const response = await generateAIResponse(testPrompt);

    return {
      success: true,
      message: "AI service is working correctly",
      response,
    };
  } catch (error: any) {
    return {
      success: false,
      message: `AI service test failed: ${error.message}`,
    };
  }
}
