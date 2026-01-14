import { Router, type Router as RouterType } from "express";
import { getAdmin } from "../controllers/adminController";
import { attachAuth, requireAuth, requireGroup } from "../middleware/auth";

const router: RouterType = Router();

router.use(attachAuth, requireAuth, requireGroup("administrators"));

router.get("/ping", getAdmin);

export default router;
