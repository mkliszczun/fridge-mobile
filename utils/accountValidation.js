export function emailError(email, maxLength = 64) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.trim().length > maxLength) {
    return `Podaj poprawny adres e-mail (maksymalnie ${maxLength} znaki).`;
  }
  return null;
}

export function passwordError(password, confirmation) {
  // Count UTF-8 bytes without depending on TextEncoder availability in Hermes.
  let bytes = 0;
  for (const character of password) {
    const code = character.codePointAt(0);
    bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
  }
  if (password.length < 8 || bytes > 72) return "Użyj co najmniej 8 znaków. Jeśli hasło jest długie lub zawiera wiele znaków specjalnych, skróć je.";
  if (confirmation !== undefined && password !== confirmation) return "Hasła muszą być takie same.";
  return null;
}
