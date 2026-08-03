import { eq } from "drizzle-orm";
import { schema } from "@trafy-community/db";
import { db } from "./db.js";
import { exec } from "child_process";
import util from "util";
import fs from "fs/promises";
import path from "path";
import os from "os";

const execAsync = util.promisify(exec);

export async function processBuildHarness(submissionId: string) {
  const [submission] = await db
    .select()
    .from(schema.buildSubmissions)
    .where(eq(schema.buildSubmissions.id, submissionId))
    .limit(1);

  if (!submission || !submission.repoUrl) {
    return;
  }

  const [mission] = await db
    .select()
    .from(schema.buildMissions)
    .where(eq(schema.buildMissions.id, submission.missionId))
    .limit(1);

  if (!mission) {
    return;
  }

  await db
    .update(schema.buildSubmissions)
    .set({ status: "harness_running" })
    .where(eq(schema.buildSubmissions.id, submissionId));

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "build-harness-"));
  
  let buildPassed = false;
  let testsPassed = false;
  let testOutput = "";
  let metricValue: number | null = null;
  let machineScore = 0;

  try {
    // Basic validation of URL
    let repoUrl = submission.repoUrl;
    if (!repoUrl.endsWith(".git")) {
      repoUrl += ".git";
    }

    // Clone repo
    // In a production environment this should be strictly sandboxed.
    // For V1 we just run a basic clone and then docker run to test.
    await execAsync(`git clone --depth 1 ${repoUrl} src`, { cwd: tempDir, timeout: 30000 });

    const srcDir = path.join(tempDir, "src");

    // Detect project type
    let dockerImage = "node:20-slim";
    let defaultBuildCmd = "";
    let defaultTestCmd = "";

    const files = await fs.readdir(srcDir);
    if (files.includes("package.json")) {
      dockerImage = "node:20-slim";
      defaultBuildCmd = "npm install && npm run build --if-present";
      defaultTestCmd = "npm test --if-present";
    } else if (files.includes("requirements.txt")) {
      dockerImage = "python:3.11-slim";
      defaultBuildCmd = "pip install -r requirements.txt";
      defaultTestCmd = "pytest";
    } else if (files.includes("Cargo.toml")) {
      dockerImage = "rust:1.75-slim";
      defaultBuildCmd = "cargo build";
      defaultTestCmd = "cargo test";
    } else if (files.includes("go.mod")) {
      dockerImage = "golang:1.21-alpine";
      defaultBuildCmd = "go build ./...";
      defaultTestCmd = "go test ./...";
    }

    const buildCmd = mission.buildCommand || defaultBuildCmd;
    const testCmd = mission.testCommand || defaultTestCmd;

    // Run Build
    try {
      if (buildCmd) {
        await execAsync(`docker run --rm -v "${srcDir}:/app" -w /app ${dockerImage} sh -c "${buildCmd}"`, { timeout: 60000 });
      }
      buildPassed = true;
    } catch (e: any) {
      buildPassed = false;
      testOutput += `\nBuild failed:\n${e.stdout || ""}\n${e.stderr || ""}`;
    }

    // Run Tests
    if (buildPassed) {
      try {
        if (testCmd) {
          const { stdout, stderr } = await execAsync(`docker run --rm -v "${srcDir}:/app" -w /app ${dockerImage} sh -c "${testCmd}"`, { timeout: 60000 });
          testsPassed = true;
          testOutput += `\nTests passed:\n${stdout}\n${stderr}`;
          
          if (mission.metricName) {
            // Attempt to parse metric value from stdout
            const regex = new RegExp(`${mission.metricName}\\s*[=:]\\s*([0-9.]+)`, "i");
            const match = stdout.match(regex);
            if (match && match[1]) {
              metricValue = parseFloat(match[1]);
            }
          }
        } else {
          testsPassed = true;
        }
      } catch (e: any) {
        testsPassed = false;
        testOutput += `\nTests failed:\n${e.stdout || ""}\n${e.stderr || ""}`;
      }
    }

    // Truncate output
    testOutput = testOutput.slice(0, 10000);

    // Compute machine score
    let score = 0;
    if (buildPassed) score += 0.3;
    if (testsPassed) score += 0.5;
    if (mission.metricName && metricValue !== null && mission.metricThreshold !== null) {
      // Assuming higher is better or threshold is minimum. 
      // This is a naive heuristic for V1.
      if (metricValue >= mission.metricThreshold) {
        score += 0.2;
      }
    } else {
      // If no metric required, give the 0.2 to tests
      if (testsPassed) score += 0.2;
    }
    machineScore = score;

  } catch (err: any) {
    testOutput = err.message || "Unknown harness error";
    buildPassed = false;
    testsPassed = false;
  } finally {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (e) {
      console.error("Failed to clean up harness temp dir", e);
    }
  }

  await db
    .update(schema.buildSubmissions)
    .set({
      status: "harness_done",
      buildPassed,
      testsPassed,
      testOutput,
      metricValue,
      machineScore,
    })
    .where(eq(schema.buildSubmissions.id, submissionId));
}
