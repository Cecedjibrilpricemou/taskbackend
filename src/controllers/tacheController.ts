import { Request, Response } from 'express';
import {
  creerTache,
  listerTaches,
  modifierTache,
  attribuerTache,
  supprimerTache,
  listerMesTaches,
  modifierStatutTache,
} from '../services/tacheService';
import { estErreurMetier } from '../utils/errors';
import { StatutTache, PrioriteTache } from '../types/entities';

const STATUTS_VALIDES: StatutTache[] = ['a_faire', 'en_cours', 'terminee'];
const PRIORITES_VALIDES: PrioriteTache[] = ['basse', 'moyenne', 'haute'];

function envoyerErreur(res: Response, err: unknown) {
  if (estErreurMetier(err)) {
    res.status(err.statusCode).json({ status: 'erreur', message: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ status: 'erreur', message: 'Erreur serveur' });
}

export async function creerTacheController(req: Request, res: Response) {
  const { titre, description, priorite, dateEcheance } = req.body;

  if (!titre || !priorite) {
    res.status(400).json({ status: 'erreur', message: 'titre et priorite sont requis' });
    return;
  }
  if (!PRIORITES_VALIDES.includes(priorite)) {
    res.status(400).json({ status: 'erreur', message: `priorite doit être l'une de : ${PRIORITES_VALIDES.join(', ')}` });
    return;
  }

  try {
    const id = await creerTache({ titre, description, priorite, dateEcheance }, req.user!.id);
    res.status(201).json({ status: 'ok', id });
  } catch (err) {
    envoyerErreur(res, err);
  }
}

export async function listerTachesController(req: Request, res: Response) {
  const statut = req.query.statut as string | undefined;
  const priorite = req.query.priorite as string | undefined;

  if (statut && !STATUTS_VALIDES.includes(statut as StatutTache)) {
    res.status(400).json({ status: 'erreur', message: `statut doit être l'un de : ${STATUTS_VALIDES.join(', ')}` });
    return;
  }
  if (priorite && !PRIORITES_VALIDES.includes(priorite as PrioriteTache)) {
    res.status(400).json({ status: 'erreur', message: `priorite doit être l'une de : ${PRIORITES_VALIDES.join(', ')}` });
    return;
  }

  try {
    const taches = await listerTaches({
      statut: statut as StatutTache | undefined,
      priorite: priorite as PrioriteTache | undefined,
    });
    res.json({ status: 'ok', taches });
  } catch (err) {
    envoyerErreur(res, err);
  }
}

export async function modifierTacheController(req: Request, res: Response) {
  const tacheId = Number(req.params.id);
  const { titre, description, priorite, dateEcheance } = req.body;

  if (!Number.isInteger(tacheId)) {
    res.status(400).json({ status: 'erreur', message: 'id de tâche invalide' });
    return;
  }
  if (!titre || !priorite) {
    res.status(400).json({ status: 'erreur', message: 'titre et priorite sont requis' });
    return;
  }
  if (!PRIORITES_VALIDES.includes(priorite)) {
    res.status(400).json({ status: 'erreur', message: `priorite doit être l'une de : ${PRIORITES_VALIDES.join(', ')}` });
    return;
  }

  try {
    await modifierTache(tacheId, { titre, description, priorite, dateEcheance }, req.user!.id);
    res.json({ status: 'ok' });
  } catch (err) {
    envoyerErreur(res, err);
  }
}

export async function attribuerTacheController(req: Request, res: Response) {
  const tacheId = Number(req.params.id);
  const { utilisateurIds } = req.body;

  if (!Number.isInteger(tacheId)) {
    res.status(400).json({ status: 'erreur', message: 'id de tâche invalide' });
    return;
  }
  if (!Array.isArray(utilisateurIds) || !utilisateurIds.every((id) => Number.isInteger(id))) {
    res.status(400).json({ status: 'erreur', message: 'utilisateurIds doit être un tableau de nombres entiers' });
    return;
  }

  try {
    await attribuerTache(tacheId, utilisateurIds, req.user!.id);
    res.json({ status: 'ok' });
  } catch (err) {
    envoyerErreur(res, err);
  }
}

export async function supprimerTacheController(req: Request, res: Response) {
  const tacheId = Number(req.params.id);

  if (!Number.isInteger(tacheId)) {
    res.status(400).json({ status: 'erreur', message: 'id de tâche invalide' });
    return;
  }

  try {
    await supprimerTache(tacheId, req.user!.id);
    res.json({ status: 'ok' });
  } catch (err) {
    envoyerErreur(res, err);
  }
}

export async function listerMesTachesController(req: Request, res: Response) {
  try {
    const taches = await listerMesTaches(req.user!.id);
    res.json({ status: 'ok', taches });
  } catch (err) {
    envoyerErreur(res, err);
  }
}

export async function modifierStatutTacheController(req: Request, res: Response) {
  const tacheId = Number(req.params.id);
  const { statut } = req.body;

  if (!Number.isInteger(tacheId)) {
    res.status(400).json({ status: 'erreur', message: 'id de tâche invalide' });
    return;
  }
  if (!statut || !STATUTS_VALIDES.includes(statut)) {
    res.status(400).json({ status: 'erreur', message: `statut doit être l'un de : ${STATUTS_VALIDES.join(', ')}` });
    return;
  }

  try {
    await modifierStatutTache(tacheId, req.user!.id, statut);
    res.json({ status: 'ok' });
  } catch (err) {
    envoyerErreur(res, err);
  }
}
