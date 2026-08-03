import { z } from "zod";
import { env } from "./env.js";
import { callGeminiMultimodalJson } from "./gemini-client.js";

// Relaxed schemas for the LLM output to prevent rigid zod failures,
// we will validate strictly on the frontend wizard submission anyway.
export const parsedResumeSchema = z.object({
  fullName: z.object({ value: z.string(), confidence: z.enum(["high", "medium", "low"]) }).optional(),
  title: z.object({ value: z.string(), confidence: z.enum(["high", "medium", "low"]) }).optional(),
  bio: z.object({ value: z.string(), confidence: z.enum(["high", "medium", "low"]) }).optional(),
  education: z.array(z.object({
    institution: z.string().default(""),
    degree: z.string().optional(),
    startYear: z.coerce.number().optional(),
    endYear: z.coerce.number().optional(),
    confidence: z.enum(["high", "medium", "low"]).default("high"),
  })).default([]),
  experience: z.array(z.object({
    company: z.string().default(""),
    role: z.string().default(""),
    startDate: z.string().default(""),
    endDate: z.string().optional(),
    description: z.string().optional(),
    confidence: z.enum(["high", "medium", "low"]).default("high"),
  })).default([]),
});

export type ParsedResume = z.infer<typeof parsedResumeSchema>;

export async function parseResume(resumeUrl: string): Promise<ParsedResume> {
  if (!env.GEMINI_API_KEY && !env.OPENAI_API_KEY) {
    // Stub fallback for local dev
    return {
      fullName: { value: "", confidence: "low" },
      title: { value: "", confidence: "low" },
      bio: { value: "", confidence: "low" },
      education: [],
      experience: [],
    };
  }

  try {
    const res = await fetch(resumeUrl);
    if (!res.ok) throw new Error("Failed to download resume from storage.");
    
    const buffer = await res.arrayBuffer();
    const base64Data = Buffer.from(buffer).toString("base64");
    const mimeType = res.headers.get("content-type") || "application/pdf";

    if (env.GEMINI_API_KEY) {
      const prompt = `
        Extract the following information from the provided resume document.
        Return the result strictly as a JSON object matching this schema:
        {
          "fullName": { "value": string, "confidence": "high" | "medium" | "low" },
          "title": { "value": string, "confidence": "high" | "medium" | "low" },
          "bio": { "value": string, "confidence": "high" | "medium" | "low" },
          "education": [
            { "institution": string, "degree": string, "startYear": number, "endYear": number, "confidence": "high" | "medium" | "low" }
          ],
          "experience": [
            { "company": string, "role": string, "startDate": string (YYYY-MM-DD), "endDate": string (YYYY-MM-DD), "description": string, "confidence": "high" | "medium" | "low" }
          ]
        }
        If a field is missing, omit it or leave it empty, but always include the confidence score.
      `;
      
      const fallback = {
        fullName: { value: "", confidence: "low" as const },
        title: { value: "", confidence: "low" as const },
        bio: { value: "", confidence: "low" as const },
        education: [],
        experience: [],
      } as ParsedResume;

      return callGeminiMultimodalJson<ParsedResume>(prompt, base64Data, mimeType, parsedResumeSchema, fallback);
    }
    
    // OpenAI fallback would go here
    throw new Error("Unsupported AI provider configuration.");
  } catch (err) {
    console.error("Parse resume error:", err);
    // Return empty stub so the UI doesn't crash, user can just type it in manually
    return {
      fullName: { value: "", confidence: "low" },
      title: { value: "", confidence: "low" },
      bio: { value: "", confidence: "low" },
      education: [],
      experience: [],
    };
  }
}
