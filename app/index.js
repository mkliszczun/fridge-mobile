import { View, Text, StyleSheet, Alert } from "react-native";
import { Link } from "expo-router";
import MenuCard from "../components/MenuCard";

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.greeting}>Witaj, Maciek 👋</Text>
      <Text style={styles.subtitle}>Co chcesz zrobić?</Text>

      <View style={styles.grid}>
        <MenuCard title="Lista lodówek" subtitle="Przeglądaj zawartość"
          onPress={() => Alert.alert("Lista lodówek", "Do podłączenia później")} />
        <Link href="/scanner" asChild>
          <MenuCard title="Skanuj produkty" subtitle="Dodaj przez EAN" primary />
        </Link>
        <MenuCard title="Usuń produkt" subtitle="Szybkie usuwanie"
          onPress={() => Alert.alert("Usuń produkt", "Do podłączenia później")} />
        <MenuCard title="Otwórz produkt" subtitle="Zmienimy datę po otwarciu"
          onPress={() => Alert.alert("Otwórz produkt", "Do podłączenia później")} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:{ flex:1, padding:20, paddingTop:52, backgroundColor:"#F7F7FB" },
  greeting:{ fontSize:26, fontWeight:"700", color:"#111" },
  subtitle:{ marginTop:6, fontSize:14, color:"#666" },
  grid:{ marginTop:20, flexDirection:"row", flexWrap:"wrap", gap:12 },
});
