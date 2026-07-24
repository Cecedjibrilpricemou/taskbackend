import { Router } from 'express';
import {
  creerTacheController,
  listerTachesController,
  modifierTacheController,
  attribuerTacheController,
  supprimerTacheController,
  listerMesTachesController,
  modifierStatutTacheController,
} from '../controllers/tacheController';
import { authentifier, autoriser } from '../middlewares/authMiddleware';

const router = Router();

router.get('/mes-taches', authentifier, autoriser('utilisateur'), listerMesTachesController);
router.patch('/:id/statut', authentifier, autoriser('utilisateur'), modifierStatutTacheController);

router.post('/', authentifier, autoriser('admin'), creerTacheController);
router.get('/', authentifier, autoriser('admin'), listerTachesController);
router.patch('/:id', authentifier, autoriser('admin'), modifierTacheController);
router.post('/:id/attribution', authentifier, autoriser('admin'), attribuerTacheController);
router.delete('/:id', authentifier, autoriser('admin'), supprimerTacheController);

export default router;
