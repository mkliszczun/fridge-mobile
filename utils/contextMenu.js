import { ActionSheetIOS, Alert, Platform } from "react-native";

export const showContextMenu = ({ title, message, actions = [], anchor }) => {
  const availableActions = actions.filter(Boolean);

  if (Platform.OS === "ios") {
    const cancelButtonIndex = availableActions.length;
    const destructiveButtonIndices = availableActions
      .map((action, index) => (action.role === "destructive" ? index : null))
      .filter((index) => index !== null);
    const disabledButtonIndices = availableActions
      .map((action, index) => (action.disabled ? index : null))
      .filter((index) => index !== null);

    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        message,
        options: [...availableActions.map((action) => action.label), "Anuluj"],
        cancelButtonIndex,
        ...(destructiveButtonIndices.length
          ? { destructiveButtonIndex: destructiveButtonIndices }
          : {}),
        ...(disabledButtonIndices.length ? { disabledButtonIndices } : {}),
        ...(typeof anchor === "number" ? { anchor } : {}),
      },
      (selectedIndex) => {
        const selectedAction = availableActions[selectedIndex];
        if (selectedAction && !selectedAction.disabled) {
          selectedAction.onPress?.();
        }
      }
    );
    return;
  }

  Alert.alert(
    title || "Wybierz działanie",
    message,
    [
      ...availableActions.map((action) => ({
        text: action.label,
        style: action.role === "destructive" ? "destructive" : "default",
        onPress: action.disabled ? undefined : action.onPress,
      })),
      { text: "Anuluj", style: "cancel" },
    ]
  );
};
