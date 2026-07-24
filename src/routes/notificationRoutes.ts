import { Router } from 'express';
import { listerNotificationsController, marquerNotificationLueController } from '../controllers/notificationController';
import { authentifier } from '../middlewares/authMiddleware';

const router = Router();

// Accessible à n'importe quel utilisateur connecté (admin ou standard) :
// chacun ne voit que ses propres notifications (voir le service).
router.get('/', authentifier, listerNotificationsController);
router.patch('/:id/lue', authentifier, marquerNotificationLueController);

export default router;
