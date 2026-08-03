"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { trpc, withAuthRetry } from "@/lib/trpc-client";
import { Box, Typography, Card, CircularProgress, Alert, Button, TextareaAutosize as Textarea, Slider, Chip, Divider } from "@mui/material";
import Link from "next/link";

export default function VivaReviewDetailPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();

  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);

  useEffect(() => {
    withAuthRetry(() => trpc.viva.getVivaForReview.query({ vivaId: id }))
      .then(setData)
      .finally(() => setIsLoading(false));
  }, [id]);

  const [notes, setNotes] = useState("");
  const [overrideScores, setOverrideScores] = useState<Record<number, number>>({});

  if (isLoading) return <CircularProgress />;
  if (!data || !data.viva) return <Alert severity="error">Viva not found</Alert>;

  const { viva, submission, answers } = data;
  const questions = (viva.questionsJson as any[]) || [];

  const handleOverrideChange = (qIndex: number, newScore: number) => {
    setOverrideScores(prev => ({ ...prev, [qIndex]: newScore }));
  };

  const handleApprove = async () => {
    setIsMutating(true);
    try {
      await withAuthRetry(() => trpc.viva.review.mutate({ vivaId: viva.id, action: "approve", notes }));
      router.push("/assess/viva/review");
    } finally { setIsMutating(false); }
  };

  const handleReject = async () => {
    setIsMutating(true);
    try {
      await withAuthRetry(() => trpc.viva.review.mutate({ vivaId: viva.id, action: "reject", notes }));
      router.push("/assess/viva/review");
    } finally { setIsMutating(false); }
  };

  const handleSubmitOverrides = async () => {
    // Calculate new average based on overrides
    // Each question is out of 15 (c+d+a). 
    // Here we simplified the override to a single score (0-1) per question for the reviewer.
    const overridesArr = Object.entries(overrideScores).map(([idx, score]) => ({
      questionIndex: parseInt(idx),
      overrideScore: score
    }));

    // If they overrode some but not all, we compute the final average
    let totalScore = 0;
    answers.forEach((ans: any) => {
      const over = overrideScores[ans.questionIndex];
      if (over !== undefined) {
        totalScore += over;
      } else {
        const c = ans.clarityScore || 0;
        const d = ans.depthScore || 0;
        const a = ans.accuracyScore || 0;
        totalScore += (c + d + a) / 15;
      }
    });

    const finalScore = answers.length > 0 ? totalScore / answers.length : 0;

    setIsMutating(true);
    try {
      await withAuthRetry(() => trpc.viva.review.mutate({
        vivaId: viva.id,
        action: "override",
        overrideScore: finalScore,
        notes,
        answerOverrides: overridesArr
      }));
      router.push("/assess/viva/review");
    } finally { setIsMutating(false); }
  };

  return (
    <Box sx={{ p: 4, maxWidth: 1200, mx: "auto", display: "flex", gap: 4 }}>
      {/* Left panel: Context */}
      <Box sx={{ flex: 1 }}>
        <Typography variant="h5" sx={{ mb: 2 }}>Candidate Submission</Typography>
        <Card variant="outlined" sx={{ mb: 4, p: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>GitHub Repository</Typography>
          <Typography sx={{ mb: 2 }}>
            <Link href={submission?.repoUrl || "#"} target="_blank">{submission?.repoUrl}</Link>
          </Typography>
          <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>Write-up</Typography>
          <Typography sx={{ whiteSpace: "pre-wrap" }}>
            {submission?.writeup || "No write-up provided."}
          </Typography>
        </Card>

        <Typography variant="h5" sx={{ mb: 2 }}>Review Action</Typography>
        <Card variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Reviewer Notes</Typography>
          <Textarea 
            minRows={4} 
            value={notes} 
            onChange={(e: any) => setNotes(e.target.value)}
            placeholder="Add context for your decision..."
            style={{ marginBottom: "24px", width: "100%", padding: "12px" }}
          />

          <Box sx={{ display: "flex", gap: 2 }}>
            <Button color="success" variant="contained" onClick={handleApprove} disabled={isMutating}>
              Approve (Use LLM Scores)
            </Button>
            <Button color="primary" variant="contained" onClick={handleSubmitOverrides} disabled={isMutating || Object.keys(overrideScores).length === 0}>
              Submit Overrides
            </Button>
            <Button color="error" variant="outlined" onClick={handleReject} disabled={isMutating || !notes}>
              Reject (Requires Notes)
            </Button>
          </Box>
        </Card>
      </Box>

      {/* Right panel: Answers */}
      <Box sx={{ flex: 2 }}>
        <Typography variant="h5" sx={{ mb: 2 }}>Viva Answers</Typography>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {answers.map((ans: any) => {
            const q = questions[ans.questionIndex];
            const originalScore = ((ans.clarityScore || 0) + (ans.depthScore || 0) + (ans.accuracyScore || 0)) / 15;
            const currentOverride = overrideScores[ans.questionIndex];

            return (
              <Card key={ans.id} variant="outlined" sx={{ p: 2 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
                  <Typography variant="h6">Q{ans.questionIndex + 1}: {q?.prompt}</Typography>
                  {ans.confidence === "low" && <Chip color="error" size="small" label="🚩 Low Confidence" />}
                </Box>
                
                <Box sx={{ display: "flex", gap: 3 }}>
                  <Box sx={{ flex: 1 }}>
                    <video src={ans.videoUrl || ""} controls style={{ width: "100%", borderRadius: 8, backgroundColor: "black" }} />
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="subtitle2">Transcript</Typography>
                    <Box sx={{ maxHeight: 150, overflowY: "auto", mb: 2, p: 1, bgcolor: "grey.100", borderRadius: 1 }}>
                      <Typography variant="body2">{ans.transcript}</Typography>
                    </Box>

                    <Typography variant="subtitle2">LLM Rationale</Typography>
                    <Typography variant="caption" sx={{ mb: 2, fontStyle: "italic", display: 'block' }}>
                      {ans.llmRationale}
                    </Typography>

                    <Divider sx={{ my: 2 }} />
                    
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>
                      Score: {currentOverride !== undefined ? `${(currentOverride * 100).toFixed(0)}% (Override)` : `${(originalScore * 100).toFixed(0)}% (AI)`}
                    </Typography>
                    
                    <Typography variant="caption">Override Score (0-100%)</Typography>
                    <Slider 
                      value={currentOverride !== undefined ? currentOverride * 100 : originalScore * 100}
                      onChange={(_: any, val: any) => handleOverrideChange(ans.questionIndex, (val as number) / 100)}
                      step={5}
                      min={0}
                      max={100}
                      valueLabelDisplay="auto"
                    />
                  </Box>
                </Box>
              </Card>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
}
