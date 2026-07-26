# TaskManager — Documentation technique complète

Support de soutenance : base de données, backend, frontend. Chaque section explique le "pourquoi", pas seulement le "quoi", avec du code réel et des exemples concrets à raconter à l'oral.

---

## 1. Vue d'ensemble du projet

**But** : application de gestion de tâches avec deux rôles — **admin** (gère les utilisateurs et les tâches, attribue, supprime) et **utilisateur standard** (voit et fait évoluer uniquement ses tâches attribuées).

**Stack** :
- Base de données : MySQL, avec un compte applicatif restreint et un accès exclusivement par vues/procédures (voir section 2).
- Backend : Node.js + TypeScript + Express, API REST consommée par le frontend.
- Frontend : Angular 21 + Angular Material, deux espaces distincts selon le rôle.

**Deux dépôts séparés** (pas de monorepo) :
- `taskbackend` — l'API
- `taskfrontend` — l'application Angular

Le frontend ne parle jamais directement à la base : il appelle uniquement l'API du backend, qui elle-même n'accède jamais directement aux tables (uniquement vues/procédures). Trois couches, chacune ne connaît que celle juste en dessous.

---

## 2. Base de données

> Section fournie telle quelle par l'auteur du projet — seule la numérotation des sous-titres a été adaptée pour s'intégrer au document final (2.1 à 2.5 au lieu de 1 à 5). Le contenu n'a pas été réécrit.

### 2.1 Le principe, et pourquoi il n'est pas juste déclaratif

La règle du cahier des charges est : **aucun accès direct aux tables depuis le code de l'application**. Tout passe par une vue (lecture) ou une procédure stockée (écriture, ou lecture qui a besoin d'un paramètre — comme "les tâches de CET utilisateur", qu'une vue ne peut pas exprimer puisqu'une vue MySQL ne prend pas de paramètre).

**Ce qui rend ça vérifiable, pas juste une promesse** : le backend ne se connecte pas à MySQL avec le compte root/administrateur. Il utilise un compte dédié, `app_taskmanager`, qui n'a **strictement aucun droit** sur les tables (`utilisateurs`, `taches`, `tache_utilisateur`, `historique_taches`, `notifications`) — uniquement `SELECT` sur les vues et `EXECUTE` sur les procédures. Si quelqu'un pose la question "et si votre code avait un bug et tapait direct dans la table ?" — la réponse est : ça échoue à l'exécution, MySQL refuse la requête (`ERROR 1142 : command denied`), peu importe ce que fait le code applicatif. Ce n'est pas une convention qu'on respecte, c'est une contrainte que le moteur de base de données impose.

**Pourquoi ça marche quand même** (question probable) : si ce compte n'a aucun droit sur les tables, comment peut-il lire une vue qui, elle, va chercher ses données DANS les tables ? Réponse : en MySQL, une vue et une procédure s'exécutent par défaut avec les droits de la personne qui les a **créées** (le mode `SQL SECURITY DEFINER`, qui est le comportement par défaut), pas les droits de la personne qui les **appelle**. Comme c'est root qui a créé les vues et procédures, elles ont accès aux tables — et le compte restreint, lui, n'a besoin que du droit d'appeler la vue ou la procédure, jamais d'un accès direct à ce qu'il y a derrière. C'est le mécanisme qui permet de donner un accès très étroit (juste "cette liste", "cette action précise") sans jamais exposer les tables brutes.

### 2.2 Les vues (lecture)

Une vue est utilisée quand la lecture est **la même pour tout le monde qui y a droit** — pas besoin de paramètre, juste une requête pré-écrite qu'on interroge comme une table.

#### `v_utilisateurs`
Liste des utilisateurs pour l'admin — **sans jamais exposer le mot de passe** (même haché, il n'a rien à faire dans une réponse API). La vue ne sélectionne que les colonnes utiles (id, nom, prénom, email, rôle, statut, dates). Le mot de passe reste inaccessible même si un jour quelqu'un oublie de filtrer la réponse côté code — la vue elle-même ne le contient pas.

#### `v_taches_liste`
La liste globale des tâches pour l'admin. Le point technique à savoir expliquer : une tâche peut être assignée à plusieurs utilisateurs (relation N,N via la table `tache_utilisateur`), donc cette vue fait une jointure avec `GROUP_CONCAT` pour regrouper tous les noms assignés sur une seule ligne par tâche (`nb_assignes`, `utilisateurs_assignes_noms`), plutôt qu'une ligne par assignation. Elle filtre aussi `supprime = 0` pour ne jamais montrer une tâche supprimée (voir suppression logique, section 2.4).

#### `v_kpi_taches_par_statut`, `v_kpi_taches_par_priorite`
Deux vues simples : un `COUNT(*)` groupé par statut, puis par priorité. Alimentent les graphiques en camembert du tableau de bord.

#### `v_kpi_taches_en_retard`
Tâches dont la date d'échéance est dépassée et qui ne sont pas encore terminées (`date_echeance < CURDATE() AND statut <> 'terminee'`). Un indicateur de retard côté métier.

#### `v_kpi_charge_utilisateurs`
Nombre de tâches actives (non terminées) par utilisateur — sert à visualiser qui est surchargé.

#### `v_kpi_synthese`
Une vue "résumé" en une seule ligne : elle combine plusieurs sous-requêtes (total de tâches, par statut, en retard, utilisateurs actifs/bloqués/désactivés) pour que le tableau de bord fasse un seul appel réseau au lieu de cinq.

**Point commun à retenir** : aucune de ces vues ne prend de paramètre — c'est *pour ça* que ce sont des vues et pas des procédures. Dès qu'il faut filtrer par "l'utilisateur actuellement connecté", ce n'est plus une vue, c'est forcément une procédure (voir `sp_lister_taches_utilisateur` plus bas).

### 2.3 Les procédures (écriture, et lecture paramétrée)

#### Création et authentification

