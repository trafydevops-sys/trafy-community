"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { withAuthRetry, trpc } from "@/lib/trpc-client";
import { formatMoney } from "@/lib/format";
import {
  Box,
  Typography,
  Tabs,
  Tab,
  Grid,
  Card,
  CardContent,
  Chip,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  FormControlLabel,
  Switch,
  IconButton,
  Tooltip,
  Paper,
} from "@mui/material";
import {
  Bookmark,
  BookmarkBorder,
  CheckCircle,
  Warning,
  NotificationsActive,
  DeleteOutlined,
} from "@mui/icons-material";
import { JOB_TAGS } from "@trafy-community/core";

// Define a safe fallback if types aren't fully resolved in this environment
type JobSummary = any;
type JobAlert = any;

function compensationLabel(job: JobSummary): string {
  const min = formatMoney(job.compensationMinCents, job.currency);
  const suffix = job.compensationType === "hourly" ? "/hr" : job.compensationType === "salary" ? "/yr" : "";
  if (job.compensationMaxCents && job.compensationMaxCents !== job.compensationMinCents) {
    return `${min}–${formatMoney(job.compensationMaxCents, job.currency)}${suffix}`;
  }
  return `${min}${suffix}`;
}

export default function JobsPage() {
  const [tabIndex, setTabIndex] = useState(0);
  
  // Data States
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [recommendedJobs, setRecommendedJobs] = useState<JobSummary[]>([]);
  const [savedJobs, setSavedJobs] = useState<JobSummary[]>([]);
  const [alerts, setAlerts] = useState<JobAlert[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter States
  const [query, setQuery] = useState("");
  const [jobType, setJobType] = useState("");
  const [remote, setRemote] = useState(false);
  const [location, setLocation] = useState("");
  const [experienceLevel, setExperienceLevel] = useState("");
  const [industry, setIndustry] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  
  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      if (tabIndex === 0) {
        const filters: any = {
          query: query.trim() || undefined,
          jobType: jobType || undefined,
          location: location.trim() || undefined,
          experienceLevel: experienceLevel || undefined,
          industry: industry || undefined,
          tags: tags.length > 0 ? tags : undefined,
        };
        if (remote) filters.remote = true;

        const found = await withAuthRetry(() => trpc.jobs.listPublished.query(filters));
        setJobs(found);
      } else if (tabIndex === 1) {
        const recs = await withAuthRetry(() => trpc.jobs.recommended.query());
        setRecommendedJobs(recs);
      } else if (tabIndex === 2) {
        const saved = await withAuthRetry(() => trpc.jobs.listSaved.query());
        setSavedJobs(saved);
      } else if (tabIndex === 3) {
        const foundAlerts = await withAuthRetry(() => trpc.jobs.listAlerts.query());
        setAlerts(foundAlerts);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load jobs.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabIndex]);

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    if (tabIndex !== 0) setTabIndex(0);
    else loadData();
  }

  async function handleToggleSave(jobId: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      const res = await withAuthRetry(() => trpc.jobs.saveJob.mutate({ jobId }));
      // Optimistic UI updates
      const updateList = (list: JobSummary[]) => list.map(j => j.id === jobId ? { ...j, savedByMe: res.saved } : j);
      setJobs(updateList(jobs));
      setRecommendedJobs(updateList(recommendedJobs));
      if (!res.saved) {
        setSavedJobs(savedJobs.filter(j => j.id !== jobId));
      } else {
        loadData(); // Re-fetch saved jobs to ensure correct ordering
      }
    } catch (err) {
      alert("Failed to save job");
    }
  }

  async function handleCreateAlert() {
    try {
      const filters: any = {
        query: query.trim() || undefined,
        jobType: jobType || undefined,
        location: location.trim() || undefined,
        experienceLevel: experienceLevel || undefined,
        industry: industry || undefined,
      };
      if (remote) filters.remote = true;

      await withAuthRetry(() => trpc.jobs.createAlert.mutate(filters));
      alert("Job alert created!");
    } catch (err) {
      alert("Failed to create alert");
    }
  }
  
  async function handleDeleteAlert(alertId: string) {
    try {
      await withAuthRetry(() => trpc.jobs.deleteAlert.mutate({ alertId }));
      setAlerts(alerts.filter(a => a.id !== alertId));
    } catch (err) {
      alert("Failed to delete alert");
    }
  }

  const renderJobCard = (job: JobSummary) => (
    <Box key={job.id} sx={{ flexBasis: '100%', maxWidth: '100%', mb: 2 }}>
      <Link href={`/jobs/${job.id}`} style={{ textDecoration: "none" }}>
        <Card variant="outlined" sx={{ '&:hover': { borderColor: 'primary.main', boxShadow: 1 }, cursor: 'pointer', transition: 'all 0.2s' }}>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Box>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1 }}>
                  {job.organizationName && <Chip size="small" label={job.organizationName} color="default" />}
                  <Chip size="small" label={job.jobType.replace("_", " ")} variant="outlined" />
                  {job.remote && <Chip size="small" label="Remote" color="info" variant="outlined" />}
                </Box>
                <Typography variant="h6" component="div">
                  {job.title}
                </Typography>
                <Typography color="text.secondary" variant="body2" sx={{ mb: 1 }}>
                  {job.posterName} {job.location ? `· ${job.location}` : ""}
                </Typography>
              </Box>
              <Box sx={{ textAlign: 'right' }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                  {compensationLabel(job)}
                </Typography>
                <IconButton onClick={(e) => handleToggleSave(job.id, e)} color="primary">
                  {job.savedByMe ? <Bookmark /> : <BookmarkBorder />}
                </IconButton>
              </Box>
            </Box>
            
            {job.description && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {job.description}
              </Typography>
            )}

            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2 }}>
              <Box sx={{ display: 'flex', gap: 1 }}>
                {job.tags?.map((tag: string) => (
                  <Chip key={tag} label={tag} size="small" sx={{ fontSize: '0.7rem' }} />
                ))}
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {job.requiredTrack && (
                  <Tooltip title={job.meetsScoreGate ? "You meet the score requirement!" : `Requires a ${job.requiredTrack} score of ${job.minVerifiedScore}`}>
                    <Chip 
                      size="small"
                      icon={job.meetsScoreGate ? <CheckCircle /> : <Warning />}
                      label={job.meetsScoreGate ? "Qualified" : "No score yet"}
                      color={job.meetsScoreGate ? "success" : "warning"}
                      variant="outlined"
                      clickable={!job.meetsScoreGate}
                      onClick={!job.meetsScoreGate ? (e) => {
                        e.preventDefault();
                        window.location.href = `/assess`;
                      } : undefined}
                    />
                  </Tooltip>
                )}
                <Typography variant="caption" color="text.secondary">
                  {job.applicationCount} application{job.applicationCount === 1 ? "" : "s"}
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>
      </Link>
    </Box>
  );

  return (
    <AppShell active="jobs">
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 'bold' }}>Jobs Discovery</Typography>
        <Typography color="text.secondary">Find the right role for your skills.</Typography>
      </Box>

      {error && <div className="error-banner">{error}</div>}

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={tabIndex} onChange={(_, nv) => setTabIndex(nv)}>
          <Tab label="All Jobs" />
          <Tab label="Recommended" />
          <Tab label="Saved" />
          <Tab label="My Alerts" />
        </Tabs>
      </Box>

      <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
        {tabIndex === 0 && (
          <Box sx={{ flex: '1 1 250px', maxWidth: '300px' }}>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="h6" sx={{ mb: 1 }}>Filters</Typography>
              <form onSubmit={handleSearch}>
                <TextField fullWidth size="small" label="Search" value={query} onChange={(e) => setQuery(e.target.value)} sx={{ mb: 2 }} />
                
                <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                  <InputLabel>Job Type</InputLabel>
                  <Select value={jobType} label="Job Type" onChange={(e) => setJobType(e.target.value)}>
                    <MenuItem value="">All types</MenuItem>
                    <MenuItem value="full_time">Full-time</MenuItem>
                    <MenuItem value="contract">Contract</MenuItem>
                    <MenuItem value="freelance">Freelance</MenuItem>
                  </Select>
                </FormControl>

                <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                  <InputLabel>Experience</InputLabel>
                  <Select value={experienceLevel} label="Experience" onChange={(e) => setExperienceLevel(e.target.value)}>
                    <MenuItem value="">Any</MenuItem>
                    <MenuItem value="entry">Entry Level</MenuItem>
                    <MenuItem value="mid">Mid Level</MenuItem>
                    <MenuItem value="senior">Senior</MenuItem>
                    <MenuItem value="lead">Lead</MenuItem>
                  </Select>
                </FormControl>

                <TextField fullWidth size="small" label="Location" value={location} onChange={(e) => setLocation(e.target.value)} sx={{ mb: 2 }} />
                <TextField fullWidth size="small" label="Industry" value={industry} onChange={(e) => setIndustry(e.target.value)} sx={{ mb: 2 }} />

                <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                  <InputLabel>Tags</InputLabel>
                  <Select
                    multiple
                    value={tags}
                    label="Tags"
                    onChange={(e) => setTags(typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value)}
                    renderValue={(selected) => (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {selected.map((value) => (
                          <Chip key={value} label={value} size="small" />
                        ))}
                      </Box>
                    )}
                  >
                    {JOB_TAGS.map((tag) => (
                      <MenuItem key={tag} value={tag}>{tag}</MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <FormControlLabel
                  control={<Switch checked={remote} onChange={(e) => setRemote(e.target.checked)} />}
                  label="Remote Only"
                  sx={{ mb: 2, display: 'block' }}
                />

                <Button fullWidth variant="contained" type="submit" sx={{ mb: 1 }}>Apply Filters</Button>
                <Button fullWidth variant="outlined" color="secondary" onClick={handleCreateAlert} startIcon={<NotificationsActive />}>
                  Create Alert
                </Button>
              </form>
            </Paper>
          </Box>
        )}

        <Box sx={{ flex: '3 1 600px' }}>
          {loading ? (
            <Typography>Loading...</Typography>
          ) : tabIndex === 0 && jobs.length === 0 ? (
            <Typography>No jobs found.</Typography>
          ) : tabIndex === 1 && recommendedJobs.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 5 }}>
              <Typography variant="h6">No recommendations yet</Typography>
              <Typography color="text.secondary" sx={{ mb: 2 }}>Complete track assessments and fill out your profile location/remote preferences to unlock personalized job matches.</Typography>
              <Button component={Link} href="/assess" variant="contained">Take an Assessment</Button>
            </Box>
          ) : tabIndex === 2 && savedJobs.length === 0 ? (
            <Typography>You haven't saved any jobs yet.</Typography>
          ) : tabIndex === 3 && alerts.length === 0 ? (
            <Typography>You haven't set up any job alerts.</Typography>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {tabIndex === 0 && jobs.map(renderJobCard)}
              {tabIndex === 1 && recommendedJobs.map(renderJobCard)}
              {tabIndex === 2 && savedJobs.map(renderJobCard)}
              
              {tabIndex === 3 && (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                  {alerts.map(alert => (
                    <Box key={alert.id} sx={{ flex: '1 1 300px' }}>
                      <Card variant="outlined">
                        <CardContent>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Box>
                              <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>Alert Setup</Typography>
                              <Typography variant="body2" color="text.secondary">
                                Query: {alert.query || "Any"} | Type: {alert.jobType?.replace("_", " ") || "Any"}
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                Location: {alert.location || "Any"} {alert.remote ? "(Remote)" : ""}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                Created {new Date(alert.createdAt).toLocaleDateString()}
                              </Typography>
                            </Box>
                            <IconButton onClick={() => handleDeleteAlert(alert.id)} color="error">
                              <DeleteOutlined />
                            </IconButton>
                          </Box>
                        </CardContent>
                      </Card>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          )}
        </Box>
      </Box>
    </AppShell>
  );
}
