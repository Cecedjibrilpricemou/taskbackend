import { Router } from 'express';
import { changerMotDePasseController } from '../controllers/compteController';
import { authentifier } from '../middlewares/authMiddleware';

// Monté sur /api/auth dans app.ts, à côté d'authRoutes -- routeur séparé
// volontairement pour isoler "gestion du compte personnel" de
// "authentification" (voir commentaire dans app.ts).
const router = Router();

router.patch('/mot-de-passe', authentifier, changerMotDePasseController);

export default router;
