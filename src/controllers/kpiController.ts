import { Request, Response } from 'express';
import { obtenirKpis } from '../services/kpiService';

export async function obtenirKpisController(req: Request, res: Response) {
  try {
    const kpis = await obtenirKpis();
    res.json({ status: 'ok', ...kpis });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'erreur', message: 'Erreur serveur' });
  }
}
