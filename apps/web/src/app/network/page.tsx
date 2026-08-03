"use client";

import { useEffect, useState } from "react";
import { 
  Box, Typography, Tabs, Tab, Card, CardContent, Button, Avatar, 
  Grid, 
  Chip,
  Badge,
  CircularProgress
} from "@mui/material";
import { trpc, withAuthRetry } from "@/lib/trpc-client";
import { AppShell } from "@/components/app-shell";

export default function NetworkPage() {
  const [tabIndex, setTabIndex] = useState(0);

  const [pendingReceived, setPendingReceived] = useState<any[]>([]);
  const [pendingSent, setPendingSent] = useState<any[]>([]);
  const [acceptedConnections, setAcceptedConnections] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchConnections = async () => {
    try {
      const [rec, sent, acc, sug] = await Promise.all([
        withAuthRetry(() => trpc.connections.list.query({ status: "pending", direction: "received" })),
        withAuthRetry(() => trpc.connections.list.query({ status: "pending", direction: "sent" })),
        withAuthRetry(() => trpc.connections.list.query({ status: "accepted" })),
        withAuthRetry(() => trpc.discover.suggest.query()),
      ]);
      setPendingReceived(rec);
      setPendingSent(sent);
      setAcceptedConnections(acc);
      setSuggestions(sug);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConnections();
  }, []);

  const respondToConnection = async (connectionId: string, action: "accept" | "reject") => {
    setActionLoading(connectionId);
    try {
      await withAuthRetry(() => trpc.connections.respond.mutate({ connectionId, action }));
      await fetchConnections();
    } finally {
      setActionLoading(null);
    }
  };

  const withdrawConnection = async (connectionId: string) => {
    setActionLoading(connectionId);
    try {
      await withAuthRetry(() => trpc.connections.withdraw.mutate({ connectionId }));
      await fetchConnections();
    } finally {
      setActionLoading(null);
    }
  };

  const sendConnection = async (addresseeId: string) => {
    setActionLoading(addresseeId);
    try {
      await withAuthRetry(() => trpc.connections.send.mutate({ addresseeId }));
      await fetchConnections();
    } finally {
      setActionLoading(null);
    }
  };

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabIndex(newValue);
  };

  return (
    <AppShell active="network">
      <Box sx={{ maxWidth: 800, mx: "auto", py: 4 }}>
        <Typography variant="h4" sx={{ fontWeight: "bold", mb: 4 }}>My Network</Typography>

        <Tabs value={tabIndex} onChange={handleTabChange} sx={{ borderBottom: 1, borderColor: "divider", mb: 4 }}>
          <Tab label={
            <Badge badgeContent={pendingReceived?.length || 0} color="error" sx={{ '& .MuiBadge-badge': { right: -15, top: 0 } }}>
              Pending Invites
            </Badge>
          } />
          <Tab label="Sent" />
          <Tab label="Connections" />
        </Tabs>

        {tabIndex === 0 && (
          <Box>
            {pendingReceived?.length === 0 ? (
              <Typography color="text.secondary">No pending invites.</Typography>
            ) : (
              <Grid container spacing={2}>
                {pendingReceived?.map(conn => (
                  <Grid size={{ xs: 12, sm: 6 }} key={conn.id}>
                    <Card variant="outlined">
                      <CardContent>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
                          <Avatar src={conn.otherUser.avatarUrl || ""} />
                          <Box>
                            <Typography sx={{ fontWeight: "bold" }}>{conn.otherUser.fullName}</Typography>
                            <Typography variant="body2" color="text.secondary">{conn.otherUser.title}</Typography>
                          </Box>
                        </Box>
                        {conn.note && (
                          <Typography variant="body2" sx={{ mb: 2, fontStyle: "italic", bgcolor: "action.hover", p: 1, borderRadius: 1 }}>
                            "{conn.note}"
                          </Typography>
                        )}
                        <Box sx={{ display: "flex", gap: 1 }}>
                          <Button 
                            variant="outlined" 
                            color="error"
                            size="small"
                            fullWidth
                            disabled={actionLoading === conn.id}
                            onClick={() => respondToConnection(conn.id, "reject")}
                          >
                            Ignore
                          </Button>
                          <Button 
                            variant="contained"
                            size="small"
                            fullWidth
                            disabled={actionLoading === conn.id}
                            onClick={() => respondToConnection(conn.id, "accept")}
                          >
                            Accept
                          </Button>
                        </Box>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            )}
          </Box>
        )}

        {tabIndex === 1 && (
          <Box>
            {pendingSent?.length === 0 ? (
              <Typography color="text.secondary">No sent invites.</Typography>
            ) : (
              <Grid container spacing={2}>
                {pendingSent?.map(conn => (
                  <Grid size={{ xs: 12, sm: 6 }} key={conn.id}>
                    <Card variant="outlined">
                      <CardContent>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
                          <Avatar src={conn.otherUser.avatarUrl || ""} />
                          <Box>
                            <Typography sx={{ fontWeight: "bold" }}>{conn.otherUser.fullName}</Typography>
                            <Typography variant="body2" color="text.secondary">{conn.otherUser.title}</Typography>
                          </Box>
                        </Box>
                        <Button 
                          variant="outlined"
                          color="error"
                          disabled={actionLoading === conn.id}
                          onClick={() => withdrawConnection(conn.id)}
                        >
                          Withdraw
                        </Button>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            )}
          </Box>
        )}

        {tabIndex === 2 && (
          <Box>
            {acceptedConnections?.length === 0 ? (
              <Typography color="text.secondary">No connections yet.</Typography>
            ) : (
              <Grid container spacing={2}>
                {acceptedConnections?.map(conn => (
                  <Grid size={{ xs: 12, sm: 6 }} key={conn.id}>
                    <Card variant="outlined">
                      <CardContent sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                        <Avatar src={conn.otherUser.avatarUrl || ""} />
                        <Box sx={{ flex: 1 }}>
                          <Typography sx={{ fontWeight: "bold" }}>{conn.otherUser.fullName}</Typography>
                          <Typography variant="body2" color="text.secondary">{conn.otherUser.title}</Typography>
                        </Box>
                        <Button variant="outlined" size="small" href={`/chats?userId=${conn.otherUser.id}`}>
                          Message
                        </Button>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            )}
          </Box>
        )}

        {/* People You May Know */}
        <Box sx={{ mt: 8 }}>
          <Typography variant="h5" sx={{ fontWeight: "bold", mb: 3 }}>People You May Know</Typography>
          {!suggestions ? (
            <CircularProgress />
          ) : suggestions.length === 0 ? (
            <Typography color="text.secondary">No suggestions right now.</Typography>
          ) : (
            <Grid container spacing={2}>
              {suggestions.map(person => (
                <Grid size={{ xs: 12, sm: 4 }} key={person.userId}>
                  <Card variant="outlined" sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
                    <CardContent sx={{ flex: 1, textAlign: "center" }}>
                      <Avatar src="" sx={{ width: 64, height: 64, mx: "auto", mb: 2 }} />
                      <Typography sx={{ fontWeight: "bold" }}>{person.fullName}</Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        {person.title || "Member"}
                      </Typography>
                      {person.mutualCount > 0 && (
                        <Chip size="small" label={`${person.mutualCount} mutual connections`} sx={{ mb: 1 }} />
                      )}
                      {person.sharedCollege && (
                        <Chip size="small" label="Shared College" color="primary" variant="outlined" sx={{ mb: 1 }} />
                      )}
                    </CardContent>
                    <Box sx={{ p: 2, pt: 0 }}>
                      <Button 
                        variant="outlined" 
                        fullWidth 
                        sx={{ mt: 2 }}
                        disabled={actionLoading === person.userId || person.connectionStatus === "pending"}
                        onClick={() => sendConnection(person.userId)}
                      >
                        {person.connectionStatus === "pending" ? "Pending" : "Connect"}
                      </Button>
                    </Box>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}
        </Box>
      </Box>
    </AppShell>
  );
}
