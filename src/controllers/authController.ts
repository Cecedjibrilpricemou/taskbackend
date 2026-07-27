import { Request, Response } from 'express';
import { login, AuthError } from '../services/authService';
import pool from '../config/db';
import { dureeEnMs } from '../utils/duree';

// Options du cookie JWT, partagées entre la pose (login) et la suppression
// (logout) -- clearCookie ne fonctionne que si les options (hors maxAge/
// expires) correspondent exactement à celles utilisées lors de la pose.
// `secure` est conditionnel à l'environnement : mis en dur à true, le
// cookie ne serait jamais envoyé en HTTP local (XAMPP/localhost, pas de
// HTTPS), et l'authentification semblerait cassée sans aucun message
// d'erreur clair côté client.
const OPTIONS_COOKIE_TOKEN = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
};

// Toutes les réponses de l'API suivent l'enveloppe { status: 'ok' | 'erreur', ... }.
export async function loginController(req: Request, res: Response) {
  const { email, motDePasse } = req.body;

  if (!email || !motDePasse) {
    res.status(400).json({ status: 'erreur', message: 'Email et mot de passe requis' });
    return;
  }

  try {
    const { token, utilisateur } = await login(email, motDePasse);
    res.cookie('token', token, {
      ...OPTIONS_COOKIE_TOKEN,
      maxAge: dureeEnMs(process.env.JWT_EXPIRES_IN || '8h'),
    });
    res.json({ status: 'ok', utilisateur });
  } catch (err) {
    // Voir services/authService.ts pour le pourquoi de cet `instanceof`
    // (ça fonctionne ici, mais ce n'est pas le pattern recommandé ailleurs).
    if (err instanceof AuthError) {
      res.status(err.statusCode).json({ status: 'erreur', message: err.message });
      return;
    }
    console.error(err);
    res.status(500).json({ status: 'erreur', message: 'Erreur serveur' });
  }
}

// Le frontend ne peut pas supprimer lui-même un cookie httpOnly (invisible
// en JavaScript) -- cette route est donc indispensable, pas un simple
// confort.
export function logoutController(req: Request, res: Response) {
  res.clearCookie('token', OPTIONS_COOKIE_TOKEN);
  res.json({ status: 'ok' });
}

// Profil de l'utilisateur actuellement connecté (déduit du JWT, pas d'un
// paramètre d'URL) -- il est donc impossible de consulter le profil d'un
// tiers via cette route.
export async function meController(req: Request, res: Response) {
  try {
    const [resultats]: any = await pool.query('CALL sp_utilisateur_par_id(?)', [req.user!.id]);
    const utilisateur = resultats[0][0];
    if (!utilisateur) {
      res.status(404).json({ status: 'erreur', message: 'Utilisateur introuvable' });
      return;
    }
    const { mot_de_passe, ...utilisateurPublic } = utilisateur;
    res.json({ status: 'ok', utilisateur: utilisateurPublic });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'erreur', message: 'Erreur serveur' });
  }
}
