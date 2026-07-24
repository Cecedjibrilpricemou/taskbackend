import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../config/db';

import { AuthPayload, UtilisateurAvecMotDePasse, UtilisateurPublic } from '../types/entities';

export class AuthError extends Error {
  public readonly isAuthError = true as const;

  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

interface ResultatConnexion {
  token: string;
  utilisateur: UtilisateurPublic;
}

async function trouverParEmail(email: string): Promise<UtilisateurAvecMotDePasse | undefined> {
  const [resultats]: any = await pool.query('CALL sp_utilisateur_par_email(?)', [email]);
  return resultats[0][0];
}

export async function login(email: string, motDePasse: string): Promise<ResultatConnexion> {
  const utilisateur = await trouverParEmail(email);

  if (!utilisateur) {
    throw new AuthError(401, 'Identifiants invalides');
  }

  if (utilisateur.statut !== 'actif') {
    throw new AuthError(403, "Ce compte est bloqué ou désactivé. Contactez l'administrateur.");
  }

  const motDePasseValide = await bcrypt.compare(motDePasse, utilisateur.mot_de_passe);
  if (!motDePasseValide) {
    throw new AuthError(401, 'Identifiants invalides');
  }

  await pool.query('CALL sp_enregistrer_connexion(?)', [utilisateur.id]);

  const payload: AuthPayload = { id: utilisateur.id, role: utilisateur.role };
  const token = jwt.sign(payload, process.env.JWT_SECRET as string, {
    expiresIn: (process.env.JWT_EXPIRES_IN || '8h') as any,
  });

  const { mot_de_passe, ...utilisateurPublic } = utilisateur;

  return { token, utilisateur: utilisateurPublic };
}

export function estUneAuthError(err: unknown): err is AuthError {
  return typeof err === 'object' && err !== null && (err as any).isAuthError === true;
}