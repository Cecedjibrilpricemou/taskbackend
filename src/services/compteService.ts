import bcrypt from 'bcryptjs';
import pool from '../config/db';
import { ErreurMetier } from '../utils/errors';
import { UtilisateurAvecMotDePasse } from '../types/entities';

export async function changerMotDePasse(
  utilisateurId: number,
  ancienMotDePasse: string,
  nouveauMotDePasse: string
): Promise<void> {
  if (nouveauMotDePasse.length < 8) {
    throw new ErreurMetier(400, 'Le nouveau mot de passe doit contenir au moins 8 caractères');
  }

  const [resultats]: any = await pool.query('CALL sp_utilisateur_par_id(?)', [utilisateurId]);
  const utilisateur: UtilisateurAvecMotDePasse | undefined = resultats[0][0];
  if (!utilisateur) {
    throw new ErreurMetier(404, 'Utilisateur introuvable');
  }

  const motDePasseValide = await bcrypt.compare(ancienMotDePasse, utilisateur.mot_de_passe);
  if (!motDePasseValide) {
    throw new ErreurMetier(401, 'Ancien mot de passe incorrect');
  }

  const hash = await bcrypt.hash(nouveauMotDePasse, 10);
  await pool.query('CALL sp_modifier_mot_de_passe(?, ?)', [utilisateurId, hash]);
}
