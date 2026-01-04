import { ChessGame, TimeControl } from '../types';

const LICHESS_API_BASE = 'https://lichess.org/api';

const mapSpeedToTimeControl = (speed: string): TimeControl => {
  switch (speed) {
    case 'ultraBullet': // Lichess specific
    case 'bullet': return 'bullet';
    case 'blitz': return 'blitz';
    case 'rapid': return 'rapid';
    case 'classical': return 'classical';
    case 'correspondence': return 'daily';
    default: 
      console.warn(`[Lichess Import] Unknown speed: ${speed}`);
      return 'unknown';
  }
};

export const fetchRecentGames = async (usernameInput: string, count: number = 100): Promise<ChessGame[]> => {
  // Normalize input (handle full URL)
  const username = usernameInput.includes('lichess.org') 
    ? usernameInput.split('/').pop()?.trim() || usernameInput 
    : usernameInput.trim();

  // Fetch up to 'count' games (default 100)
  const url = `${LICHESS_API_BASE}/games/user/${username}?max=${count}&pgnInJson=true&clocks=false&opening=true`;
  console.log(`[Lichess Import] Requesting: ${url}`);

  try {
    const response = await fetch(url, {
      headers: { 'Accept': 'application/x-ndjson' }
    });

    if (!response.ok) {
      let errorMessage = `Lichess API Error: ${response.status}`;
      if (response.status === 404) errorMessage = `User '${username}' not found on Lichess.`;
      else if (response.status === 429) errorMessage = "Lichess rate limit exceeded. Please wait a moment.";
      throw new Error(errorMessage);
    }

    const text = await response.text();
    if (!text || !text.trim()) {
        console.warn(`[Lichess Import] No games found for ${username}.`);
        return [];
    }

    const games = text.trim().split('\n').map((line, idx) => {
      try {
        if (!line.trim()) return null;
        const data = JSON.parse(line);
        const mappedTC = mapSpeedToTimeControl(data.speed);

        // Debug logging for first few items
        if (idx < 2) {
            console.log(`[Lichess Import] Sample Game ${idx}:`, { id: data.id, speed: data.speed, mappedTC });
        }

        return {
          id: data.id,
          white: data.players.white.user?.name || 'Anonymous',
          black: data.players.black.user?.name || 'Anonymous',
          pgn: data.pgn,
          date: new Date(data.createdAt).toISOString(),
          result: data.winner ? (data.winner === 'white' ? '1-0' : '0-1') : '1/2-1/2',
          source: 'lichess',
          timeControl: mappedTC,
          rated: data.rated || false
        } as ChessGame;
      } catch (e) {
        console.warn("Skipping malformed game line", e);
        return null;
      }
    }).filter(Boolean) as ChessGame[];

    console.log(`[Lichess Import] Parsed ${games.length} games.`);
    
    // Log distribution
    const distribution = games.reduce((acc, g) => {
        acc[g.timeControl] = (acc[g.timeControl] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);
    console.log("[Lichess Import] Distribution:", distribution);

    return games;
  } catch (error) {
    console.error("Failed to fetch games", error);
    throw error;
  }
};