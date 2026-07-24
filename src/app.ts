import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response } from 'express';
import cors from 'cors';
import pool from './config/db';
import authRoutes from './routes/authRoutes';
import compteRoutes from './routes/compteRoutes';
import tacheRoutes from './routes/tacheRoutes';
import notificationRoutes from './routes/notificationRoutes';
import kpiRoutes from './routes/kpiRoutes';
import utilisateurRoutes from './routes/utilisateurRoutes';

const app = express();
app.use(cors());
app.use(express.json());


app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'Backend TaskManager operationnel' });
});

app.get('/api/db-test', async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query('SELECT id, nom, prenom, role FROM v_utilisateurs');
    res.json({ status: 'ok', utilisateurs: rows });
  } catch (err: any) {
    res.status(500).json({ status: 'erreur', message: err.message });
  }
});
app.use('/api/auth', authRoutes);
app.use('/api/auth', compteRoutes);
app.use('/api/taches', tacheRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/kpis', kpiRoutes);
app.use('/api/utilisateurs', utilisateurRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Serveur demarre sur le port ${PORT}`));
