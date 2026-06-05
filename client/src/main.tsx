import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { bootstrapPwaShellFromUrl } from "@/lib/pwaShellBootstrap";

bootstrapPwaShellFromUrl(window.location.pathname);

createRoot(document.getElementById("root")!).render(<App />);
