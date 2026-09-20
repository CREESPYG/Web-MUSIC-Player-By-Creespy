import type { VercelRequest, VercelResponse } from '@vercel/node';
import { dbService } from './_db.js';
import crypto from 'crypto';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      const { code } = req.query;
      if (code && typeof code === 'string') {
        const row = dbService.getRoom(code);
        if (!row) return res.status(404).json({ error: 'Room not found' });
        return res.status(200).json(row);
      }

      const rows = dbService.getRoom();
      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
      const { room_code, name, room_type, host_id, control_mode, require_approval, chat_enabled, voice_enabled, max_participants } = req.body || {};
      if (!room_code || !name || !host_id) {
        return res.status(400).json({ error: 'room_code, name, and host_id are required' });
      }

      const roomId = crypto.randomUUID();
      const saved = dbService.createRoom({
        id: roomId,
        room_code,
        name,
        room_type: room_type || 'public',
        host_id,
        control_mode: control_mode || 'host_only',
        require_approval: require_approval || 0,
        chat_enabled: chat_enabled !== undefined ? chat_enabled : 1,
        voice_enabled: voice_enabled !== undefined ? voice_enabled : 1,
        max_participants: max_participants || 20,
      });

      return res.status(201).json(saved);
    }

    if (req.method === 'PATCH') {
      const { id } = req.query;
      if (!id || typeof id !== 'string') return res.status(400).json({ error: 'Missing room id' });

      const updates = req.body || {};
      const updated = dbService.updateRoom(id, updates);
      if (!updated) return res.status(404).json({ error: 'Room not found' });

      return res.status(200).json(updated);
    }

    if (req.method === 'DELETE') {
      const { id, host } = req.query;
      if (!id || !host || typeof id !== 'string' || typeof host !== 'string') {
        return res.status(400).json({ error: 'Missing id or host' });
      }

      const closed = dbService.closeRoom(id, host);
      if (!closed) return res.status(404).json({ error: 'Room not found or not host' });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('Error in /api/rooms:', error);
    return res.status(500).json({ error: error.message || 'Internal error' });
  }
}
