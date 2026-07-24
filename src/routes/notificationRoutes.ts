import { Router } from 'express';
import { listerNotificationsController, marquerNotificationLueController } from '../controllers/notificationController';
import { authentifier } from '../middlewares/authMiddleware';

const router = Router();

router.get('/', authentifier, listerNotificationsController);
router.patch('/:id/lue', authentifier, marquerNotificationLueController);

export default router;
