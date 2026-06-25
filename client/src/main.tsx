import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import "./index.css";
import { bootstrapPwaShellFromUrl } from "@/lib/pwaShellBootstrap";
import { APP_HOME_PATH } from "@shared/brand";

if (window.location.pathname === "/" || window.location.pathname === "") {
  window.history.replaceState(null, "", APP_HOME_PATH);
}

bootstrapPwaShellFromUrl(window.location.pathname);

registerSW({ immediate: true });

createRoot(document.getElementById("root")!).render(<App />);
