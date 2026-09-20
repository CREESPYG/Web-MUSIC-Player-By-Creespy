import type { VercelRequest, VercelResponse } from '@vercel/node';
import { dbService } from './_db.js';
import crypto from 'crypto';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      const { id, owner } = req.query;

      if (id && typeof id === 'string') {
        const item = dbService.getPlaylists(undefined, id);
        if (!item) return res.status(404).json({ error: 'Playlist not found' });
        return res.status(200).json(item);
      }

      if (owner && typeof owner === 'string') {
        const rows = dbService.getPlaylists(owner);
        return res.status(200).json(rows);
      }

      const rows = dbService.getPlaylists();
      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
      const { id, owner_uid, title, description, cover_art, tracks, author, track_count } = req.body || {};
      if (!owner_uid || !title) {
        return res.status(400).json({ error: 'owner_uid and title are required' });
      }

      const playlistId = id || crypto.randomUUID();
      const saved = dbService.upsertPlaylist({
        id: playlistId,
        owner_uid,
        title,
        description: description || '',
        cover_art: cover_art || null,
        tracks: typeof tracks === 'string' ? tracks : JSON.stringify(tracks || []),
        author: author || 'Anonymous',
        track_count: track_count || (Array.isArray(tracks) ? tracks.length : 0),
      });

      return res.status(200).json(saved);
    }

    if (req.method === 'DELETE') {
      const { id, owner } = req.query;
      if (!id || !owner || typeof id !== 'string' || typeof owner !== 'string') {
        return res.status(400).json({ error: 'Missing id or owner' });
      }

      const deleted = dbService.deletePlaylist(id, owner);
      if (!deleted) return res.status(404).json({ error: 'Playlist not found or not owner' });
      return res.status(200).json({ success: true });
    }

    if (req.method === 'PATCH') {
      const { id, action } = req.query;
      if (action === 'play' && id && typeof id === 'string') {
        dbService.incrementPlayCount(id);
        return res.status(200).json({ success: true });
      }
      return res.status(400).json({ error: 'Invalid patch action' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('Error in /api/playlists:', error);
    return res.status(500).json({ error: error.message || 'Internal error' });
  }
}
