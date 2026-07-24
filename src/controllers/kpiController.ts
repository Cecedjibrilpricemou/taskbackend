import { Request, Response } from 'express';
import { obtenirKpis } from '../services/kpiService';

// GET /api/kpis (admin uniquement, voir routes/kpiRoutes.ts) -- renvoie
// les 5 blocs (synthese, parStatut, parPriorite, enRetard, chargeUtilisateurs)
// à plat au même niveau que `status`, pas imbriqués sous une clé "kpis".
export async function obtenirKpisController(req: Request, res: Response) {
  try {
    const kpis = await obtenirKpis();
    res.json({ status: 'ok', ...kpis });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'erreur', message: 'Erreur serveur' });
  }
}
