"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  Certificate,
  EducationEntry,
  ExperienceEntry,
  PrivacySettingsInput,
} from "@trafy-community/core";
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
import DeleteOutlineIcon from "@mui/icons-material/Delete";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import { withAuthRetry, trpc } from "@/lib/trpc-client";
import { uploadFile } from "@/lib/upload";
import { useAuth } from "@/lib/auth-context";

const STEPS = ["Basics", "Education", "Experience", "Certificates", "Privacy", "Review"] as const;
type StepName = (typeof STEPS)[number];

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random());
}

export default function OnboardingPage() {
  const router = useRouter();
  const { user } = useAuth();

  const [stepIndex, setStepIndex] = useState(0);
  const step: StepName = STEPS[stepIndex] ?? STEPS[0];

  const [fullName, setFullName] = useState("");
  const [title, setTitle] = useState("");
  const [bio, setBio] = useState("");
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

  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function goNext() {
    setError(null);
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
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
      router.push("/feed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your profile. Please try again.");
    } finally {
      setSaving(false);
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

  return (
    <Container maxWidth="sm" sx={{ py: { xs: 5, sm: 8 } }}>
      <Typography variant="h4" gutterBottom>
        Build your profile
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        {user?.email ? `Signed in as ${user.email}. ` : ""}
        A complete profile helps instructors and employers find you — it takes about two minutes.
      </Typography>

      <Stepper activeStep={stepIndex} alternativeLabel sx={{ mb: 4 }}>
        {STEPS.map((s) => (
          <Step key={s}>
            <StepLabel>{s}</StepLabel>
          </Step>
        ))}
      </Stepper>

      <Paper variant="outlined" sx={{ p: 3 }}>
        <Stack spacing={2.5}>
          {error && <Alert severity="error">{error}</Alert>}

          {step === "Basics" && (
            <>
              <TextField id="fullName" label="Full name" required fullWidth value={fullName} onChange={(e) => setFullName(e.target.value)} />
              <TextField id="title" label="Title" fullWidth placeholder="e.g. Frontend Developer" value={title} onChange={(e) => setTitle(e.target.value)} />
              <TextField id="bio" label="Bio" multiline rows={4} fullWidth value={bio} onChange={(e) => setBio(e.target.value)} />
            </>
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
                        value={row.startYear}
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
                        value={row.startDate}
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

          <Stack direction="row" spacing={1.5} sx={{ pt: 1 }}>
            <Button variant="outlined" onClick={goBack} disabled={stepIndex === 0}>
              Back
            </Button>
            {step === "Review" ? (
              <Button variant="contained" onClick={handleFinish} disabled={saving || !fullName} sx={{ flex: 1 }}>
                {saving ? "Saving…" : "Finish"}
              </Button>
            ) : (
              <Button variant="contained" onClick={goNext} disabled={step === "Basics" && !fullName} sx={{ flex: 1 }}>
                Continue
              </Button>
            )}
          </Stack>
        </Stack>
      </Paper>
    </Container>
  );
}
