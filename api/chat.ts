import type { VercelRequest, VercelResponse } from '@vercel/node';
import { dbService } from './_db.js';
import crypto from 'crypto';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      const { room } = req.query;
      if (!room || typeof room !== 'string') {
        return res.status(400).json({ error: 'Missing room query parameter' });
      }

      const rows = dbService.getChat(room);
      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
      const { room_id, user_id, nickname, message } = req.body || {};
      if (!room_id || !user_id || !nickname || !message) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const id = crypto.randomUUID();
      const saved = dbService.addChatMessage({
        id,
        room_id,
        user_id,
        nickname,
        message,
      });

      return res.status(201).json(saved);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('Error in /api/chat:', error);
    return res.status(500).json({ error: error.message || 'Internal error' });
  }
}
