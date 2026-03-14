import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import productsRouter from "./products.js";
import alertsRouter from "./alerts.js";
import schedulerRouter from "./scheduler.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/products", productsRouter);
router.use("/alerts", alertsRouter);
router.use("/scheduler", schedulerRouter);

export default router;
