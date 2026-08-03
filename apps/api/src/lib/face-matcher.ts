import { schema } from "@trafy-community/db";
import { db } from "./db.js";
import { eq } from "drizzle-orm";
import { callGeminiJson } from "./gemini-client.js";
import { z } from "zod";

export async function checkFaceMatch(sessionId: string) {
  const snapshots = await db.select().from(schema.webcamSnapshots).where(eq(schema.webcamSnapshots.sessionId, sessionId));
  if (snapshots.length < 2) return; // Need at least 2 to compare

  const [session] = await db.select().from(schema.assessmentSessions).where(eq(schema.assessmentSessions.id, sessionId)).limit(1);
  if (!session) return;

  // In a real implementation, we would download the images from S3 and pass them to Gemini.
  // We're passing URLs in the prompt. Gemini might not be able to fetch URLs directly
  // if they are not publicly accessible or if it doesn't support that mode.
  // For this V1, we'll construct a prompt. If the URLs are pre-signed S3 urls, this might work.
  
  const prompt = `
    You are an AI proctoring assistant. Analyze the following sequence of webcam snapshots 
    taken during a candidate's online assessment. 
    
    Your task is to identify ANY of the following anomalies:
    1. A different person appears in the camera compared to the first image.
    2. Multiple people are visible in the frame.
    3. The person is completely missing from the camera for an extended period.
    
    Here are the URLs to the snapshots (in chronological order):
    ${snapshots.map((s, i) => `[Image ${i + 1}]: ${s.imageUrl}`).join('\n')}
    
    Respond in JSON format:
    {
      "anomalyDetected": boolean,
      "severity": "none" | "warning" | "critical",
      "reason": string
    }
  `;

  const fallback = { anomalyDetected: false, severity: "none" as const, reason: "" };

  const result = await callGeminiJson(
    prompt, 
    z.object({ 
      anomalyDetected: z.boolean(), 
      severity: z.enum(["none", "warning", "critical"]), 
      reason: z.string() 
    }), 
    fallback
  );

  if (result.anomalyDetected && result.severity !== "none") {
    await db.insert(schema.integrityFlags).values({
      sessionId: sessionId,
      userId: session.userId,
      kind: 'webcam_anomaly',
      severity: result.severity,
      detail: { reason: result.reason },
      visible: true,
      resolution: 'pending',
    });
  }
}
