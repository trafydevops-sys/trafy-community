import { Tabs } from "expo-router";
import { UnreadNotificationsProvider, useUnreadNotifications } from "@/lib/notifications-context";

function TabsNavigator() {
  const { unreadCount } = useUnreadNotifications();

  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="feed" options={{ title: "Feed" }} />
      <Tabs.Screen name="chats" options={{ title: "Chats" }} />
      <Tabs.Screen name="groups" options={{ title: "Groups" }} />
      <Tabs.Screen name="learn" options={{ title: "Learn" }} />
      <Tabs.Screen name="assess" options={{ title: "Assess" }} />
      <Tabs.Screen
        name="notifications"
        options={{
          title: "Alerts",
          tabBarBadge: unreadCount > 0 ? (unreadCount > 9 ? "9+" : unreadCount) : undefined,
        }}
      />
      <Tabs.Screen name="me" options={{ title: "Me" }} />
    </Tabs>
  );
}

export default function TabsLayout() {
  return (
    <UnreadNotificationsProvider>
      <TabsNavigator />
    </UnreadNotificationsProvider>
  );
}
