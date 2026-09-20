import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { View, ActivityIndicator } from "react-native";
import { AuthProvider, useAuth } from "../context/AuthContext";

function RootNavigator() {
  const { sessionId, verification, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === "(auth)";

    if (!sessionId && verification && segments[1] !== "verify-email") {
      router.replace("/verify-email");
    } else if (!sessionId && !verification && (!inAuthGroup || segments[1] === "verify-email")) {
      router.replace("/login");
    } else if (sessionId && inAuthGroup) {
      router.replace("/");
    }
  }, [sessionId, verification, loading, segments, router]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color="#304B54" />
      </View>
    );
  }

  return <Stack key={sessionId || (verification ? "verification" : "guest")} screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
