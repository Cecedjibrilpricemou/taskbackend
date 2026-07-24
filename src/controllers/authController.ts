import { Request, Response } from 'express';
import { login, AuthError } from '../services/authService';
import pool from '../config/db';

// Toutes les réponses de l'API suivent l'enveloppe { status: 'ok' | 'erreur', ... }.
export async function loginController(req: Request, res: Response) {
  const { email, motDePasse } = req.body;

  if (!email || !motDePasse) {
    res.status(400).json({ status: 'erreur', message: 'Email et mot de passe requis' });
    return;
  }

  try {
    const resultat = await login(email, motDePasse);
    res.json({ status: 'ok', ...resultat });
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
