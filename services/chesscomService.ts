import { ChessGame, TimeControl } from '../types';

const CHESSCOM_API_BASE = 'https://api.chess.com/pub';

const mapTimeClassToTimeControl = (timeClass: string): TimeControl => {
  switch (timeClass) {
    case 'bullet': return 'bullet';
    case 'blitz': return 'blitz';
    case 'rapid': return 'rapid';
    case 'daily': return 'daily';
    default: return 'unknown';
  }
};

export const fetchChessComGames = async (usernameInput: string, count: number = 20): Promise<ChessGame[]> => {
  // Normalize input
  const username = usernameInput.includes('chess.com') 
  ? usernameInput.split('/').pop()?.trim() || usernameInput 
  : usernameInput.trim();

  try {
    // 1. Get list of monthly archives
    const archivesRes = await fetch(`${CHESSCOM_API_BASE}/player/${username}/games/archives`);
    if (!archivesRes.ok) throw new Error(`Chess.com user '${username}' not found.`);
    
    const data = await archivesRes.json();
    const archives = data.archives;

    if (!archives || archives.length === 0) return [];

    // 2. Fetch recent archives (Iterate backwards through the last 3)
    // This protects against cases where the new month just started and has 0 games.
    const archivesToFetch = archives.slice(-3).reverse(); 
    let rawGames: any[] = [];
    
    for (const url of archivesToFetch) {
        if (rawGames.length >= count) break;
        try {
            console.log(`[ChessCom Import] Fetching archive: ${url}`);
            const res = await fetch(url);
            const data = await res.json();
            if (data.games && Array.isArray(data.games)) {
                // Archives are chronological, reverse them to get newest first
                rawGames = rawGames.concat(data.games.reverse());
            }
        } catch(e) { 
            console.warn(`[ChessCom Import] Failed to fetch archive ${url}`, e); 
        }
    }

    // 3. Normalize to ChessGame format
    return rawGames
      .slice(0, count)
      .map((g: any) => {
        try {
            return {
            id: g.url ? g.url.split('/').pop() : `cc-${Date.now()}-${Math.random()}`,
            white: g.white.username,
            black: g.black.username,
            pgn: g.pgn,
            date: new Date(g.end_time * 1000).toISOString(),
            result: g.white.result === 'win' ? '1-0' : (g.black.result === 'win' ? '0-1' : '1/2-1/2'),
            source: 'chesscom',
            timeControl: mapTimeClassToTimeControl(g.time_class),
            rated: g.rated || false
            } as ChessGame;
        } catch (e) { return null; }
      }).filter(Boolean) as ChessGame[];

  } catch (error) {
    console.error("Failed to fetch Chess.com games", error);
    throw error;
  }
};