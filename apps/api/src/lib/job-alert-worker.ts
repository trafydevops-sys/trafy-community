import { db } from "./db.js";
import { schema } from "@trafy-community/db";
import { and, eq, gte } from "drizzle-orm";
import { Resend } from "resend";
import { env } from "./env.js";

const resend = new Resend(env.RESEND_API_KEY);

// Send daily digest
export async function sendDailyJobAlerts() {
  console.log("Starting daily job alerts digest...");

  // 1. Get all jobs published in the last 24 hours
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const newJobs = await db
    .select()
    .from(schema.jobs)
    .where(and(
      eq(schema.jobs.published, true),
      gte(schema.jobs.createdAt, oneDayAgo)
    ));

  if (newJobs.length === 0) {
    console.log("No new jobs published in the last 24 hours.");
    return;
  }

  // 2. Fetch all active alerts
  const alerts = await db.select().from(schema.jobAlerts);
  
  if (alerts.length === 0) {
    console.log("No job alerts configured.");
    return;
  }

  // 3. Match jobs to alerts and group by user
  const userMatches = new Map<string, typeof schema.jobs.$inferSelect[]>();

  for (const alert of alerts) {
    for (const job of newJobs) {
      // Basic matching logic based on alert criteria
      let matches = true;

      if (alert.jobType && job.jobType !== alert.jobType) matches = false;
      if (alert.remote !== null && job.remote !== alert.remote) matches = false;
      if (alert.experienceLevel && job.experienceLevel !== alert.experienceLevel) matches = false;
      if (alert.industry && job.industry !== alert.industry) matches = false;
      if (alert.track && job.requiredTrack !== alert.track) matches = false;
      
      // text search matching
      if (matches && alert.query) {
        const q = alert.query.toLowerCase();
        const searchPool = (job.title + " " + (job.description || "")).toLowerCase();
        if (!searchPool.includes(q)) {
          matches = false;
        }
      }

      if (matches) {
        if (!userMatches.has(alert.userId)) {
          userMatches.set(alert.userId, []);
        }
        
        // Ensure no duplicate jobs for a single user (if they have multiple matching alerts)
        const userJobs = userMatches.get(alert.userId)!;
        if (!userJobs.find(j => j.id === job.id)) {
          userJobs.push(job);
        }
      }
    }
  }

  // 4. Send emails
  let emailsSent = 0;
  for (const [userId, matchedJobs] of userMatches.entries()) {
    if (matchedJobs.length === 0) continue;

    const [user] = await db
      .select({ email: schema.users.email })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (!user) continue;

    const jobListHtml = matchedJobs.map(job => 
      `<li><strong>${job.title}</strong> ${job.remote ? "(Remote)" : ""} - <a href="https://trafy.community/jobs/${job.id}">View Job</a></li>`
    ).join("");

    const html = `
      <h2>Your Daily Job Alerts</h2>
      <p>We found ${matchedJobs.length} new jobs matching your alerts:</p>
      <ul>
        ${jobListHtml}
      </ul>
      <p>Good luck!</p>
    `;

    try {
      await resend.emails.send({
        from: "Trafy Alerts <alerts@trafy.community>",
        to: user.email,
        subject: `Your Daily Job Matches (${matchedJobs.length} new)`,
        html,
      });
      emailsSent++;
    } catch (e) {
      console.error(`Failed to send alert to ${user.email}:`, e);
    }
  }

  console.log(`Finished daily job alerts. Sent ${emailsSent} digest emails.`);
}

// In a real production deployment, this would be invoked by a CRON runner or node-cron.
// For demonstration, we can simulate a tick if needed, or simply expose this function.
