import { Router, type Router as RouterType } from "express";
import { submitHandler, galleryHandler } from "../controllers/imageController";
import { attachAuth, requireAuth } from "../middleware/auth";

const router: RouterType = Router();

// All image routes require authentication
router.use(attachAuth, requireAuth);

router.post("/submit", submitHandler);
router.get("/gallery", galleryHandler);

export default router;
