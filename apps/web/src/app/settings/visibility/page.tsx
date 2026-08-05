"use client";

import { useState, useEffect } from "react";
import { trpc, withAuthRetry } from "@/lib/trpc-client";
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
  const [privacy, setPrivacy] = useState<any>(null);

  useEffect(() => {
    withAuthRetry(() => (trpc as any).profiles.get.query())
      .then((data: any) => {
        if (data.privacy) {
          setPrivacy(data.privacy);
        } else {
          // Default fallbacks if no row exists yet
          setPrivacy({
            profileVisibility: "public",
            showEmail: false,
            showEducation: true,
            showExperience: true,
            showCertificates: true,
          });
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleChange = async (key: string, value: any) => {
    if (!privacy) return;
    
    const updated = { ...privacy, [key]: value };
    setPrivacy(updated);
    setSaving(true);
    
    try {
      await withAuthRetry(() => (trpc as any).profiles.updatePrivacy.mutate(updated));
    } catch (e) {
      console.error("Failed to update privacy settings", e);
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
            <Typography variant="h6" fontWeight="bold">Profile viewing options</Typography>
            <Typography variant="body2" color="text.secondary">Choose whether you're visible or viewing in private mode.</Typography>
          </Box>
          {saving && <CircularProgress size={20} />}
        </Box>
        
        <Box sx={{ p: 3 }}>
          <Select
            size="small"
            value={privacy?.profileVisibility || "public"}
            onChange={(e) => handleChange("profileVisibility", e.target.value)}
            sx={{ minWidth: 200 }}
          >
            <MenuItem value="public">Public (Everyone)</MenuItem>
            <MenuItem value="connections">Connections only</MenuItem>
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
            <Typography variant="h6" fontWeight="bold">Visibility of your profile & network</Typography>
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
