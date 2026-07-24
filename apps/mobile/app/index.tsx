import { useEffect, useState } from "react";
import { Redirect } from "expo-router";
import { ActivityIndicator, View, StyleSheet } from "react-native";
import { useAuth } from "@/lib/auth-context";
import { biometricsAvailable } from "@/lib/biometrics";
import { trpc } from "@/lib/trpc-client";

function Loading() {
  return (
    <View style={styles.center}>
      <ActivityIndicator />
    </View>
  );
}

/**
 * Not a screen a user ever sees — decides where to send them based on
 * session state, the biometric lock, and whether onboarding is done, then
 * redirects. Kept as its own route (rather than logic in _layout.tsx) so
 * expo-router's <Redirect> can do the navigation declaratively.
 */
export default function Gate() {
  const { user, ready, unlocked, markUnlocked } = useAuth();
  const [checkingBiometrics, setCheckingBiometrics] = useState(true);
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    if (!ready || !user || unlocked) return;
    let cancelled = false;
    biometricsAvailable().then((available) => {
      if (cancelled) return;
      // No biometric hardware/enrollment on this device — skip the gate
      // transparently rather than stranding the user with no way to unlock.
      if (!available) markUnlocked();
      setCheckingBiometrics(false);
    });
    return () => {
      cancelled = true;
    };
  }, [ready, user, unlocked, markUnlocked]);

  useEffect(() => {
    if (!ready || !user || !unlocked) return;
    let cancelled = false;
    trpc.profile.get
      .query()
      .then(({ profile }) => {
        if (!cancelled) setOnboarded(Boolean(profile?.fullName));
      })
      .catch(() => {
        if (!cancelled) setOnboarded(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, user, unlocked]);

  if (!ready) return <Loading />;
  if (!user) return <Redirect href="/sign-in" />;
  if (!unlocked) {
    if (checkingBiometrics) return <Loading />;
    return <Redirect href="/lock" />;
  }
  if (onboarded === null) return <Loading />;
  return <Redirect href={onboarded ? "/(tabs)/feed" : "/onboarding"} />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
