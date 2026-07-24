import { Stack } from "expo-router";

export default function ChatsStackLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: "Chats" }} />
    </Stack>
  );
}
