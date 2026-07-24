import { Router } from 'express';
import { changerMotDePasseController } from '../controllers/compteController';
import { authentifier } from '../middlewares/authMiddleware';

const router = Router();

router.patch('/mot-de-passe', authentifier, changerMotDePasseController);

export default router;
