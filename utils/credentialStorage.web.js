// Web is a preview target: keep credentials in memory, never localStorage/AsyncStorage.
let value = null;
export const credentialStorage = {
  read: async () => value,
  write: async (next) => { value = next; },
  clear: async () => { value = null; },
};
