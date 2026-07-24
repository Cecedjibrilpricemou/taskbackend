import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../config/db';

import { AuthPayload, UtilisateurAvecMotDePasse, UtilisateurPublic } from '../types/entities';

// Erreur dédiée à l'authentification, locale à ce fichier -- historique :
// c'est le tout premier service écrit sur ce projet, avant que le pattern
// générique ErreurMetier (voir utils/errors.ts) n'existe. authController.ts
// utilise encore `err instanceof AuthError` avec cette classe locale ; ça
// fonctionne (vérifié), donc ce n'est pas un bug, juste une petite
// incohérence historique avec le reste du code qui utilise
// ErreurMetier/estErreurMetier. Pas urgent à unifier, mais à savoir si tu
// touches à ce fichier.
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
  // Une procédure appelée via CALL renvoie un tableau de result sets ;
  // resultats[0] est le premier (et ici unique) SELECT de la procédure,
  // resultats[0][0] la première ligne (ou undefined si aucun match).
  return resultats[0][0];
}

// Vérifie email + mot de passe, met à jour la date de dernière connexion,
// et renvoie un JWT + le profil public (sans le hash) en cas de succès.
export async function login(email: string, motDePasse: string): Promise<ResultatConnexion> {
  const utilisateur = await trouverParEmail(email);

  if (!utilisateur) {
    throw new AuthError(401, 'Identifiants invalides');
  }

  if (utilisateur.statut !== 'actif') {
    throw new AuthError(403, "Ce compte est bloqué ou désactivé. Contactez l'administrateur.");
  }

  // Le mot de passe n'est JAMAIS comparé côté SQL : la procédure renvoie
  // le hash bcrypt, et c'est ici, côté Node, que bcrypt.compare vérifie
  // le mot de passe en clair envoyé par le client contre ce hash.
  const motDePasseValide = await bcrypt.compare(motDePasse, utilisateur.mot_de_passe);
  if (!motDePasseValide) {
    throw new AuthError(401, 'Identifiants invalides');
  }

  await pool.query('CALL sp_enregistrer_connexion(?)', [utilisateur.id]);

  const payload: AuthPayload = { id: utilisateur.id, role: utilisateur.role };
  const token = jwt.sign(payload, process.env.JWT_SECRET as string, {
    expiresIn: (process.env.JWT_EXPIRES_IN || '8h') as any,
  });

  // On retire le hash avant de renvoyer l'utilisateur au client.
  const { mot_de_passe, ...utilisateurPublic } = utilisateur;

  return { token, utilisateur: utilisateurPublic };
}

export function estUneAuthError(err: unknown): err is AuthError {
  return typeof err === 'object' && err !== null && (err as any).isAuthError === true;
}
