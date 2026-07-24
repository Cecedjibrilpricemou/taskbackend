import pool from '../config/db';
import { relancerErreurSignalMysql } from '../utils/errors';
import { Notification } from '../types/entities';

interface NotificationBrute {
  id: number;
  tache_id: number;
  message: string;
  lue: number;
  date_creation: Date;
}

export async function listerNotifications(utilisateurId: number): Promise<Notification[]> {
  const [rows]: any = await pool.query('CALL sp_lister_notifications_utilisateur(?)', [utilisateurId]);
  return (rows[0] as NotificationBrute[]).map((n) => ({ ...n, lue: Boolean(n.lue) }));
}

export async function marquerNotificationLue(notificationId: number, utilisateurId: number): Promise<void> {
  try {
    await pool.query('CALL sp_marquer_notification_lue(?, ?)', [notificationId, utilisateurId]);
  } catch (err) {
    relancerErreurSignalMysql(err, 404);
  }
}
