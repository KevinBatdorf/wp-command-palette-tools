import { createRoot } from "@wordpress/element";
import "./palette.css";
import { PaletteMenu } from "./palette-menu";

// Nothing prints a container for it, and Modal portals to the body anyway.
const root = document.createElement("div");
root.className = "wpcp-tools-palette-root";
document.body.append(root);

createRoot(root).render(<PaletteMenu />);
