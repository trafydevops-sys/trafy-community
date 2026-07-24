import { Stack } from "expo-router";

export default function AssessStackLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: "Assess" }} />
    </Stack>
  );
}
