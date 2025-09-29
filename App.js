import { ExpoRoot } from "expo-router";
import "./utils/networkLogger";

export default function App() {
  const ctx = require.context("./app");
  return <ExpoRoot context={ctx} />;
}
