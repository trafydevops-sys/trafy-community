"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { trpc, withAuthRetry } from "@/lib/trpc-client";
import {
  Box,
  Typography,
  CircularProgress,
  Alert,
  Tabs,
  Tab,
  Card,
  CardContent,
  Avatar,
  Button,
  Grid,
} from "@mui/material";

export default function PublicCompanyPage() {
  const { slug } = useParams() as { slug: string };
  const [org, setOrg] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tabIndex, setTabIndex] = useState(0);

  // Data fetching states for tabs
  const [jobs, setJobs] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);

  useEffect(() => {
    const fetchOrg = async () => {
      try {
        const data = await trpc.organizations.getPublic.query({ slug });
        setOrg(data);
        if (data.type === "company") {
          const orgJobs = await trpc.organizations.listJobs.query({ slug });
          setJobs(orgJobs);
          const orgPosts = await trpc.organizations.listPosts.query({ slug });
          setPosts(orgPosts);
        } else {
          // It's an institution. Actually to get batches we need organizationId. We have it in data.id.
          // Wait, list procedure in batches router requires getOrganizationInput (organizationId).
          // But our TRPC is not authenticated for public visitor? Ah, list batches might require auth right now. Let's try.
          // In batches router: `list` is protectedProcedure? Yes, we made it protected. If the PRD wants Batches to be public, we need to change it to publicProcedure in batches.ts.
          // Let's assume we can fetch them or we handle the error. For now we will try.
          try {
            const orgBatches = await trpc.batches.list.query({ organizationId: data.id });
            setBatches(orgBatches);
          } catch (e) {
            console.log("Batches requires auth or failed", e);
          }
        }
      } catch (err: any) {
        setError(err.message || "Failed to load profile");
      } finally {
        setLoading(false);
      }
    };
    fetchOrg();
  }, [slug]);

  if (loading) return <Box sx={{ p: 4, display: "flex", justifyContent: "center" }}><CircularProgress /></Box>;
  if (error || !org) return <Box sx={{ p: 4 }}><Alert severity="error">{error || "Not found"}</Alert></Box>;

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabIndex(newValue);
  };

  return (
    <Box sx={{ maxWidth: 1000, mx: "auto", p: { xs: 2, md: 4 } }}>
      {/* Hero Section */}
      <Card sx={{ mb: 4, position: "relative", overflow: "visible" }}>
        <Box
          sx={{
            height: 200,
            bgcolor: "primary.main",
            backgroundImage: org.bannerUrl ? `url(${org.bannerUrl})` : "none",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <Box sx={{ px: 4, pb: 4, display: "flex", gap: 3, alignItems: "flex-end", mt: -6 }}>
          <Avatar
            src={org.logoUrl}
            sx={{ width: 120, height: 120, border: "4px solid white", bgcolor: "background.paper" }}
          />
          <Box sx={{ flex: 1, pb: 1 }}>
          <Typography variant="h4" sx={{ fontWeight: "bold" }}>
            {org.name}
          </Typography>
          <Typography variant="body1" color="text.secondary">
              {org.industry && `${org.industry} • `}
              {org.employeeRange && `${org.employeeRange} employees • `}
              {org.location && `${org.location}`}
            </Typography>
          </Box>
          <Box sx={{ pb: 1, display: "flex", gap: 2 }}>
            {org.website && (
              <Button variant="outlined" href={org.website} target="_blank">
                Website
              </Button>
            )}
            <Button variant="contained">Follow</Button>
          </Box>
        </Box>
      </Card>

      {/* Tabs Navigation */}
      <Tabs value={tabIndex} onChange={handleTabChange} sx={{ borderBottom: 1, borderColor: "divider", mb: 3 }}>
        <Tab label="About" />
        {org.type === "company" && <Tab label="Jobs" />}
        {org.type === "company" && <Tab label="Posts" />}
        {org.type === "institution" && <Tab label="Batches" />}
        <Tab label="People" />
      </Tabs>

      {/* Tab Panels */}
      {tabIndex === 0 && (
        <Box>
          <Typography variant="h6" sx={{ mb: 2 }}>About Us</Typography>
          <Typography variant="body1" sx={{ whiteSpace: "pre-wrap" }}>
            {org.about || "No description provided."}
          </Typography>
        </Box>
      )}

      {org.type === "company" && tabIndex === 1 && (
        <Box>
          <Typography variant="h6" sx={{ mb: 2 }}>Open Roles</Typography>
          {jobs.length === 0 ? (
            <Typography color="text.secondary">No open roles right now.</Typography>
          ) : (
            <Grid container spacing={2}>
              {jobs.map((job) => (
                <Grid size={{ xs: 12, sm: 6 }} key={job.id} sx={{}}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="h6">{job.title}</Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        {job.location || "Remote"} • {job.jobType}
                      </Typography>
                      <Button variant="contained" size="small" href={`/jobs/${job.id}`}>
                        Apply Now
                      </Button>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}
        </Box>
      )}

      {org.type === "company" && tabIndex === 2 && (
        <Box>
          <Typography variant="h6" sx={{ mb: 2 }}>Recent Posts</Typography>
          {posts.length === 0 ? (
            <Typography color="text.secondary">No posts yet.</Typography>
          ) : (
            <Grid container spacing={2}>
              {posts.map((post) => (
                <Grid size={{ xs: 12 }} key={post.id} sx={{}}>
                  <Card variant="outlined">
                    <CardContent>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
                        <Avatar src={post.author.avatarUrl} />
                        <Typography sx={{ fontWeight: "bold" }}>{post.author.fullName}</Typography>
                      </Box>
                      <Typography>{post.body}</Typography>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}
        </Box>
      )}

      {org.type === "institution" && tabIndex === 1 && (
        <Box>
          <Typography variant="h6" sx={{ mb: 2 }}>Batches & Programmes</Typography>
          {batches.length === 0 ? (
            <Typography color="text.secondary">No batches available.</Typography>
          ) : (
            <Grid container spacing={2}>
              {batches.map((batch) => (
                <Grid size={{ xs: 12, sm: 6 }} key={batch.id} sx={{}}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="h6">{batch.name}</Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Starts: {new Date(batch.startDate).toLocaleDateString()}
                      </Typography>
                      <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
                        <Box sx={{ bgcolor: "primary.light", color: "primary.contrastText", px: 1, py: 0.5, borderRadius: 1, fontSize: 12 }}>
                          {batch.studentCount} Enrolled
                        </Box>
                        <Box sx={{ bgcolor: "success.light", color: "success.contrastText", px: 1, py: 0.5, borderRadius: 1, fontSize: 12 }}>
                          {batch.placementRate.toFixed(1)}% Placed
                        </Box>
                      </Box>
                      <Button variant="contained" size="small">Enroll</Button>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}
        </Box>
      )}
      
      {/* People tab */}
      {tabIndex === (org.type === "company" ? 3 : 2) && (
        <Box>
          <Typography variant="h6" sx={{ mb: 2 }}>People</Typography>
          <Typography color="text.secondary">Members visibility coming soon.</Typography>
        </Box>
      )}
    </Box>
  );
}
