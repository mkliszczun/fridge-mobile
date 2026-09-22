import { useCallback, useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  ActivityIndicator,
  AppState,
  Linking,
  Platform,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { API_BASE_URL } from "../../constants/api";
import { useAuth } from "../../context/AuthContext";
import { cameraPermissionState, handleCameraPermissionAction } from "../../utils/cameraPermission";
import { normalizeOffProduct, productScanParams } from "../../utils/productDraft";

export default function ScannerScreen() {
  const [permission, requestPermission, refreshPermission] = useCameraPermissions();
  const requestedInitially = useRef(false);
  const [permissionBusy, setPermissionBusy] = useState(false);
  const [permissionError, setPermissionError] = useState(null);
  const permissionState = cameraPermissionState(permission, Platform.OS);
  const readyRef = useRef(false);
  const [processing, setProcessing] = useState(false);
  const [lastCode, setLastCode] = useState(null);
  const frozenRef = useRef(false);
  const pendingRef = useRef(null);
  const { apiFetch, sessionId } = useAuth();
  const router = useRouter();
  const { mode } = useLocalSearchParams();
  const catalogMode = mode === "catalog";
  const [active, setActive] = useState(false);
  const activeRef = useRef(false);
  const lookupController = useRef(null);
  const retryTimer = useRef(null);

  useFocusEffect(useCallback(() => {
    activeRef.current = true;
    setActive(true); readyRef.current = false; setProcessing(false); frozenRef.current = false; setLastCode(null);
    pendingRef.current = null;
    return () => {
      activeRef.current = false;
      setActive(false);
      lookupController.current?.abort();
      clearTimeout(retryTimer.current);
    };
  }, [sessionId]));

  useEffect(() => {
    if (permission?.status !== "undetermined" || permission.canAskAgain === false || requestedInitially.current) return;
    requestedInitially.current = true;
    requestPermission().catch(() => setPermissionError("Nie udało się sprawdzić dostępu do aparatu. Spróbuj ponownie."));
  }, [permission, requestPermission]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", state => {
      if (state === "active") refreshPermission().catch(() => setPermissionError("Nie udało się odświeżyć zgody na aparat."));
    });
    return () => subscription.remove();
  }, [refreshPermission]);

  const handlePermission = async () => {
    if (permissionBusy) return;
    setPermissionBusy(true);
    setPermissionError(null);
    try {
      await handleCameraPermissionAction(permission, {
        requestPermission, refreshPermission, openSettings: () => Linking.openSettings(),
      }, Platform.OS);
    } catch {
      setPermissionError(permissionState === "settings"
        ? "Otwórz ustawienia ręcznie i zezwól tej aplikacji na dostęp do aparatu."
        : "Nie udało się uzyskać zgody. Spróbuj ponownie.");
    } finally {
      setPermissionBusy(false);
    }
  };

  const onBarcodeScanned = ({ data, type }) => {
    if (!activeRef.current || !readyRef.current || frozenRef.current) return;

    const allowed = ["ean13", "ean8", "org.gs1.EAN-13", "org.gs1.EAN-8"];
    if (!allowed.includes(type)) {
      Alert.alert("Nieobsługiwany kod", type);
      return;
    }

    if (pendingRef.current === data) return;
    pendingRef.current = data;
    lookupProduct(data);
  };

  const fetchOffProduct = async (ean, controller) => {
    let offData = null;
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/off/${encodeURIComponent(ean)}`, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",

      },
    });
      if (res.ok) offData = normalizeOffProduct(await res.json().catch(() => null));
    } catch (error) {
      if (controller.signal.aborted) return;
    }
    if (!activeRef.current || controller.signal.aborted) return;
    if (!offData?.productName) Alert.alert("Brak danych produktu", "Wpisz nazwę ręcznie. Następnie możesz uzupełnić pozostałe pola przez AI.");
    const destination = {
      pathname: "/add-product",
      params: productScanParams(ean, offData, `${Date.now()}-${ean}`),
    };
    if (catalogMode) router.dismissTo(destination);
    else router.replace(destination);
  };

  const handleCameraReady = () => { readyRef.current = true; };

  const handleCameraMountError = ({ message }) => {
    readyRef.current = false;
    Alert.alert(
      "Nie udało się uruchomić aparatu",
      message || "Zamknij skaner i spróbuj ponownie."
    );
  };

  const lookupProduct = async (ean) => {
    const controller = new AbortController();
    lookupController.current = controller;
    setProcessing(true);
    frozenRef.current = true;
    setLastCode(ean);
    let success = false;
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/products/${encodeURIComponent(ean)}`, {
        method: "GET",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",

        },
      });
      if (!activeRef.current || controller.signal.aborted) return;
      if (res.status === 404) {
        await fetchOffProduct(ean, controller);
        success = true;
        return;
      }
      const payload = await res.json().catch(() => null);
      if (!activeRef.current || controller.signal.aborted) return;
      if (!res.ok || !payload) {
        const message = payload?.message || `Kod ${ean} nie został znaleziony.`;
        throw new Error(message);
      }

      if (catalogMode) {
        Alert.alert("Produkt już istnieje", `${payload.name || ean} jest już w katalogu. Nie trzeba dodawać go ponownie.`);
        success = true;
        router.back();
        return;
      }

      router.replace({
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
      if (activeRef.current && !controller.signal.aborted) Alert.alert("Brak produktu", `${String(err)}\nEAN: ${ean}`);
    } finally {
      if (activeRef.current && !controller.signal.aborted) setProcessing(false);
      if (!success && activeRef.current && !controller.signal.aborted) retryTimer.current = setTimeout(() => {
        frozenRef.current = false;
        setLastCode(null);
        pendingRef.current = null;
      }, 600);
    }
  };

  if (!permission) return <View style={styles.center}><ActivityIndicator accessibilityLabel="Sprawdzam dostęp do aparatu" /></View>;
  if (!permission.granted)
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Potrzebny dostęp do aparatu</Text>
        {permissionState === "settings" && <Text style={styles.permissionHint}>
          {Platform.OS === "web"
            ? "Dostęp do aparatu jest zablokowany. Włącz go w ustawieniach tej strony w przeglądarce, a potem sprawdź ponownie."
            : "Dostęp do aparatu jest zablokowany. Włącz go w ustawieniach telefonu i wróć do aplikacji."}
        </Text>}
        {permissionError && <Text accessibilityRole="alert" style={styles.permissionHint}>{permissionError}</Text>}
        <Pressable accessibilityRole="button" disabled={permissionBusy} style={styles.primaryBtn} onPress={handlePermission}>
          <Text style={styles.primaryBtnText}>{permissionState === "settings"
            ? Platform.OS === "web" ? "Sprawdź ponownie" : "Otwórz ustawienia"
            : "Zezwól"}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" style={styles.primaryBtn} onPress={() => router.back()}>
          <Text style={styles.primaryBtnText}>Wróć</Text>
        </Pressable>
      </View>
    );

  return (
    <View style={styles.scannerWrap}>
      {active && <CameraView
        style={styles.camera}
        facing="back"
        zoom={0}
        autofocus="on"
        onBarcodeScanned={onBarcodeScanned}
        barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8"] }}
        onCameraReady={handleCameraReady}
        onMountError={handleCameraMountError}
      />}
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
  permissionHint:{ textAlign:"center", paddingHorizontal:24, marginTop:12, color:"#404040" },
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
