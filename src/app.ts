// dotenv.config() doit s'exécuter avant tout autre import qui lit des
// variables d'environnement (ex: config/db.ts, JWT_SECRET dans les
// services) -- d'où sa position tout en haut du fichier.
import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import pool from './config/db';
import authRoutes from './routes/authRoutes';
import compteRoutes from './routes/compteRoutes';
import tacheRoutes from './routes/tacheRoutes';
import notificationRoutes from './routes/notificationRoutes';
import kpiRoutes from './routes/kpiRoutes';
import utilisateurRoutes from './routes/utilisateurRoutes';

const app = express();
// origin doit être une valeur exacte : un cookie posé avec `credentials`
// ne peut pas fonctionner avec un wildcard ('*') -- règle imposée par le
// navigateur, pas une option côté serveur.
app.use(cors({ origin: 'http://localhost:4200', credentials: true }));
app.use(express.json());
app.use(cookieParser());


// Ping simple, sans dépendance à la base -- utile pour vérifier que le
// serveur répond avant même de tester la connexion MySQL.
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'Backend TaskManager operationnel' });
});

// Endpoint de diagnostic pour vérifier rapidement la connexion MySQL et
// les droits du compte app_taskmanager sur la vue v_utilisateurs. Pas
// utilisé par le frontend, utile en dev/débogage uniquement.
app.get('/api/db-test', async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query('SELECT id, nom, prenom, role FROM v_utilisateurs');
    res.json({ status: 'ok', utilisateurs: rows });
  } catch (err: any) {
    res.status(500).json({ status: 'erreur', message: err.message });
  }
});

// authRoutes (login/me) et compteRoutes (mot de passe) sont deux routeurs
// distincts montés sur le même préfixe /api/auth -- volontaire, pour ne
// pas mélanger les responsabilités "authentification" et "compte perso"
// dans un même fichier.
app.use('/api/auth', authRoutes);
app.use('/api/auth', compteRoutes);
app.use('/api/taches', tacheRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/kpis', kpiRoutes);
app.use('/api/utilisateurs', utilisateurRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Serveur demarre sur le port ${PORT}`));
