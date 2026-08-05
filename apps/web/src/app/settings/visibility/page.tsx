"use client";

import { useState, useEffect } from "react";
import { trpc, withAuthRetry } from "@/lib/trpc-client";
import type { PrivacySettingsInput, ProfileVisibility } from "@trafy-community/core";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
import CircularProgress from "@mui/material/CircularProgress";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";

export default function VisibilitySettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [privacy, setPrivacy] = useState<PrivacySettingsInput | null>(null);

  useEffect(() => {
    withAuthRetry(() => trpc.profile.get.query())
      .then((data) => {
        // Defaults when no privacy row exists yet — these mirror the defaults
        // on privacySettingsInput in packages/core.
        setPrivacy(
          data.privacy ?? {
            profileVisibility: "public",
            showEmail: false,
            showEducation: true,
            showExperience: true,
            showCertificates: true,
          }
        );
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleChange = async <K extends keyof PrivacySettingsInput>(
    key: K,
    value: PrivacySettingsInput[K]
  ) => {
    if (!privacy) return;

    const previous = privacy;
    const updated = { ...privacy, [key]: value };
    setPrivacy(updated);
    setSaving(true);

    try {
      await withAuthRetry(() => trpc.profile.updatePrivacy.mutate(updated));
    } catch (e) {
      // Roll the toggle back so the UI never claims a setting was saved when
      // it wasn't — otherwise a failed write silently looks like a success.
      console.error("Failed to update privacy settings", e);
      setPrivacy(previous);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Box sx={{ py: 6, display: "flex", justifyContent: "center" }}><CircularProgress /></Box>;
  }

  return (
    <Stack spacing={4}>
      <Paper sx={{ p: 0, borderRadius: 2, overflow: "hidden" }}>
        <Box sx={{ p: 3, borderBottom: "1px solid", borderColor: "divider", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: "bold" }}>Profile viewing options</Typography>
            <Typography variant="body2" color="text.secondary">Choose whether you're visible or viewing in private mode.</Typography>
          </Box>
          {saving && <CircularProgress size={20} />}
        </Box>
        
        <Box sx={{ p: 3 }}>
          <Select
            size="small"
            value={privacy?.profileVisibility ?? "public"}
            onChange={(e) => handleChange("profileVisibility", e.target.value as ProfileVisibility)}
            sx={{ minWidth: 200 }}
          >
            {/* Only the two values profileVisibilitySchema accepts. A third
                "connections" option used to be listed here, but the server
                rejects it, so picking it failed validation on every save. */}
            <MenuItem value="public">Public (Everyone)</MenuItem>
            <MenuItem value="private">Private</MenuItem>
          </Select>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
            If you select Private, you will also not be able to see who viewed your profile.
          </Typography>
        </Box>
      </Paper>

      <Paper sx={{ p: 0, borderRadius: 2, overflow: "hidden" }}>
        <Box sx={{ p: 3, borderBottom: "1px solid", borderColor: "divider", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: "bold" }}>Visibility of your profile & network</Typography>
            <Typography variant="body2" color="text.secondary">Choose what information people can see on your profile.</Typography>
          </Box>
          {saving && <CircularProgress size={20} />}
        </Box>
        
        <Stack sx={{ p: 1 }} divider={<Box sx={{ borderBottom: "1px solid", borderColor: "divider" }} />}>
          <Box sx={{ p: 2, display: "flex", justifyContent: "space-between", alignItems: "center", "&:hover": { bgcolor: "action.hover" } }}>
            <Box>
              <Typography variant="subtitle2">Email address</Typography>
              <Typography variant="body2" color="text.secondary">Allow connections to see your email address</Typography>
            </Box>
            <Switch 
              checked={privacy?.showEmail || false} 
              onChange={(e) => handleChange("showEmail", e.target.checked)} 
              color="primary"
            />
          </Box>
          <Box sx={{ p: 2, display: "flex", justifyContent: "space-between", alignItems: "center", "&:hover": { bgcolor: "action.hover" } }}>
            <Box>
              <Typography variant="subtitle2">Education</Typography>
              <Typography variant="body2" color="text.secondary">Display your schools and degrees</Typography>
            </Box>
            <Switch 
              checked={privacy?.showEducation ?? true} 
              onChange={(e) => handleChange("showEducation", e.target.checked)} 
              color="primary"
            />
          </Box>
          <Box sx={{ p: 2, display: "flex", justifyContent: "space-between", alignItems: "center", "&:hover": { bgcolor: "action.hover" } }}>
            <Box>
              <Typography variant="subtitle2">Experience</Typography>
              <Typography variant="body2" color="text.secondary">Display your current and past roles</Typography>
            </Box>
            <Switch 
              checked={privacy?.showExperience ?? true} 
              onChange={(e) => handleChange("showExperience", e.target.checked)} 
              color="primary"
            />
          </Box>
          <Box sx={{ p: 2, display: "flex", justifyContent: "space-between", alignItems: "center", "&:hover": { bgcolor: "action.hover" } }}>
            <Box>
              <Typography variant="subtitle2">Certificates</Typography>
              <Typography variant="body2" color="text.secondary">Display your achievements and licenses</Typography>
            </Box>
            <Switch 
              checked={privacy?.showCertificates ?? true} 
              onChange={(e) => handleChange("showCertificates", e.target.checked)} 
              color="primary"
            />
          </Box>
        </Stack>
      </Paper>
    </Stack>
  );
}
