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
    synthese: (syntheseRows as KpiSynthese[])[0],
    parStatut: parStatut as KpiParStatut[],
    parPriorite: parPriorite as KpiParPriorite[],
    enRetard: enRetard as KpiTacheEnRetard[],
    chargeUtilisateurs: chargeUtilisateurs as KpiChargeUtilisateur[],
  };
}
