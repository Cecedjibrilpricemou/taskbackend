// Erreur métier générique, à lever depuis n'importe quel service pour
// signaler un cas attendu (validation, ressource introuvable, conflit...)
// avec un code HTTP précis. Pattern à réutiliser partout :
//
//   throw new ErreurMetier(404, 'Tâche introuvable');
//
// puis, dans le controller :
//
//   if (estErreurMetier(err)) {
//     res.status(err.statusCode).json({ status: 'erreur', message: err.message });
//     return;
//   }
export class ErreurMetier extends Error {
  // Marqueur de type explicite plutôt qu'un `instanceof ErreurMetier`.
  // `instanceof` sur une classe d'erreur perso est fragile avec les
  // rechargements à chaud (tsx) car deux copies du module peuvent
  // coexister en mémoire -- le marqueur booléen n'a pas ce problème.
  public readonly estUneErreurMetier = true as const;

  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = 'ErreurMetier';
  }
}

export function estErreurMetier(err: unknown): err is ErreurMetier {
  return typeof err === 'object' && err !== null && (err as any).estUneErreurMetier === true;
}

interface ErreurMysql {
  code?: string;
  sqlMessage?: string;
  message: string;
}

// Une procédure stockée qui rejette une entrée invalide le fait via
// `SIGNAL SQLSTATE '45000'` côté SQL. mysql2 remonte ça comme une erreur
// avec code = 'ER_SIGNAL_EXCEPTION' -- ce guard permet de la distinguer
// d'une vraie erreur d'infrastructure (connexion perdue, etc.).
function estErreurSignalMysql(err: unknown): err is ErreurMysql {
  return typeof err === 'object' && err !== null && (err as any).code === 'ER_SIGNAL_EXCEPTION';
}

// À utiliser dans le catch d'un appel `CALL sp_...` : si la procédure a
// rejeté l'entrée via SIGNAL, on relaie son message tel quel au client
// avec le code HTTP fourni par l'appelant (le sens de l'erreur dépend du
// contexte : 400 pour une validation, 403 pour un droit refusé, etc.).
// Toute autre erreur (vraie panne) est relancée telle quelle et finit en
// 500 générique côté controller.
export function relancerErreurSignalMysql(err: unknown, statutParDefaut: number): never {
  if (estErreurSignalMysql(err)) {
    throw new ErreurMetier(statutParDefaut, err.sqlMessage || err.message);
  }
  throw err;
}

// errno 1452 = violation de contrainte de clé étrangère (ex: attribution
// d'une tâche à un tache_id qui n'existe plus/pas). Certaines procédures
// ne vérifient pas explicitement l'existence de la ressource avant
// d'insérer ; ce guard permet de transformer cette erreur SQL brute en
// 404 propre plutôt que de laisser remonter un 500.
export function estErreurContrainteFk(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as any).errno === 1452;
}
