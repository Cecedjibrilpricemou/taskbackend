// Interfaces partagées par tout le backend. Elles reflètent la forme
// EXACTE des colonnes renvoyées par les vues et procédures MySQL (voir
// schema.sql) -- pas une convention de nommage arbitraire. D'où le mélange
// français/snake_case qui suit directement les noms de colonnes SQL.

export type Role = 'admin' | 'utilisateur';
export type StatutUtilisateur = 'actif' | 'bloque' | 'desactive';

// Forme brute renvoyée par sp_utilisateur_par_id / sp_utilisateur_par_email,
// utilisée uniquement en interne pour la vérification du mot de passe.
// Ne jamais renvoyer cet objet tel quel au client (contient le hash).
export interface UtilisateurAvecMotDePasse {
  id: number;
  nom: string;
  prenom: string;
  email: string;
  mot_de_passe: string;
  role: Role;
  statut: StatutUtilisateur;
}

// Version sans mot de passe, celle qu'on renvoie réellement au client
// (ex: dans la réponse de /api/auth/login).
export interface UtilisateurPublic {
  id: number;
  nom: string;
  prenom: string;
  email: string;
  role: Role;
  statut: StatutUtilisateur;
}

// Contenu du JWT signé à la connexion (voir authService.login).
export interface AuthPayload {
  id: number;
  role: Role;
}

export type StatutTache = 'a_faire' | 'en_cours' | 'terminee';
export type PrioriteTache = 'basse' | 'moyenne' | 'haute';

// Correspond à une ligne de v_taches_liste (liste globale, admin).
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
