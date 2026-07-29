import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { parseCookie } from 'cookie';
import { verifierJwt } from '../middlewares/authMiddleware';
import { Notification } from '../types/entities';

let io: Server | undefined;

// Le handshake socket.io ne passe pas par le pipeline de middlewares Express
// (cookie-parser inclus) -- engine.io intercepte les requêtes /socket.io/*
// directement sur le serveur HTTP -- d'où le parsing manuel du header Cookie.
function extraireToken(socket: Socket): string | undefined {
  const entete = socket.handshake.headers.cookie;
  if (!entete) return undefined;
  return parseCookie(entete).token;
}

// Attache socket.io au serveur HTTP existant (retour de app.listen()) --
// mêmes règles CORS que l'API REST dans app.ts, requises pour que le cookie
// httpOnly de session soit envoyé lors du handshake.
export function attacherSocketIO(server: HttpServer): Server {
  io = new Server(server, {
    cors: { origin: 'http://localhost:4200', credentials: true },
  });

  io.use((socket, next) => {
    const token = extraireToken(socket);
    if (!token) {
      next(new Error('Token manquant'));
      return;
    }
    try {
      socket.data.user = verifierJwt(token);
      next();
    } catch {
      next(new Error('Token invalide ou expiré'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`user:${socket.data.user.id}`);
  });

  return io;
}

// Utilisé par les services (ex: tacheService.attribuerTache) pour pousser une
// notification au destinataire concerné uniquement, sans passer par un
// broadcast global.
export function emettreNotification(utilisateurId: number, notification: Notification): void {
  io?.to(`user:${utilisateurId}`).emit('notification:new', notification);
}
