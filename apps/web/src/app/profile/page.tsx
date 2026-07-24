"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Certificate, EducationEntry, ExperienceEntry, PrivacySettingsInput } from "@trafy-community/core";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import { AppShell } from "@/components/app-shell";
import { withAuthRetry, trpc } from "@/lib/trpc-client";
import { useAuth } from "@/lib/auth-context";

type ProfileData = {
  fullName: string;
  bio?: string;
  title?: string;
  education: EducationEntry[];
  experience: ExperienceEntry[];
  certificates: Certificate[];
};

export default function ProfilePage() {
  const router = useRouter();
  const { user, logout } = useAuth();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [privacy, setPrivacy] = useState<PrivacySettingsInput | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    withAuthRetry(() => trpc.profile.get.query())
      .then((data) => {
        setProfile(data.profile);
        setPrivacy(data.privacy);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load your profile."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppShell active="profile">
      <Typography variant="h4" gutterBottom>
        Your profile
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        {user?.email}
      </Typography>

      <Paper variant="outlined" sx={{ p: 3 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {loading ? (
          <Typography color="text.secondary">Loading your profile…</Typography>
        ) : !profile?.fullName ? (
          <Stack spacing={2} sx={{ alignItems: "flex-start" }}>
            <Typography>Finish building your profile to unlock courses, jobs, and your community.</Typography>
            <Button variant="contained" component={Link} href="/onboarding">
              Build your profile
            </Button>
          </Stack>
        ) : (
          <Stack spacing={2.5}>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
              <Typography variant="h6">{profile.fullName}</Typography>
              {privacy && <Chip size="small" label={privacy.profileVisibility} />}
            </Stack>
            {profile.title && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: -1.5 }}>
                {profile.title}
              </Typography>
            )}
            {profile.bio && <Typography variant="body1">{profile.bio}</Typography>}

            <Divider />

            <div>
              <Typography variant="subtitle2" gutterBottom>
                Education
              </Typography>
              {profile.education.length === 0 && (
                <Typography variant="body2" color="text.secondary">
                  None added yet.
                </Typography>
              )}
              {profile.education.map((e, i) => (
                <Typography variant="body2" key={i}>
                  <strong>{e.institution}</strong>
                  {e.degree ? ` — ${e.degree}` : ""} ({e.startYear}
                  {e.endYear ? `–${e.endYear}` : "–present"})
                </Typography>
              ))}
            </div>

            <div>
              <Typography variant="subtitle2" gutterBottom>
                Experience
              </Typography>
              {profile.experience.length === 0 && (
                <Typography variant="body2" color="text.secondary">
                  None added yet.
                </Typography>
              )}
              {profile.experience.map((e, i) => (
                <Typography variant="body2" key={i}>
                  <strong>{e.role}</strong> at {e.company} ({e.startDate} – {e.endDate ?? "present"})
                </Typography>
              ))}
            </div>

            <div>
              <Typography variant="subtitle2" gutterBottom>
                Certificates
              </Typography>
              {profile.certificates.length === 0 && (
                <Typography variant="body2" color="text.secondary">
                  None added yet.
                </Typography>
              )}
              {profile.certificates.map((c, i) => (
                <Typography variant="body2" key={i}>
                  <a href={c.fileUrl} target="_blank" rel="noreferrer">
                    {c.label}
                  </a>
                </Typography>
              ))}
            </div>

            <Stack direction="row" spacing={1.5}>
              <Button variant="outlined" component={Link} href="/onboarding">
                Edit profile
              </Button>
              <Button
                variant="outlined"
                onClick={async () => {
                  await logout();
                  router.push("/");
                }}
              >
                Sign out
              </Button>
            </Stack>
          </Stack>
        )}
      </Paper>
    </AppShell>
  );
}
