import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import productsRouter from "./products.js";
import alertsRouter from "./alerts.js";
import schedulerRouter from "./scheduler.js";
import productTypesRouter from "./productTypes.js";
import settingsRouter from "./settings.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/products", productsRouter);
router.use("/alerts", alertsRouter);
router.use("/scheduler", schedulerRouter);
router.use("/product-types", productTypesRouter);
router.use("/settings", settingsRouter);

export default router;