**`sp_creer_utilisateur`** — crée un utilisateur. Vérifie d'abord que l'email n'existe pas déjà (`SIGNAL` sinon, une erreur volontaire et lisible plutôt qu'un plantage). Point notable : elle ne prend **pas** de paramètre de rôle — elle crée toujours un compte `utilisateur`, jamais `admin`. C'est une décision de conception : il n'existe qu'un seul compte administrateur, créé une seule fois au tout début (directement en base, pas via l'application), donc l'application elle-même ne peut structurellement pas créer un second admin — pas parce qu'on lui a demandé de ne pas le faire, mais parce que la procédure n'a même pas la possibilité de le faire.

**`sp_utilisateur_par_email`** — utilisée à la connexion. Elle renvoie l'utilisateur (mot de passe haché inclus) pour un email donné. Point important à savoir expliquer : cette procédure **ne vérifie pas** le mot de passe. Elle se contente de retourner la ligne ; c'est le code Node.js qui compare le mot de passe fourni au hash stocké (avec `bcrypt`). Pourquoi ? Parce que le hachage bcrypt n'existe pas en SQL — on ne peut pas vérifier un mot de passe haché en bcrypt directement dans une requête MySQL. Ce n'est donc pas un oubli, c'est une séparation des responsabilités : la procédure fournit la donnée, l'application fait la vérification cryptographique.

