import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  ActivityIndicator,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { API_BASE_URL } from "../../constants/api";
import { useAuth } from "../../context/AuthContext";

export default function ScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [ready, setReady] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [lastCode, setLastCode] = useState(null);
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
    if (!ready || processing) return;

    const allowed = ["ean13", "ean8", "org.gs1.EAN-13", "org.gs1.EAN-8"];
    if (!allowed.includes(type)) {
      Alert.alert("Nieobsługiwany kod", type);
      return;
    }

    lookupProduct(data);
  };

  const lookupProduct = async (ean) => {
    setProcessing(true);
    setLastCode(ean);
    try {
      const res = await fetch(`${API_BASE_URL}/api/products?ean=${encodeURIComponent(ean)}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload) {
        const message = payload?.message || `Kod ${ean} nie został znaleziony.`;
        throw new Error(message);
      }

      router.push({
        pathname: "/add-fridge-item",
        params: {
          productId: String(payload.id ?? ""),
          productName: payload.name || "",
          productType: typeof payload.productType === "string" ? payload.productType : "",
          defaultUnit: payload.defaultUnit ? JSON.stringify(payload.defaultUnit) : "",
          brand: payload.brand || "",
          ean,
        },
      });
    } catch (err) {
      Alert.alert("Brak produktu", `${String(err)}\nEAN: ${ean}`);
    } finally {
      setProcessing(false);
      setTimeout(() => setLastCode(null), 400);
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
        {processing && (
          <View style={styles.processingBadge}>
            <ActivityIndicator size="small" color="#fff" />
            <Text style={styles.processingText}>Sprawdzam...</Text>
          </View>
        )}
        {lastCode && !processing && (
          <View style={styles.processingBadge}>
            <Text style={styles.processingText}>Ostatni kod: {lastCode}</Text>
          </View>
        )}
      </View>
      <StatusBar style="light" />
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
  processingBadge:{ flexDirection:"row", alignItems:"center", gap:8, paddingHorizontal:14, paddingVertical:8, backgroundColor:"rgba(0,0,0,0.55)", borderRadius:12 },
  processingText:{ color:"#fff", fontWeight:"600" },
});
