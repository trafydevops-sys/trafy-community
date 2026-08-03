"use client";

import { useState, useEffect } from "react";
import { trpc, withAuthRetry } from "@/lib/trpc-client";
import { Box, Typography, Card, CircularProgress, Alert, Grid, Chip } from "@mui/material";

// Nivo components (will be dynamically imported to avoid SSR issues if necessary, but standard client components for now)
import { ResponsiveFunnel } from "@nivo/funnel";
import { ResponsiveBar } from "@nivo/bar";
import { ResponsiveLine } from "@nivo/line";
import { ResponsiveScatterPlot } from "@nivo/scatterplot";

export default function HiringAnalyticsDashboard() {
  const [funnelData, setFunnelData] = useState<any>(null);
  const [timeData, setTimeData] = useState<any>(null);
  const [dropoffData, setDropoffData] = useState<any>(null);
  const [scoreData, setScoreData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [jobId, setJobId] = useState<string | undefined>();
  const [track, setTrack] = useState<string | undefined>();

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    Promise.all([
      withAuthRetry(() => trpc.analytics.getFunnel.query({ jobId })),
      withAuthRetry(() => trpc.analytics.getTimeToHire.query({ jobId })),
      withAuthRetry(() => trpc.analytics.getAssessmentDropoff.query({ track })),
      withAuthRetry(() => trpc.analytics.getScoreOutcome.query({ jobId, track })),
    ]).then(([funnel, time, dropoff, score]) => {
      if (mounted) {
        setFunnelData(funnel);
        setTimeData(time);
        setDropoffData(dropoff);
        setScoreData(score);
        setLoading(false);
      }
    }).catch(err => {
      console.error(err);
      if (mounted) setLoading(false);
    });

    return () => { mounted = false; };
  }, [jobId, track]);

  if (loading) return <Box sx={{ p: 4, display: "flex", justifyContent: "center" }}><CircularProgress /></Box>;
  if (!funnelData) return <Alert severity="error">Failed to load analytics</Alert>;

  // Format data for Nivo
  const nivoFunnelData = funnelData.stages.map((s: any) => ({
    id: s.stage,
    value: s.count,
    label: s.stage.toUpperCase()
  }));

  const nivoBarData = timeData.stageDurations.map((s: any) => ({
    stage: s.stage.replace(/_/g, " "),
    days: s.avgDays,
  }));

  const nivoLineData = [
    {
      id: "median days",
      data: timeData.trend.map((t: any) => ({
        x: t.month,
        y: t.medianDays
      }))
    }
  ];

  const nivoDropoffData = dropoffData.buckets.map((b: any) => ({
    id: `${b.track} L${b.layer}`,
    started: b.started,
    submitted: b.submitted,
    graded: b.graded,
  }));

  const nivoScatterData = [
    {
      id: "hired",
      data: scoreData.points.filter((p: any) => p.outcome === "hired").map((p: any) => ({ x: p.rawScore, y: p.percentile }))
    },
    {
      id: "rejected",
      data: scoreData.points.filter((p: any) => p.outcome === "rejected").map((p: any) => ({ x: p.rawScore, y: p.percentile }))
    },
    {
      id: "open",
      data: scoreData.points.filter((p: any) => p.outcome === "open").map((p: any) => ({ x: p.rawScore, y: p.percentile }))
    }
  ];

  return (
    <Box sx={{ p: 4, maxWidth: 1400, mx: "auto" }}>
      <Typography variant="h4" sx={{ mb: 4 }}>Hiring Analytics Dashboard</Typography>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', mx: -2, '& > *': { p: 2 } }}>
        {/* 1. Funnel */}
        <Box sx={{ width: { xs: '100%', md: '50%' } }}>
          <Card variant="outlined" sx={{ p: 3, height: "100%" }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Funnel Conversion</Typography>
            <Box sx={{ display: "flex", gap: 2, mb: 2 }}>
              <Chip label={`Total Applications: ${funnelData.totalApplications}`} />
              <Chip label={`Overall Hire Rate: ${(funnelData.overallHireRate * 100).toFixed(1)}%`} color="primary" />
            </Box>
            <Box sx={{ height: 300 }}>
              <ResponsiveFunnel
                data={nivoFunnelData}
                margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
                valueFormat=">-.0f"
                colors={{ scheme: 'spectral' }}
                borderWidth={20}
                labelColor={{ from: 'color', modifiers: [['darker', 3]] }}
                beforeSeparatorLength={100}
                beforeSeparatorOffset={20}
                afterSeparatorLength={100}
                afterSeparatorOffset={20}
                currentPartSizeExtension={10}
                currentBorderWidth={40}
                motionConfig="wobbly"
              />
            </Box>
          </Card>
        </Box>

        {/* 2. Time to Hire */}
        <Box sx={{ width: { xs: '100%', md: '50%' } }}>
          <Card variant="outlined" sx={{ p: 3, height: "100%" }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Time to Hire</Typography>
            <Box sx={{ display: "flex", gap: 2, mb: 2 }}>
              <Chip label={`Median: ${timeData.medianDaysToHire.toFixed(1)} days`} />
              <Chip label={`Offer Acceptance: ${(timeData.offerAcceptanceRate * 100).toFixed(1)}%`} color="primary" />
            </Box>
            <Box sx={{ height: 300 }}>
              <ResponsiveLine
                data={nivoLineData}
                margin={{ top: 20, right: 20, bottom: 40, left: 40 }}
                xScale={{ type: 'point' }}
                yScale={{ type: 'linear', min: 0, max: 'auto' }}
                axisBottom={{ tickSize: 5, tickPadding: 5, tickRotation: -45 }}
                axisLeft={{ tickSize: 5, tickPadding: 5, tickRotation: 0 }}
                pointSize={10}
                pointColor={{ theme: 'background' }}
                pointBorderWidth={2}
                pointBorderColor={{ from: 'serieColor' }}
                enableArea={true}
                useMesh={true}
              />
            </Box>
          </Card>
        </Box>

        {/* 3. Assessment Dropoff */}
        <Box sx={{ width: { xs: '100%', md: '50%' } }}>
          <Card variant="outlined" sx={{ p: 3, height: "100%" }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Assessment Drop-off</Typography>
            <Box sx={{ display: "flex", gap: 2, mb: 2 }}>
              <Chip label={`Overall Dropoff: ${(dropoffData.overallDropoffRate * 100).toFixed(1)}%`} color={dropoffData.overallDropoffRate > 0.4 ? "error" : "default"} />
            </Box>
            <Box sx={{ height: 300 }}>
              <ResponsiveBar
                data={nivoDropoffData}
                keys={['started', 'submitted', 'graded']}
                indexBy="id"
                margin={{ top: 20, right: 130, bottom: 50, left: 60 }}
                padding={0.3}
                valueScale={{ type: 'linear' }}
                indexScale={{ type: 'band', round: true }}
                colors={{ scheme: 'nivo' }}
                axisBottom={{ tickRotation: -45 }}
                legends={[
                  {
                    dataFrom: 'keys',
                    anchor: 'bottom-right',
                    direction: 'column',
                    justify: false,
                    translateX: 120,
                    translateY: 0,
                    itemsSpacing: 2,
                    itemWidth: 100,
                    itemHeight: 20,
                    itemDirection: 'left-to-right',
                    itemOpacity: 0.85,
                    symbolSize: 20,
                  }
                ]}
              />
            </Box>
          </Card>
        </Box>

        {/* 4. Score vs Outcome */}
        <Box sx={{ width: { xs: '100%', md: '50%' } }}>
          <Card variant="outlined" sx={{ p: 3, height: "100%" }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Score vs Outcome</Typography>
            <Box sx={{ display: "flex", gap: 2, mb: 2 }}>
              <Chip label={`Pearson r: ${scoreData.correlation.toFixed(2)}`} />
            </Box>
            <Box sx={{ height: 300 }}>
              <ResponsiveScatterPlot
                data={nivoScatterData}
                margin={{ top: 20, right: 90, bottom: 70, left: 90 }}
                xScale={{ type: 'linear', min: 0, max: 100 }}
                yScale={{ type: 'linear', min: 0, max: 100 }}
                blendMode="multiply"
                axisBottom={{
                  tickSize: 5,
                  tickPadding: 5,
                  tickRotation: 0,
                  legend: 'Raw Score',
                  legendPosition: 'middle',
                  legendOffset: 46
                }}
                axisLeft={{
                  tickSize: 5,
                  tickPadding: 5,
                  tickRotation: 0,
                  legend: 'Percentile',
                  legendPosition: 'middle',
                  legendOffset: -60
                }}
                legends={[
                  {
                    anchor: 'bottom-right',
                    direction: 'column',
                    justify: false,
                    translateX: 130,
                    translateY: 0,
                    itemWidth: 100,
                    itemHeight: 12,
                    itemsSpacing: 5,
                    itemDirection: 'left-to-right',
                    symbolSize: 12,
                    symbolShape: 'circle',
                  }
                ]}
              />
            </Box>
          </Card>
        </Box>
      </Box>
    </Box>
  );
}
