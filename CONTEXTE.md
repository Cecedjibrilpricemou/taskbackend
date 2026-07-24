# TaskManager — État du projet

Application de gestion de tâches avec utilisateurs et rôles. Ce document est un état des lieux à jour : décisions prises, ce qui est fait, ce qui reste à faire, et les conventions à respecter absolument pour ne rien casser.

## 1. Vue d'ensemble

- **But** : gestion de tâches avec deux rôles stricts — `admin` (gère utilisateurs et tâches) et `utilisateur` (voit et fait évoluer uniquement ses tâches attribuées).
- **Stack** : Angular (frontend) · Node.js + TypeScript + Express (backend) · MySQL (base `TaskManager`, administrée via phpMyAdmin/XAMPP en local).
- **Deux dépôts GitHub séparés** (pas de monorepo) :
  - `taskbackend` — API Node/TypeScript
  - `taskfrontend` — Application Angular
- **Environnement de dev** : Windows + XAMPP (MySQL/phpMyAdmin) + Git Bash + Postman/Insomnia pour tester l'API.

## 2. Règle d'architecture absolue : vues et procédures uniquement

Le code Node.js **ne fait jamais** de `SELECT`/`INSERT`/`UPDATE`/`DELETE` directement sur une table. Tout accès passe par :
- une **vue** (`v_...`) pour la lecture,
- une **procédure stockée** (`sp_...`) pour l'écriture (et les lectures filtrées par utilisateur courant, qu'une vue ne peut pas paramétrer).

C'est renforcé au niveau du moteur, pas seulement par discipline de code : le backend se connecte avec un compte MySQL restreint, **`app_taskmanager`**, qui n'a **aucun droit direct sur les tables** — seulement `SELECT` sur les vues et `EXECUTE` sur les procédures (vérifié : un accès direct à une table renvoie une erreur MySQL "command denied"). En local, ce compte est sans mot de passe (cohérent avec `root` sur XAMPP) ; un mot de passe sera à remettre avant tout déploiement accessible depuis l'extérieur du poste.

Le schéma complet (tables, contraintes, vues, procédures, compte restreint) est dans `taskbackend/database/schema.sql`.

### Tables
`utilisateurs`, `taches`, `tache_utilisateur` (attribution N,N), `historique_taches` (audit), `notifications`.

### Vues (lecture, non paramétrées)
`v_utilisateurs`, `v_taches_liste`, `v_kpi_taches_par_statut`, `v_kpi_taches_par_priorite`, `v_kpi_taches_en_retard`, `v_kpi_charge_utilisateurs`, `v_kpi_synthese`.

### Procédures (écriture, ou lecture paramétrée par utilisateur courant)
`sp_creer_utilisateur`, `sp_utilisateur_par_id`, `sp_modifier_mot_de_passe`, `sp_utilisateur_par_email`, `sp_enregistrer_connexion`, `sp_changer_statut_utilisateur`, `sp_creer_tache`, `sp_attribuer_tache`, `sp_lister_notifications_utilisateur`, `sp_marquer_notification_lue`, `sp_modifier_tache`, `sp_modifier_statut_tache`, `sp_supprimer_tache`, `sp_lister_taches_utilisateur`.

## 3. Décisions métier à respecter (ne pas redemander, ne pas contredire)

