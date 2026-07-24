-- ============================================================================
-- Application "Gestion de Tâches" — Angular / Node.js / MySQL
-- Script de création : base, tables, contraintes, vues, procédures stockées
-- Compatible MySQL 8+ et MariaDB 10.4+ (utilisable tel quel dans phpMyAdmin :
-- onglet "Importer", ou coller dans l'onglet SQL)
-- ============================================================================

SET NAMES utf8mb4 COLLATE utf8mb4_general_ci;

CREATE DATABASE IF NOT EXISTS TaskManager
  CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE TaskManager;

-- ----------------------------------------------------------------------------
-- 1. TABLES
-- ----------------------------------------------------------------------------

-- Utilisateurs (admin ou utilisateur standard).
-- Aucune suppression physique n'est prévue : seul le statut change
-- (actif / bloque / desactive), afin de préserver l'intégrité de l'historique.
CREATE TABLE utilisateurs (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  nom                 VARCHAR(100) NOT NULL,
  prenom              VARCHAR(100) NOT NULL,
  email               VARCHAR(150) NOT NULL,
  mot_de_passe        VARCHAR(255) NOT NULL COMMENT 'hash bcrypt, jamais le mot de passe en clair',
  role                ENUM('admin','utilisateur') NOT NULL DEFAULT 'utilisateur',
  statut              ENUM('actif','bloque','desactive') NOT NULL DEFAULT 'actif',
  date_creation       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  derniere_connexion  DATETIME NULL,
  UNIQUE KEY uniq_email (email),
  KEY idx_statut (statut),
  KEY idx_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Tâches. Suppression logique (soft delete) pour ne jamais casser
-- l'historique / l'audit lié à une tâche.
CREATE TABLE taches (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  titre            VARCHAR(150) NOT NULL,
  description      TEXT NULL,
  statut           ENUM('a_faire','en_cours','terminee') NOT NULL DEFAULT 'a_faire',
  priorite         ENUM('basse','moyenne','haute') NOT NULL DEFAULT 'moyenne',
  date_creation    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  date_echeance    DATE NULL,
  date_terminee    DATETIME NULL COMMENT 'renseignee automatiquement quand statut passe a terminee',
  cree_par         INT NOT NULL COMMENT 'admin ayant cree la tache',
  supprime         TINYINT(1) NOT NULL DEFAULT 0,
  date_suppression DATETIME NULL,
  CONSTRAINT chk_titre_longueur CHECK (CHAR_LENGTH(TRIM(titre)) >= 3),
  CONSTRAINT fk_taches_cree_par FOREIGN KEY (cree_par) REFERENCES utilisateurs(id),
  KEY idx_statut (statut),
  KEY idx_priorite (priorite),
  KEY idx_supprime (supprime)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Attribution des tâches (relation N,N : une tâche peut avoir plusieurs
-- utilisateurs assignés, un utilisateur peut avoir plusieurs tâches).
CREATE TABLE tache_utilisateur (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  tache_id          INT NOT NULL,
  utilisateur_id    INT NOT NULL,
  date_attribution  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_tache_utilisateur (tache_id, utilisateur_id),
  CONSTRAINT fk_tu_tache FOREIGN KEY (tache_id) REFERENCES taches(id) ON DELETE CASCADE,
  CONSTRAINT fk_tu_utilisateur FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Historique / audit : trace chaque action importante sur une tâche
-- (création, modification, attribution, changement de statut, suppression).
CREATE TABLE historique_taches (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  tache_id        INT NOT NULL,
  utilisateur_id  INT NULL COMMENT 'auteur de l action, NULL si systeme',
  action          VARCHAR(50) NOT NULL,
  details         VARCHAR(500) NULL,
  date_action     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ht_tache FOREIGN KEY (tache_id) REFERENCES taches(id),
  CONSTRAINT fk_ht_utilisateur FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Notifications in-app (déclenchées uniquement à l'attribution d'une tâche
-- à un utilisateur qui ne l'était pas déjà — pas de doublon si la liste
-- d'assignés est simplement re-soumise à l'identique).
CREATE TABLE notifications (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  utilisateur_id  INT NOT NULL,
  tache_id        INT NULL,
  message         VARCHAR(255) NOT NULL,
  lue             TINYINT(1) NOT NULL DEFAULT 0,
  date_creation   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notif_utilisateur FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id),
  CONSTRAINT fk_notif_tache FOREIGN KEY (tache_id) REFERENCES taches(id),
  KEY idx_utilisateur_lue (utilisateur_id, lue)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------------------------------------------------------
-- 2. COMPTE ADMIN INITIAL (amorçage)
-- Aucune inscription publique n'existe : le premier admin est injecté ici.
-- Email  : admin@taskmanager.local
-- Mot de passe temporaire : Admin@1234   -> A CHANGER DES LA 1ere CONNEXION
-- (hash bcrypt généré côté Node.js, 10 rounds)
-- ----------------------------------------------------------------------------
INSERT INTO utilisateurs (nom, prenom, email, mot_de_passe, role, statut)
VALUES ('Admin', 'Principal', 'admin@taskmanager.local',
        '$2b$10$qgHZPXOMDNyInIhplHo6Y.XSR31i0TWSCki6SszQFDgHicnVvYOri',
        'admin', 'actif');

-- ----------------------------------------------------------------------------
-- 3. VUES
-- ----------------------------------------------------------------------------

-- Liste des utilisateurs pour l'admin (mot de passe JAMAIS exposé)
CREATE VIEW v_utilisateurs AS
SELECT id, nom, prenom, email, role, statut, date_creation, derniere_connexion
FROM utilisateurs;

-- Liste globale des tâches (admin) avec assignés agrégés
CREATE VIEW v_taches_liste AS
SELECT
  t.id, t.titre, t.description, t.statut, t.priorite,
  t.date_creation, t.date_echeance, t.date_terminee,
  t.cree_par, CONCAT(u.prenom, ' ', u.nom) AS cree_par_nom,
  COUNT(tu.utilisateur_id)                              AS nb_assignes,
  GROUP_CONCAT(ua.id SEPARATOR ',')                     AS utilisateurs_assignes_ids,
  GROUP_CONCAT(CONCAT(ua.prenom,' ',ua.nom) SEPARATOR ', ') AS utilisateurs_assignes_noms
FROM taches t
JOIN utilisateurs u        ON u.id = t.cree_par
LEFT JOIN tache_utilisateur tu ON tu.tache_id = t.id
LEFT JOIN utilisateurs ua      ON ua.id = tu.utilisateur_id
WHERE t.supprime = 0
GROUP BY t.id;

-- KPI : répartition des tâches par statut
CREATE VIEW v_kpi_taches_par_statut AS
SELECT statut, COUNT(*) AS total
FROM taches
WHERE supprime = 0
GROUP BY statut;

-- KPI : répartition des tâches par priorité
CREATE VIEW v_kpi_taches_par_priorite AS
SELECT priorite, COUNT(*) AS total
FROM taches
WHERE supprime = 0
GROUP BY priorite;

-- KPI : tâches en retard (échéance dépassée, non terminées)
CREATE VIEW v_kpi_taches_en_retard AS
SELECT id, titre, date_echeance, priorite
FROM taches
WHERE supprime = 0
  AND date_echeance IS NOT NULL
  AND date_echeance < CURDATE()
  AND statut <> 'terminee';

-- KPI : charge de travail par utilisateur (tâches actives, non terminées)
CREATE VIEW v_kpi_charge_utilisateurs AS
SELECT
  u.id AS utilisateur_id,
  CONCAT(u.prenom,' ',u.nom) AS utilisateur_nom,
  u.statut AS statut_utilisateur,
  COUNT(tu.tache_id) AS nb_taches_actives
FROM utilisateurs u
LEFT JOIN tache_utilisateur tu ON tu.utilisateur_id = u.id
LEFT JOIN taches t ON t.id = tu.tache_id AND t.statut <> 'terminee' AND t.supprime = 0
WHERE u.role = 'utilisateur'
GROUP BY u.id;

-- KPI : synthèse globale en une seule ligne (pour le dashboard admin)
CREATE VIEW v_kpi_synthese AS
SELECT
  (SELECT COUNT(*) FROM taches WHERE supprime=0)                                   AS total_taches,
  (SELECT COUNT(*) FROM taches WHERE supprime=0 AND statut='terminee')              AS taches_terminees,
  (SELECT COUNT(*) FROM taches WHERE supprime=0 AND statut='a_faire')               AS taches_a_faire,
  (SELECT COUNT(*) FROM taches WHERE supprime=0 AND statut='en_cours')              AS taches_en_cours,
  (SELECT COUNT(*) FROM taches WHERE supprime=0 AND date_echeance < CURDATE()
                                 AND statut<>'terminee')                            AS taches_en_retard,
  (SELECT COUNT(*) FROM utilisateurs WHERE role='utilisateur' AND statut='actif')   AS utilisateurs_actifs,
  (SELECT COUNT(*) FROM utilisateurs WHERE statut='bloque')                        AS utilisateurs_bloques,
  (SELECT COUNT(*) FROM utilisateurs WHERE statut='desactive')                     AS utilisateurs_desactives;

-- ----------------------------------------------------------------------------
-- 4. PROCÉDURES STOCKÉES
-- Rappel important : les procédures ne connaissent pas les rôles applicatifs
-- (JWT). L'autorisation (qui a le droit d'appeler quoi) est toujours vérifiée
-- AVANT l'appel, côté Node.js (middleware). Les procédures appliquent en plus
-- quelques garde-fous "défense en profondeur" (ex: statut invalide, utilisateur
-- non assigné) mais ne remplacent pas le contrôle d'accès applicatif.
-- ----------------------------------------------------------------------------
DELIMITER $$

-- Créer un utilisateur (appelée uniquement par l'admin, contrôle en amont).
-- Un seul compte admin existe dans toute l'application (créé une seule fois
-- lors de l'amorçage) : cette procédure ne crée donc JAMAIS que des comptes
-- de rôle 'utilisateur' -- il n'y a pas de paramètre de rôle, structurellement
-- impossible de créer un second admin par ce chemin.
CREATE PROCEDURE sp_creer_utilisateur(
  IN p_nom VARCHAR(100),
  IN p_prenom VARCHAR(100),
  IN p_email VARCHAR(150),
  IN p_mot_de_passe_hash VARCHAR(255),
  OUT p_nouvel_id INT
)
BEGIN
  IF EXISTS (SELECT 1 FROM utilisateurs WHERE email = p_email) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cet email est deja utilise';
  END IF;

  INSERT INTO utilisateurs (nom, prenom, email, mot_de_passe, role, statut)
  VALUES (p_nom, p_prenom, p_email, p_mot_de_passe_hash, 'utilisateur', 'actif');

  SET p_nouvel_id = LAST_INSERT_ID();
END $$

-- Récupérer un utilisateur par id (profil courant, avant changement de mot de passe, etc.)
CREATE PROCEDURE sp_utilisateur_par_id(
  IN p_utilisateur_id INT
)
BEGIN
  SELECT id, nom, prenom, email, mot_de_passe, role, statut
  FROM utilisateurs
  WHERE id = p_utilisateur_id;
END $$

-- Modifier son PROPRE mot de passe (utilisateur standard ou admin).
-- L'ancien mot de passe est vérifié côté Node.js (bcrypt.compare) avant
-- cet appel ; côté Node.js on s'assure aussi que p_utilisateur_id correspond
-- bien à l'utilisateur actuellement connecté (jamais celui d'un tiers).
CREATE PROCEDURE sp_modifier_mot_de_passe(
  IN p_utilisateur_id INT,
  IN p_nouveau_mot_de_passe_hash VARCHAR(255)
)
BEGIN
  UPDATE utilisateurs
  SET mot_de_passe = p_nouveau_mot_de_passe_hash
  WHERE id = p_utilisateur_id;
END $$

-- Récupérer un utilisateur par email pour la connexion.
-- Le hash est comparé côté Node.js (bcrypt.compare) : SQL ne vérifie
-- jamais un mot de passe en clair.
CREATE PROCEDURE sp_utilisateur_par_email(
  IN p_email VARCHAR(150)
)
BEGIN
  SELECT id, nom, prenom, email, mot_de_passe, role, statut
  FROM utilisateurs
  WHERE email = p_email;
END $$

CREATE PROCEDURE sp_enregistrer_connexion(
  IN p_utilisateur_id INT
)
BEGIN
  UPDATE utilisateurs SET derniere_connexion = NOW() WHERE id = p_utilisateur_id;
END $$

-- Changer le statut d'un utilisateur : actif / bloque / desactive
CREATE PROCEDURE sp_changer_statut_utilisateur(
  IN p_utilisateur_id INT,
  IN p_nouveau_statut VARCHAR(20)
)
BEGIN
  IF p_nouveau_statut NOT IN ('actif','bloque','desactive') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Statut utilisateur invalide';
  END IF;

  UPDATE utilisateurs SET statut = p_nouveau_statut WHERE id = p_utilisateur_id;
END $$

-- Créer une tâche (admin uniquement)
CREATE PROCEDURE sp_creer_tache(
  IN p_titre VARCHAR(150),
  IN p_description TEXT,
  IN p_priorite VARCHAR(20),
  IN p_date_echeance DATE,
  IN p_cree_par INT,
  OUT p_nouvel_id INT
)
BEGIN
  IF CHAR_LENGTH(TRIM(p_titre)) < 3 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Le titre doit contenir au moins 3 caracteres';
  END IF;

  INSERT INTO taches (titre, description, priorite, date_echeance, cree_par, statut)
  VALUES (p_titre, p_description, p_priorite, p_date_echeance, p_cree_par, 'a_faire');

  SET p_nouvel_id = LAST_INSERT_ID();

  INSERT INTO historique_taches (tache_id, utilisateur_id, action, details)
  VALUES (p_nouvel_id, p_cree_par, 'creation', CONCAT('Tache creee : ', p_titre));
END $$

-- Attribuer une tâche à un ou plusieurs utilisateurs.
-- p_utilisateur_ids : identifiants séparés par des virgules, ex '2,5,7'.
-- Remplace la liste d'assignés existante : les utilisateurs qui ne sont plus
-- dans la liste sont désassignés, ceux déjà présents restent inchangés (pas
-- de notification), et seuls les NOUVEAUX assignés reçoivent une notification
-- in-app -- pas de spam si la même liste est simplement re-soumise.
CREATE PROCEDURE sp_attribuer_tache(
  IN p_tache_id INT,
  IN p_utilisateur_ids VARCHAR(500),
  IN p_effectue_par INT
)
BEGIN
  DECLARE v_id_courant VARCHAR(20);
  DECLARE v_reste VARCHAR(500);
  DECLARE v_pos INT;
  DECLARE v_titre VARCHAR(150);

  -- Atomicite : si un identifiant est invalide en cours de boucle, tout est
  -- annule (y compris le desassignement du debut) plutot que de laisser un
  -- etat partiel (ex: un utilisateur assigne, un autre rejete).
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;

  SET p_utilisateur_ids = REPLACE(p_utilisateur_ids, ' ', '');
  SELECT titre INTO v_titre FROM taches WHERE id = p_tache_id;

  -- Désassigner ceux qui ne sont plus dans la nouvelle liste
  DELETE FROM tache_utilisateur
  WHERE tache_id = p_tache_id
    AND FIND_IN_SET(utilisateur_id, p_utilisateur_ids) = 0;

  SET v_reste = CONCAT(p_utilisateur_ids, ',');

  boucle: WHILE LENGTH(v_reste) > 0 DO
    SET v_pos = LOCATE(',', v_reste);
    IF v_pos = 0 THEN
      LEAVE boucle;
    END IF;
    SET v_id_courant = TRIM(SUBSTRING(v_reste, 1, v_pos - 1));
    SET v_reste = SUBSTRING(v_reste, v_pos + 1);

    IF v_id_courant <> '' THEN
      IF NOT EXISTS (SELECT 1 FROM utilisateurs WHERE id = CAST(v_id_courant AS UNSIGNED)) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Utilisateur introuvable parmi les identifiants fournis';
      END IF;

      INSERT IGNORE INTO tache_utilisateur (tache_id, utilisateur_id)
      VALUES (p_tache_id, CAST(v_id_courant AS UNSIGNED));

      -- ROW_COUNT() = 1 uniquement si la ligne est réellement nouvelle
      -- (INSERT IGNORE ne fait rien si l'utilisateur était déjà assigné)
      IF ROW_COUNT() = 1 THEN
        INSERT INTO notifications (utilisateur_id, tache_id, message)
        VALUES (CAST(v_id_courant AS UNSIGNED), p_tache_id,
                CONCAT('Une nouvelle tâche vous a été attribuée : ', v_titre));
      END IF;
    END IF;
  END WHILE boucle;

  INSERT INTO historique_taches (tache_id, utilisateur_id, action, details)
  VALUES (p_tache_id, p_effectue_par, 'attribution', CONCAT('Utilisateurs assignes : ', p_utilisateur_ids));

  COMMIT;
END $$

-- Lister les notifications d'un utilisateur (les plus récentes d'abord)
CREATE PROCEDURE sp_lister_notifications_utilisateur(
  IN p_utilisateur_id INT
)
BEGIN
  SELECT id, tache_id, message, lue, date_creation
  FROM notifications
  WHERE utilisateur_id = p_utilisateur_id
  ORDER BY date_creation DESC;
END $$

-- Marquer une notification comme lue (uniquement la sienne)
CREATE PROCEDURE sp_marquer_notification_lue(
  IN p_notification_id INT,
  IN p_utilisateur_id INT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM notifications
    WHERE id = p_notification_id AND utilisateur_id = p_utilisateur_id
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Notification introuvable pour cet utilisateur';
  END IF;

  UPDATE notifications SET lue = 1 WHERE id = p_notification_id;
END $$

-- Modifier une tâche : admin uniquement, le statut est volontairement EXCLU
CREATE PROCEDURE sp_modifier_tache(
  IN p_tache_id INT,
  IN p_titre VARCHAR(150),
  IN p_description TEXT,
  IN p_priorite VARCHAR(20),
  IN p_date_echeance DATE,
  IN p_effectue_par INT
)
BEGIN
  IF CHAR_LENGTH(TRIM(p_titre)) < 3 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Le titre doit contenir au moins 3 caracteres';
  END IF;

  UPDATE taches
  SET titre = p_titre, description = p_description,
      priorite = p_priorite, date_echeance = p_date_echeance
  WHERE id = p_tache_id AND supprime = 0;

  INSERT INTO historique_taches (tache_id, utilisateur_id, action, details)
  VALUES (p_tache_id, p_effectue_par, 'modification', 'Tache modifiee par l administrateur');
END $$

-- Modifier UNIQUEMENT le statut d'une tâche : réservé à un utilisateur assigné
CREATE PROCEDURE sp_modifier_statut_tache(
  IN p_tache_id INT,
  IN p_utilisateur_id INT,
  IN p_nouveau_statut VARCHAR(20)
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM tache_utilisateur
    WHERE tache_id = p_tache_id AND utilisateur_id = p_utilisateur_id
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Utilisateur non autorise a modifier cette tache';
  END IF;

  IF p_nouveau_statut NOT IN ('a_faire','en_cours','terminee') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Statut invalide';
  END IF;

  UPDATE taches
  SET statut = p_nouveau_statut,
      date_terminee = CASE WHEN p_nouveau_statut = 'terminee' THEN NOW() ELSE NULL END
  WHERE id = p_tache_id;

  INSERT INTO historique_taches (tache_id, utilisateur_id, action, details)
  VALUES (p_tache_id, p_utilisateur_id, 'changement_statut', CONCAT('Nouveau statut : ', p_nouveau_statut));
END $$

-- Supprimer une tâche : admin uniquement — suppression LOGIQUE (soft delete)
CREATE PROCEDURE sp_supprimer_tache(
  IN p_tache_id INT,
  IN p_effectue_par INT
)
BEGIN
  UPDATE taches
  SET supprime = 1, date_suppression = NOW()
  WHERE id = p_tache_id;

  INSERT INTO historique_taches (tache_id, utilisateur_id, action, details)
  VALUES (p_tache_id, p_effectue_par, 'suppression', 'Tache supprimee (suppression logique)');
END $$

-- Lister les tâches assignées à un utilisateur donné ("mes tâches")
CREATE PROCEDURE sp_lister_taches_utilisateur(
  IN p_utilisateur_id INT
)
BEGIN
  SELECT
    t.id, t.titre, t.description, t.statut, t.priorite,
    t.date_creation, t.date_echeance, t.date_terminee
  FROM taches t
  JOIN tache_utilisateur tu ON tu.tache_id = t.id
  WHERE tu.utilisateur_id = p_utilisateur_id AND t.supprime = 0
  ORDER BY (t.date_echeance IS NULL), t.date_echeance ASC;
END $$

DELIMITER ;

-- ============================================================================
-- 5. UTILISATEUR APPLICATIF RESTREINT (recommandé, à utiliser depuis Node.js)
-- ----------------------------------------------------------------------------
-- Ce compte n'a AUCUN droit direct sur les tables (utilisateurs, taches,
-- tache_utilisateur, historique_taches, notifications) : uniquement
-- SELECT sur les vues et EXECUTE sur les procédures. C'est ce compte, et
-- non root/admin, que le backend Node.js utilisera dans son .env.
--
-- Pourquoi ça marche quand même : les vues et procédures sont exécutées
-- avec les droits de leur créateur (SQL SECURITY DEFINER, comportement par
-- défaut), pas ceux de l'appelant. Ce compte peut donc lire les vues et
-- appeler les procédures normalement, alors qu'une requête directe sur une
-- table (SELECT/INSERT/UPDATE/DELETE) lui sera refusée par le moteur --
-- même en cas de faille ou de bug côté applicatif.
--
-- Si votre hébergement ne permet pas CREATE USER (mutualisé restreint),
-- cette section peut être ignorée sans casser le reste : il suffit que le
-- code applicatif n'utilise jamais que CALL et SELECT FROM v_....
-- ----------------------------------------------------------------------------
-- Pas de mot de passe (cohérent avec root sur XAMPP en local). Ce compte
-- reste malgré tout bloqué sur les tables : seuls les vues et les
-- procédures lui sont accessibles (voir les GRANT ci-dessous). Avant tout
-- déploiement accessible depuis l'extérieur (hors poste local), remettre
-- un mot de passe est fortement recommandé.
CREATE USER IF NOT EXISTS 'app_taskmanager'@'%';

GRANT SELECT ON TaskManager.v_utilisateurs             TO 'app_taskmanager'@'%';
GRANT SELECT ON TaskManager.v_taches_liste              TO 'app_taskmanager'@'%';
GRANT SELECT ON TaskManager.v_kpi_taches_par_statut     TO 'app_taskmanager'@'%';
GRANT SELECT ON TaskManager.v_kpi_taches_par_priorite   TO 'app_taskmanager'@'%';
GRANT SELECT ON TaskManager.v_kpi_taches_en_retard      TO 'app_taskmanager'@'%';
GRANT SELECT ON TaskManager.v_kpi_charge_utilisateurs   TO 'app_taskmanager'@'%';
GRANT SELECT ON TaskManager.v_kpi_synthese              TO 'app_taskmanager'@'%';

GRANT EXECUTE ON PROCEDURE TaskManager.sp_creer_utilisateur             TO 'app_taskmanager'@'%';
GRANT EXECUTE ON PROCEDURE TaskManager.sp_utilisateur_par_email         TO 'app_taskmanager'@'%';
GRANT EXECUTE ON PROCEDURE TaskManager.sp_utilisateur_par_id            TO 'app_taskmanager'@'%';
GRANT EXECUTE ON PROCEDURE TaskManager.sp_modifier_mot_de_passe         TO 'app_taskmanager'@'%';
GRANT EXECUTE ON PROCEDURE TaskManager.sp_enregistrer_connexion         TO 'app_taskmanager'@'%';
GRANT EXECUTE ON PROCEDURE TaskManager.sp_changer_statut_utilisateur    TO 'app_taskmanager'@'%';
GRANT EXECUTE ON PROCEDURE TaskManager.sp_creer_tache                   TO 'app_taskmanager'@'%';
GRANT EXECUTE ON PROCEDURE TaskManager.sp_attribuer_tache               TO 'app_taskmanager'@'%';
GRANT EXECUTE ON PROCEDURE TaskManager.sp_modifier_tache                TO 'app_taskmanager'@'%';
GRANT EXECUTE ON PROCEDURE TaskManager.sp_modifier_statut_tache         TO 'app_taskmanager'@'%';
GRANT EXECUTE ON PROCEDURE TaskManager.sp_supprimer_tache               TO 'app_taskmanager'@'%';
GRANT EXECUTE ON PROCEDURE TaskManager.sp_lister_taches_utilisateur     TO 'app_taskmanager'@'%';
GRANT EXECUTE ON PROCEDURE TaskManager.sp_lister_notifications_utilisateur TO 'app_taskmanager'@'%';
GRANT EXECUTE ON PROCEDURE TaskManager.sp_marquer_notification_lue      TO 'app_taskmanager'@'%';

FLUSH PRIVILEGES;