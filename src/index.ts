import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { CONFIG } from "./config.js";
import { router } from "./api.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

app.use(cors());
app.use(express.json());

// API routes
app.use("/api", router);

// Serve built React client
const clientDist = path.join(__dirname, "../client/dist");
app.use(express.static(clientDist));
app.get("*", (_req, res) => res.sendFile(path.join(clientDist, "index.html")));

app.listen(CONFIG.PORT, () => {
  console.log("┌─────────────────────────────────────┐");
  console.log(`│  ARB AGENT running                  │`);
  console.log(`│  http://localhost:${CONFIG.PORT}            │`);
  console.log("└─────────────────────────────────────┘");
});
