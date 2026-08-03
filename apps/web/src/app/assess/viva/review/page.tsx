"use client";

import { trpc, withAuthRetry } from "@/lib/trpc-client";
import { Box, Typography, Table, CircularProgress, Chip, Button } from "@mui/material";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function VivaReviewDashboard() {
  const [vivas, setVivas] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    withAuthRetry(() => trpc.viva.listPendingReview.query())
      .then(setVivas)
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) return <CircularProgress />;

  return (
    <Box sx={{ p: 4, maxWidth: 1000, mx: "auto" }}>
      <Typography variant="h4" sx={{ mb: 4 }}>Viva Review Dashboard</Typography>

      <Table>
        <thead>
          <tr>
            <th>Candidate</th>
            <th>Mission</th>
            <th>Track</th>
            <th>LLM Score</th>
            <th>Flags</th>
            <th>Submitted</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {vivas?.map((v: any) => (
            <tr key={v.vivaId}>
              <td>{v.candidateName}</td>
              <td>{v.missionTitle}</td>
              <td>{v.track}</td>
              <td>
                {(v.llmRawScore !== null && v.llmRawScore !== undefined) 
                  ? `${(v.llmRawScore * 100).toFixed(0)}%` 
                  : '-'}
              </td>
              <td>
                {v.flaggedAnswers > 0 ? (
                  <Chip color="error" size="small" label={`${v.flaggedAnswers} flagged`} />
                ) : (
                  <Chip color="success" size="small" label="Clean" />
                )}
                {v.llmConfidence === "low" && <Chip color="warning" size="small" sx={{ ml: 1 }} label="Low Conf" />}
              </td>
              <td>{v.submittedAt ? new Date(v.submittedAt).toLocaleDateString() : '-'}</td>
              <td>
                <Button component={Link} href={`/assess/viva/review/${v.vivaId}`} size="small">
                  Review
                </Button>
              </td>
            </tr>
          ))}
          {(!vivas || vivas.length === 0) && (
            <tr>
              <td colSpan={7} style={{ textAlign: 'center', padding: '24px' }}>
                <Typography color="text.secondary">No pending vivas to review.</Typography>
              </td>
            </tr>
          )}
        </tbody>
      </Table>
    </Box>
  );
}
