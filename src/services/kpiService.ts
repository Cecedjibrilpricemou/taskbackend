import pool from '../config/db';
import {
  KpiSynthese,
  KpiParStatut,
  KpiParPriorite,
  KpiTacheEnRetard,
  KpiChargeUtilisateur,
} from '../types/entities';

export interface KpisComplets {
  synthese: KpiSynthese;
  parStatut: KpiParStatut[];
  parPriorite: KpiParPriorite[];
  enRetard: KpiTacheEnRetard[];
  chargeUtilisateurs: KpiChargeUtilisateur[];
}

// Les 5 vues KPI sont globales (pas de filtre par utilisateur courant),
// donc de simples SELECT sur des vues suffisent -- pas besoin de
// procédure stockée ici. Récupérées en parallèle via Promise.all puisque
// les 5 requêtes sont indépendantes.
export async function obtenirKpis(): Promise<KpisComplets> {
  const [
    [syntheseRows],
    [parStatut],
    [parPriorite],
    [enRetard],
    [chargeUtilisateurs],
  ] = await Promise.all([
    pool.query('SELECT * FROM v_kpi_synthese'),
    pool.query('SELECT * FROM v_kpi_taches_par_statut'),
    pool.query('SELECT * FROM v_kpi_taches_par_priorite'),
    pool.query('SELECT * FROM v_kpi_taches_en_retard'),
    pool.query('SELECT * FROM v_kpi_charge_utilisateurs'),
  ]);

  return {
    // v_kpi_synthese renvoie toujours exactement une ligne (agrégats globaux).
    synthese: (syntheseRows as KpiSynthese[])[0],
    parStatut: parStatut as KpiParStatut[],
    parPriorite: parPriorite as KpiParPriorite[],
    enRetard: enRetard as KpiTacheEnRetard[],
    chargeUtilisateurs: chargeUtilisateurs as KpiChargeUtilisateur[],
  };
}
