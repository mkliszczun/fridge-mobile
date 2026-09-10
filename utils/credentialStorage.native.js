import * as SecureStore from "expo-secure-store";

const KEY = "fridge.session.v2";
const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
export const credentialStorage = {
  read: () => SecureStore.getItemAsync(KEY, options),
  write: (value) => SecureStore.setItemAsync(KEY, value, options),
  clear: () => SecureStore.deleteItemAsync(KEY, options),
};
