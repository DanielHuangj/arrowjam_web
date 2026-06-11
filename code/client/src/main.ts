import "./style.css";
import { App } from "./app.ts";

const root = document.getElementById("app");
if (!root) throw new Error("#app not found");

new App(root).start();
