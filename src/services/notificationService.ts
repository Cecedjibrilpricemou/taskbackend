import pool from '../config/db';
import { relancerErreurSignalMysql } from '../utils/errors';
import { Notification } from '../types/entities';

// Forme brute renvoyée par sp_lister_notifications_utilisateur : la
// colonne `lue` est un TINYINT(1) côté MySQL, donc mysql2 la renvoie
// comme un number (0/1) et non un boolean -- d'où le retype juste après.
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

// La procédure vérifie déjà que la notification appartient bien à
// l'utilisateur courant (SIGNAL sinon) -- ce qui empêche un utilisateur
// de marquer comme lue une notification qui n'est pas la sienne, et se
// traduit ici par un 404 propre plutôt qu'un no-op silencieux.
export async function marquerNotificationLue(notificationId: number, utilisateurId: number): Promise<void> {
  try {
    await pool.query('CALL sp_marquer_notification_lue(?, ?)', [notificationId, utilisateurId]);
  } catch (err) {
    relancerErreurSignalMysql(err, 404);
  }
}
