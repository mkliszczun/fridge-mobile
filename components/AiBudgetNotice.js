import { useCallback } from "react";
import { Pressable, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useAuth } from "../context/AuthContext";

export default function AiBudgetNotice() {
  const { aiUsage, usageError, canUseAi, refreshUsage } = useAuth();
  useFocusEffect(useCallback(() => { refreshUsage(); }, [refreshUsage]));
  const percent = aiUsage && Number(aiUsage.limitUsd) > 0
    ? Math.max(0, Math.min(100, Math.floor(Number(aiUsage.remainingUsd) / Number(aiUsage.limitUsd) * 100))) : null;
  const reset = aiUsage ? new Date(aiUsage.resetsAt).toLocaleString("pl-PL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null;
  return <View style={{ padding: 14, borderRadius: 17, backgroundColor: "rgba(238,244,242,0.86)", gap: 6, marginTop: 10 }}>
    <Text accessibilityLiveRegion="polite" style={{ color: "#304B54", fontWeight: "700", fontSize: 14 }}>
      {!canUseAi ? "Dzienny limit AI został wykorzystany" : percent !== null ? `Pozostało ${percent}% dziennego limitu AI` : "Dzienny limit AI"}
    </Text>
    <Text style={{ color: "#667579", fontSize: 13, lineHeight: 19 }}>
      {reset ? `Odnowienie: ${reset} (Twój czas lokalny).` : "Limit odnawia się codziennie o północy UTC."} Limit jest wspólny dla produktów, przepisów, posiłków i zakupów, także w Premium.
    </Text>
    {usageError && <Pressable accessibilityRole="button" onPress={refreshUsage} style={{ paddingVertical: 10 }}><Text style={{ color: "#913D34" }}>Nie udało się sprawdzić zużycia. Dotknij, aby ponowić.</Text></Pressable>}
  </View>;
}
