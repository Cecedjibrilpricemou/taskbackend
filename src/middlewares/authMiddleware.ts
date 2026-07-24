import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthPayload, Role } from '../types/entities';

// Augmente le type Request d'Express pour pouvoir stocker l'utilisateur
// décodé du JWT sur `req.user`, rempli par `authentifier` ci-dessous et
// lu par tous les controllers protégés (`req.user!.id`, `req.user!.role`).
declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

// Vérifie le header `Authorization: Bearer <token>` et remplit req.user.
// À poser sur toute route qui nécessite d'être connecté, avant `autoriser`
// si un contrôle de rôle est aussi nécessaire.
export function authentifier(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ status: 'erreur', message: 'Token manquant' });
    return;
  }

  const token = authHeader.substring(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET as string) as AuthPayload;
    req.user = payload;
    next();
  } catch (err) {
    res.status(401).json({ status: 'erreur', message: 'Token invalide ou expiré' });
  }
}

// Factory de middleware : autoriser('admin') ou autoriser('admin', 'utilisateur').
// Doit toujours être posé APRÈS `authentifier` (dépend de req.user). Le
// contrôle de rôle est fait ici côté serveur -- ne jamais compter
// uniquement sur un garde côté frontend pour la sécurité réelle.
export function autoriser(...rolesAutorises: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !rolesAutorises.includes(req.user.role)) {
      res.status(403).json({ status: 'erreur', message: 'Accès refusé' });
      return;
    }
    next();
  };
}
