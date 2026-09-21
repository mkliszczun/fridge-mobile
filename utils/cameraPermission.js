export function cameraPermissionState(permission, platform = "native") {
  if (!permission) return "loading";
  if (permission.granted) return "granted";
  if (permission.canAskAgain === false || (platform === "web" && permission.status === "denied")) return "settings";
  return "request";
}

export async function handleCameraPermissionAction(permission, actions, platform = "native") {
  const state = cameraPermissionState(permission, platform);
  if (state === "request") return actions.requestPermission();
  if (state === "settings") {
    return platform === "web" ? actions.refreshPermission() : actions.openSettings();
  }
}
