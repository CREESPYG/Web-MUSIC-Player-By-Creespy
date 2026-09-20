import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Register & automatically update PWA Service Worker
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  // Clear legacy caches if present
  if ("caches" in window) {
    caches.keys().then((keys) => {
      for (const k of keys) {
        if (k.startsWith("creep-creep-cache-v1")) {
          caches.delete(k);
        }
      }
    });
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        reg.update();
      })
      .catch((err) => {
        console.warn("PWA Service Worker registration skipped:", err);
      });
  });
}

