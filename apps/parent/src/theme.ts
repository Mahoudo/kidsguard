import { useColorScheme } from "react-native";

export interface Theme {
  dark: boolean;
  bg: string;
  card: string;
  cardAlt: string;
  text: string;
  muted: string;
  border: string;
  primary: string;
  primarySoft: string;
  accent: string;
  danger: string;
  success: string;
  warning: string;
  onPrimary: string;
}

const light: Theme = {
  dark: false,
  bg: "#F5F6FB",
  card: "#FFFFFF",
  cardAlt: "#F0F1F8",
  text: "#15162B",
  muted: "#8A8FA3",
  border: "#ECEDF5",
  primary: "#6C5CE7",
  primarySoft: "#EEEBFF",
  accent: "#4A6CF7",
  danger: "#FF4D6D",
  success: "#21C97A",
  warning: "#FFA726",
  onPrimary: "#FFFFFF",
};

const dark: Theme = {
  dark: true,
  bg: "#0D0E1A",
  card: "#181A2C",
  cardAlt: "#21243B",
  text: "#F3F4FB",
  muted: "#9AA0B8",
  border: "#262A45",
  primary: "#8576FF",
  primarySoft: "#272a4d",
  accent: "#5B7BFF",
  danger: "#FF5C7A",
  success: "#2BD67B",
  warning: "#FFB74D",
  onPrimary: "#FFFFFF",
};

export function useTheme(): Theme {
  return useColorScheme() === "dark" ? dark : light;
}

export const GRADIENT = ["#6C5CE7", "#4A6CF7"] as const;
