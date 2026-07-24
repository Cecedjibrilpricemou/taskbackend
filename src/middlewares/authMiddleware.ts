import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthPayload, Role } from '../types/entities';

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

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

export function autoriser(...rolesAutorises: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !rolesAutorises.includes(req.user.role)) {
      res.status(403).json({ status: 'erreur', message: 'Accès refusé' });
      return;
    }
    next();
  };
}