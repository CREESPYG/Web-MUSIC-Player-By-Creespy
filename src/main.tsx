import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import AdminApp from "./admin/AdminApp";

const isAdminPath =
  typeof window !== "undefined" &&
  window.location.pathname.replace(/\/+$/, "").startsWith("/creespy/admin");

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Missing #root");

createRoot(rootElement).render(
  <StrictMode>{isAdminPath ? <AdminApp /> : <App />}</StrictMode>
);

// Register PWA Service Worker
if (typeof window !== "undefined" && "serviceWorker" in navigator && process.env.NODE_ENV === "production") {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then(() => undefined)
      .catch((err) => {
        console.warn("PWA Service Worker registration skipped:", err);
      });
  });
}

