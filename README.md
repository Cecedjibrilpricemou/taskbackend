# TaskManager — Backend

API REST pour une application de gestion de tâches avec deux rôles : **admin** (gère utilisateurs et tâches) et **utilisateur** (voit et fait évoluer uniquement ses tâches attribuées).

## Stack

- **Node.js** + **TypeScript** + **Express 5**
- **MySQL** (compatible MariaDB 10.4+), pilotée via `mysql2`
- Authentification par **JWT**, mots de passe hachés avec **bcrypt**

## Prérequis

- Node.js 18+
- Un serveur MySQL/MariaDB (XAMPP, MySQL natif, etc.)

## Installation

```bash
npm install
```

## Configuration

Copier `.env.example` en `.env` et renseigner :

```
DB_HOST=localhost
DB_PORT=3306
DB_NAME=TaskManager
DB_USER=app_taskmanager
DB_PASSWORD=
JWT_SECRET=une_longue_chaine_aleatoire
JWT_EXPIRES_IN=8h
PORT=3000
```

## Base de données

Le script `schema.sql` crée tout : base, tables, contraintes, vues, procédures stockées, compte applicatif restreint, et un compte admin d'amorçage (identifiants dans les commentaires du script — **à changer dès la première connexion**).

Import via phpMyAdmin (onglet *Importer*) ou en ligne de commande :

```bash
mysql -u root < schema.sql
```

### Règle d'architecture : vues et procédures uniquement

Le backend ne fait **jamais** de `SELECT`/`INSERT`/`UPDATE`/`DELETE` direct sur une table. Tout accès passe par :
- une **vue** (`v_...`) pour la lecture,
- une **procédure stockée** (`sp_...`) pour l'écriture, et pour toute lecture filtrée par l'utilisateur courant.

C'est renforcé au niveau du moteur : le compte MySQL utilisé par l'application, `app_taskmanager`, n'a **aucun droit direct sur les tables** — uniquement `SELECT` sur les vues et `EXECUTE` sur les procédures (`GRANT` définis en fin de `schema.sql`).

> ⚠️ Si une procédure est corrigée via `DROP PROCEDURE` + `CREATE PROCEDURE`, le `GRANT EXECUTE` de `app_taskmanager` sur cet objet est perdu et doit être redonné manuellement (MySQL ne le restaure pas automatiquement pour un objet recréé sous le même nom).

## Lancer le projet

```bash
npm run dev     # tsx watch — rechargement à chaud
npm run build   # compilation TypeScript -> dist/
npm run start   # exécute dist/app.js (après build)
```

## Architecture

```
src/
├── app.ts                    → point d'entrée Express, montage des routes
├── config/db.ts              → pool mysql2
├── types/entities.ts         → interfaces partagées (Utilisateur, Tache, Notification, Kpi...)
├── utils/errors.ts           → ErreurMetier + estErreurMetier + helpers de relais d'erreurs MySQL
├── middlewares/authMiddleware.ts → authentifier (JWT), autoriser(...roles)
├── services/                 → logique métier, seul endroit qui appelle pool.query
├── controllers/               → req/res, codes HTTP, validation d'entrée
└── routes/                    → déclaration des routes + middlewares
```

Chaque domaine (auth, compte, tâches, notifications, utilisateurs, kpis) suit le même découpage **route → controller → service**.

### Gestion d'erreurs

```typescript
import { ErreurMetier, estErreurMetier } from './utils/errors';

// dans un service :
throw new ErreurMetier(404, 'Tâche introuvable');

// dans un controller :
if (estErreurMetier(err)) {
  res.status(err.statusCode).json({ status: 'erreur', message: err.message });
  return;
}
```

Les erreurs `SIGNAL` levées par les procédures stockées (violations de règles métier) sont automatiquement relayées en `ErreurMetier` via `relancerErreurSignalMysql`, plutôt que de remonter en 500 générique.

### Sécurité

- Chaque route protégée applique **authentifier** (vérifie le JWT) **et** **autoriser(...rôles)** — jamais l'un sans l'autre.
- Mots de passe hachés avec bcrypt côté Node.js ; aucune procédure SQL ne compare ou ne stocke un mot de passe en clair.
- Un utilisateur ne peut modifier que son propre mot de passe, et son statut de tâche que s'il y est réellement assigné (vérifié à la fois côté Node.js et côté procédure stockée, défense en profondeur).

## Endpoints

| Méthode | Route | Accès | Description |
|---|---|---|---|
| GET | `/api/health` | public | ping |
| POST | `/api/auth/login` | public | `{ email, motDePasse }` → `{ token, utilisateur }` |
| GET | `/api/auth/me` | connecté | profil de l'utilisateur courant |
| PATCH | `/api/auth/mot-de-passe` | connecté | `{ ancienMotDePasse, nouveauMotDePasse }` (≥ 8 caractères), uniquement le sien |
| GET | `/api/utilisateurs` | admin | liste des utilisateurs |
| POST | `/api/utilisateurs` | admin | `{ nom, prenom, email, motDePasse }` — 409 si email déjà utilisé |
| PATCH | `/api/utilisateurs/:id/statut` | admin | `{ statut: "actif"\|"bloque"\|"desactive" }` |
| POST | `/api/taches` | admin | `{ titre, description?, priorite, dateEcheance? }` |
| GET | `/api/taches` | admin | liste globale, filtrable par `?statut=` et `?priorite=` |
| PATCH | `/api/taches/:id` | admin | modifie une tâche (jamais son statut) |
| POST | `/api/taches/:id/attribution` | admin | `{ utilisateurIds: number[] }` — remplace la liste d'assignés |
| DELETE | `/api/taches/:id` | admin | suppression logique |
| GET | `/api/taches/mes-taches` | utilisateur | tâches attribuées à l'utilisateur connecté |
| PATCH | `/api/taches/:id/statut` | utilisateur | `{ statut }`, uniquement si l'utilisateur est assigné |
| GET | `/api/notifications` | connecté | notifications de l'utilisateur courant |
| PATCH | `/api/notifications/:id/lue` | connecté | marque une notification comme lue |
| GET | `/api/kpis` | admin | synthèse + répartitions agrégées (statut, priorité, retard, charge par utilisateur) |

Toutes les réponses suivent l'enveloppe `{ status: 'ok' | 'erreur', ... }`.

## État du projet

Fonctionnellement complet : tous les endpoints ci-dessus existent et ont été testés (cas de succès et cas d'erreur : token manquant, mauvais rôle, données invalides, ressource introuvable, etc.).

Reste à faire, non bloquant :
- Validation d'entrée centralisée (`zod` ou `express-validator`) — actuellement des vérifications manuelles dans les contrôleurs.
- Suite de tests automatisée — les tests existants sont des vérifications manuelles, pas une suite CI.
- Filtres supplémentaires sur `GET /api/taches` (par utilisateur assigné, recherche texte) — seuls `statut` et `priorite` sont filtrables actuellement.

Prochaine étape naturelle : le frontend Angular (dépôt séparé `taskfrontend`).
