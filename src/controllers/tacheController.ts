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

// Ce fichier regroupe deux familles de routes avec des permissions
// différentes (voir routes/tacheRoutes.ts pour le détail des middlewares) :
// - creerTacheController / listerTachesController / modifierTacheController /
//   attribuerTacheController / supprimerTacheController -> admin uniquement.
// - listerMesTachesController / modifierStatutTacheController -> utilisateur
//   standard uniquement (jamais l'admin, même s'il était assigné par erreur).

const STATUTS_VALIDES: StatutTache[] = ['a_faire', 'en_cours', 'terminee'];
const PRIORITES_VALIDES: PrioriteTache[] = ['basse', 'moyenne', 'haute'];

// Centralise la traduction ErreurMetier -> réponse HTTP pour tous les
// controllers de ce fichier (évite de répéter le même try/catch).
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

// Liste globale (admin), avec filtres optionnels ?statut= et ?priorite=
// en query string. Ne filtre pas encore par utilisateur assigné ni par
// recherche texte (voir README pour l'état des lieux des limitations connues).
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

// Remplace titre/description/priorité/échéance -- jamais le statut (voir
// modifierStatutTacheController plus bas, réservé aux utilisateurs assignés).
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

// Remplace la liste complète des utilisateurs assignés (pas un ajout).
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

// Suppression logique -- voir services/tacheService.supprimerTache.
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

// "Mes tâches" (utilisateur standard) : tâches attribuées à req.user!.id.
export async function listerMesTachesController(req: Request, res: Response) {
  try {
    const taches = await listerMesTaches(req.user!.id);
    res.json({ status: 'ok', taches });
  } catch (err) {
    envoyerErreur(res, err);
  }
}

// (utilisateur standard) Change UNIQUEMENT le statut d'une tâche qui lui
// est assignée. Le service relaie en 403 le cas où l'utilisateur n'est
// pas assigné à la tâche (vérifié côté procédure stockée).
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
