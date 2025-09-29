import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  Modal,
  TextInput,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { API_BASE_URL } from "../../constants/api";
import { useAuth } from "../../context/AuthContext";

export default function FridgeListScreen() {
  const router = useRouter();
  const { token, activeFridge, setActiveFridge } = useAuth();
  const [fridges, setFridges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [listError, setListError] = useState(null);
  const [addVisible, setAddVisible] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState(null);

  const authHeaders = useMemo(
    () => ({
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }),
    [token]
  );

  const loadFridges = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    setListError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/fridges`, {
        method: "GET",
        headers: authHeaders,
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        const message = payload?.message || `HTTP ${res.status}`;
        throw new Error(message);
      }
      setFridges(Array.isArray(payload) ? payload : []);
    } catch (err) {
      setListError(err.message || "Nie udało się pobrać lodówek");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    loadFridges();
  }, [loadFridges]);

  const openAddModal = () => {
    setNewName("");
    setModalError(null);
    setAddVisible(true);
  };

  const closeAddModal = () => {
    if (!saving) setAddVisible(false);
  };

  const handleAddFridge = async () => {
    if (!newName.trim()) {
      setModalError("Podaj nazwę lodówki");
      return;
    }
    setSaving(true);
    setModalError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/fridges`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ name: newName.trim() }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        const message = payload?.message || `HTTP ${res.status}`;
        throw new Error(message);
      }

      if (payload && payload.id) {
        setFridges((prev) => [payload, ...prev]);
        setActiveFridge(String(payload.id));
      } else {
        await loadFridges();
      }
      setAddVisible(false);
    } catch (err) {
      setModalError(err.message || "Nie udało się dodać lodówki");
    } finally {
      setSaving(false);
    }
  };

  return (
    <LinearGradient
      colors={["#FFF8E6", "#FFE19A", "#FFF3C9"]}
      locations={[0, 0.55, 1]}
      style={styles.background}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backLabel}>←</Text>
          </Pressable>
          <Text style={styles.title}>Twoje lodówki</Text>
        </View>
        {listError && !loading ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{listError}</Text>
            <Pressable onPress={() => loadFridges()}>
              <Text style={styles.errorBannerAction}>Spróbuj ponownie</Text>
            </Pressable>
          </View>
        ) : null}

        {loading ? (
          <View style={styles.loaderBox}>
            <ActivityIndicator size="large" color="#1F6FEB" />
          </View>
        ) : (
          <FlatList
            data={fridges}
            keyExtractor={(item, index) => String(item?.id ?? index)}
            contentContainerStyle={styles.listContent}
            ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
            ListEmptyComponent={() => (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyTitle}>Brak lodówek</Text>
                <Text style={styles.emptySubtitle}>Dodaj pierwszą lodówkę, aby zacząć.</Text>
              </View>
            )}
            refreshing={refreshing}
            onRefresh={() => loadFridges(true)}
            renderItem={({ item }) => {
              const isActive = activeFridge && String(item?.id) === String(activeFridge);
              return (
                <Pressable
                  onPress={() => setActiveFridge(item?.id)}
                  style={({ pressed }) => [
                    styles.card,
                    isActive && styles.cardActive,
                    pressed && styles.cardPressed,
                  ]}
                >
                  <View style={styles.cardHeaderRow}>
                    <Text style={[styles.itemName, isActive && styles.itemNameActive]}>
                      {item?.name ?? "(bez nazwy)"}
                    </Text>
                    {isActive ? <Text style={styles.activeBadge}>Aktywna</Text> : null}
                  </View>
                  <Text style={styles.itemRole}>
                    Rola: {item?.roleOfCurrentUser ?? "nieznana"}
                  </Text>
                </Pressable>
              );
            }
            }
          />
        )}

        <Pressable style={styles.addButton} onPress={openAddModal}>
          <Text style={styles.addButtonText}>Dodaj nową lodówkę</Text>
        </Pressable>
      </View>

      <Modal
        visible={addVisible}
        transparent
        animationType="fade"
        onRequestClose={closeAddModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Nowa lodówka</Text>
            <TextInput
              placeholder="Nazwa"
              value={newName}
              onChangeText={setNewName}
              style={styles.modalInput}
            />
            {modalError && <Text style={styles.errorText}>{modalError}</Text>}
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalBtn, styles.modalCancel]}
                onPress={closeAddModal}
                disabled={saving}
              >
                <Text style={styles.modalCancelText}>Anuluj</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, styles.modalConfirm, saving && styles.modalDisabled]}
                onPress={handleAddFridge}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalConfirmText}>Dodaj</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  container: { flex: 1, paddingTop: 52, paddingHorizontal: 20 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
    gap: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.7)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  backLabel: { fontSize: 20, color: "#4A3B1B" },
  title: { fontSize: 24, fontWeight: "700", color: "#4A3B1B" },
  listContent: { paddingBottom: 120, paddingTop: 4 },
  loaderBox: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorBanner: {
    backgroundColor: "rgba(214,69,80,0.12)",
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  errorBannerText: { color: "#B71C1C", fontWeight: "600", marginBottom: 6 },
  errorBannerAction: { color: "#1F6FEB", fontWeight: "700" },
  emptyBox: {
    alignItems: "center",
    paddingVertical: 60,
    gap: 8,
  },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: "#3F3116" },
  emptySubtitle: { fontSize: 13, color: "#6F5833" },
  card: {
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    borderRadius: 16,
    padding: 18,
    shadowColor: "#000",
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
  },
  cardPressed: { transform: [{ scale: 0.99 }] },
  cardActive: {
    borderWidth: 2,
    borderColor: "rgba(76, 175, 80, 0.4)",
    backgroundColor: "rgba(76, 175, 80, 0.08)",
  },
  cardHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  itemName: { fontSize: 16, fontWeight: "700", color: "#3F3116" },
  itemNameActive: { color: "#2F6F34" },
  itemRole: { fontSize: 13, color: "#6F5833" },
  activeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: "rgba(76, 175, 80, 0.15)",
    color: "#2F6F34",
    fontSize: 12,
    fontWeight: "700",
  },
  addButton: {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: 32,
    backgroundColor: "#1F6FEB",
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  addButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 24,
    gap: 16,
  },
  modalTitle: { fontSize: 20, fontWeight: "700", color: "#2F281F" },
  modalInput: {
    borderWidth: 1,
    borderColor: "rgba(255,190,120,0.5)",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
  },
  modalActions: { flexDirection: "row", gap: 12 },
  modalBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  modalCancel: { backgroundColor: "#EFEFF5" },
  modalConfirm: { backgroundColor: "#1F6FEB" },
  modalDisabled: { opacity: 0.7 },
  modalCancelText: { color: "#111", fontWeight: "600" },
  modalConfirmText: { color: "#fff", fontWeight: "700" },
  errorText: { color: "#D64550", fontSize: 13 },
});
