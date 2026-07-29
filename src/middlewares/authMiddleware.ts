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

// Partagée avec le handshake WebSocket (src/realtime/socket.ts), qui vérifie
// le même cookie httpOnly `token` mais en dehors du pipeline de middlewares
// Express -- d'où l'extraction, pour ne pas dupliquer jwt.verify(...).
export function verifierJwt(token: string): AuthPayload {
  return jwt.verify(token, process.env.JWT_SECRET as string) as AuthPayload;
}

// Vérifie le cookie httpOnly `token` et remplit req.user. À poser sur
// toute route qui nécessite d'être connecté, avant `autoriser` si un
// contrôle de rôle est aussi nécessaire.
export function authentifier(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.token;
  if (!token) {
    res.status(401).json({ status: 'erreur', message: 'Token manquant' });
    return;
  }

  try {
    req.user = verifierJwt(token);
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
