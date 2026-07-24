export class ErreurMetier extends Error {
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

function estErreurSignalMysql(err: unknown): err is ErreurMysql {
  return typeof err === 'object' && err !== null && (err as any).code === 'ER_SIGNAL_EXCEPTION';
}

export function relancerErreurSignalMysql(err: unknown, statutParDefaut: number): never {
  if (estErreurSignalMysql(err)) {
    throw new ErreurMetier(statutParDefaut, err.sqlMessage || err.message);
  }
  throw err;
}

export function estErreurContrainteFk(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as any).errno === 1452;
}
