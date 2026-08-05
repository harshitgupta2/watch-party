import { Router } from 'express';
import { RoomManager } from '../domain/RoomManager';

export function roomsRouter(roomManager: RoomManager): Router {
  const router = Router();

  router.post('/', (_req, res) => {
    const room = roomManager.createRoom();
    res.status(201).json({ roomId: room.roomId, code: room.code });
  });

  router.get('/:code', (req, res) => {
    const room = roomManager.getRoom(req.params.code);
    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }
    res.json(room.toState());
  });

  return router;
}
