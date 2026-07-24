import { Router } from 'express';
import { loginController, meController } from '../controllers/authController';
import { authentifier } from '../middlewares/authMiddleware';

const router = Router();

// /login est public (c'est le point d'entrée pour obtenir un token).
router.post('/login', loginController);
router.get('/me', authentifier, meController);

export default router;
