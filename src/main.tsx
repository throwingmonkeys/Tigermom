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
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConvexAuthProvider client={client}>
      <App />
    </ConvexAuthProvider>
  </React.StrictMode>,
);