**`sp_utilisateur_par_id`** — même idée que ci-dessus, mais par identifiant plutôt que par email (utile pour retrouver le profil de l'utilisateur déjà connecté, à partir de son token).

**`sp_enregistrer_connexion`** — met à jour la date de dernière connexion après un login réussi.

**`sp_modifier_mot_de_passe`** — change le mot de passe (déjà haché par l'application avant l'appel) d'un utilisateur. Utilisée uniquement pour que quelqu'un change **son propre** mot de passe — c'est le code applicatif qui garantit qu'on ne l'appelle qu'avec l'identifiant de la personne connectée, jamais celui d'un tiers.

**`sp_changer_statut_utilisateur`** — bascule un compte entre `actif`, `bloque`, `desactive`. Vérifie que la valeur est l'une des trois attendues (`SIGNAL` sinon).

#### Tâches

**`sp_creer_tache`** — crée une tâche. Vérifie que le titre fait au moins 3 caractères (règle du cahier des charges), puis insère avec le statut par défaut `a_faire`. Utilise un paramètre `OUT` pour renvoyer l'identifiant généré — technique à savoir expliquer : MySQL permet à une procédure de renvoyer une valeur "en sortie" via une variable de session (`CALL sp_creer_tache(..., @nouvel_id)` puis `SELECT @nouvel_id`), ce qui est nécessaire ici car un simple `SELECT` ne suffit pas à récupérer un identifiant auto-généré au sein d'une procédure.

**`sp_attribuer_tache`** — la plus riche techniquement, vaut la peine d'être bien maîtrisée :
- Elle prend une liste d'identifiants utilisateurs sous forme de texte séparé par des virgules (ex. `'2,5,7'`), parce que SQL ne sait pas nativement passer un tableau en paramètre à une procédure.
- Elle **remplace** la liste d'assignés existante plutôt que de l'ajouter : elle retire d'abord ceux qui ne sont plus dans la nouvelle liste (via `FIND_IN_SET`, une fonction MySQL qui teste l'appartenance à une liste séparée par virgules), puis ajoute les nouveaux.
- Elle vérifie que chaque identifiant fourni correspond à un utilisateur qui existe réellement (`SIGNAL` sinon) — ce contrôle a été ajouté après un vrai bug trouvé en testant : sans lui, `INSERT IGNORE` (utilisé pour éviter une erreur si quelqu'un est déjà assigné) avalait aussi silencieusement une clé étrangère invalide, laissant croire que l'attribution avait réussi alors que rien n'avait été assigné.
- Elle est **transactionnelle** (`START TRANSACTION` / `COMMIT`, avec un `ROLLBACK` automatique si une erreur survient) : si la liste contient un mélange d'identifiants valides et invalides, soit tout est appliqué, soit rien ne l'est — jamais un état à moitié fait. Ça a aussi été corrigé après un test qui montrait qu'un identifiant valide restait assigné même quand l'appel global échouait sur un identifiant suivant invalide.
- Elle ne notifie (table `notifications`) que les utilisateurs **réellement nouvellement** assignés (en testant si l'insertion a effectivement ajouté une ligne, via `ROW_COUNT()`), pas ceux qui étaient déjà assignés — pour éviter de spammer une notification à chaque petite modification de la liste.

**`sp_modifier_tache`** — modifie titre/description/priorité/échéance. Ne touche jamais au statut : c'est une règle métier volontaire (seul un utilisateur assigné peut faire évoluer le statut, jamais l'admin), donc la procédure elle-même n'accepte tout simplement pas ce paramètre.

**`sp_modifier_statut_tache`** — change uniquement le statut. Vérifie d'abord que l'utilisateur qui fait la demande est bien assigné à cette tâche (`SIGNAL` sinon) — un garde-fou supplémentaire côté base, en plus du contrôle déjà fait côté application. Renseigne aussi automatiquement `date_terminee` quand le nouveau statut est `terminee` (et la remet à `NULL` si le statut redescend), ce qui alimente ensuite le calcul du temps moyen de traitement.

**`sp_supprimer_tache`** — ne fait **pas** de `DELETE`. Elle marque la tâche `supprime = 1` avec une date de suppression (suppression logique). Pourquoi : un `DELETE` physique casserait la traçabilité — l'historique (`historique_taches`) pointe vers cette tâche, et la conserver permet à l'admin de garder un audit complet plutôt que de perdre toute trace qu'une tâche a existé.

**`sp_lister_taches_utilisateur`** — la liste "mes tâches" pour un utilisateur standard. C'est l'exemple le plus clair de "pourquoi une procédure et pas une vue" : cette liste dépend de **qui pose la question** (chaque utilisateur ne doit voir que les siennes), or une vue MySQL ne prend pas de paramètre — impossible de lui dire "mais seulement pour l'utilisateur 42". Une procédure, elle, prend cet identifiant en paramètre et filtre en conséquence.

#### Notifications

**`sp_lister_notifications_utilisateur`** — même logique que ci-dessus : une liste personnelle, donc une procédure paramétrée, pas une vue.

**`sp_marquer_notification_lue`** — marque une notification comme lue, en vérifiant d'abord qu'elle appartient bien à l'utilisateur qui fait la demande (`SIGNAL` sinon) — pour qu'on ne puisse jamais marquer comme lue une notification qui n'est pas la sienne, même en appelant directement la procédure avec un autre identifiant.

### 2.4 Décisions de conception transversales (utile pour répondre à "pourquoi ce choix ?")

- **Suppression logique partout, jamais de `DELETE` physique** (tâches comme utilisateurs) : préserve l'intégrité de l'historique/audit. Un utilisateur n'est jamais supprimé, seulement désactivé/bloqué — pour la même raison.
- **`SIGNAL SQLSTATE '45000'`** est utilisé systématiquement pour les erreurs métier (email dupliqué, statut invalide, utilisateur non assigné, titre trop court...) plutôt que de laisser MySQL renvoyer une erreur technique brute. Ça permet au code Node.js de distinguer une erreur métier attendue (qu'il transforme en réponse HTTP claire, ex. 409 ou 400) d'une vraie panne technique (500).
- **Aucune procédure ne fait confiance au rôle de l'appelant** : les procédures ne savent rien du JWT ni des rôles applicatifs. C'est le code Node.js (middleware) qui vérifie "cette personne a-t-elle le droit d'appeler ça ?" *avant* d'appeler la procédure. Les vérifications internes aux procédures (utilisateur assigné, notification qui appartient bien à la bonne personne) sont un **second niveau** de sécurité, pas le seul.

### 2.5 Questions probables en soutenance (base de données)

**"Pourquoi une vue ici et une procédure là, et pas l'inverse ?"**
→ Vue = lecture identique pour tout le monde, sans paramètre. Procédure = dès qu'il faut écrire, ou dès qu'il faut filtrer par un paramètre (comme l'utilisateur courant), parce qu'une vue MySQL ne prend pas de paramètre.

**"Si votre backend a un bug et fait un accès direct à une table, que se passe-t-il ?"**
→ Ça échoue au niveau du moteur MySQL (`command denied`), parce que le compte de connexion (`app_taskmanager`) n'a aucun droit sur les tables, seulement sur les vues et procédures.

**"Comment un compte sans droit sur les tables peut-il quand même lire des données qui viennent des tables ?"**
→ Grâce au mode `SQL SECURITY DEFINER` de MySQL (par défaut) : une vue/procédure s'exécute avec les droits de celui qui l'a créée, pas de celui qui l'appelle.

**"Comment gérez-vous les erreurs métier côté base de données ?"**
→ Avec `SIGNAL SQLSTATE '45000'`, qui remonte un message clair au code applicatif, distinct d'une erreur technique.

**"Pourquoi une transaction dans l'attribution de tâches ?"**
→ Pour garantir que l'opération est atomique : si un des identifiants fournis est invalide, on ne veut pas qu'une partie de l'attribution soit appliquée quand même.

**"Pourquoi une suppression logique plutôt qu'un vrai DELETE ?"**
→ Pour préserver l'historique/l'audit : une tâche supprimée physiquement casserait la traçabilité de ce qui s'est passé avant sa suppression.

---

## 3. BACKEND (taskbackend)

### 3.1 Architecture générale : routes → controllers → services

Le code est découpé en trois couches, chacune avec une seule responsabilité :

- **`routes/`** : décide QUI a le droit d'appeler QUOI. Une route ne fait rien d'autre que brancher une URL + une méthode HTTP sur une chaîne de middlewares (`authentifier`, `autoriser('admin')`...) puis un controller.
- **`controllers/`** : traduit HTTP ↔ métier. Lit `req.body`/`req.params`/`req.query`, valide la forme des données (types, champs requis), appelle le service, transforme le résultat (ou l'erreur) en réponse HTTP avec le bon code de statut.
- **`services/`** : la vraie logique. C'est le seul endroit qui appelle `pool.query(...)` (donc le seul endroit qui parle à MySQL). Ne connaît rien d'Express — pas de `req`/`res`, juste des fonctions qui prennent des paramètres et renvoient des données ou lèvent une erreur.

**Pourquoi ce découpage plutôt que tout mettre dans un seul fichier ?** Chaque couche peut être relue, testée ou modifiée sans toucher aux autres. Un service ne sait pas qu'il est appelé depuis une requête HTTP — on pourrait l'appeler depuis un script en ligne de commande sans rien changer. Un controller ne contient jamais de SQL. Ça évite qu'un fichier de 500 lignes mélange validation, sécurité et requêtes SQL.

**Exemple complet suivi de bout en bout : `POST /api/taches/:id/attribution`**

Cas concret : un admin attribue la tâche 6 aux utilisateurs 2 et 5.

1. Le frontend envoie `POST http://localhost:3000/api/taches/6/attribution`, header `Authorization: Bearer <token>`, corps `{ "utilisateurIds": [2, 5] }`.
2. Dans `app.ts`, la requête tombe dans `app.use('/api/taches', tacheRoutes)`.
3. Dans `routes/tacheRoutes.ts`, la route qui matche est :
   ```ts
   router.post('/:id/attribution', authentifier, autoriser('admin'), attribuerTacheController);
   ```
   - `authentifier` (middleware) lit le header, vérifie le JWT (`jwt.verify`), pose `req.user = { id: 1, role: 'admin' }`. Si le token manque ou est invalide → réponse 401 immédiate, la chaîne s'arrête là, `attribuerTacheController` n'est jamais appelé.
   - `autoriser('admin')` vérifie `req.user.role === 'admin'`. Si c'était un `utilisateur` standard → 403, même logique d'arrêt immédiat.
4. `attribuerTacheController` (dans `controllers/tacheController.ts`) s'exécute : récupère `tacheId = Number(req.params.id)` (= 6) et `utilisateurIds = req.body.utilisateurIds` (= `[2, 5]`). Vérifie que `tacheId` est un entier et que `utilisateurIds` est bien un tableau d'entiers — sinon 400 immédiat, sans même toucher à la base.
5. Il appelle `attribuerTache(6, [2, 5], 1)` dans `services/tacheService.ts` (le `1` est l'id de l'admin connecté, pour la traçabilité).
6. Le service vérifie que le tableau n'est pas vide, transforme `[2, 5]` en la chaîne `'2,5'`, puis exécute :
   ```ts
   await pool.query('CALL sp_attribuer_tache(?, ?, ?)', [tacheId, idsConcat, effectuePar]);
   ```
7. MySQL exécute `sp_attribuer_tache` (détaillée en 2.3) : transaction, désassignation de ceux qui ne sont plus dans la liste, vérification et insertion des nouveaux, notification des nouveaux assignés, `COMMIT`.
   - Si un id utilisateur n'existe pas → la procédure lève `SIGNAL` → mysql2 remonte une erreur `code: 'ER_SIGNAL_EXCEPTION'` → `relancerErreurSignalMysql` la transforme en `ErreurMetier(400, message de la procédure)`.
   - Si la tâche 6 n'existe pas/plus → violation de clé étrangère (`errno 1452`) → `estErreurContrainteFk` la détecte → `ErreurMetier(404, 'Tâche introuvable')`.
8. De retour dans le controller : si une `ErreurMetier` a été levée, `envoyerErreur` répond `res.status(err.statusCode).json({ status: 'erreur', message: err.message })`. Sinon, `res.json({ status: 'ok' })`.
9. Le frontend reçoit `{ status: 'ok' }`, ferme le dialog d'attribution, affiche un snackbar "Attribution mise à jour", recharge la liste des tâches.

Ce trajet (route → middleware → controller → service → SQL → réponse) est **le même pour tous les endpoints** de l'API — seuls les middlewares posés et le contenu du service changent.

### 3.2 Chaque endpoint de l'API

Toutes les réponses suivent l'enveloppe `{ status: 'ok' | 'erreur', ... }`. Les colonnes "Vue/procédure" renvoient à la section 2.

| Méthode | Route | Protection | Ce qu'il fait | Vue/procédure appelée |
|---|---|---|---|---|
| GET | `/api/health` | Public | Ping simple, aucune dépendance à la base | — |
| GET | `/api/db-test` | **Aucune** (pas de middleware) | Endpoint de diagnostic dev, teste la connexion MySQL | `SELECT ... FROM v_utilisateurs` |
| POST | `/api/auth/login` | Public | Vérifie email + mot de passe, renvoie un JWT | `sp_utilisateur_par_email`, `sp_enregistrer_connexion` |
| GET | `/api/auth/me` | Connecté | Profil de l'utilisateur courant (déduit du JWT) | `sp_utilisateur_par_id` |
| PATCH | `/api/auth/mot-de-passe` | Connecté | Change son propre mot de passe | `sp_utilisateur_par_id`, `sp_modifier_mot_de_passe` |
| GET | `/api/utilisateurs` | Admin | Liste tous les utilisateurs | `SELECT * FROM v_utilisateurs` |
| POST | `/api/utilisateurs` | Admin | Crée un compte (rôle `utilisateur` uniquement) | `sp_creer_utilisateur` |
| PATCH | `/api/utilisateurs/:id/statut` | Admin | Change le statut d'un compte | `sp_changer_statut_utilisateur` |
| POST | `/api/taches` | Admin | Crée une tâche | `sp_creer_tache` |
| GET | `/api/taches` | Admin | Liste globale, filtres `?statut=`/`?priorite=` optionnels | `SELECT * FROM v_taches_liste` |
| PATCH | `/api/taches/:id` | Admin | Modifie titre/description/priorité/échéance (jamais le statut) | `sp_modifier_tache` |
| POST | `/api/taches/:id/attribution` | Admin | Remplace la liste des utilisateurs assignés | `sp_attribuer_tache` |
| DELETE | `/api/taches/:id` | Admin | Suppression logique | `sp_supprimer_tache` |
| GET | `/api/taches/mes-taches` | Utilisateur | Tâches attribuées à l'appelant | `sp_lister_taches_utilisateur` |
| PATCH | `/api/taches/:id/statut` | Utilisateur | Change le statut d'une tâche qui lui est assignée | `sp_modifier_statut_tache` |
| GET | `/api/notifications` | Connecté | Notifications de l'utilisateur courant | `sp_lister_notifications_utilisateur` |
| PATCH | `/api/notifications/:id/lue` | Connecté | Marque une notification comme lue | `sp_marquer_notification_lue` |
| GET | `/api/kpis` | Admin | Synthèse + répartitions pour le tableau de bord | 5 vues `v_kpi_*` (section 2.2) |

"Connecté" = n'importe quel rôle, tant que le JWT est valide. "Admin"/"Utilisateur" = en plus, le rôle exact requis.

`/api/db-test` mérite d'être signalé à l'oral si la question vient : c'est un endpoint de debug oublié sans aucune protection, qui expose une liste basique d'utilisateurs (id, nom, prénom, rôle — jamais le mot de passe). Pas une faille critique, mais pas propre pour de la production : à retirer ou protéger avant un vrai déploiement.

### 3.3 Sécurité

**JWT** : généré dans `authService.login()` après vérification du mot de passe :
```ts
const payload: AuthPayload = { id: utilisateur.id, role: utilisateur.role };
const token = jwt.sign(payload, process.env.JWT_SECRET as string, {
  expiresIn: process.env.JWT_EXPIRES_IN || '8h',
});
```
Le contenu du token est volontairement minimal : juste `{ id, role }`. Vérifié sur chaque route protégée par `authentifier` (`middlewares/authMiddleware.ts`) : `jwt.verify(token, JWT_SECRET)` contrôle la signature et l'expiration ; en cas de succès, le payload décodé est posé sur `req.user` et lu par tous les controllers en aval.

**Hachage bcrypt** : jamais de mot de passe en clair stocké ou comparé. À la création d'un compte (`utilisateurService.creerUtilisateur`) et au changement de mot de passe (`compteService.changerMotDePasse`), `bcrypt.hash(motDePasse, 10)` calcule le hash avant l'appel SQL. À la connexion, `bcrypt.compare(motDePasse, utilisateur.mot_de_passe)` compare le mot de passe fourni au hash stocké — jamais l'inverse (voir aussi 2.3, `sp_utilisateur_par_email`).

**Compte MySQL restreint** : voir section 2.1 — le backend se connecte avec `app_taskmanager`, qui n'a aucun droit sur les tables. Ce n'est pas répété ici en détail, la section 2 fait référence.

**Pourquoi le contrôle de rôle existe à la fois côté backend (middleware) et côté frontend (guards Angular, section 4.2)** : ce sont deux niveaux différents, pas une redondance inutile. Le backend est **la seule vraie sécurité** — n'importe qui peut appeler l'API directement avec Postman ou curl, en contournant totalement le frontend ; si le middleware `autoriser` n'existait pas, un utilisateur standard pourrait appeler `DELETE /api/taches/3` directement. Le guard Angular, lui, n'empêche rien côté serveur : il évite juste d'afficher une page à laquelle l'utilisateur n'a pas accès, et redirige proprement. Retirer les guards frontend ne rendrait rien "piratable" de plus (le backend refuserait quand même) ; retirer les middlewares backend rendrait toute l'application non sécurisée.

### 3.4 Packages npm installés

Versions réelles lues dans `package.json`/`package-lock.json` (pas des suppositions).

**Dépendances de production**

| Package | Version installée | Rôle concret dans ce projet |
|---|---|---|
| `bcryptjs` | 3.0.3 | Hache le mot de passe à la création d'un utilisateur et au changement de mot de passe (`bcrypt.hash`), et le compare au hash stocké à la connexion (`bcrypt.compare`) — jamais stocké ou comparé en clair. |
| `cors` | 2.8.6 | Autorise le frontend (autre port, donc autre origine pour le navigateur) à appeler l'API. Activé globalement dans `app.ts` avec `app.use(cors())`, sans restriction de domaine particulière. |
| `dotenv` | 17.4.2 | Charge les variables du fichier `.env` (`DB_HOST`, `JWT_SECRET`, `PORT`...) en mémoire au tout début de `app.ts`, avant tout le reste. |
| `express` | 5.2.1 | Le framework HTTP : routing, middlewares, parsing du JSON entrant (`express.json()`). |
| `jsonwebtoken` | 9.0.3 | Signe le token à la connexion (`jwt.sign`) et le vérifie sur chaque route protégée (`jwt.verify` dans `authMiddleware.ts`). |
| `mysql2` | 3.23.1 | Driver MySQL, utilisé en mode `mysql2/promise` pour tous les `pool.query(...)` et `CALL sp_...` du projet. |

**Dépendances de développement**

| Package | Version installée | Rôle concret dans ce projet |
|---|---|---|
| `@types/bcryptjs` | 2.4.6 | Types TypeScript pour `bcryptjs` (aide l'éditeur/le compilateur, ne s'exécute jamais). |
| `@types/cors` | 2.8.19 | Idem pour `cors`. |
| `@types/express` | 5.0.6 | Idem pour `express` (types de `Request`/`Response` utilisés partout dans les controllers). |
| `@types/jsonwebtoken` | 9.0.10 | Idem pour `jsonwebtoken`. |
| `@types/node` | 26.1.1 | Types pour l'API Node.js native (`process.env`, etc.). |
| `nodemon` | 3.1.14 | **Installé mais inutilisé.** Le script `dev` du `package.json` utilise `tsx watch`, pas nodemon ; aucun fichier `nodemon.json` ni script ne l'appelle. |
| `tsx` | 4.23.1 | Exécute le TypeScript directement en développement sans compilation manuelle, avec rechargement à chaud (`npm run dev` = `tsx watch src/app.ts`). |
| `typescript` | 7.0.2 | Compilateur TypeScript, utilisé par `npm run build` (`tsc`) pour produire le JavaScript de production dans `dist/`. Note : c'est la préversion "native" (réécrite en Go) de TypeScript 7 — plus récente que la version utilisée côté frontend (5.9, voir 4.4), les deux projets étant indépendants. |

### 3.5 Point technique : récupérer un paramètre `OUT` d'une procédure avec mysql2

mysql2 ne mappe pas nativement les paramètres `OUT` d'une procédure MySQL vers une valeur JavaScript utilisable directement. La solution : passer par une **variable de session SQL**, remplie par la procédure, puis relue avec un `SELECT` séparé — dans la même connexion du pool.

Exemple réel, `tacheService.creerTache` :
```ts
await pool.query('CALL sp_creer_tache(?, ?, ?, ?, ?, @nouvel_id)', [
  input.titre,
  input.description ?? null,
  input.priorite,
  input.dateEcheance ?? null,
  creePar,
]);
const [rows]: any = await pool.query('SELECT @nouvel_id AS id');
return rows[0].id;
```
`@nouvel_id` est écrit par la procédure (`SET p_nouvel_id = LAST_INSERT_ID();` côté SQL, voir 2.3), puis relu par un deuxième aller-retour réseau. Le même pattern revient dans `utilisateurService.creerUtilisateur` avec `@nouvel_id` pour `sp_creer_utilisateur`.

### 3.6 Point technique : transformer une erreur SQL en code HTTP propre

Deux mécanismes distincts, tous les deux dans `utils/errors.ts`.

**1. Un `SIGNAL` levé volontairement par une procédure** (règle métier violée : email dupliqué, statut invalide, utilisateur non assigné...). mysql2 le remonte avec `code: 'ER_SIGNAL_EXCEPTION'` :
```ts
function estErreurSignalMysql(err: unknown): err is ErreurMysql {
  return typeof err === 'object' && err !== null && (err as any).code === 'ER_SIGNAL_EXCEPTION';
}

export function relancerErreurSignalMysql(err: unknown, statutParDefaut: number): never {
  if (estErreurSignalMysql(err)) {
    throw new ErreurMetier(statutParDefaut, err.sqlMessage || err.message);
  }
  throw err;
}
```
Utilisé dans chaque service au `catch` d'un `CALL sp_...`, avec un code HTTP différent selon le contexte — par exemple `tacheService.modifierStatutTache` relaie en 403 (l'utilisateur n'est pas assigné), alors que `creerTache`/`modifierTache` relaient en 400 (validation d'entrée) :
```ts
try {
  await pool.query('CALL sp_modifier_statut_tache(?, ?, ?)', [tacheId, utilisateurId, statut]);
} catch (err) {
  relancerErreurSignalMysql(err, 403);
}
```

**2. Une vraie violation de contrainte** (pas un `SIGNAL` explicite) — par exemple attribuer une tâche à un `tache_id` qui n'existe plus : `sp_attribuer_tache` ne vérifie pas l'existence de la tâche avant d'insérer dans `tache_utilisateur`, donc MySQL rejette l'insertion pour violation de clé étrangère, `errno 1452` :
```ts
export function estErreurContrainteFk(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as any).errno === 1452;
}
```
Dans `tacheService.attribuerTache`, ce cas précis est intercepté avant le cas général pour renvoyer un 404 plus parlant qu'un 400 générique :
```ts
try {
  await pool.query('CALL sp_attribuer_tache(?, ?, ?)', [tacheId, idsConcat, effectuePar]);
} catch (err) {
  if (estErreurContrainteFk(err)) {
    throw new ErreurMetier(404, 'Tâche introuvable');
  }
  relancerErreurSignalMysql(err, 400);
}
```
Toute erreur qui n'est ni l'un ni l'autre (vraie panne d'infrastructure, connexion perdue...) n'est interceptée par rien de spécifique : elle remonte telle quelle jusqu'au controller, qui répond 500 générique (`envoyerErreur` / bloc `catch` de chaque controller).

---

## 4. FRONTEND (taskfrontend)

### 4.1 Architecture générale

Angular 21, **standalone** (aucun `NgModule` dans tout le projet — chaque composant déclare directement ses imports), **zoneless** (aucune dépendance `zone.js` dans `package.json` : Angular ne redessine plus automatiquement l'écran à chaque événement/promesse, il se base sur les **signals** pour savoir quand rafraîchir).

Organisation de `src/app/` :
```
core/
├── api-config.ts            → URL de base de l'API (constante, pas de fichier d'environnement)
├── guards/                  → authGuard, adminGuard, standardGuard, guestGuard
├── interceptors/            → auth.interceptor.ts
└── services/                → un service par domaine (auth, tache, utilisateur, notification, kpi, compte)
models/                      → interfaces TS, alignées sur la forme réelle des réponses API
layout/shell/                → toolbar + sidenav, layout partagé par les deux espaces
shared/                      → badges.ts (libellés/couleurs des chips), dialogs réutilisables
pages/
├── login/
├── admin/                   → utilisateurs, taches, tableau-de-bord
└── app/                     → mes-taches (espace utilisateur standard)
```

Aucun `HttpClient` n'est injecté directement dans un composant : toujours via un service de `core/services/`. Les composants ne connaissent que le service, jamais l'URL de l'API ni la forme brute de la requête HTTP.

### 4.2 Authentification de bout en bout côté frontend

**1. Connexion** (`pages/login/login.ts`) : formulaire réactif (`email`, `motDePasse`), soumis à `AuthService.login()`.

**2. Stockage du token** (`core/services/auth.service.ts`) :
```ts
login(email: string, motDePasse: string): Observable<ConnexionReponse> {
  return this.http
    .post<ConnexionReponse>(`${API_BASE_URL}/auth/login`, { email, motDePasse })
    .pipe(
      tap((reponse) => {
        localStorage.setItem(CLE_TOKEN, reponse.token);
        localStorage.setItem(CLE_UTILISATEUR, JSON.stringify(reponse.utilisateur));
        this.tokenSignal.set(reponse.token);
        this.utilisateurSignal.set(reponse.utilisateur);
      })
    );
}
```
Le token et l'utilisateur sont stockés dans `localStorage` (survit au rechargement de la page) **et** dans deux signals (`tokenSignal`, `utilisateurSignal`), qui alimentent des computed exposés en lecture seule : `estConnecte`, `isAdmin`.

**3. L'intercepteur attache le token à chaque requête** (`core/interceptors/auth.interceptor.ts`) :
```ts
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const token = auth.token();
  const requete = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(requete).pipe(
    catchError((erreur: HttpErrorResponse) => {
      if (erreur.status === 401 && auth.estConnecte()) {
        auth.logout();
        router.navigate(['/login']);
      }
      return throwError(() => erreur);
    })
  );
};
```
Branché une seule fois dans `app.config.ts` (`provideHttpClient(withInterceptors([authInterceptor]))`) : toutes les requêtes HTTP de l'application passent par là, sans qu'aucun service n'ait besoin d'ajouter le header lui-même. Il gère aussi la déconnexion automatique si le token est refusé (expiré ou invalide) par le backend.

**4. Le guard vérifie le rôle avant d'autoriser une route** (`core/guards/admin.guard.ts`) :
```ts
export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.estConnecte()) {
    router.navigate(['/login']);
    return false;
  }
  if (!auth.isAdmin()) {
    router.navigate(['/app']);
    return false;
  }
  return true;
};
```
Branché sur la route dans `app.routes.ts` : `{ path: 'admin', canActivate: [adminGuard], ... }`. Son symétrique, `standardGuard`, protège `/app` en interdisant l'accès à un admin (redirigé vers `/admin`). Un quatrième guard, `guestGuard`, empêche un utilisateur déjà connecté de revoir la page de connexion.

Rappel important (voir aussi 3.3) : ce guard n'est qu'un confort de navigation, pas une sécurité. Le fichier `auth.guard.ts` existe aussi dans le projet (vérifie juste "est connecté") mais n'est actuellement branché sur aucune route — `adminGuard`/`standardGuard` font le travail à sa place puisqu'ils vérifient déjà la connexion avant le rôle.

### 4.3 Structure des pages/composants principaux

**Auth** (`pages/login/`) : une seule page, formulaire réactif avec validation (email valide, champs requis), affichage de l'erreur renvoyée par le backend directement dans le formulaire, redirection vers `/admin` ou `/app` selon le rôle une fois connecté.

**Admin / Utilisateurs** (`pages/admin/utilisateurs/`) : tableau (`MatTableDataSource` + `MatPaginator`) listant tous les comptes, bouton d'ouverture d'un dialog de création (`creer-utilisateur-dialog/`) avec formulaire réactif, menu par ligne pour changer le statut (actif/bloqué/désactivé) — chaque changement de statut passe par un `ConfirmDialog` générique avant d'être appliqué.

**Admin / Tâches** (`pages/admin/taches/`) : tableau des tâches avec deux filtres côté client (`mat-select` statut/priorité, appliqués sur les données déjà chargées via un `computed`), deux dialogs réutilisés en création et en édition (`tache-dialog/`, même composant pour les deux cas selon qu'une tâche est passée en donnée ou non), un dialog dédié à l'attribution multi-utilisateurs (`attribution-dialog/`, cases à cocher), suppression avec confirmation.

**Admin / Tableau de bord** (`pages/admin/tableau-de-bord/`) : consomme `GET /api/kpis` en un seul appel, affiche des tuiles de statistiques, un graphique en anneau (répartition par statut) et un graphique en barres (répartition par priorité) via `ng2-charts`/`chart.js`, une liste des tâches en retard, et des barres de charge par utilisateur (`mat-progress-bar`, pas un graphique — calcul de proportion fait à la main avec `chargeMax`).

**Espace utilisateur standard** (`pages/app/mes-taches/`) : tableau façon Kanban à trois colonnes (à faire / en cours / terminée, calculées par un `computed` qui filtre `tacheService.mesTaches()`), en-tête personnalisé avec le prénom de l'utilisateur connecté et des tuiles de statistiques (dont le nombre de tâches en retard, calculé côté frontend en comparant `date_echeance` à la date du jour), changement de statut via un menu par carte.

**Notifications** : pas une page mais un composant partagé (`shared/components/notifications-panel/`), affiché dans un `mat-menu` déclenché par la cloche du header (`layout/shell/`), commun aux deux espaces. Le compteur de non-lues (`nbNonLues`) est un `computed` sur la liste chargée par `NotificationService`, affiché en badge sur l'icône.

### 4.4 Packages npm installés

Versions réelles lues dans `package.json`/`package-lock.json`.

**Dépendances de production**

| Package | Version installée | Rôle concret dans ce projet |
|---|---|---|
| `@angular/cdk` | 21.2.14 | Fournit `BreakpointObserver`, utilisé dans `shell.ts` pour basculer la sidenav entre mode `side` (bureau) et `over` (mobile, sous 768px). |
| `@angular/common` | 21.2.18 | Pipes utilisés dans les templates (`DatePipe` pour toutes les dates affichées). |
| `@angular/compiler` | 21.2.18 | Compile les templates Angular au build — jamais importé directement dans le code applicatif. |
| `@angular/core` | 21.2.18 | Le cœur du framework : `Component`, `signal`, `computed`, `inject`, `effect`. |
| `@angular/forms` | 21.2.18 | Reactive Forms (`FormBuilder`, `Validators`) — tous les formulaires du projet (login, dialogs) sont réactifs, aucun formulaire template-driven. |
| `@angular/material` | 21.2.14 | Composants UI (`mat-table`, `mat-dialog`, `mat-sidenav`, `mat-card`...) et le système de thème Material 3 (`mat.theme()` dans `styles.scss`, palette bleu/ardoise personnalisée). |
| `@angular/platform-browser` | 21.2.18 | Bootstrap de l'application dans le navigateur (`main.ts`). |
| `@angular/router` | 21.2.18 | Routing, guards, chargement paresseux des pages (`loadComponent` dans `app.routes.ts`). |
| `chart.js` | 4.5.1 | Bibliothèque de graphiques sous-jacente ; importée directement pour le type `ChartConfiguration` dans `tableau-de-bord.ts`. |
| `ng2-charts` | 10.0.0 | Fournit la directive Angular `BaseChartDirective` qui connecte Chart.js aux templates, et `provideCharts()` branché dans `app.config.ts`. |
| `rxjs` | 7.8.2 | Observables utilisés par `HttpClient` et l'intercepteur (`tap`, `catchError`, `throwError`). |
| `tslib` | 2.8.1 | Helpers TypeScript compilés, utilisés implicitement par la sortie du compilateur — jamais importé directement dans le code du projet. |

**Dépendances de développement**

| Package | Version installée | Rôle concret dans ce projet |
|---|---|---|
| `@angular/build` | 21.2.19 | Moteur de build utilisé par `ng build`/`ng serve` (basé sur esbuild/Vite). |
| `@angular/cli` | 21.2.19 | Outil en ligne de commande (`ng`) utilisé pour scaffolder et lancer le projet. |
| `@angular/compiler-cli` | 21.2.18 | Compilation AOT des templates au moment du build de production. |
| `jsdom` | 27.4.0 | Simule un DOM en Node.js pour exécuter les tests unitaires sans navigateur réel. |
| `typescript` | 5.9.3 | Compilateur TypeScript (version stable classique — à distinguer de la version 7 "native" utilisée côté backend, section 3.4 ; les deux projets sont indépendants). |
| `vitest` | 4.1.10 | Testeur unitaire par défaut du scaffold Angular 21 (`ng test`). Aucun test métier n'a été écrit dans ce projet : seul le test généré automatiquement (`app.spec.ts`, vérifie juste que le composant racine se crée) existe. |

### 4.5 Angular Material et Angular 21 : ce qui est notable

Ce projet utilise **Angular 21**, sorti récemment — plusieurs choses ont changé par rapport aux versions qu'un évaluateur connaît peut-être mieux (Angular 15-17), utile de le dire explicitement plutôt que de laisser croire à un oubli :

- **Standalone par défaut** : pas un seul `NgModule` dans le projet. Chaque `@Component` déclare directement son tableau `imports`. Plus besoin de `AppModule`, `SharedModule`, etc.
- **Zoneless** : pas de `zone.js` chargé (absent de `package.json`). Le rafraîchissement de l'affichage n'est plus déclenché automatiquement par chaque événement DOM/timer/promesse ; il repose sur les **signals** (`signal()`, `computed()`) qui savent précisément quelle donnée a changé.
- **Control flow natif** : `@if`, `@for` (avec `track` obligatoire), `@switch` directement dans les templates — jamais `*ngIf`/`*ngFor`/`*ngSwitch` (l'ancienne syntaxe à base de directives structurelles).
- **Signal inputs/outputs** : `input()`/`output()` plutôt que les décorateurs `@Input()`/`@Output()` — pas directement utilisés dans ce projet (aucun composant avec des `@Input`/`input()` personnalisés, la communication passe par les services partagés et les dialogs Material), mais la convention du projet suit cette philosophie signal-first partout ailleurs.

Côté Material spécifiquement : le thème n'utilise pas les couleurs par défaut (violet/rose). `styles.scss` définit un thème personnalisé via le mixin `mat.theme()` avec une palette bleu/ardoise, pensée pour un outil de gestion interne plutôt qu'une démonstration.

---

## 5. Questions probables en soutenance — backend et frontend

### Backend

**"Pourquoi découper en routes/controllers/services au lieu de tout mettre dans un seul fichier par fonctionnalité ?"**
→ Chaque couche a une seule responsabilité : la route décide qui a le droit d'appeler quoi, le controller traduit HTTP ↔ métier, le service parle à la base. Ça permet de modifier une couche sans risquer de casser les autres, et ça évite qu'un même fichier mélange sécurité, validation et SQL.

**"Le contrôle de rôle existe côté backend ET côté frontend : lequel est la vraie sécurité ?"**
→ Le backend. N'importe qui peut appeler l'API directement (Postman, curl) en contournant le frontend. Le guard Angular n'est qu'un confort de navigation ; retirer le middleware backend rendrait l'application réellement non sécurisée, retirer le guard frontend ne changerait rien à la sécurité réelle.

**"Que contient le JWT, et pourquoi pas plus ?"**
→ Juste `{ id, role }`. Le strict nécessaire pour identifier l'utilisateur et vérifier son rôle sans requête base à chaque appel. Le reste du profil (nom, email) est récupéré via `/api/auth/me` si besoin, plutôt que figé dans un token qui vit 8h.

**"Comment une erreur SQL devient-elle une réponse HTTP propre ?"**
→ Deux cas distincts (détail en 3.6) : un `SIGNAL` levé volontairement par une procédure est détecté via `code === 'ER_SIGNAL_EXCEPTION'` et transformé en `ErreurMetier` avec le code HTTP choisi par l'appelant (400, 403...) ; une vraie violation de contrainte (clé étrangère, `errno 1452`) est détectée séparément et peut être transformée différemment (ex. 404). Tout le reste remonte en 500 générique.

**"Pourquoi mysql2 ne gère-t-il pas nativement un paramètre `OUT` de procédure ?"**
→ Ce n'est pas une limite de mysql2 en particulier, c'est le protocole `CALL` de MySQL : la valeur `OUT` est écrite dans une variable de session côté serveur, pas renvoyée directement dans le résultat de l'appel. Il faut donc un second `SELECT @variable` dans la même connexion pour la récupérer (voir 3.5).

### Frontend

**"Pourquoi Angular zoneless, et qu'est-ce que ça change concrètement ?"**
→ Zoneless veut dire pas de `zone.js` : Angular ne redessine plus automatiquement l'écran après chaque événement ou promesse résolue. À la place, il se base sur les signals (`signal()`, `computed()`) : le rafraîchissement se déclenche uniquement quand une valeur réellement lue dans un template change. Plus léger, plus explicite sur ce qui provoque un rendu.

**"Pourquoi un intercepteur HTTP plutôt qu'ajouter le header manuellement dans chaque appel de service ?"**
→ Un seul endroit (`auth.interceptor.ts`) attache le token à TOUTES les requêtes sortantes, et gère aussi TOUTES les erreurs 401 (déconnexion + redirection) au même endroit. Sans ça, il faudrait dupliquer cette logique dans chaque service (`TacheService`, `UtilisateurService`...).

**"Que se passe-t-il si le token expire pendant que l'utilisateur travaille ?"**
→ Le backend renvoie 401 sur la prochaine requête. L'intercepteur détecte ce 401, appelle `AuthService.logout()` (vide le `localStorage` et les signals), et redirige vers `/login`.

**"Pourquoi des guards différents pour admin et utilisateur standard, plutôt qu'un seul guard générique ?"**
→ Parce que le comportement de repli diffère : `adminGuard` redirige un non-admin vers `/app`, `standardGuard` redirige un admin vers `/admin`. Un seul guard paramétré aurait été possible, mais deux fichiers courts et explicites sont plus simples à lire que la logique conditionnelle équivalente.

**"Pourquoi les filtres sur la liste des tâches (admin) sont-ils appliqués côté client et pas côté serveur ?"**
→ Parce que l'API ne les supporte pas encore côté serveur (`GET /api/taches` renvoie toute la liste). En attendant, le frontend filtre sur les données déjà chargées via un `computed`. Fonctionnellement correct pour le volume actuel, mais ne passerait pas à l'échelle avec beaucoup de tâches — c'est une limite connue, pas un choix définitif.
