export type Role = 'admin' | 'utilisateur';
export type StatutUtilisateur = 'actif' | 'bloque' | 'desactive';

export interface UtilisateurAvecMotDePasse {
  id: number;
  nom: string;
  prenom: string;
  email: string;
  mot_de_passe: string;
  role: Role;
  statut: StatutUtilisateur;
}

export interface UtilisateurPublic {
  id: number;
  nom: string;
  prenom: string;
  email: string;
  role: Role;
  statut: StatutUtilisateur;
}

export interface AuthPayload {
  id: number;
  role: Role;
}

export type StatutTache = 'a_faire' | 'en_cours' | 'terminee';
export type PrioriteTache = 'basse' | 'moyenne' | 'haute';

export interface Tache {
  id: number;
  titre: string;
  description: string | null;
  statut: StatutTache;
  priorite: PrioriteTache;
  date_creation: Date;
  date_echeance: Date | null;
  date_terminee: Date | null;
  cree_par: number;
  cree_par_nom: string;
  nb_assignes: number;
  utilisateurs_assignes_ids: string | null;
  utilisateurs_assignes_noms: string | null;
}

export interface Notification {
  id: number;
  tache_id: number;
  message: string;
  lue: boolean;
  date_creation: Date;
}

export interface KpiSynthese {
  total_taches: number;
  taches_terminees: number;
  taches_a_faire: number;
  taches_en_cours: number;
  taches_en_retard: number;
  utilisateurs_actifs: number;
  utilisateurs_bloques: number;
  utilisateurs_desactives: number;
}

export interface KpiParStatut {
  statut: StatutTache;
  total: number;
}

export interface KpiParPriorite {
  priorite: PrioriteTache;
  total: number;
}

export interface KpiTacheEnRetard {
  id: number;
  titre: string;
  date_echeance: Date | null;
  priorite: PrioriteTache;
}

export interface KpiChargeUtilisateur {
  utilisateur_id: number;
  utilisateur_nom: string;
  statut_utilisateur: StatutUtilisateur;
  nb_taches_actives: number;
}
