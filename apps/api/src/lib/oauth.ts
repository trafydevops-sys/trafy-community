import { env } from "./env.js";
import { TRPCError } from "@trpc/server";

export async function exchangeGoogleCode(code: string, redirectUri: string): Promise<string> {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Google OAuth is not configured on the server." });
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    const errorBody = await tokenRes.text();
    console.error("Google Token Error:", errorBody);
    throw new TRPCError({ code: "BAD_REQUEST", message: "Failed to exchange Google authorization code." });
  }

  const tokenData = await tokenRes.json() as any;
  
  const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  if (!userRes.ok) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to fetch Google user profile." });
  }

  const userData = await userRes.json() as any;
  if (!userData.email) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "No email returned from Google." });
  }

  return userData.email.toLowerCase();
}

export async function exchangeLinkedinCode(code: string, redirectUri: string): Promise<string> {
  if (!env.LINKEDIN_CLIENT_ID || !env.LINKEDIN_CLIENT_SECRET) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "LinkedIn OAuth is not configured on the server." });
  }

  const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: env.LINKEDIN_CLIENT_ID,
      client_secret: env.LINKEDIN_CLIENT_SECRET,
    }),
  });

  if (!tokenRes.ok) {
    const errorBody = await tokenRes.text();
    console.error("LinkedIn Token Error:", errorBody);
    throw new TRPCError({ code: "BAD_REQUEST", message: "Failed to exchange LinkedIn authorization code." });
  }

  const tokenData = await tokenRes.json() as any;

  const userRes = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  if (!userRes.ok) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to fetch LinkedIn user profile." });
  }

  const userData = await userRes.json() as any;
  if (!userData.email) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "No email returned from LinkedIn." });
  }

  return userData.email.toLowerCase();
}

export async function exchangeGithubCode(code: string, redirectUri: string): Promise<string> {
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "GitHub OAuth is not configured on the server." });
  }

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    const errorBody = await tokenRes.text();
    console.error("GitHub Token Error:", errorBody);
    throw new TRPCError({ code: "BAD_REQUEST", message: "Failed to exchange GitHub authorization code." });
  }

  const tokenData = await tokenRes.json() as any;

  if (tokenData.error) {
    console.error("GitHub Token Error Response:", tokenData);
    throw new TRPCError({ code: "BAD_REQUEST", message: tokenData.error_description || "Failed to exchange GitHub authorization code." });
  }

  const userRes = await fetch("https://api.github.com/user/emails", {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!userRes.ok) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to fetch GitHub user emails." });
  }

  const emailsData = await userRes.json() as any[];
  
  // Find the primary email
  const primaryEmail = emailsData.find(e => e.primary);
  
  if (!primaryEmail || !primaryEmail.email) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "No primary email returned from GitHub." });
  }

  return primaryEmail.email.toLowerCase();
}
