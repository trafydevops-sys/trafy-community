"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  Certificate,
  EducationEntry,
  ExperienceEntry,
  PrivacySettingsInput,
  UserRole,
  OnboardingGoal,
} from "@trafy-community/core";
import { USER_ROLES, ONBOARDING_GOALS, GOAL_TO_TRACK } from "@trafy-community/core";
import Container from "@mui/material/Container";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Alert from "@mui/material/Alert";
import Chip from "@mui/material/Chip";
import Stepper from "@mui/material/Stepper";
import Step from "@mui/material/Step";
import StepLabel from "@mui/material/StepLabel";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import InputLabel from "@mui/material/InputLabel";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import Divider from "@mui/material/Divider";
import CircularProgress from "@mui/material/CircularProgress";
import Grid from "@mui/material/Grid";
import Box from "@mui/material/Box";
import DeleteOutlineIcon from "@mui/icons-material/Delete";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import SchoolIcon from "@mui/icons-material/School";
import WorkIcon from "@mui/icons-material/Work";
import PersonIcon from "@mui/icons-material/Person";
import BusinessIcon from "@mui/icons-material/Business";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import { withAuthRetry, trpc } from "@/lib/trpc-client";
import { uploadFile } from "@/lib/upload";
import { useAuth } from "@/lib/auth-context";

type FlowStep = 
  | "Role" 
  | "Resume" 
  | "Basics" 
  | "Goals" 
  | "Education" 
  | "Experience" 
  | "Certificates" 
  | "Privacy" 
  | "Baseline" 
  | "Review";

const TALENT_STEPS: FlowStep[] = ["Role", "Resume", "Basics", "Goals", "Education", "Experience", "Certificates", "Privacy", "Baseline", "Review"];
const OTHER_STEPS: FlowStep[] = ["Role", "Basics", "Privacy", "Review"];

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random());
}

