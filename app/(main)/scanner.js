import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  Modal,
  ActivityIndicator,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { API_BASE_URL } from "../../constants/api";
import { useAuth } from "../../context/AuthContext";
const API_URL = `${API_BASE_URL}/integration/connect`;

export default function ScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [ready, setReady] = useState(false);
  const [scanned, setScanned] = useState(null);
  const [sending, setSending] = useState(false);
  const { token } = useAuth();
  const router = useRouter();

  useEffect(() => { if (!permission) requestPermission(); }, [permission]);

  if (!permission) return null;
  if (!permission.granted)
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Potrzebny dostęp do aparatu</Text>
        <Pressable style={styles.primaryBtn} onPress={requestPermission}>
          <Text style={styles.primaryBtnText}>Zezwól</Text>
        </Pressable>
      </View>
    );

  const onBarcodeScanned = ({ data, type }) => {
    if (!ready || scanned) return;

    const allowed = ["ean13", "ean8", "org.gs1.EAN-13", "org.gs1.EAN-8"];
    if (!allowed.includes(type)) {
      Alert.alert("Nieobsługiwany kod", type);
      return;
    }

    setScanned({ data, type });
  };

  const handleCancel = () => {
    setScanned(null);
  };

  const handleSend = async () => {
    if (!scanned) return;
    setSending(true);
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ ean: scanned.data }),
      });
      let payload = null;
      try { payload = await res.json(); } catch {}
      if (!res.ok) {
        const message = payload?.message || `HTTP ${res.status}`;
        throw new Error(message);
      }

      const code = scanned.data;
      const message = payload?.message ? String(payload.message) : "OK";
      setScanned(null);
      Alert.alert("Wysłano do API", `EAN: ${code}\n${message}`, [
        { text: "OK" },
      ]);
    } catch (err) {
      Alert.alert("Błąd wysyłki", String(err), [
        { text: "OK" },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.scannerWrap}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        onBarcodeScanned={onBarcodeScanned}
        barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8"] }}
        onCameraReady={() => setReady(true)}
      />
      <View style={styles.overlay}>
        <Text style={styles.hint}>Nakieruj na kod EAN</Text>
        <Pressable style={styles.secondaryBtn} onPress={() => router.back()}>
          <Text style={styles.secondaryBtnText}>Anuluj</Text>
        </Pressable>
      </View>
      <StatusBar style="light" />

      <Modal
        visible={!!scanned}
        transparent
        animationType="fade"
        onRequestClose={handleCancel}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Zeskanowano kod</Text>
            <View style={styles.modalBody}>
              <Text style={styles.modalCode}>{scanned?.data}</Text>
              <Text style={styles.modalSubtitle}>Typ: {scanned?.type}</Text>
            </View>
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancelBtn} onPress={handleCancel} disabled={sending}>
                <Text style={styles.modalCancelText}>Anuluj</Text>
              </Pressable>
              <Pressable
                style={[styles.modalSendBtn, sending && styles.modalSendBtnDisabled]}
                onPress={handleSend}
                disabled={sending}
              >
                {sending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalSendText}>Wyślij do API</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  center:{ flex:1, alignItems:"center", justifyContent:"center", backgroundColor:"#F7F7FB" },
  title:{ fontSize:18, fontWeight:"600" },
  primaryBtn:{ backgroundColor:"#1F6FEB", paddingHorizontal:16, paddingVertical:12, borderRadius:12, marginTop:12 },
  primaryBtnText:{ color:"#fff", fontWeight:"700" },

  scannerWrap:{ flex:1, backgroundColor:"black" },
  overlay:{ position:"absolute", bottom:28, left:20, right:20, alignItems:"center", gap:10 },
  hint:{ paddingHorizontal:12, paddingVertical:8, color:"#fff", backgroundColor:"rgba(0,0,0,0.5)", borderRadius:10, fontSize:14 },
  secondaryBtn:{ backgroundColor:"#fff", paddingHorizontal:16, paddingVertical:12, borderRadius:12 },
  secondaryBtnText:{ color:"#111", fontWeight:"700" },

  modalOverlay:{ flex:1, backgroundColor:"rgba(0,0,0,0.65)", alignItems:"center", justifyContent:"center", padding:24 },
  modalCard:{ width:"100%", backgroundColor:"#fff", borderRadius:18, padding:24, gap:18 },
  modalTitle:{ fontSize:18, fontWeight:"700", color:"#111" },
  modalBody:{ alignItems:"center", gap:6 },
  modalCode:{ fontSize:28, fontWeight:"700", letterSpacing:1.2, color:"#1F6FEB" },
  modalSubtitle:{ fontSize:13, color:"#555" },
  modalActions:{ flexDirection:"row", gap:12 },
  modalCancelBtn:{ flex:1, backgroundColor:"#EFEFF5", borderRadius:12, paddingVertical:14, alignItems:"center" },
  modalCancelText:{ color:"#111", fontWeight:"600" },
  modalSendBtn:{ flex:1, backgroundColor:"#1F6FEB", borderRadius:12, paddingVertical:14, alignItems:"center" },
  modalSendBtnDisabled:{ backgroundColor:"#8EB6FF" },
  modalSendText:{ color:"#fff", fontWeight:"700" },
});
