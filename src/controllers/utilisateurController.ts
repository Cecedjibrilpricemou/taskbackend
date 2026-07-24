import { Request, Response } from 'express';
import * as utilisateurService from '../services/utilisateurService';
import { estErreurMetier } from '../utils/errors';

// Toutes les routes de ce controller sont réservées à l'admin (voir
// routes/utilisateurRoutes.ts, `router.use(authentifier, autoriser('admin'))`
// posé une seule fois pour tout le routeur).

export async function listerController(req: Request, res: Response) {
  try {
    const utilisateurs = await utilisateurService.listerUtilisateurs();
    res.json({ status: 'ok', utilisateurs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'erreur', message: 'Erreur serveur' });
  }
}

// Crée uniquement des comptes de rôle 'utilisateur' -- voir le commentaire
// dans services/utilisateurService.creerUtilisateur pour le pourquoi.
export async function creerController(req: Request, res: Response) {
  const { nom, prenom, email, motDePasse } = req.body;
  if (!nom || !prenom || !email || !motDePasse) {
    res.status(400).json({ status: 'erreur', message: 'Nom, prenom, email et motDePasse sont requis' });
    return;
  }
  if (motDePasse.length < 8) {
    res.status(400).json({ status: 'erreur', message: 'Le mot de passe doit contenir au moins 8 caracteres' });
    return;
  }
  try {
    const id = await utilisateurService.creerUtilisateur(nom, prenom, email, motDePasse);
    res.status(201).json({ status: 'ok', id });
  } catch (err) {
    if (estErreurMetier(err)) {
      res.status(err.statusCode).json({ status: 'erreur', message: err.message });
      return;
    }
    console.error(err);
    res.status(500).json({ status: 'erreur', message: 'Erreur serveur' });
  }
}

// Seul levier de gestion du cycle de vie d'un compte : pas de suppression
// physique, uniquement actif / bloque / desactive.
export async function changerStatutController(req: Request, res: Response) {
  const id = Number(req.params.id);
  const { statut } = req.body;
  if (!statut) {
    res.status(400).json({ status: 'erreur', message: 'Le champ statut est requis' });
    return;
  }
  try {
    await utilisateurService.changerStatutUtilisateur(id, statut);
    res.json({ status: 'ok', message: 'Statut mis a jour' });
  } catch (err) {
    if (estErreurMetier(err)) {
      res.status(err.statusCode).json({ status: 'erreur', message: err.message });
      return;
    }
    console.error(err);
    res.status(500).json({ status: 'erreur', message: 'Erreur serveur' });
  }
}
