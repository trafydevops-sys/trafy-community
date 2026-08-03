"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { trpc, withAuthRetry } from "@/lib/trpc-client";
import { 
  Box, Typography, Card, CardContent, Button, CircularProgress, 
  Chip
} from "@mui/material";
import { AppShell } from "@/components/app-shell";

export default function ReviewDashboardPage() {
  const router = useRouter();
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await withAuthRetry(() => trpc.buildMissions.listPendingReview.query());
        setSubmissions(data);
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  return (
    <AppShell active="assess">
      <Box sx={{ p: 4, maxWidth: 1000, mx: "auto" }}>
        <Typography variant="h4" sx={{ fontWeight: "bold", mb: 1 }}>
          Pending Reviews
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 4 }}>
          Submissions for Build Missions you have authored.
        </Typography>

        {isLoading ? (
          <CircularProgress />
        ) : submissions.length === 0 ? (
          <Typography color="text.secondary">No pending submissions to review!</Typography>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {submissions.map((sub: any) => (
              <Box key={sub.id}>
                <Card variant="outlined" sx={{ bgcolor: "background.paper" }}>
                  <CardContent sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <Box>
                      <Typography variant="h6" sx={{ fontWeight: "bold", mb: 1 }}>
                        Submission {sub.id.split('-')[0]}
                      </Typography>
                      <Box sx={{ display: "flex", gap: 1 }}>
                        <Typography variant="body2" color="text.secondary">Status:</Typography>
                        <Typography variant="body2" sx={{ color: "warning.main", fontWeight: "bold" }}>
                          {sub.status}
                        </Typography>
                      </Box>
                    </Box>
                    <Button 
                      variant="contained" 
                      onClick={() => router.push(`/assess/mission/${sub.id}/review`)}
                      disabled={sub.status !== 'harness_done' && sub.status !== 'submitted'}
                    >
                      {sub.status === 'harness_done' || sub.status === 'submitted' ? 'Grade Now' : 'Waiting for Harness'}
                    </Button>
                  </CardContent>
                </Card>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </AppShell>
  );
}
