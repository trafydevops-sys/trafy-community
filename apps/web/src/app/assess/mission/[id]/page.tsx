"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { trpc, withAuthRetry } from "@/lib/trpc-client";
import { 
  Box, Typography, Card, CardContent, Button, CircularProgress, 
  Grid, Chip, TextField, Alert
} from "@mui/material";
import { AppShell } from "@/components/app-shell";

export default function MissionCandidatePage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  
  const [mission, setMission] = useState<any>(null);
  const [submission, setSubmission] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const [repoUrl, setRepoUrl] = useState("");
  const [writeup, setWriteup] = useState("");
  const [timeLeft, setTimeLeft] = useState<string>("");
  const [isStarting, setIsStarting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const loadData = async () => {
    try {
      const [missionsData, subData] = await Promise.all([
        withAuthRetry(() => trpc.buildMissions.listPublished.query()),
        withAuthRetry(() => trpc.buildMissions.getMySubmission.query({ missionId: id }))
      ]);
      setMission(missionsData.find((m: any) => m.id === id));
      setSubmission(subData);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [id]);

  useEffect(() => {
    if (!submission || submission.status !== "active") return;

    const interval = setInterval(() => {
      const now = new Date().getTime();
      const expires = new Date(submission.expiresAt).getTime();
      const diff = expires - now;

      if (diff <= 0) {
        setTimeLeft("EXPIRED");
        clearInterval(interval);
      } else {
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [submission]);

  const handleStart = async () => {
    setIsStarting(true);
    try {
      await withAuthRetry(() => trpc.buildMissions.start.mutate({ missionId: mission.id }));
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to start mission");
    } finally {
      setIsStarting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!submission) return;
    setIsSubmitting(true);
    setErrorMsg("");
    try {
      await withAuthRetry(() => trpc.buildMissions.submit.mutate({
        submissionId: submission.id,
        repoUrl,
        writeup
      }));
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to submit");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <AppShell active="assess"><Box sx={{ p: 4 }}><CircularProgress /></Box></AppShell>;
  }

  if (!mission) {
    return <AppShell active="assess"><Box sx={{ p: 4 }}><Typography>Mission not found</Typography></Box></AppShell>;
  }

  return (
    <AppShell active="assess">
      <Box sx={{ maxWidth: 900, mx: "auto", p: 4 }}>
        <Typography variant="h3" sx={{ fontWeight: "bold", mb: 2 }}>{mission.title}</Typography>
        <Box sx={{ display: "flex", gap: 1, mb: 4 }}>
          <Chip label={`Track: ${mission.track}`} />
          <Chip label={`${mission.timeLimitHours}h Limit`} />
        </Box>

        <Card sx={{ mb: 4, bgcolor: "background.paper" }}>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 1 }}>Mission Brief</Typography>
            <Typography variant="body1" sx={{ whiteSpace: "pre-wrap", mb: 2 }}>
              {mission.briefMarkdown}
            </Typography>
            {mission.starterRepoUrl && (
              <Typography>
                <strong>Starter Repo:</strong> <a href={mission.starterRepoUrl} target="_blank" rel="noreferrer" style={{ color: "#66b2ff" }}>{mission.starterRepoUrl}</a>
              </Typography>
            )}
          </CardContent>
        </Card>

        {errorMsg && <Alert severity="error" sx={{ mb: 4 }}>{errorMsg}</Alert>}

        {!submission && (
          <Card sx={{ textAlign: "center", p: 4 }}>
            <Typography variant="h5" sx={{ mb: 1 }}>Ready to begin?</Typography>
            <Typography color="text.secondary" sx={{ mb: 4 }}>
              Once you start, the {mission.timeLimitHours}-hour timer cannot be paused. 
              Ensure you have time to complete the mission before clicking start.
            </Typography>
            <Button variant="contained" size="large" onClick={handleStart} disabled={isStarting}>
              {isStarting ? "Starting..." : "Start Mission"}
            </Button>
          </Card>
        )}

        {submission?.status === "active" && (
          <Card sx={{ p: 4 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 4 }}>
              <Typography variant="h5" sx={{ fontWeight: "bold" }}>Your Submission</Typography>
              <Chip 
                label={`Time Left: ${timeLeft || "Calculating..."}`} 
                color={timeLeft === "EXPIRED" ? "error" : "success"}
                sx={{ fontWeight: "bold", fontSize: '1rem', py: 2.5, px: 1 }} 
              />
            </Box>

            <form onSubmit={handleSubmit}>
              <TextField
                label="GitHub Repository URL"
                required
                fullWidth
                variant="outlined"
                placeholder="https://github.com/username/repo"
                value={repoUrl}
                onChange={e => setRepoUrl(e.target.value)}
                sx={{ mb: 3 }}
                helperText="The repository must be public for our automated harness to clone it."
              />
              
              <TextField
                label="Write-up (Optional)"
                fullWidth
                multiline
                rows={6}
                variant="outlined"
                placeholder="Explain your architectural decisions, trade-offs, and how to run your project..."
                value={writeup}
                onChange={e => setWriteup(e.target.value)}
                sx={{ mb: 4 }}
              />

              <Button 
                type="submit" 
                variant="contained" 
                size="large" 
                fullWidth 
                disabled={isSubmitting || timeLeft === "EXPIRED"}
              >
                {isSubmitting ? "Submitting..." : "Submit Mission"}
              </Button>
            </form>
          </Card>
        )}

        {submission && ["submitted", "harness_running", "harness_done"].includes(submission.status) && (
          <Card sx={{ p: 6, textAlign: "center" }}>
            <Typography variant="h1" sx={{ mb: 2 }}>⚙️</Typography>
            <Typography variant="h5" sx={{ fontWeight: "bold", mb: 1 }}>Submission Received</Typography>
            <Typography color="text.secondary" sx={{ mb: 4 }}>
              Your code is being tested by our automated harness, after which it will be reviewed by an expert.
            </Typography>
            <Chip label={`Status: ${submission.status.toUpperCase()}`} />
          </Card>
        )}

        {submission?.status === "graded" && (
          <Card sx={{ p: 4 }}>
            <Typography variant="h4" sx={{ fontWeight: "bold", textAlign: "center", mb: 1 }}>
              Mission Graded
            </Typography>
            <Typography variant="h2" color="success.main" sx={{ fontWeight: 900, textAlign: "center", mb: 4 }}>
              {((submission.rawScore || 0) * 100).toFixed(0)}%
            </Typography>
            
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <Box>
                <Box sx={{ p: 2, bgcolor: "background.default", borderRadius: 1, border: "1px solid", borderColor: "divider" }}>
                  <Typography variant="body2" color="text.secondary">Machine Harness</Typography>
                  <Typography variant="h5" sx={{ fontWeight: "bold" }}>{((submission.machineScore || 0) * 100).toFixed(0)}%</Typography>
                </Box>
              </Box>
              <Box>
                <Box sx={{ p: 2, bgcolor: "background.default", borderRadius: 1, border: "1px solid", borderColor: "divider" }}>
                  <Typography variant="body2" color="text.secondary">Human Rubric</Typography>
                  <Typography variant="h5" sx={{ fontWeight: "bold" }}>{((submission.rubricAvg || 0) * 100).toFixed(0)}%</Typography>
                </Box>
              </Box>
            </Box>
          </Card>
        )}
      </Box>
    </AppShell>
  );
}
