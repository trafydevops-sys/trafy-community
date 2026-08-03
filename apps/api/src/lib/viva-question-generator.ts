import { eq } from "drizzle-orm";
import { schema } from "@trafy-community/db";
import { db } from "./db.js";
import { callGeminiJson } from "./gemini-client.js";
import { vivaQuestionSchema } from "@trafy-community/core";
import { z } from "zod";

async function fetchRepoSourceFiles(repoUrl: string) {
  // Extract owner and repo from URL
  // e.g. https://github.com/owner/repo
  const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
  if (!match) return [];
  const [, owner, repo] = match;

  try {
    const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/main?recursive=1`);
    if (!treeRes.ok) return [];
    const treeData = await treeRes.json() as any;

    const sourceFiles = [];
    const files = treeData.tree || [];
    
    // Sort and filter for key files (e.g. .ts, .tsx, .py, .js)
    const candidates = files
      .filter((f: any) => f.type === "blob" && /\.(ts|tsx|js|jsx|py|go|rs)$/.test(f.path))
      .sort((a: any, b: any) => b.size - a.size) // Get largest files first
      .slice(0, 5); // Max 5 files to fit in context

    for (const file of candidates) {
      const contentRes = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/main/${file.path}`);
      if (contentRes.ok) {
        sourceFiles.push({ path: file.path, content: await contentRes.text() });
      }
    }
    return sourceFiles;
  } catch (err) {
    console.error("Failed to fetch repo", err);
    return [];
  }
}

export async function generateVivaQuestions(vivaId: string, submissionId: string) {
  const [viva] = await db.select().from(schema.vivaExams).where(eq(schema.vivaExams.id, vivaId)).limit(1);
  if (!viva) return;

  const [submission] = await db.select().from(schema.buildSubmissions).where(eq(schema.buildSubmissions.id, submissionId)).limit(1);
  if (!submission || !submission.repoUrl) return;

  // Wait, where do we get the mission brief?
  // Let's assume a generic mission for now since missionId might not be fully fleshed out.
  const missionBrief = "Build a functional web application based on the requirements.";
  
  const repoFiles = await fetchRepoSourceFiles(submission.repoUrl);
  
  const prompt = `
    You are conducting a technical viva (oral defense) for a coding project.
    
    ## Mission Brief
    ${missionBrief}
    
    ## Candidate's Code
    ${repoFiles.map(f => `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``).join('\n\n')}
    
    ## Candidate's Write-up
    ${submission.writeup || '(no write-up provided)'}
    
    Generate exactly 6 viva questions that test whether the candidate truly wrote
    and understands this code. Questions should cover:
    - 2 "code_decision" questions: Why did you choose X over Y?
    - 1 "architecture" question: Explain the overall structure
    - 1 "edge_case" question: What happens when...?
    - 1 "improvement" question: What would you change if...?
    - 1 "concept" question: Explain the underlying concept behind...
    
    Return as JSON array matching this schema:
    [{ "prompt": string, "category": string, "targetFile": string, "difficulty": "standard"|"probing"|"challenge" }]
  `;

  const fallbackStub = [
    { prompt: "Why did you choose this tech stack?", category: "code_decision" as const, difficulty: "standard" as const },
    { prompt: "Explain a difficult bug you encountered.", category: "code_decision" as const, difficulty: "probing" as const },
    { prompt: "How does the main architecture work?", category: "architecture" as const, difficulty: "standard" as const },
    { prompt: "What happens if the API fails?", category: "edge_case" as const, difficulty: "standard" as const },
    { prompt: "How would you scale this?", category: "improvement" as const, difficulty: "challenge" as const },
    { prompt: "Explain the concept of state management here.", category: "concept" as const, difficulty: "standard" as const }
  ];

  const questions = await callGeminiJson(prompt, z.array(vivaQuestionSchema), fallbackStub);

  await db.update(schema.vivaExams).set({
    questionsJson: questions,
    status: 'questions_ready',
  }).where(eq(schema.vivaExams.id, vivaId));
}