export default function OnboardingPage() {
  const router = useRouter();
  const { user } = useAuth();

  const [role, setRole] = useState<UserRole | null>(null);
  const steps = role === "talent" || role === null ? TALENT_STEPS : OTHER_STEPS;
  const [stepIndex, setStepIndex] = useState(0);
  const step = steps[stepIndex] ?? steps[0];

  const [fullName, setFullName] = useState("");
  const [title, setTitle] = useState("");
  const [bio, setBio] = useState("");
  const [goals, setGoals] = useState<OnboardingGoal[]>([]);
  const [resumeUrl, setResumeUrl] = useState<string | null>(null);
  const [education, setEducation] = useState<(EducationEntry & { _key: string })[]>([]);
  const [experience, setExperience] = useState<(ExperienceEntry & { _key: string })[]>([]);
  const [certificates, setCertificates] = useState<(Certificate & { _key: string })[]>([]);
  const [privacy, setPrivacy] = useState<PrivacySettingsInput>({
    profileVisibility: "public",
    showEmail: false,
    showEducation: true,
    showExperience: true,
    showCertificates: true,
  });

  const [uploadingResume, setUploadingResume] = useState(false);
  const [parsingResume, setParsingResume] = useState(false);
  const [parsedData, setParsedData] = useState<any>(null);

  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function goNext() {
    setError(null);
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  }
  function goBack() {
    setError(null);
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  async function handleFinish() {
    setSaving(true);
    setError(null);
    try {
      await withAuthRetry(() =>
        trpc.profile.update.mutate({
          fullName,
          title: title || undefined,
          bio: bio || undefined,
          education: education.map(({ _key, ...rest }) => rest),
          experience: experience.map(({ _key, ...rest }) => rest),
          certificates: certificates.map(({ _key, ...rest }) => rest),
        })
      );
      await withAuthRetry(() => trpc.profile.updatePrivacy.mutate(privacy));
      await withAuthRetry(() => trpc.onboarding.saveState.mutate({
        userRole: role!,
        goals,
        resumeUrl: resumeUrl || undefined,
        onboardingCompleted: true
      }));
      router.push("/feed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your profile. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleResumeUpload(file: File) {
    setUploadingResume(true);
    setError(null);
    try {
      const result = await uploadFile("resume", file);
      setResumeUrl(result.url);
      setUploadingResume(false);
      setParsingResume(true);
      
      const parsed = await trpc.onboarding.parseResume.mutate({ resumeUrl: result.url });
      setParsedData(parsed);
      
      // Auto-fill available basics
      if (parsed.fullName?.value) setFullName(parsed.fullName.value);
      if (parsed.title?.value) setTitle(parsed.title.value);
      if (parsed.bio?.value) setBio(parsed.bio.value);
      
      if (parsed.education?.length) {
        setEducation(parsed.education.map((e: any) => ({ ...e, _key: newId() })));
      }
      if (parsed.experience?.length) {
        setExperience(parsed.experience.map((e: any) => ({ ...e, _key: newId() })));
      }
      
    } catch (err) {
      setError(err instanceof Error ? err.message : "Resume upload or parsing failed.");
    } finally {
      setUploadingResume(false);
      setParsingResume(false);
    }
  }

  async function handleCertificateFile(key: string, file: File) {
    setUploadingKey(key);
    setError(null);
    try {
      const result = await uploadFile("certificate", file);
      setCertificates((rows) => rows.map((r) => (r._key === key ? { ...r, fileUrl: result.url } : r)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploadingKey(null);
    }
  }

  function toggleGoal(goal: OnboardingGoal) {
    setGoals((prev) => prev.includes(goal) ? prev.filter(g => g !== goal) : [...prev, goal]);
  }

  const ConfidenceChip = ({ confidence }: { confidence?: string }) => {
    if (!confidence) return null;
    const color = confidence === "high" ? "success" : confidence === "medium" ? "warning" : "error";
    return <Chip label={`${confidence} confidence`} size="small" color={color} sx={{ height: 20, fontSize: '0.7rem' }} />;
  };

  return (
    <Container maxWidth="md" sx={{ py: { xs: 5, sm: 8 } }}>
      <Typography variant="h4" gutterBottom align="center">
        {step === "Role" ? "Welcome to Trafy Community" : "Build your profile"}
      </Typography>
      <Typography variant="body1" color="text.secondary" align="center" sx={{ mb: 4 }}>
        {step === "Role" ? "Let's personalize your experience. What brings you here?" : "A complete profile helps you stand out."}
      </Typography>

      {step !== "Role" && (
        <Stepper activeStep={stepIndex} alternativeLabel sx={{ mb: 5, overflowX: "auto" }}>
          {steps.map((s) => (
            <Step key={s}>
              <StepLabel>{s}</StepLabel>
            </Step>
          ))}
        </Stepper>
      )}

      <Paper variant="outlined" sx={{ p: { xs: 3, sm: 4 }, maxWidth: 600, mx: "auto" }}>
        <Stack spacing={3}>
          {error && <Alert severity="error">{error}</Alert>}

          {step === "Role" && (
            <Grid container spacing={2}>
              {[
                { id: "talent", icon: <PersonIcon fontSize="large" />, title: "Talent", desc: "Learn, get certified, and find jobs" },
                { id: "recruiter", icon: <WorkIcon fontSize="large" />, title: "Recruiter", desc: "Post jobs and hire top talent" },
                { id: "instructor", icon: <SchoolIcon fontSize="large" />, title: "Instructor", desc: "Create courses and teach students" },
                { id: "institution", icon: <BusinessIcon fontSize="large" />, title: "Institution", desc: "Manage cohorts and train teams" },
              ].map((r) => (
                <Grid size={{ xs: 12, sm: 6 }} key={r.id}>
                  <Paper
                    variant="outlined"
                    sx={{
                      p: 3,
                      textAlign: "center",
                      cursor: "pointer",
                      borderWidth: 2,
                      borderColor: role === r.id ? "primary.main" : "divider",
                      bgcolor: role === r.id ? "primary.50" : "transparent",
                      transition: "all 0.2s",
                      "&:hover": { borderColor: "primary.light", bgcolor: "primary.50" }
                    }}
                    onClick={() => setRole(r.id as UserRole)}
                  >
                    <Box sx={{ color: role === r.id ? "primary.main" : "text.secondary", mb: 1 }}>{r.icon}</Box>
                    <Typography variant="h6">{r.title}</Typography>
                    <Typography variant="body2" color="text.secondary">{r.desc}</Typography>
                  </Paper>
                </Grid>
              ))}
            </Grid>
          )}

          {step === "Resume" && (
            <Stack spacing={3} sx={{ alignItems: "center" }}>
              {!parsedData && !parsingResume && !uploadingResume && (
                <>
                  <AutoAwesomeIcon color="primary" sx={{ fontSize: 48 }} />
                  <Typography variant="h6" align="center">Skip the form filling</Typography>
                  <Typography variant="body2" color="text.secondary" align="center">
                    Upload your resume (PDF or DOCX) and our AI will automatically extract your experience, education, and skills. You can edit everything before it saves.
                  </Typography>
                  <Button variant="contained" component="label" size="large" startIcon={<UploadFileIcon />}>
                    Upload Resume
                    <input
                      type="file"
                      hidden
                      accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleResumeUpload(file);
                      }}
                    />
                  </Button>
                </>
              )}
              
              {(uploadingResume || parsingResume) && (
                <Stack spacing={2} sx={{ alignItems: "center", py: 4 }}>
                  <CircularProgress />
                  <Typography variant="body1">{uploadingResume ? "Uploading..." : "Parsing your resume with AI..."}</Typography>
                </Stack>
              )}

              {parsedData && (
                <Stack spacing={2} sx={{ width: "100%" }}>
                  <Alert icon={<CheckCircleIcon />} severity="success">
                    Resume parsed successfully! Please review the extracted information below.
                  </Alert>
                  
                  {parsedData.fullName?.value && (
                    <Paper variant="outlined" sx={{ p: 2 }}>
                      <Stack direction="row" sx={{ justifyContent: "space-between", mb: 1 }}>
                        <Typography variant="subtitle2">Name</Typography>
                        <ConfidenceChip confidence={parsedData.fullName.confidence} />
                      </Stack>
                      <TextField fullWidth size="small" value={fullName} onChange={e => setFullName(e.target.value)} />
                    </Paper>
                  )}

                  {parsedData.title?.value && (
                    <Paper variant="outlined" sx={{ p: 2 }}>
                      <Stack direction="row" sx={{ justifyContent: "space-between", mb: 1 }}>
                        <Typography variant="subtitle2">Title</Typography>
                        <ConfidenceChip confidence={parsedData.title.confidence} />
                      </Stack>
                      <TextField fullWidth size="small" value={title} onChange={e => setTitle(e.target.value)} />
                    </Paper>
                  )}
                  
                  {parsedData.experience?.length > 0 && (
                    <Paper variant="outlined" sx={{ p: 2 }}>
                      <Stack direction="row" sx={{ justifyContent: "space-between", mb: 1 }}>
                        <Typography variant="subtitle2">Experience Extracted</Typography>
                        <ConfidenceChip confidence="high" />
                      </Stack>
                      <Typography variant="body2" color="text.secondary">
                        {parsedData.experience.length} roles found. You can review and edit them in the Experience step.
                      </Typography>
                    </Paper>
                  )}
                </Stack>
              )}
            </Stack>
          )}

          {step === "Basics" && (
            <>
              <TextField id="fullName" label="Full name" required fullWidth value={fullName} onChange={(e) => setFullName(e.target.value)} />
              <TextField id="title" label="Title" fullWidth placeholder="e.g. Frontend Developer" value={title} onChange={(e) => setTitle(e.target.value)} />
              <TextField id="bio" label="Bio" multiline rows={4} fullWidth value={bio} onChange={(e) => setBio(e.target.value)} />
            </>
          )}

          {step === "Goals" && (
            <Stack spacing={3}>
              <Typography variant="subtitle1">What do you want to achieve?</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {ONBOARDING_GOALS.map((goal) => (
                  <Chip
                    key={goal}
                    label={goal.replace(/-/g, ' ')}
                    onClick={() => toggleGoal(goal)}
                    color={goals.includes(goal) ? "primary" : "default"}
                    variant={goals.includes(goal) ? "filled" : "outlined"}
                    sx={{ textTransform: 'capitalize' }}
                  />
                ))}
              </Box>

              {goals.length > 0 && (
                <Paper sx={{ p: 2, bgcolor: "primary.50", borderColor: "primary.100" }} variant="outlined">
                  <Typography variant="subtitle2" color="primary.900" gutterBottom>
                    Recommended Tracks
                  </Typography>
                  <Typography variant="body2" color="primary.800">
                    Based on your goals, we'll personalize your feed with content for: 
                    <strong> {Array.from(new Set(goals.map(g => GOAL_TO_TRACK[g]).filter(Boolean))).join(', ') || 'General Tech'}</strong>
                  </Typography>
                </Paper>
              )}
            </Stack>
          )}

          {step === "Education" && (
            <>
              {education.map((row) => (
                <Paper key={row._key} variant="outlined" sx={{ p: 2 }}>
                  <Stack spacing={2}>
                    <Stack direction="row" sx={{ justifyContent: "flex-end" }}>
                      <IconButton
                        size="small"
                        aria-label="Remove education entry"
                        onClick={() => setEducation((rows) => rows.filter((r) => r._key !== row._key))}
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                    <TextField
                      label="Institution"
                      fullWidth
                      value={row.institution}
                      onChange={(e) =>
                        setEducation((rows) => rows.map((r) => (r._key === row._key ? { ...r, institution: e.target.value } : r)))
                      }
                    />
                    <TextField
                      label="Degree"
                      fullWidth
                      value={row.degree ?? ""}
                      onChange={(e) => setEducation((rows) => rows.map((r) => (r._key === row._key ? { ...r, degree: e.target.value } : r)))}
                    />
                    <Stack direction="row" spacing={2}>
                      <TextField
                        label="Start year"
                        type="number"
                        fullWidth
                        value={row.startYear || ""}
                        onChange={(e) =>
                          setEducation((rows) => rows.map((r) => (r._key === row._key ? { ...r, startYear: Number(e.target.value) } : r)))
                        }
                      />
                      <TextField
                        label="End year"
                        type="number"
                        fullWidth
                        value={row.endYear ?? ""}
                        onChange={(e) =>
                          setEducation((rows) =>
                            rows.map((r) =>
                              r._key === row._key ? { ...r, endYear: e.target.value ? Number(e.target.value) : undefined } : r
                            )
                          )
                        }
                      />
                    </Stack>
                  </Stack>
                </Paper>
              ))}
              <Button
                variant="outlined"
                onClick={() => setEducation((rows) => [...rows, { _key: newId(), institution: "", startYear: new Date().getFullYear() }])}
              >
                + Add education
              </Button>
            </>
          )}

          {step === "Experience" && (
            <>
              {experience.map((row) => (
                <Paper key={row._key} variant="outlined" sx={{ p: 2 }}>
                  <Stack spacing={2}>
                    <Stack direction="row" sx={{ justifyContent: "flex-end" }}>
                      <IconButton
                        size="small"
                        aria-label="Remove experience entry"
                        onClick={() => setExperience((rows) => rows.filter((r) => r._key !== row._key))}
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                    <TextField
                      label="Company"
                      fullWidth
                      value={row.company}
                      onChange={(e) => setExperience((rows) => rows.map((r) => (r._key === row._key ? { ...r, company: e.target.value } : r)))}
                    />
                    <TextField
                      label="Role"
                      fullWidth
                      value={row.role}
                      onChange={(e) => setExperience((rows) => rows.map((r) => (r._key === row._key ? { ...r, role: e.target.value } : r)))}
                    />
                    <Stack direction="row" spacing={2}>
                      <TextField
                        label="Start date"
                        type="date"
                        fullWidth
                        slotProps={{ inputLabel: { shrink: true } }}
                        value={row.startDate || ""}
                        onChange={(e) => setExperience((rows) => rows.map((r) => (r._key === row._key ? { ...r, startDate: e.target.value } : r)))}
                      />
                      <TextField
                        label="End date"
                        type="date"
                        fullWidth
                        slotProps={{ inputLabel: { shrink: true } }}
                        value={row.endDate ?? ""}
                        onChange={(e) =>
                          setExperience((rows) => rows.map((r) => (r._key === row._key ? { ...r, endDate: e.target.value || undefined } : r)))
                        }
                      />
                    </Stack>
                    <TextField
                      label="Description"
                      multiline
                      rows={3}
                      fullWidth
                      value={row.description ?? ""}
                      onChange={(e) =>
                        setExperience((rows) => rows.map((r) => (r._key === row._key ? { ...r, description: e.target.value } : r)))
                      }
                    />
                  </Stack>
                </Paper>
              ))}
              <Button
                variant="outlined"
                onClick={() =>
                  setExperience((rows) => [
                    ...rows,
                    { _key: newId(), company: "", role: "", startDate: new Date().toISOString().slice(0, 10) },
                  ])
                }
              >
                + Add experience
              </Button>
            </>
          )}

          {step === "Certificates" && (
            <>
              {certificates.map((row) => (
                <Paper key={row._key} variant="outlined" sx={{ p: 2 }}>
                  <Stack spacing={2}>
                    <Stack direction="row" sx={{ justifyContent: "flex-end" }}>
                      <IconButton
                        size="small"
                        aria-label="Remove certificate"
                        onClick={() => setCertificates((rows) => rows.filter((r) => r._key !== row._key))}
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                    <TextField
                      label="Label"
                      fullWidth
                      placeholder="e.g. AWS Certified Developer"
                      value={row.label}
                      onChange={(e) => setCertificates((rows) => rows.map((r) => (r._key === row._key ? { ...r, label: e.target.value } : r)))}
                    />
                    <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
                      <Button variant="outlined" component="label" startIcon={<UploadFileIcon />}>
                        Choose file
                        <input
                          type="file"
                          hidden
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleCertificateFile(row._key, file);
                          }}
                        />
                      </Button>
                      {uploadingKey === row._key && <Typography variant="body2" color="text.secondary">Uploading…</Typography>}
                      {row.fileUrl && (
                        <Typography variant="body2">
                          <a href={row.fileUrl} target="_blank" rel="noreferrer">
                            View uploaded file
                          </a>
                        </Typography>
                      )}
                    </Stack>
                  </Stack>
                </Paper>
              ))}
              <Button variant="outlined" onClick={() => setCertificates((rows) => [...rows, { _key: newId(), label: "", fileUrl: "" }])}>
                + Add certificate
              </Button>
            </>
          )}

          {step === "Privacy" && (
            <>
              <FormControl fullWidth>
                <InputLabel id="visibility-label">Profile visibility</InputLabel>
                <Select
                  labelId="visibility-label"
                  label="Profile visibility"
                  value={privacy.profileVisibility}
                  onChange={(e) =>
                    setPrivacy((p) => ({ ...p, profileVisibility: e.target.value as PrivacySettingsInput["profileVisibility"] }))
                  }
                >
                  <MenuItem value="public">Public — anyone can view</MenuItem>
                  <MenuItem value="private">Private — only you</MenuItem>
                </Select>
              </FormControl>
              <Divider />
              <Stack spacing={1}>
                {(
                  [
                    ["showEmail", "Show my email on my public profile"],
                    ["showEducation", "Show education"],
                    ["showExperience", "Show experience"],
                    ["showCertificates", "Show certificates"],
                  ] as const
                ).map(([key, label]) => (
                  <FormControlLabel
                    key={key}
                    control={
                      <Switch checked={privacy[key]} onChange={(e) => setPrivacy((p) => ({ ...p, [key]: e.target.checked }))} />
                    }
                    label={label}
                    sx={{ justifyContent: "space-between", ml: 0 }}
                    labelPlacement="start"
                  />
                ))}
              </Stack>
            </>
          )}

          {step === "Baseline" && (
            <Paper variant="outlined" sx={{ p: 4, textAlign: "center", bgcolor: "primary.50", borderColor: "primary.200" }}>
              <AutoAwesomeIcon color="primary" sx={{ fontSize: 48, mb: 2 }} />
              <Typography variant="h5" gutterBottom>Benchmark your skills</Typography>
              <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
                Take a quick 10-minute foundation assessment to unlock personalized course recommendations and prove your baseline skills to recruiters.
              </Typography>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ justifyContent: "center" }}>
                <Button variant="contained" size="large" onClick={() => router.push("/assess")}>
                  Take the test now
                </Button>
                <Button variant="outlined" size="large" onClick={goNext}>
                  Skip for now
                </Button>
              </Stack>
            </Paper>
          )}

          {step === "Review" && (
            <Stack spacing={1.5}>
              <Typography variant="h6">
                {fullName || "(no name yet)"}
                {title ? ` — ${title}` : ""}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {bio || "No bio yet."}
              </Typography>
              <Typography variant="body2">Education: {education.length}</Typography>
              <Typography variant="body2">Experience: {experience.length}</Typography>
              <Typography variant="body2">Certificates: {certificates.length}</Typography>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <Typography variant="body2">Visibility:</Typography>
                <Chip size="small" label={privacy.profileVisibility} />
              </Stack>
            </Stack>
          )}

          <Stack direction="row" spacing={1.5} sx={{ pt: 2 }}>
            <Button variant="outlined" onClick={goBack} disabled={stepIndex === 0} sx={{ display: step === "Role" || step === "Baseline" ? "none" : "block" }}>
              Back
            </Button>
            
            {step === "Review" ? (
              <Button variant="contained" onClick={handleFinish} disabled={saving || !fullName} sx={{ flex: 1 }}>
                {saving ? "Saving…" : "Finish Onboarding"}
              </Button>
            ) : step === "Role" ? (
              <Button variant="contained" onClick={goNext} disabled={!role} sx={{ flex: 1 }}>
                Continue
              </Button>
            ) : step === "Baseline" ? null : ( // Baseline handles its own navigation
              <Button 
                variant={step === "Resume" || step === "Goals" ? "text" : "contained"} 
                onClick={goNext} 
                disabled={step === "Basics" && !fullName} 
                sx={{ flex: 1 }}
              >
                {step === "Resume" || step === "Goals" ? (parsedData || goals.length > 0 ? "Continue" : "Skip") : "Continue"}
              </Button>
            )}
          </Stack>
        </Stack>
      </Paper>
    </Container>
  );
}
