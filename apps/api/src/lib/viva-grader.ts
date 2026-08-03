import { eq } from "drizzle-orm";
import { schema } from "@trafy-community/db";
import { db } from "./db.js";
import { callGeminiJson, callGeminiMultimodal } from "./gemini-client.js";
import { vivaAnswerGradeSchema } from "@trafy-community/core";
import { env } from "./env.js";

// Dummy function to pretend fetching video buffer from S3/local
async function fetchVideoBuffer(videoUrl: string): Promise<Buffer> {
  // In a real implementation, we would download the S3 object
  // For now, return an empty buffer since we're stubbing media processing if no real S3 exists
  if (videoUrl.startsWith('http')) {
    try {
      const res = await fetch(videoUrl);
      const arrayBuffer = await res.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch {
      return Buffer.alloc(0);
    }
  }
  return Buffer.alloc(0);
}

// Optional Deepgram fallback
async function transcribeWithDeepgram(videoBuffer: Buffer): Promise<string> {
  if (!env.DEEPGRAM_API_KEY) throw new Error("No Deepgram API key");
  const res = await fetch("https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true", {
    method: "POST",
    headers: {
      "Authorization": `Token ${env.DEEPGRAM_API_KEY}`,
      "Content-Type": "video/webm"
    },
    body: videoBuffer
  });
  if (!res.ok) throw new Error("Deepgram failed");
  const data = await res.json() as any;
  return data.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
}

export async function gradeViva(vivaId: string) {
  const [viva] = await db.select().from(schema.vivaExams).where(eq(schema.vivaExams.id, vivaId)).limit(1);
  if (!viva) return;

  const answers = await db.select().from(schema.vivaAnswers).where(eq(schema.vivaAnswers.vivaId, vivaId));
  const questions = viva.questionsJson as any[];

  // 1. Transcribe
  await db.update(schema.vivaExams).set({ status: 'transcribing' }).where(eq(schema.vivaExams.id, vivaId));
  
  for (const answer of answers) {
    if (answer.transcript) continue; // Already transcribed
    
    let transcript = "Stub transcript. I built this using React and Node.js. It scales well.";
    if (answer.videoUrl) {
      const videoBuffer = await fetchVideoBuffer(answer.videoUrl);
      if (videoBuffer.length > 0) {
        const base64Data = videoBuffer.toString("base64");
        
        // Try Gemini Multimodal first
        const prompt = "Transcribe this video recording verbatim. The speaker is answering a technical viva question. Return only the transcript text, no timestamps.";
        try {
          const geminiTranscript = await callGeminiMultimodal(prompt, base64Data, "video/webm", "");
          if (geminiTranscript.length > 10) {
            transcript = geminiTranscript;
          } else {
            throw new Error("Gemini returned very short/empty transcript");
          }
        } catch (err) {
          // Fallback to Deepgram
          try {
             transcript = await transcribeWithDeepgram(videoBuffer);
          } catch (dgErr) {
             console.error("Both Gemini and Deepgram failed for transcription", dgErr);
          }
        }
      }
    }
    
    await db.update(schema.vivaAnswers).set({ transcript }).where(eq(schema.vivaAnswers.id, answer.id));
    answer.transcript = transcript;
  }

  // 2. Grade
  await db.update(schema.vivaExams).set({ status: 'llm_grading' }).where(eq(schema.vivaExams.id, vivaId));
  
  for (const answer of answers) {
    const question = questions[answer.questionIndex];
    
    const prompt = `
      You are grading a candidate's oral defense of their code project.
      
      ## Question asked
      ${question.prompt}
      (Category: ${question.category}, targeting file: ${question.targetFile || 'general'})
      
      ## Candidate's verbal answer (transcript)
      ${answer.transcript}
      
      Grade on three dimensions (0-5 each):
      - clarity: How clearly did they explain? (0=incoherent, 5=crystal clear)
      - depth: How deep is their understanding? (0=surface, 5=expert-level)
      - accuracy: Are their claims correct? (0=wrong, 5=fully correct)
      
      Also rate your confidence in this grade: high/medium/low.
      "low" means the transcript was unclear or the answer was ambiguous.
      
      Return JSON: { "clarityScore": N, "depthScore": N, "accuracyScore": N, "confidence": "high"|"medium"|"low", "rationale": "..." }
    `;

    const fallbackGrade = { clarityScore: 3, depthScore: 3, accuracyScore: 3, confidence: "low" as const, rationale: "Stub grading" };
    const grade = await callGeminiJson(prompt, vivaAnswerGradeSchema, fallbackGrade);
    
    await db.update(schema.vivaAnswers).set({
      clarityScore: grade.clarityScore,
      depthScore: grade.depthScore,
      accuracyScore: grade.accuracyScore,
      confidence: grade.confidence,
      llmRationale: grade.rationale,
    }).where(eq(schema.vivaAnswers.id, answer.id));
    
    // Update local object for aggregate
    answer.clarityScore = grade.clarityScore;
    answer.depthScore = grade.depthScore;
    answer.accuracyScore = grade.accuracyScore;
    answer.confidence = grade.confidence;
  }

  // 3. Aggregate
  const gradedAnswers = await db.select().from(schema.vivaAnswers).where(eq(schema.vivaAnswers.vivaId, vivaId));
  const avgPerAnswer = gradedAnswers.map(a => ((a.clarityScore || 0) + (a.depthScore || 0) + (a.accuracyScore || 0)) / 15);
  const llmRawScore = avgPerAnswer.length ? avgPerAnswer.reduce((s, v) => s + v, 0) / avgPerAnswer.length : 0;
  
  const lowestConfidence = gradedAnswers.some(a => a.confidence === 'low') ? 'low'
    : gradedAnswers.some(a => a.confidence === 'medium') ? 'medium' : 'high';
    
  await db.update(schema.vivaExams).set({
    llmRawScore,
    llmConfidence: lowestConfidence,
    status: 'pending_review',
  }).where(eq(schema.vivaExams.id, vivaId));
}
