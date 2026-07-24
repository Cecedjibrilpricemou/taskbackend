import bcrypt from 'bcryptjs';
import pool from '../config/db';
import { UtilisateurPublic, StatutUtilisateur } from '../types/entities';
import { ErreurMetier } from '../utils/errors';

export async function listerUtilisateurs(): Promise<UtilisateurPublic[]> {
  const [rows]: any = await pool.query('SELECT * FROM v_utilisateurs');
  return rows;
}

export async function creerUtilisateur(
  nom: string, prenom: string, email: string, motDePasse: string
): Promise<number> {
  const hash = await bcrypt.hash(motDePasse, 10);
  try {
    await pool.query('CALL sp_creer_utilisateur(?, ?, ?, ?, @nouvel_id)', [nom, prenom, email, hash]);
    const [rows]: any = await pool.query('SELECT @nouvel_id AS id');
    return rows[0].id;
  } catch (err: any) {
    if (err?.sqlState === '45000') {
      throw new ErreurMetier(409, err.sqlMessage || 'Cet email est déjà utilisé');
    }
    throw err;
  }
}

const STATUTS_VALIDES: StatutUtilisateur[] = ['actif', 'bloque', 'desactive'];

export async function changerStatutUtilisateur(id: number, statut: string): Promise<void> {
  if (!STATUTS_VALIDES.includes(statut as StatutUtilisateur)) {
    throw new ErreurMetier(400, 'Statut invalide (actif, bloque ou desactive attendu)');
  }
  await pool.query('CALL sp_changer_statut_utilisateur(?, ?)', [id, statut]);
}
