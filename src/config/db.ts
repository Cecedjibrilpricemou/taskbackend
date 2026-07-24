import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

// Ce pool se connecte avec le compte MySQL restreint `app_taskmanager`.
// Ce compte n'a AUCUN droit direct sur les tables (utilisateurs, taches,
// tache_utilisateur, historique_taches, notifications) : uniquement SELECT
// sur les vues (v_...) et EXECUTE sur les procédures stockées (sp_...).
// Une requête directe sur une table échouera avec une erreur MySQL
// "command denied" -- c'est voulu, pas un bug. Voir schema.sql à la racine
// du dépôt pour le détail des GRANT.
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});

export default pool;
