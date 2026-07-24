import { Router } from 'express';
import { obtenirKpisController } from '../controllers/kpiController';
import { authentifier, autoriser } from '../middlewares/authMiddleware';

const router = Router();

router.get('/', authentifier, autoriser('admin'), obtenirKpisController);

export default router;
