"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { trpc, withAuthRetry } from "@/lib/trpc-client";
import { 
  Box, Typography, Card, CardContent, Button, CircularProgress, 
  Chip
} from "@mui/material";
import { AppShell } from "@/components/app-shell";

export default function MissionsPage() {
  const router = useRouter();
  const [missions, setMissions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await withAuthRetry(() => trpc.buildMissions.listPublished.query());
        setMissions(data);
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
          Build Missions
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 4 }}>
          Complete real-world projects in an extended timeframe to prove your engineering skills.
        </Typography>

        {isLoading ? (
          <CircularProgress />
        ) : missions.length === 0 ? (
          <Typography color="text.secondary">No missions available right now. Check back later!</Typography>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {missions.map((mission: any) => (
              <Box key={mission.id}>
                <Card variant="outlined" sx={{ bgcolor: "background.paper" }}>
                  <CardContent sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <Box>
                      <Typography variant="h6" sx={{ fontWeight: "bold", mb: 1 }}>
                        {mission.title}
                      </Typography>
                      <Box sx={{ display: "flex", gap: 1 }}>
                        <Chip label={`Track: ${mission.track}`} size="small" />
                        <Chip label={`${mission.timeLimitHours}h Limit`} size="small" />
                      </Box>
                    </Box>
                    <Button 
                      variant="contained" 
                      onClick={() => router.push(`/assess/mission/${mission.id}`)}
                    >
                      View Mission
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
