import { View, Text, StyleSheet, Alert, Pressable } from "react-native";
import { Link } from "expo-router";
import MenuCard from "../../components/MenuCard";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "../../context/AuthContext";

export default function HomeScreen() {
  const { user, logout } = useAuth();
  return (
    <LinearGradient
      colors={["#FFF8E6", "#FFE19A", "#FFF3C9"]}
      locations={[0, 0.55, 1]}
      style={styles.background}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Witaj{user ? `, ${user}` : ""} 👋</Text>
            <Text style={styles.subtitle}>Co chcesz zrobić?</Text>
          </View>
          <Pressable style={styles.logoutBtn} onPress={logout}>
            <Text style={styles.logoutText}>Wyloguj</Text>
          </Pressable>
        </View>

        <View style={styles.grid}>
          <Link href="/fridges" asChild>
            <MenuCard
              title="Lista lodówek"
              subtitle="Przeglądaj zawartość"
            />
          </Link>
          <Link href="/scanner" asChild>
            <MenuCard title="Skanuj produkty" subtitle="Dodaj przez EAN" primary />
          </Link>
          <Link href="/add-product" asChild>
            <MenuCard
              title="Dodaj produkt do katalogu"
              subtitle="Nowy produkt bazowy"
            />
          </Link>
          <Link href="/fridge" asChild>
            <MenuCard
              title="Lodówka"
              subtitle="Zawartość aktywnej"
            />
          </Link>
          <Link href="/add-fridge-item" asChild>
            <MenuCard
              title="Dodaj produkt do lodówki"
              subtitle="Wybierz z katalogu"
            />
          </Link>
          <Link href="/products" asChild>
            <MenuCard
              title="Katalog produktów"
              subtitle="Przeglądaj bazę"
            />
          </Link>
          <MenuCard
            title="Usuń produkt"
            subtitle="Szybkie usuwanie"
            onPress={() => Alert.alert("Usuń produkt", "Do podłączenia później")}
          />
          <MenuCard
            title="Otwórz produkt"
            subtitle="Zmienimy datę po otwarciu"
            onPress={() => Alert.alert("Otwórz produkt", "Do podłączenia później")}
          />
          <MenuCard
            title="Testowy przycisk"
            subtitle="Sprawdzam aktualizację"
            onPress={() => {}}
          />
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  background:{ flex:1 },
  container:{ flex:1, padding:20, paddingTop:52 },
  header:{ flexDirection:"row", justifyContent:"space-between", alignItems:"center" },
  greeting:{ fontSize:26, fontWeight:"700", color:"#111" },
  subtitle:{ marginTop:6, fontSize:14, color:"#666" },
  logoutBtn:{ marginLeft:16, paddingHorizontal:16, paddingVertical:10, borderRadius:12, backgroundColor:"rgba(31,111,235,0.12)" },
  logoutText:{ color:"#1F6FEB", fontWeight:"600" },
  grid:{ marginTop:24, flexDirection:"column", gap:12 },
});
