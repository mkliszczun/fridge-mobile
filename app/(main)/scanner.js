import { useEffect, useState, useRef } from "react";
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
  const [frozen, setFrozen] = useState(false);
  const pendingRef = useRef(null);
  const { token } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!permission) return;
    if (!permission.granted) requestPermission();
  }, [permission, requestPermission]);

  const onBarcodeScanned = ({ data, type }) => {
    if (!ready || processing || frozen) return;

    const allowed = ["ean13", "ean8", "org.gs1.EAN-13", "org.gs1.EAN-8"];
    if (!allowed.includes(type)) {
      Alert.alert("Nieobsługiwany kod", type);
      return;
    }

    if (pendingRef.current === data) return;
    pendingRef.current = data;
    lookupProduct(data);
  };

  const fetchOffProduct = async (ean) => {
    const res = await fetch(`${API_BASE_URL}/api/off/${encodeURIComponent(ean)}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok || !payload?.product) {
      Alert.alert("Nieznany produkt", `Kod ${ean} jest nieznany. Dodaj go ręcznie.`);
      router.push({
        pathname: "/add-product",
        params: {
          prefillName: "",
          prefillEan: ean,
        },
      });
      return;
    }

    const product = payload.product;
    const productName =
      (typeof product?.productName === "string" && product.productName.trim()) ||
      (typeof product?.product_name === "string" && product.product_name.trim()) ||
      (typeof product?.name === "string" && product.name.trim()) ||
      "";
    router.push({
      pathname: "/add-product",
      params: {
        prefillName: productName,
        prefillEan: ean,
        prefillBrand: product?.brands || "",
        prefillCategories: product?.categoriesTags ? JSON.stringify(product.categoriesTags) : "",
      },
    });
  };

  useEffect(() => {
    return () => {
      setProcessing(false);
      setFrozen(false);
      setLastCode(null);
      pendingRef.current = null;
    };
  }, []);

  const handleCameraReady = () => setReady(true);

  const handleCameraMountError = ({ message }) => {
    setReady(false);
    Alert.alert(
      "Nie udało się uruchomić aparatu",
      message || "Zamknij skaner i spróbuj ponownie."
    );
  };

  const lookupProduct = async (ean) => {
    setProcessing(true);
    setFrozen(true);
    setLastCode(ean);
    let success = false;
    try {
      const res = await fetch(`${API_BASE_URL}/api/products/${encodeURIComponent(ean)}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (res.status === 404) {
        await fetchOffProduct(ean);
        success = true;
        return;
      }
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
          productData: JSON.stringify(payload),
        },
      });
      success = true;
    } catch (err) {
      Alert.alert("Brak produktu", `${String(err)}\nEAN: ${ean}`);
    } finally {
      setProcessing(false);
      setTimeout(() => {
        setFrozen(false);
        setLastCode(null);
        pendingRef.current = null;
      }, success ? 1000 : 600);
    }
  };

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

  return (
    <View style={styles.scannerWrap}>
      <CameraView
        style={styles.camera}
        facing="back"
        zoom={0}
        autofocus="on"
        onBarcodeScanned={onBarcodeScanned}
        barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8"] }}
        onCameraReady={handleCameraReady}
        onMountError={handleCameraMountError}
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
  camera:{ flex:1 },
  overlay:{ position:"absolute", bottom:28, left:20, right:20, alignItems:"center", gap:10 },
  hint:{ paddingHorizontal:12, paddingVertical:8, color:"#fff", backgroundColor:"rgba(0,0,0,0.5)", borderRadius:10, fontSize:14 },
  secondaryBtn:{ backgroundColor:"#fff", paddingHorizontal:16, paddingVertical:12, borderRadius:12 },
  secondaryBtnText:{ color:"#111", fontWeight:"700" },
  processingBadge:{ flexDirection:"row", alignItems:"center", gap:8, paddingHorizontal:14, paddingVertical:8, backgroundColor:"rgba(0,0,0,0.55)", borderRadius:12 },
  processingText:{ color:"#fff", fontWeight:"600" },
});
