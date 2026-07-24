import bcrypt from 'bcryptjs';
import pool from '../config/db';
import { UtilisateurPublic, StatutUtilisateur } from '../types/entities';
import { ErreurMetier } from '../utils/errors';

export async function listerUtilisateurs(): Promise<UtilisateurPublic[]> {
  const [rows]: any = await pool.query('SELECT * FROM v_utilisateurs');
  return rows;
}

// sp_creer_utilisateur n'a pas de paramètre de rôle : elle ne crée QUE
// des comptes de rôle 'utilisateur'. C'est une décision métier assumée --
// il n'existe qu'un seul compte admin, créé une fois pour toutes lors de
// l'amorçage de la base (voir schema.sql), jamais recréable via l'API.
export async function creerUtilisateur(
  nom: string, prenom: string, email: string, motDePasse: string
): Promise<number> {
  const hash = await bcrypt.hash(motDePasse, 10);
  try {
    // Paramètre OUT (@nouvel_id) : voir le commentaire équivalent dans
    // tacheService.creerTache pour le détail de ce pattern.
    await pool.query('CALL sp_creer_utilisateur(?, ?, ?, ?, @nouvel_id)', [nom, prenom, email, hash]);
    const [rows]: any = await pool.query('SELECT @nouvel_id AS id');
    return rows[0].id;
  } catch (err: any) {
    // sqlState 45000 = SIGNAL levé par la procédure quand l'email existe
    // déjà (contrainte UNIQUE sur utilisateurs.email) -> 409 Conflict.
    if (err?.sqlState === '45000') {
      throw new ErreurMetier(409, err.sqlMessage || 'Cet email est déjà utilisé');
    }
    throw err;
  }
}

const STATUTS_VALIDES: StatutUtilisateur[] = ['actif', 'bloque', 'desactive'];

// Un utilisateur bloqué/désactivé perd tout accès (connexion refusée dès
// authService.login), mais ses tâches restent attribuées en base pour
// la traçabilité -- pas de suppression, seulement un changement de statut.
export async function changerStatutUtilisateur(id: number, statut: string): Promise<void> {
  if (!STATUTS_VALIDES.includes(statut as StatutUtilisateur)) {
    throw new ErreurMetier(400, 'Statut invalide (actif, bloque ou desactive attendu)');
  }
  await pool.query('CALL sp_changer_statut_utilisateur(?, ?)', [id, statut]);
}
