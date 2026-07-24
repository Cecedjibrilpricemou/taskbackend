import { Router } from 'express';
import { listerController, creerController, changerStatutController } from '../controllers/utilisateurController';
import { authentifier, autoriser } from '../middlewares/authMiddleware';

const router = Router();
router.use(authentifier, autoriser('admin'));
router.get('/', listerController);
router.post('/', creerController);
router.patch('/:id/statut', changerStatutController);

export default router;
