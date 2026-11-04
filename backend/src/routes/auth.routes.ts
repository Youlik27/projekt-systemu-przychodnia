import { Router } from "express";
import {
  postRegister,
} from "../controllers/auth.controller.js";

const router = Router();

router.post("/auth/register", postRegister);


export default router;