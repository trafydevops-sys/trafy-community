"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { trpc, withAuthRetry } from "@/lib/trpc-client";
import {
  Box,
  Typography,
  Card,
  CardContent,
  Avatar,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Drawer,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  CircularProgress,
  Checkbox,
  IconButton,
  Divider,
} from "@mui/material";
import HistoryIcon from "@mui/icons-material/History";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import DownloadIcon from "@mui/icons-material/Download";
import EditIcon from "@mui/icons-material/Edit";
import SendIcon from "@mui/icons-material/Send";
import EventIcon from "@mui/icons-material/Event";
import LabelIcon from "@mui/icons-material/Label";
import BlockIcon from "@mui/icons-material/Block";
import { io, Socket } from "socket.io-client";
import {
  APPLICATION_PIPELINE_ORDER,
  type ApplicationStatus,
  type Application,
} from "@trafy-community/core";

export default function PipelinePage() {
  const { jobId } = useParams() as { jobId: string };

  const [socket, setSocket] = useState<Socket | null>(null);
  
  // Queries
  const [applications, setApplications] = useState<Application[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  async function refetch() {
    try {
      const data = await withAuthRetry(() => trpc.applications.listForJob.query({ jobId }));
      setApplications(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    refetch();
  }, [jobId]);

  useEffect(() => {
    const token = localStorage.getItem("token") || ""; 
    
    const newSocket = io(process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001", {
      path: "/socket.io",
      auth: { token },
    });
    setSocket(newSocket);
    
    newSocket.on("connect", () => {
      newSocket.emit("pipeline:join", jobId);
    });
    
    newSocket.on("pipeline:update", () => {
      refetch();
    });

    return () => {
      newSocket.emit("pipeline:leave", jobId);
      newSocket.disconnect();
    };
  }, [jobId]);

  // State
  const [draggedAppId, setDraggedAppId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [rejectionModalOpen, setRejectionModalOpen] = useState(false);
  const [pendingRejectionAppId, setPendingRejectionAppId] = useState<string | null>(null);
  const [pendingRejectionAppIds, setPendingRejectionAppIds] = useState<string[] | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  
  const [auditLogDrawerOpen, setAuditLogDrawerOpen] = useState(false);
  const [auditLogAppId, setAuditLogAppId] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  const STAGES: ApplicationStatus[] = [...APPLICATION_PIPELINE_ORDER, "rejected"];

  const handleDragStart = (e: React.DragEvent, appId: string) => {
    e.dataTransfer.setData("text/plain", appId);
    setDraggedAppId(appId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent, targetStatus: ApplicationStatus) => {
    e.preventDefault();
    const appId = e.dataTransfer.getData("text/plain");
    setDraggedAppId(null);
    if (!appId) return;

    const app = applications.find(a => a.id === appId);
    if (!app || app.status === targetStatus) return;

    if (targetStatus === "rejected") {
      setPendingRejectionAppId(appId);
      setRejectionReason("");
      setRejectionModalOpen(true);
      return;
    }

    const previousApps = [...applications];
    setApplications(prev => prev.map(a => a.id === appId ? { ...a, status: targetStatus } : a));
    
    try {
      await withAuthRetry(() => trpc.applications.updateStatus.mutate({ applicationId: appId, status: targetStatus }));
      refetch();
    } catch (err) {
      setApplications(previousApps);
      alert("Failed to update candidate status.");
    }
  };

  const handleRejectSubmit = async () => {
    if (!rejectionReason.trim()) {
      alert("A rejection reason is required.");
      return;
    }

    const previousApps = [...applications];

    if (pendingRejectionAppId) {
      setApplications(prev => prev.map(a => a.id === pendingRejectionAppId ? { ...a, status: "rejected" } : a));
      try {
        await withAuthRetry(() => trpc.applications.updateStatus.mutate({ applicationId: pendingRejectionAppId, status: "rejected", rejectionReason }));
      } catch {
        setApplications(previousApps);
        alert("Failed to update candidate status.");
      }
    } else if (pendingRejectionAppIds) {
      setApplications(prev => prev.map(a => pendingRejectionAppIds.includes(a.id) ? { ...a, status: "rejected" } : a));
      try {
        await withAuthRetry(() => trpc.applications.bulkUpdateStatus.mutate({ applicationIds: pendingRejectionAppIds, status: "rejected", rejectionReason }));
        setSelectedIds(new Set());
      } catch {
        setApplications(previousApps);
        alert("Failed to bulk update candidates.");
      }
    }

    refetch();
    setRejectionModalOpen(false);
    setPendingRejectionAppId(null);
    setPendingRejectionAppIds(null);
    setRejectionReason("");
  };

  const handleBulkMove = async (targetStatus: ApplicationStatus) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    if (targetStatus === "rejected") {
      setPendingRejectionAppIds(ids);
      setRejectionReason("");
      setRejectionModalOpen(true);
      return;
    }

    const previousApps = [...applications];
    setApplications(prev => prev.map(a => ids.includes(a.id) ? { ...a, status: targetStatus } : a));
    
    try {
      await withAuthRetry(() => trpc.applications.bulkUpdateStatus.mutate({ applicationIds: ids, status: targetStatus }));
      setSelectedIds(new Set());
      refetch();
    } catch {
      setApplications(previousApps);
      alert("Failed to bulk update candidates.");
    }
  };

  const handleExportCsv = async () => {
    try {
      const data = await withAuthRetry(() => trpc.applications.exportPipeline.query({ jobId }));
      if (!data || data.length === 0 || !data[0]) return;

      const headers = Object.keys(data[0] as any).join(",");
      const body = data.map((r: any) => Object.values(r).map((v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(",")).join("\n");
      const blob = new Blob([headers + "\n" + body], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pipeline_export_${jobId}.csv`;
      a.click();
    } catch (err) {
      alert("Export failed");
    }
  };

  const handleViewAuditLog = async (appId: string) => {
    setAuditLogAppId(appId);
    setAuditLogDrawerOpen(true);
    setAuditLogs([]);
    try {
      const logs = await withAuthRetry(() => trpc.applications.auditLog.query({ applicationId: appId }));
      setAuditLogs(logs);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSelect = (appId: string) => {
    const next = new Set(selectedIds);
    if (next.has(appId)) next.delete(appId);
    else next.add(appId);
    setSelectedIds(next);
  };

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, height: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Header and Controls */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 'bold' }}>Pipeline</Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          {selectedIds.size > 0 && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2">{selectedIds.size} selected</Typography>
              <Button size="small" variant="outlined" onClick={() => handleBulkMove("assessment")}>
                Send to Assessment
              </Button>
              <Button size="small" variant="outlined" color="error" onClick={() => handleBulkMove("rejected")}>
                Reject Selected
              </Button>
            </Box>
          )}
          <Button startIcon={<DownloadIcon />} variant="outlined" onClick={handleExportCsv}>
            Export CSV
          </Button>
        </Box>
      </Box>

      {/* Kanban Board */}
      <Box sx={{ display: 'flex', gap: 2, flex: 1, overflowX: "auto", pb: 2 }}>
        {STAGES.map(stage => {
          const columnApps = applications.filter(a => a.status === stage);
          return (
            <Box
              key={stage}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, stage)}
              sx={{
                width: 300,
                flexShrink: 0,
                backgroundColor: "background.default",
                borderRadius: 2,
                p: 2,
                border: '1px solid',
                borderColor: 'divider',
              }}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 'bold', textTransform: 'capitalize' }}>
                  {stage}
                </Typography>
                <Chip size="small" label={columnApps.length} />
              </Box>
              
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {columnApps.map(app => (
                  <Card
                    key={app.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, app.id)}
                    sx={{
                      cursor: 'grab',
                      opacity: draggedAppId === app.id ? 0.5 : 1,
                      '&:hover': { boxShadow: 2 },
                      position: "relative"
                    }}
                  >
                    <CardContent sx={{ p: 1.5, pb: "12px !important" }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <DragIndicatorIcon color="disabled" fontSize="small" />
                          <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>{app.id.substring(0, 8)}</Typography>
                        </Box>
                        <Checkbox 
                          size="small" 
                          checked={selectedIds.has(app.id)}
                          onChange={() => handleSelect(app.id)}
                          sx={{ p: 0 }}
                        />
                      </Box>
                      
                      <Box sx={{ mt: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="caption" color="text.secondary">
                          Applied: {new Date(app.createdAt).toLocaleDateString()}
                        </Typography>
                        <IconButton size="small" onClick={() => handleViewAuditLog(app.id)}>
                          <HistoryIcon fontSize="small" />
                        </IconButton>
                      </Box>

                      {app.rejectionReason && (
                        <Typography variant="caption" color="error" sx={{ display: 'block', mt: 1 }}>
                          Reason: {app.rejectionReason}
                        </Typography>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </Box>
            </Box>
          );
        })}
      </Box>

      {/* Rejection Modal */}
      <Dialog open={rejectionModalOpen} onClose={() => setRejectionModalOpen(false)}>
        <DialogTitle>Reject Candidate(s)</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 2 }}>Please provide a reason for rejection. This is required for auditing.</Typography>
          <TextField
            autoFocus
            margin="dense"
            label="Rejection Reason"
            fullWidth
            multiline
            rows={3}
            variant="outlined"
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRejectionModalOpen(false)}>Cancel</Button>
          <Button onClick={handleRejectSubmit} color="error" variant="contained">
            Confirm Rejection
          </Button>
        </DialogActions>
      </Dialog>

      {/* Audit Log Drawer */}
      <Drawer
        anchor="right"
        open={auditLogDrawerOpen}
        onClose={() => setAuditLogDrawerOpen(false)}
      >
        <Box sx={{ width: 400, p: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>Activity History</Typography>
          <Divider sx={{ mb: 2 }} />
          
          <List>
            {auditLogs?.map((log: any) => {
              let Icon = HistoryIcon;
              if (log.action === "status_change") Icon = EditIcon;
              if (log.action === "assessment_sent") Icon = SendIcon;
              if (log.action === "interview_scheduled") Icon = EventIcon;
              if (log.action === "tag_added") Icon = LabelIcon;
              if (log.action === "rejected") Icon = BlockIcon;

              return (
                <ListItem key={log.id} alignItems="flex-start">
                  <ListItemIcon>
                    <Icon color="action" />
                  </ListItemIcon>
                  <ListItemText
                    primary={log.details}
                    secondary={
                      <Box component="span" sx={{ display: 'flex', flexDirection: 'column' }}>
                        <Typography component="span" variant="caption" color="text.secondary">
                          {new Date(log.createdAt).toLocaleString()}
                        </Typography>
                        <Typography component="span" variant="caption" color="text.secondary">
                          By: {log.actorId.substring(0,8)}
                        </Typography>
                      </Box>
                    }
                  />
                </ListItem>
              );
            })}
            
            {(!auditLogs || auditLogs.length === 0) && (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mt: 4 }}>
                No activity history found.
              </Typography>
            )}
          </List>
        </Box>
      </Drawer>
    </Box>
  );
}
