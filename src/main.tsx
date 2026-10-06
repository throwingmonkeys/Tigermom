import React from "react";
import ReactDOM from "react-dom/client";
import { ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import "@fontsource/manrope/latin-400.css";
import "@fontsource/manrope/latin-500.css";
import "@fontsource/manrope/latin-600.css";
import "@fontsource/manrope/latin-700.css";
import "@fontsource/bree-serif/latin-400.css";
import App from "./App";
import "./styles.css";

const url = import.meta.env.VITE_CONVEX_URL;
if (!url)
  throw new Error(
    "Set VITE_CONVEX_URL in .env.local before starting Tigermom.",
  );
const client = new ConvexReactClient(url);
// A guest's sign-in keys stay in this page's memory, not localStorage.
const guestKeys = new Map<string, string>();
const guestStorage = {
  getItem: (key: string) => guestKeys.get(key) ?? null,
  setItem: (key: string, value: string) => {
    guestKeys.set(key, value);
  },
  removeItem: (key: string) => {
    guestKeys.delete(key);
  },
};
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConvexAuthProvider client={client} storage={guestStorage}>
      <App />
    </ConvexAuthProvider>
  </React.StrictMode>,
);
