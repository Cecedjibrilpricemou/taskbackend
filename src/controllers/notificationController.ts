import { Request, Response } from 'express';
import { listerNotifications, marquerNotificationLue } from '../services/notificationService';
import { estErreurMetier } from '../utils/errors';

// Notifications de l'utilisateur connecté (n'importe quel rôle).
export async function listerNotificationsController(req: Request, res: Response) {
  try {
    const notifications = await listerNotifications(req.user!.id);
    res.json({ status: 'ok', notifications });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'erreur', message: 'Erreur serveur' });
  }
}

export async function marquerNotificationLueController(req: Request, res: Response) {
  const notificationId = Number(req.params.id);

  if (!Number.isInteger(notificationId)) {
    res.status(400).json({ status: 'erreur', message: 'id de notification invalide' });
    return;
  }

  try {
    // Le service vérifie que la notification appartient bien à
    // req.user!.id -- voir services/notificationService.ts.
    await marquerNotificationLue(notificationId, req.user!.id);
    res.json({ status: 'ok' });
  } catch (err) {
    if (estErreurMetier(err)) {
      res.status(err.statusCode).json({ status: 'erreur', message: err.message });
      return;
    }
    console.error(err);
    res.status(500).json({ status: 'erreur', message: 'Erreur serveur' });
  }
}