1. **Un seul compte administrateur**, jamais recréable via l'app : `sp_creer_utilisateur` n'a pas de paramètre de rôle, elle ne crée que des `utilisateur`. L'admin existe uniquement via l'amorçage en base.
2. **Admin** : crée les utilisateurs et les tâches, attribue les tâches, supprime les tâches, modifie une tâche (sauf son statut), voit tout. Ne modifie **jamais** les informations d'un utilisateur après création (seulement son statut).
3. **Utilisateur standard** : voit uniquement ses tâches attribuées, ne modifie que leur **statut** (rien d'autre).
4. **Mot de passe personnel** : chacun (utilisateur ou admin) peut changer uniquement le sien. Personne ne modifie le mot de passe d'un tiers. → Conséquence acceptée : pas de récupération de mot de passe oublié pour l'instant (bonus futur : reset par email).
5. **Statut de tâche partagé** : si une tâche a plusieurs assignés, le statut est unique ; n'importe quel assigné peut le changer.
6. **Suppression logique (soft delete)** des tâches (`supprime`, `date_suppression`) — jamais de `DELETE` physique, pour préserver l'historique. Idem utilisateurs : pas de suppression physique, seulement changement de statut (`actif` / `bloque` / `desactive`).
7. **Blocage/désactivation** = perte totale d'accès (connexion refusée), mais les tâches restent attribuées en base (traçabilité).
8. **Notifications in-app uniquement** (pas d'email), créées **seulement** quand un utilisateur est réellement nouvellement assigné à une tâche (pas de doublon si la même liste d'assignés est resoumise) — logique déjà gérée dans `sp_attribuer_tache` via `FIND_IN_SET` + `ROW_COUNT()`.
9. **Mots de passe** : hachés avec bcrypt côté Node.js (jamais en SQL). Les procédures liées à l'authentification renvoient l'utilisateur (avec son hash) pour comparaison applicative ; elles ne vérifient jamais un mot de passe elles-mêmes.
10. **Sécurité en profondeur** : le contrôle de rôle doit être fait côté Angular (Guards, ergonomie) **ET** côté Node.js (middleware, sécurité réelle réellement appliquée) — jamais l'un sans l'autre.

## 4. Backend (`taskbackend`) — ce qui est fait

### Structure actuelle
```
taskbackend/
├── src/
│   ├── config/db.ts          → pool mysql2 (utilise app_taskmanager)
│   ├── types/entities.ts     → interfaces partagées (Role, StatutUtilisateur, Utilisateur..., AuthPayload)
│   ├── utils/errors.ts       → classe ErreurMetier + garde de type estErreurMetier
│   ├── middlewares/authMiddleware.ts → authentifier (verifie JWT), autoriser(...roles)
│   ├── services/
│   │   ├── authService.ts        → login()
│   │   └── utilisateurService.ts → listerUtilisateurs, creerUtilisateur, changerStatutUtilisateur
│   ├── controllers/
│   │   ├── authController.ts        → loginController, meController
│   │   └── utilisateurController.ts → listerController, creerController, changerStatutController
│   ├── routes/
│   │   ├── authRoutes.ts        → /api/auth/*
│   │   └── utilisateurRoutes.ts → /api/utilisateurs/* (protégées authentifier + autoriser('admin'))
│   └── app.ts
├── database/schema.sql
├── tsconfig.json   (module: "commonjs" + moduleResolution: "bundler" -- seule combinaison qui compile et s'execute proprement avec TypeScript 7 / tsx)
├── .env / .env.example
└── package.json    (scripts : dev = tsx watch, build = tsc, start = node dist/app.js)
```

### Convention d'erreurs (à réutiliser partout)
```typescript
import { ErreurMetier, estErreurMetier } from '../utils/errors';
throw new ErreurMetier(409, 'message clair');
// dans le controller :
if (estErreurMetier(err)) { res.status(err.statusCode).json({ status: 'erreur', message: err.message }); return; }
```
Note : authController.ts (le tout premier fichier écrit) utilise encore `instanceof AuthError` avec une classe locale à authService.ts -- ça fonctionne (vérifié empiriquement), ce n'est donc plus considéré comme un bug, juste une petite incohérence historique avec le reste du code qui utilise `ErreurMetier`/`estErreurMetier`. Pas urgent à unifier.

### Convention d'appel des procédures avec paramètre OUT
mysql2 ne mappe pas les OUT params nativement ; on passe par une variable de session SQL :
```typescript
await pool.query('CALL sp_creer_utilisateur(?, ?, ?, ?, @nouvel_id)', [nom, prenom, email, hash]);
const [rows]: any = await pool.query('SELECT @nouvel_id AS id');
const id = rows[0].id;
```

### Endpoints disponibles (tous testés : succès + cas d'erreur)

| Méthode | Route | Protection | Description |
|---|---|---|---|
| GET | `/api/health` | publique | ping |
| POST | `/api/auth/login` | publique | `{ email, motDePasse }` → `{ token, utilisateur }` |
| GET | `/api/auth/me` | JWT requis | infos de l'utilisateur connecté |
| PATCH | `/api/auth/mot-de-passe` | JWT requis | `{ ancienMotDePasse, nouveauMotDePasse }`, uniquement le sien |
| GET | `/api/utilisateurs` | admin | liste des utilisateurs |
| POST | `/api/utilisateurs` | admin | `{ nom, prenom, email, motDePasse }` (409 email dupliqué, 400 mot de passe < 8 caractères) |
| PATCH | `/api/utilisateurs/:id/statut` | admin | `{ statut: "actif"\|"bloque"\|"desactive" }` |
| POST | `/api/taches` | admin | crée une tâche |
| GET | `/api/taches` | admin | liste globale (v_taches_liste) |
| PATCH | `/api/taches/:id` | admin | modifie une tâche (jamais le statut) |
| POST | `/api/taches/:id/attribution` | admin | `{ utilisateurIds: number[] }` -- ⚠ voir section 9, GRANT à vérifier après tout correctif |
| DELETE | `/api/taches/:id` | admin | suppression logique |
| GET | `/api/taches/mes-taches` | utilisateur | tâches attribuées à l'utilisateur connecté |
| PATCH | `/api/taches/:id/statut` | utilisateur | `{ statut }`, uniquement si assigné |
| GET | `/api/notifications` | JWT requis | notifications de l'utilisateur connecté |
| PATCH | `/api/notifications/:id/lue` | JWT requis | marque comme lue |
| GET | `/api/kpis` | admin | synthèse + répartitions agrégées des vues v_kpi_* |

## 5. Backend — ce qui reste à faire

- **Validation d'entrée centralisée** : actuellement des vérifications manuelles dans les contrôleurs ; le cahier des charges recommande `express-validator` ou `zod` pour centraliser ça — pas encore fait.
- **Tests unitaires** : recommandés dans le cahier, pas encore écrits (les tests existants sont des vérifications manuelles via curl, pas une suite automatisée).
- **Filtres sur `GET /api/taches`** : statut/priorité/utilisateur/recherche texte -- pas encore ajoutés (query params à paramétrer en SQL).
- Sinon, le backend couvre fonctionnellement tout le cahier des charges. Prochaine étape naturelle : le frontend Angular.

## 6. Frontend (`taskfrontend`) — état

**Rien n'est fait à part le squelette généré par `ng new`** (routing activé, SSR désactivé). Aucun service, composant, guard ou page métier n'existe encore. Tout est à construire :
- Service HTTP + intercepteur JWT (attache le token, gère les 401 → redirection login)
- Guards de route (espace admin vs espace utilisateur, selon le rôle dans le token)
- Page de connexion
- Espace admin : liste utilisateurs + création + blocage, liste tâches + création + attribution + modification + suppression, tableau de bord KPIs
- Espace utilisateur : "mes tâches" + changement de statut, notifications
- Interfaces TypeScript alignées sur `taskbackend/src/types/entities.ts` (à dupliquer ou partager)
- Angular Material (ou Tailwind) pour l'UI — pas encore choisi/installé

## 7. Configuration locale (dev)

- Base : `TaskManager`, compte restreint `app_taskmanager` (pas de mot de passe en local)
- Compte admin de départ : `admin@gestion-taches.local` / *(mot de passe : voir gestionnaire de secrets de l'équipe, ne pas committer en clair)* (⚠ email historique, créé avant qu'on renomme le projet en TaskManager — encore l'email actif dans la base actuelle, ne pas le recréer)
- `taskbackend/.env` : `DB_HOST=localhost`, `DB_PORT=3306`, `DB_NAME=TaskManager`, `DB_USER=app_taskmanager`, `DB_PASSWORD=` (vide), `JWT_SECRET`, `JWT_EXPIRES_IN=8h`, `PORT=3000`

## 9. Piège opérationnel à ne pas reproduire

**Corriger une procédure via `DROP PROCEDURE` + `CREATE PROCEDURE` fait perdre le `GRANT EXECUTE` de `app_taskmanager` sur ce seul objet** (les autres procédures/vues, non touchées, gardent le leur). MySQL ne restaure pas automatiquement les privilèges d'un objet recréé sous le même nom. Réflexe à prendre systématiquement après tout correctif ciblé sur une procédure ou une vue :
```sql
GRANT EXECUTE ON PROCEDURE TaskManager.nom_de_la_procedure TO 'app_taskmanager'@'%';
-- ou, pour une vue : GRANT SELECT ON TaskManager.nom_de_la_vue TO 'app_taskmanager'@'%';
FLUSH PRIVILEGES;
```
(Un import complet et frais de `schema.sql` n'a pas ce problème : le script regrante tout à la fin. Le piège ne concerne que les correctifs ciblés sur un seul objet.)

## 10. Prochaine étape suggérée

Compléter le backend (mot de passe personnel → tâches → notifications → KPIs) avant d'attaquer le frontend, pour avoir une API complète à consommer d'un bloc.