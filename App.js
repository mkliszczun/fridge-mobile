// import { StatusBar } from "expo-status-bar";
// import React, { useEffect, useState, useRef } from "react";
// import { StyleSheet, Text, View, Button, Alert } from "react-native";
// import { CameraView, useCameraPermissions } from "expo-camera";

// export default function App() {
//   const [permission, requestPermission] = useCameraPermissions();
//   const [scanning, setScanning] = useState(false);
//   const handled = useRef(false);
//   const API_URL = "http://192.168/integration/api/connect"; // <- podmień na swoje


//   useEffect(() => {
//     if (!permission) requestPermission();
//   }, [permission]);

//   if (!permission) return null;
//   if (!permission.granted)
//     return (
//       <View style={styles.center}>
//         <Text>Brak dostępu do aparatu.</Text>
//         <Button title="Zezwól" onPress={requestPermission} />
//       </View>
//     );

//   const onBarcodeScanned = async ({ data, type }) => {
//     if (handled.current) return;
//     handled.current = true;
//     setScanning(false);
    

//     const eanTypes = ["ean13", "ean8"];
//     if (!eanTypes.includes(type)) {
//       Alert.alert("Nieobsługiwany typ", type, [
//         { text: "OK", onPress: () => (handled.current = false) },
//       ]);
//       return;
//     }

//     // Alert.alert("Zeskanowano EAN", data, [
//     //   { text: "OK", onPress: () => (handled.current = false) },
//     // ]);
//     try {
//     const res = await fetch(API_URL, {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({ ean: data }),
//     });

//     // jeśli backend zwraca JSON – spróbuj go odczytać (opcjonalnie)
//     let payload = null;
//     try { payload = await res.json(); } catch (_) {}

//     if (!res.ok) {
//       throw new Error(`HTTP ${res.status}`);
//     }

//     Alert.alert("Wysłano do API", `EAN: ${data}\nOK`, [
//       { text: "OK", onPress: () => (handled.current = false) },
//     ]);
//   } catch (err) {
//     Alert.alert("Błąd wysyłki", String(err), [
//       { text: "OK", onPress: () => (handled.current = false) },
//     ]);
//   }
//   };

//   return (
//     <View style={styles.container}>
//       <Text style={styles.title}>Fridge Mobile – skaner</Text>

//       {!scanning ? (
//         <Button title="Skanuj" onPress={() => {
//           handled.current = false;
//           setScanning(true)}} />
        
//       ) : (
//         <View style={styles.scannerBox}>
//           <CameraView
//             style={StyleSheet.absoluteFillObject}
//             facing="back"
//             onBarcodeScanned={onBarcodeScanned}
//             barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8"] }}
//           />
//           <View style={styles.overlay}>
//             <Text style={styles.overlayText}>Nakieruj na kod EAN</Text>
//             <Button title="Anuluj" onPress={() => setScanning(false)} />
//           </View>
//         </View>
//       )}
//       <StatusBar style="auto" />
//     </View>
//   );

// }
  

// const styles = StyleSheet.create({
//   container: { flex: 1, padding: 16, gap: 16, paddingTop: 48 },
//   center: { flex: 1, alignItems: "center", justifyContent: "center" },
//   title: { fontSize: 18, fontWeight: "600" },
//   scannerBox: { flex: 1, borderRadius: 12, overflow: "hidden" },
//   overlay: { position: "absolute", bottom: 24, left: 16, right: 16, gap: 12, alignItems: "center" },
//   overlayText: { padding: 8, backgroundColor: "rgba(0,0,0,0.5)", color: "white", borderRadius: 8 },
// });

