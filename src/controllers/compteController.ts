import { Request, Response } from 'express';
import { changerMotDePasse } from '../services/compteService';
import { estErreurMetier } from '../utils/errors';

export async function changerMotDePasseController(req: Request, res: Response) {
  const { ancienMotDePasse, nouveauMotDePasse } = req.body;

  if (!ancienMotDePasse || !nouveauMotDePasse) {
    res.status(400).json({ status: 'erreur', message: 'ancienMotDePasse et nouveauMotDePasse requis' });
    return;
  }

  try {
    await changerMotDePasse(req.user!.id, ancienMotDePasse, nouveauMotDePasse);
    res.json({ status: 'ok', message: 'Mot de passe modifié avec succès' });
  } catch (err) {
    if (estErreurMetier(err)) {
      res.status(err.statusCode).json({ status: 'erreur', message: err.message });
      return;
    }
    console.error(err);
    res.status(500).json({ status: 'erreur', message: 'Erreur serveur' });
  }
}
