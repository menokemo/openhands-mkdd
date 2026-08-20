import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import AuthGate from "./components/AuthGate.tsx";
import { registerServiceWorker } from "./utils/pushNotifications";

void registerServiceWorker();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthGate />
  </StrictMode>,
);