import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState, useRef } from "react";
import { StyleSheet, Text, View, Pressable, Alert } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const handled = useRef(false);

  // TODO: podmień na swój backend
  const API_URL = "http://192.168.0.123:8080/api/connect";

  useEffect(() => {
    if (!permission) requestPermission();
  }, [permission]);

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

  const onBarcodeScanned = async ({ data, type }) => {
    if (handled.current) return;
    handled.current = true;
    setScanning(false);

    const allowed = ["ean13", "ean8", "org.gs1.EAN-13", "org.gs1.EAN-8"];
    if (!allowed.includes(type)) {
      Alert.alert("Nieobsługiwany kod", type, [
        { text: "OK", onPress: () => (handled.current = false) },
      ]);
      return;
    }

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ean: data }),
      });
      let payload = null;
      try { payload = await res.json(); } catch {}
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      Alert.alert("Wysłano do API", `EAN: ${data}\nOK`, [
        { text: "OK", onPress: () => (handled.current = false) },
      ]);
    } catch (err) {
      Alert.alert("Błąd wysyłki", String(err), [
        { text: "OK", onPress: () => (handled.current = false) },
      ]);
    }
  };

  // Ekran skanera
  if (scanning) {
    handled.current = false; // reset przy każdym wejściu
    return (
      <View style={styles.scannerWrap}>
        <CameraView
          style={StyleSheet.absoluteFillObject}
          facing="back"
          onBarcodeScanned={onBarcodeScanned}
          barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8"] }}
        />
        <View style={styles.scannerOverlay}>
          <Text style={styles.scannerHint}>Nakieruj na kod EAN</Text>
          <Pressable style={styles.secondaryBtn} onPress={() => setScanning(false)}>
            <Text style={styles.secondaryBtnText}>Anuluj</Text>
          </Pressable>
        </View>
        <StatusBar style="light" />
      </View>
    );
  }

  // Home
  return (
    <View style={styles.container}>
      <Text style={styles.greeting}>Witaj, Maciek 👋</Text>
      <Text style={styles.subtitle}>Co chcesz zrobić?</Text>

      <View style={styles.grid}>
        <MenuCard
          title="Lista lodówek"
          subtitle="Przeglądaj zawartość"
          onPress={() => Alert.alert("Lista lodówek", "Tu podłączysz listę lodówek.")}
        />
        <MenuCard
          title="Skanuj produkty"
          subtitle="Dodaj przez EAN"
          primary
          onPress={() => setScanning(true)}
        />
        <MenuCard
          title="Usuń produkt"
          subtitle="Szybkie usuwanie"
          onPress={() => Alert.alert("Usuń produkt", "Tu podłączysz usuwanie produktu.")}
        />
        <MenuCard
          title="Otwórz produkt"
          subtitle="Zmienimy datę po otwarciu"
          onPress={() => Alert.alert("Otwórz produkt", "Tu podłączysz otwieranie produktu.")}
        />
      </View>

      <StatusBar style="auto" />
    </View>
  );
}

function MenuCard({ title, subtitle, onPress, primary }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        primary && styles.cardPrimary,
        pressed && styles.cardPressed,
      ]}
    >
      <Text style={[styles.cardTitle, primary && styles.cardTitlePrimary]}>{title}</Text>
      <Text style={[styles.cardSubtitle, primary && styles.cardSubtitlePrimary]}>{subtitle}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, paddingTop: 52, backgroundColor: "#F7F7FB" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#F7F7FB" },

  greeting: { fontSize: 26, fontWeight: "700", color: "#111" },
  subtitle: { marginTop: 6, fontSize: 14, color: "#666" },

  grid: {
    marginTop: 20,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },

  card: {
    width: "48%",
    backgroundColor: "white",
    borderRadius: 16,
    padding: 14,
    minHeight: 110,
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  cardPrimary: { backgroundColor: "#1F6FEB" },
  cardPressed: { transform: [{ scale: 0.98 }] },

  cardTitle: { fontSize: 16, fontWeight: "700", color: "#111" },
  cardSubtitle: { fontSize: 12, color: "#666", marginTop: 6 },

  cardTitlePrimary: { color: "white" },
  cardSubtitlePrimary: { color: "rgba(255,255,255,0.85)" },

  // skaner
  scannerWrap: { flex: 1, backgroundColor: "black" },
  scannerOverlay: {
    position: "absolute",
    bottom: 28,
    left: 20,
    right: 20,
    alignItems: "center",
    gap: 10,
  },
  scannerHint: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: "white",
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 10,
    fontSize: 14,
  },

  title: { fontSize: 18, fontWeight: "600" },

  primaryBtn: {
    backgroundColor: "#1F6FEB",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 12,
  },
  primaryBtnText: { color: "white", fontWeight: "700" },

  secondaryBtn: {
    backgroundColor: "white",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
  },
  secondaryBtnText: { color: "#111", fontWeight: "700" },
});

