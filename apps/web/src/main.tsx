import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import Dashboard from "./components/Dashboard";
import DocsPage from "./components/DocsPage";
import "./index.css";

function getRoute(): "docs" | "home" {
  if (typeof window === "undefined") return "home";
  return window.location.hash.startsWith("#/docs") ? "docs" : "home";
}

function Root() {
  const [route, setRoute] = useState<"docs" | "home">(getRoute);
  useEffect(() => {
    const onHash = () => setRoute(getRoute());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return route === "docs" ? <DocsPage /> : <Dashboard />;
}

createRoot(document.getElementById("root")!).render(<Root />);
