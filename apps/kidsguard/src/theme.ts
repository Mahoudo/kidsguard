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

// Direction "Indigo Soft" — premium, warm, family-friendly.
const light: Theme = {
  dark: false,
  bg: "#F1F1FB",
  card: "#FFFFFF",
  cardAlt: "#F5F4FF",
  text: "#16132E",
  muted: "#7C7896",
  border: "#ECEBF6",
  primary: "#5B4BE3",
  primarySoft: "#F5F4FF",
  accent: "#7C6BFF",
  danger: "#FF5D6C",
  success: "#1FC9A0",
  warning: "#FFB23E",
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
  primary: "#7C6BFF",
  primarySoft: "#262248",
  accent: "#9A8CFF",
  danger: "#FF5D6C",
  success: "#22D6AD",
  warning: "#FFB23E",
  onPrimary: "#FFFFFF",
};

export function useTheme(): Theme {
  return useColorScheme() === "dark" ? dark : light;
}

export const GRADIENT = ["#5B4BE3", "#7C6BFF"] as const;
