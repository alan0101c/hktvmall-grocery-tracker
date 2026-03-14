import express, { type Express } from "express";
import cors from "cors";
import router from "./routes/index.js";
import { initScheduler } from "./lib/scheduler.js";

const app: Express = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Initialize the scheduler on startup
initScheduler().catch((err) => {
  console.error("Failed to initialize scheduler:", err);
});

export default app;
