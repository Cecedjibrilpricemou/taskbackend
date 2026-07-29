import pool from '../config/db';
import { ErreurMetier, relancerErreurSignalMysql, estErreurContrainteFk } from '../utils/errors';
import { Tache, StatutTache, PrioriteTache } from '../types/entities';
import { emettreNotification } from '../realtime/socket';

// Forme brute renvoyée par le SELECT final de sp_attribuer_tache -- même
// remarque que NotificationBrute dans notificationService.ts : `lue` est un
// TINYINT(1) côté MySQL, à retyper en boolean avant de l'émettre en WS.
interface NotificationAttribueeBrute {
  id: number;
  utilisateur_id: number;
  tache_id: number;
  message: string;
  lue: number;
  date_creation: Date;
}

interface CreerTacheInput {
  titre: string;
  description?: string;
  priorite: PrioriteTache;
  dateEcheance?: string;
}

// sp_creer_tache a un paramètre OUT (p_nouvel_id) pour renvoyer l'id créé.
// mysql2 ne mappe pas nativement les paramètres OUT : on passe par une
// variable de session SQL (@nouvel_id), qu'on relit avec un SELECT juste
// après. Ce pattern revient dans tout le fichier partout où une
// procédure crée une ressource (voir aussi utilisateurService.ts).
export async function creerTache(input: CreerTacheInput, creePar: number): Promise<number> {
  try {
    await pool.query('CALL sp_creer_tache(?, ?, ?, ?, ?, @nouvel_id)', [
      input.titre,
      input.description ?? null,
      input.priorite,
      input.dateEcheance ?? null,
      creePar,
    ]);
  } catch (err) {
    // Erreur de validation levée par la procédure (ex: titre trop court)
    // -> 400. Toute autre erreur (infra) remonte telle quelle en 500.
    relancerErreurSignalMysql(err, 400);
  }
  const [rows]: any = await pool.query('SELECT @nouvel_id AS id');
  return rows[0].id;
}

interface ListerTachesFiltres {
  statut?: StatutTache;
  priorite?: PrioriteTache;
}

// Liste globale (admin) sur v_taches_liste. Les filtres optionnels sont
// ajoutés en WHERE de façon paramétrée (jamais de concaténation directe
// de valeur utilisateur dans le SQL, même si statut/priorite sont déjà
// validés en amont côté controller).
export async function listerTaches(filtres: ListerTachesFiltres): Promise<Tache[]> {
  const conditions: string[] = [];
  const params: string[] = [];
  if (filtres.statut) {
    conditions.push('statut = ?');
    params.push(filtres.statut);
  }
  if (filtres.priorite) {
    conditions.push('priorite = ?');
    params.push(filtres.priorite);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [rows] = await pool.query(`SELECT * FROM v_taches_liste ${where}`, params);
  return rows as Tache[];
}

interface ModifierTacheInput {
  titre: string;
  description?: string;
  priorite: PrioriteTache;
  dateEcheance?: string;
}

// Modifie titre/description/priorité/échéance -- jamais le statut (c'est
// le rôle exclusif de modifierStatutTache, réservé aux utilisateurs assignés).
export async function modifierTache(
  tacheId: number,
  input: ModifierTacheInput,
  effectuePar: number
): Promise<void> {
  try {
    await pool.query('CALL sp_modifier_tache(?, ?, ?, ?, ?, ?)', [
      tacheId,
      input.titre,
      input.description ?? null,
      input.priorite,
      input.dateEcheance ?? null,
      effectuePar,
    ]);
  } catch (err) {
    relancerErreurSignalMysql(err, 400);
  }
}

// Remplace la liste complète des utilisateurs assignés à la tâche (pas
// un ajout incrémental). p_utilisateur_ids est une chaîne d'ids séparés
// par des virgules (ex: '2,5,7') -- c'est la procédure qui la parse et
// qui gère les notifications (uniquement pour les nouveaux assignés).
export async function attribuerTache(
  tacheId: number,
  utilisateurIds: number[],
  effectuePar: number
): Promise<void> {
  if (!utilisateurIds.length) {
    throw new ErreurMetier(400, 'Au moins un utilisateur doit être attribué');
  }
  const idsConcat = utilisateurIds.join(',');
  try {
    const [rows]: any = await pool.query('CALL sp_attribuer_tache(?, ?, ?)', [
      tacheId,
      idsConcat,
      effectuePar,
    ]);
    const notifications = rows[0] as NotificationAttribueeBrute[];
    for (const notif of notifications) {
      emettreNotification(notif.utilisateur_id, {
        id: notif.id,
        tache_id: notif.tache_id,
        message: notif.message,
        lue: Boolean(notif.lue),
        date_creation: notif.date_creation,
      });
    }
  } catch (err) {
    // La procédure ne vérifie pas l'existence de tacheId avant d'insérer
    // dans tache_utilisateur : un id de tâche inexistant/supprimée casse
    // la contrainte de clé étrangère (errno 1452) plutôt que de déclencher
    // un SIGNAL explicite. On le traduit ici en 404 propre. Un id
    // d'utilisateur invalide, lui, est bien vérifié par la procédure et
    // remonte via SIGNAL -> 400 (branche relancerErreurSignalMysql ci-dessous).
    if (estErreurContrainteFk(err)) {
      throw new ErreurMetier(404, 'Tâche introuvable');
    }
    relancerErreurSignalMysql(err, 400);
  }
}

// Suppression logique (soft delete) -- la procédure ne fait jamais de
// DELETE physique, elle marque la tâche comme supprimée pour préserver
// l'historique. Idempotent : supprimer deux fois ne renvoie pas d'erreur.
export async function supprimerTache(tacheId: number, effectuePar: number): Promise<void> {
  try {
    await pool.query('CALL sp_supprimer_tache(?, ?)', [tacheId, effectuePar]);
  } catch (err) {
    relancerErreurSignalMysql(err, 400);
  }
}

// "Mes tâches" : liste filtrée par utilisateur courant. Une vue MySQL ne
// prend pas de paramètre, d'où le passage par une procédure stockée ici
// plutôt qu'un SELECT sur une vue comme listerTaches().
export async function listerMesTaches(utilisateurId: number): Promise<Tache[]> {
  const [rows]: any = await pool.query('CALL sp_lister_taches_utilisateur(?)', [utilisateurId]);
  return rows[0] as Tache[];
}

// Réservé aux utilisateurs assignés à la tâche -- la procédure vérifie
// elle-même l'assignation (SIGNAL sinon, relayé ici en 403, pas 500) en
// plus du contrôle de rôle déjà fait par le middleware `autoriser`
// (défense en profondeur : la règle est vérifiée aux deux niveaux).
export async function modifierStatutTache(
  tacheId: number,
  utilisateurId: number,
  statut: StatutTache
): Promise<void> {
  try {
    await pool.query('CALL sp_modifier_statut_tache(?, ?, ?)', [tacheId, utilisateurId, statut]);
  } catch (err) {
    relancerErreurSignalMysql(err, 403);
  }
}
