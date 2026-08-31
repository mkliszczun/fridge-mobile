import { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  ActivityIndicator,
  Modal,
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
  const [pendingCode, setPendingCode] = useState(null);
  const [availableLenses, setAvailableLenses] = useState([]);
  const [selectedLens, setSelectedLens] = useState(null);
  const [showLensPicker, setShowLensPicker] = useState(false);
  const [lensesLoading, setLensesLoading] = useState(false);
  const pendingRef = useRef(null);
  const cameraRef = useRef(null);
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
    setPendingCode(data);
    lookupProduct(data);
  };

  const hydrateLenses = async () => {
    if (!cameraRef.current?.getAvailableLensesAsync) return;
    setLensesLoading(true);
    try {
      const lenses = await cameraRef.current.getAvailableLensesAsync();
      if (Array.isArray(lenses) && lenses.length) {
        setAvailableLenses(lenses);
        setSelectedLens((prev) => (prev && lenses.includes(prev) ? prev : lenses[0]));
      }
    } catch (err) {
      console.warn("Nie udało się pobrać listy obiektywów", err);
    } finally {
      setLensesLoading(false);
    }
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
      setPendingCode(null);
      pendingRef.current = null;
    };
  }, []);

  const handleCameraReady = async () => {
    setReady(true);
    await hydrateLenses();
  };

  const handleAvailableLensesChanged = ({ nativeEvent }) => {
    const list = nativeEvent?.lenses;
    if (!Array.isArray(list) || !list.length) return;
    setAvailableLenses(list);
    setSelectedLens((prev) => (prev && list.includes(prev) ? prev : list[0]));
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
        setPendingCode(null);
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
        ref={cameraRef}
        style={StyleSheet.absoluteFillObject}
        facing="back"
        zoom={0}
        onBarcodeScanned={onBarcodeScanned}
        barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8"] }}
        onCameraReady={handleCameraReady}
        selectedLens={selectedLens || undefined}
        onAvailableLensesChanged={handleAvailableLensesChanged}
      />
      <View style={styles.overlay}>
        <Text style={styles.hint}>Nakieruj na kod EAN</Text>
        <Pressable style={styles.secondaryBtn} onPress={() => router.back()}>
          <Text style={styles.secondaryBtnText}>Anuluj</Text>
        </Pressable>
        {availableLenses.length > 1 ? (
          <Pressable
            style={styles.lensButton}
            onPress={() => setShowLensPicker(true)}
          >
            <Text style={styles.lensButtonText}>
              {formatLensLabel(selectedLens)}
            </Text>
          </Pressable>
        ) : null}
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

      <Modal
        visible={showLensPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLensPicker(false)}
      >
        <Pressable style={styles.lensModalBackdrop} onPress={() => setShowLensPicker(false)}>
          <View style={styles.lensModalCard}>
            <Text style={styles.lensModalTitle}>Wybierz obiektyw</Text>
            {lensesLoading ? (
              <View style={styles.lensModalLoader}>
                <ActivityIndicator size="small" color="#1F6FEB" />
              </View>
            ) : (
              availableLenses.map((lens) => {
                const isActive = selectedLens === lens;
                return (
                  <Pressable
                    key={lens}
                    style={[styles.lensOption, isActive && styles.lensOptionActive]}
                    onPress={() => {
                      setSelectedLens(lens);
                      setShowLensPicker(false);
                    }}
                  >
                    <Text style={[styles.lensOptionText, isActive && styles.lensOptionTextActive]}>
                      {formatLensLabel(lens)}
                    </Text>
                  </Pressable>
                );
              })
            )}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const LENS_LABELS = {
  builtInWideAngleCamera: "Standardowy",
  builtInUltraWideCamera: "Ultraszeroki",
  builtInTelephotoCamera: "Tele",
};

const formatLensLabel = (lens) => {
  if (!lens) return "Obiektyw";
  return LENS_LABELS[lens] || lens;
};

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
  lensButton:{ backgroundColor:"rgba(0,0,0,0.45)", paddingHorizontal:14, paddingVertical:10, borderRadius:12 },
  lensButtonText:{ color:"#fff", fontWeight:"600" },
  lensModalBackdrop:{ flex:1, backgroundColor:"rgba(0,0,0,0.4)", justifyContent:"center", alignItems:"center" },
  lensModalCard:{ backgroundColor:"#fff", borderRadius:16, padding:20, width:"80%", gap:8 },
  lensModalTitle:{ fontSize:18, fontWeight:"700", marginBottom:6, textAlign:"center", color:"#1F1F1F" },
  lensModalLoader:{ paddingVertical:20 },
  lensOption:{ paddingVertical:12, paddingHorizontal:12, borderRadius:12, backgroundColor:"#F6F6FB" },
  lensOptionActive:{ backgroundColor:"rgba(31,111,235,0.12)", borderWidth:1, borderColor:"#1F6FEB" },
  lensOptionText:{ textAlign:"center", fontSize:15, color:"#2F2F2F" },
  lensOptionTextActive:{ color:"#1F6FEB", fontWeight:"700" },
});
