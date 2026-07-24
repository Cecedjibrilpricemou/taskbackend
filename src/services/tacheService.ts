import pool from '../config/db';
import { ErreurMetier, relancerErreurSignalMysql, estErreurContrainteFk } from '../utils/errors';
import { Tache, StatutTache, PrioriteTache } from '../types/entities';

interface CreerTacheInput {
  titre: string;
  description?: string;
  priorite: PrioriteTache;
  dateEcheance?: string;
}

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
    relancerErreurSignalMysql(err, 400);
  }
  const [rows]: any = await pool.query('SELECT @nouvel_id AS id');
  return rows[0].id;
}

interface ListerTachesFiltres {
  statut?: StatutTache;
  priorite?: PrioriteTache;
}

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
    await pool.query('CALL sp_attribuer_tache(?, ?, ?)', [tacheId, idsConcat, effectuePar]);
  } catch (err) {
    if (estErreurContrainteFk(err)) {
      throw new ErreurMetier(404, 'Tâche introuvable');
    }
    relancerErreurSignalMysql(err, 400);
  }
}

export async function supprimerTache(tacheId: number, effectuePar: number): Promise<void> {
  try {
    await pool.query('CALL sp_supprimer_tache(?, ?)', [tacheId, effectuePar]);
  } catch (err) {
    relancerErreurSignalMysql(err, 400);
  }
}

export async function listerMesTaches(utilisateurId: number): Promise<Tache[]> {
  const [rows]: any = await pool.query('CALL sp_lister_taches_utilisateur(?)', [utilisateurId]);
  return rows[0] as Tache[];
}

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
