import { Stack } from "expo-router";

export default function LearnStackLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: "Learn" }} />
    </Stack>
  );
}
