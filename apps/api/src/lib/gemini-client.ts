import { z } from "zod";
import { env } from "./env.js";

/**
 * Shared utility for calling Gemini API and enforcing a structured JSON response.
 */
export async function callGeminiJson<T>(prompt: string, schema: z.ZodType<T, any, any>, fallbackStub: T): Promise<T> {
  if (!env.GEMINI_API_KEY) {
    console.warn("GEMINI_API_KEY is not set. Using fallback stub.");
    return fallbackStub;
  }

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`;
  
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { response_mime_type: "application/json" }
  };

  try {
    const response = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    
    if (!response.ok) {
      console.error("Gemini API error:", await response.text());
      throw new Error("Failed to call Gemini.");
    }
    
    const data = await response.json() as any;
    const jsonStr = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!jsonStr) throw new Error("No JSON returned from Gemini.");
    
    const parsed = JSON.parse(jsonStr);
    return schema.parse(parsed);
  } catch (err) {
    console.error("Gemini JSON call error:", err);
    return fallbackStub;
  }
}

/**
 * Shared utility for calling Gemini API with multimodal input (text + file).
 */
export async function callGeminiMultimodalJson<T>(
  prompt: string, 
  base64Data: string, 
  mimeType: string, 
  schema: z.ZodType<T, any, any>, 
  fallbackStub: T
): Promise<T> {
  if (!env.GEMINI_API_KEY) {
    console.warn("GEMINI_API_KEY is not set. Using fallback stub.");
    return fallbackStub;
  }

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`;
  
  const body = {
    contents: [{
      parts: [
        { text: prompt },
        { inline_data: { mime_type: mimeType, data: base64Data } }
      ]
    }],
    generationConfig: { response_mime_type: "application/json" }
  };

  try {
    const response = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    
    if (!response.ok) {
      console.error("Gemini API error:", await response.text());
      throw new Error("Failed to call Gemini.");
    }
    
    const data = await response.json() as any;
    const jsonStr = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!jsonStr) throw new Error("No JSON returned from Gemini.");
    
    const parsed = JSON.parse(jsonStr);
    return schema.parse(parsed);
  } catch (err) {
    console.error("Gemini JSON call error:", err);
    return fallbackStub;
  }
}

/**
 * Shared utility for calling Gemini API with multimodal input to get a plain string response (e.g. transcription).
 */
export async function callGeminiMultimodal(
  prompt: string,
  base64Data: string,
  mimeType: string,
  fallbackStub: string
): Promise<string> {
  if (!env.GEMINI_API_KEY) {
    console.warn("GEMINI_API_KEY is not set. Using fallback stub.");
    return fallbackStub;
  }

  // Using newer flash model for transcription accuracy
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${env.GEMINI_API_KEY}`;
  
  const body = {
    contents: [{
      parts: [
        { text: prompt },
        { inline_data: { mime_type: mimeType, data: base64Data } }
      ]
    }]
  };

  try {
    const response = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    
    if (!response.ok) {
      console.error("Gemini API error:", await response.text());
      throw new Error("Failed to call Gemini.");
    }
    
    const data = await response.json() as any;
    const textStr = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textStr) throw new Error("No text returned from Gemini.");
    
    return textStr;
  } catch (err) {
    console.error("Gemini Multimodal call error:", err);
    return fallbackStub;
  }
}
