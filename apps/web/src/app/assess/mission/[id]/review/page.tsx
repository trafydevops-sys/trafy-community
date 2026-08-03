"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { trpc, withAuthRetry } from "@/lib/trpc-client";
import { 
  Box, Typography, Card, CardContent, Button, CircularProgress, 
  Slider, Divider, Alert
} from "@mui/material";
import { AppShell } from "@/components/app-shell";

export default function MissionReviewPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();

  const [submission, setSubmission] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const data = await withAuthRetry(() => trpc.buildMissions.listPendingReview.query());
        setSubmission(data.find((s: any) => s.id === id));
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [id]);

  const [scores, setScores] = useState({
    correctnessScore: 3,
    structureScore: 3,
    testsScore: 3,
    documentationScore: 3,
  });

  if (isLoading) return <AppShell active="assess"><Box sx={{ p: 4 }}><CircularProgress /></Box></AppShell>;
  if (!submission) return <AppShell active="assess"><Box sx={{ p: 4 }}><Typography>Submission not found or you do not have access.</Typography></Box></AppShell>;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setErrorMsg("");
    try {
      await withAuthRetry(() => trpc.buildMissions.grade.mutate({
        submissionId: id,
        ...scores
      }));
      router.push("/assess/review");
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to save grades");
    } finally {
      setIsSaving(false);
    }
  };

  const updateScore = (key: keyof typeof scores, val: number) => {
    setScores(prev => ({ ...prev, [key]: val }));
  };

  return (
    <AppShell active="assess">
      <Box sx={{ maxWidth: 1200, mx: "auto", p: 4 }}>
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 4 }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h4" sx={{ fontWeight: "bold", mb: 1 }}>Review Submission</Typography>
            
            <Card sx={{ mb: 4, bgcolor: "background.paper" }}>
              <CardContent>
                <Typography variant="h6" sx={{ fontWeight: "bold", mb: 1 }}>Candidate Info</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Repository:</Typography>
                <Typography sx={{ mb: 3 }}>
                  <a href={submission.repoUrl!} target="_blank" rel="noreferrer" style={{ color: "#66b2ff", wordBreak: "break-all" }}>
                    {submission.repoUrl}
                  </a>
                </Typography>
                
                {submission.writeup && (
                  <>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Write-up:</Typography>
                    <Box sx={{ p: 2, bgcolor: "background.default", borderRadius: 1, border: "1px solid", borderColor: "divider", maxHeight: 300, overflowY: "auto", whiteSpace: "pre-wrap", typography: "body2" }}>
                      {submission.writeup}
                    </Box>
                  </>
                )}
              </CardContent>
            </Card>

            <Card sx={{ bgcolor: "background.paper" }}>
              <CardContent>
                <Typography variant="h6" sx={{ fontWeight: "bold", mb: 1 }}>Harness Results</Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 3 }}>
                  <Box sx={{ p: 2, bgcolor: "background.default", borderRadius: 1, border: "1px solid", borderColor: "divider" }}>
                    <Typography variant="body2" color="text.secondary">Build</Typography>
                    <Typography variant="body1" sx={{ fontWeight: "bold", color: submission.buildPassed ? "success.main" : "error.main" }}>
                      {submission.buildPassed ? 'PASSED' : 'FAILED'}
                    </Typography>
                  </Box>
                  <Box sx={{ p: 2, bgcolor: "background.default", borderRadius: 1, border: "1px solid", borderColor: "divider" }}>
                    <Typography variant="body2" color="text.secondary">Tests</Typography>
                    <Typography variant="body1" sx={{ fontWeight: "bold", color: submission.testsPassed ? "success.main" : "error.main" }}>
                      {submission.testsPassed ? 'PASSED' : 'FAILED'}
                    </Typography>
                  </Box>
                </Box>
                
                {submission.testOutput && (
                  <>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Console Output:</Typography>
                    <Box sx={{ p: 2, bgcolor: "background.default", borderRadius: 1, border: "1px solid", borderColor: "divider", maxHeight: 400, overflowY: "auto", whiteSpace: "pre-wrap", fontFamily: "monospace", fontSize: "0.8rem" }}>
                      {submission.testOutput}
                    </Box>
                  </>
                )}
              </CardContent>
            </Card>
          </Box>

          <Box sx={{ width: { xs: '100%', md: 400 } }}>
            <Card sx={{ bgcolor: "background.paper", position: "sticky", top: 24 }}>
              <CardContent>
                <Typography variant="h5" sx={{ fontWeight: "bold", mb: 1 }}>Human Rubric</Typography>
                <Divider sx={{ mb: 4 }} />
                
                {errorMsg && <Alert severity="error" sx={{ mb: 4 }}>{errorMsg}</Alert>}

                <form onSubmit={handleSubmit}>
                  {Object.entries(scores).map(([key, val]) => (
                    <Box key={key} sx={{ mb: 3 }}>
                      <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
                        <Typography variant="body1" sx={{ fontWeight: "medium", textTransform: "capitalize" }}>
                          {key.replace("Score", "")}
                        </Typography>
                        <Typography variant="body1" color="primary.main" sx={{ fontWeight: "bold" }}>
                          {val} / 5
                        </Typography>
                      </Box>
                      <Slider
                        value={val}
                        min={0}
                        max={5}
                        step={1}
                        marks
                        onChange={(_, newValue) => updateScore(key as any, newValue as number)}
                      />
                    </Box>
                  ))}

                  <Divider sx={{ my: 4 }} />
                  
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 4 }}>
                    <Typography color="text.secondary">Machine Score:</Typography>
                    <Typography variant="h5" sx={{ fontWeight: "bold" }}>
                      {((submission.machineScore || 0) * 100).toFixed(0)}%
                    </Typography>
                  </Box>
                  
                  <Button 
                    type="submit" 
                    variant="contained" 
                    size="large" 
                    fullWidth 
                    disabled={isSaving}
                    sx={{ py: 2 }}
                  >
                    {isSaving ? "Saving..." : "Approve & Grade"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </Box>
        </Box>
      </Box>
    </AppShell>
  );
}
