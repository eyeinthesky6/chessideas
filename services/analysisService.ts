import { ChessGame, Drill, Theme, TrainingMode } from '../types';
import { Chess } from 'chess.js';
import { DEMO_PGN_ANDERSSEN, DEMO_PGN_FISCHER, DEMO_PGN_KASPAROV, DEMO_PGN_MORPHY } from '../constants';

const cleanPgn = (pgn: string): string => {
  let clean = pgn;
  // Normalize whitespace FIRST to ensure reliable regex matching (especially for $ at end of string)
  clean = clean.replace(/\s+/g, " ").trim();

  // Remove comments { ... }
  clean = clean.replace(/\{[^}]*\}/g, " ");
  // Remove variations ( ... )
  clean = clean.replace(/\([^)]*\)/g, " ");
  // Remove metadata tags [ ... ]
  clean = clean.replace(/\[.*?\]/g, " ");
  // Remove numeric annotation glyphs like $1, $20
  clean = clean.replace(/\$\d+/g, " ");
  // Remove Result markers at the end (now works reliably because trailing whitespace is gone)
  clean = clean.replace(/(1-0|0-1|1\/2-1\/2|\*)$/, "");

  // Normalize whitespace AGAIN to clean up artifacts from replacements
  clean = clean.replace(/\s+/g, " ").trim();
  return clean;
};

// Explicit Demo Generator for the "Try Demo" button ONLY
export const generateDemoDrill = (): Drill => {
    return {
      id: 'demo-tactics-anderssen',
      sourceGameId: 'demo-game-anderssen',
      fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4', 
      theme: Theme.TACTICS,
      goal: 'Find the Mate in 1',
      solutionSan: ['Qxf7#'],
      playedMoveSan: 'Nf6', 
      difficulty: 1,
      explanation: 'The classic Scholar\'s Mate pattern.'
    };
};

export const getDemoGames = (): ChessGame[] => {
  const games: ChessGame[] = [
    {
      id: 'demo-game-anderssen',
      white: 'Adolf Anderssen',
      black: 'Jean Dufresne',
      pgn: DEMO_PGN_ANDERSSEN,
      date: '1851.06.21',
      result: '1-0',
      source: 'lichess',
      timeControl: 'classical',
      rated: false
    },
    {
      id: 'demo-game-morphy',
      white: 'Paul Morphy',
      black: 'Duke Karl',
      pgn: DEMO_PGN_MORPHY,
      date: '1858',
      result: '1-0',
      source: 'lichess',
      timeControl: 'classical',
      rated: false
    },
    {
      id: 'demo-game-fischer',
      white: 'Donald Byrne',
      black: 'Bobby Fischer',
      pgn: DEMO_PGN_FISCHER,
      date: '1956',
      result: '0-1',
      source: 'lichess',
      timeControl: 'classical',
      rated: false
    },
    {
      id: 'demo-game-kasparov',
      white: 'Garry Kasparov',
      black: 'Veselin Topalov',
      pgn: DEMO_PGN_KASPAROV,
      date: '1999',
      result: '1-0',
      source: 'lichess',
      timeControl: 'classical',
      rated: false
    }
  ];
  return games;
};

export const generateDrillFromMode = (
  games: ChessGame[], 
  mode: TrainingMode, 
  options: { startMove?: number } = {}
): Drill => {
  console.log(`[Analysis] Generating drill. Pool: ${games.length}`);
  
  if (!games || games.length === 0) {
      throw new Error("No games provided for analysis.");
  }

  let attempts = 0;
  const maxAttempts = 50;

  // Pre-calculate START FEN to avoid generating drills that are just the starting position
  const GLOBAL_START_FEN = new Chess().fen();

  while (attempts < maxAttempts) {
    attempts++;
    const game = games[Math.floor(Math.random() * games.length)];
    
    const chess = new Chess();
    
    try {
      // 1. Load PGN strictly using the cleaned version
      const cleaned = cleanPgn(game.pgn);
      chess.loadPgn(cleaned);
      
      // 2. Verify we actually loaded moves
      if (chess.history().length === 0) {
          console.warn(`[Analysis] Game ${game.id} parsed but has 0 moves.`);
          continue;
      }
    } catch (e) {
      console.warn(`[Analysis] Skipping Game ${game.id}: PGN parse error.`, e);
      continue;
    }
    
    const fullHistory = chess.history({ verbose: true });
    
    if (fullHistory.length < 12) {
        continue; 
    }

    let targetIndex = 0;
    let theme = Theme.TACTICS;
    let goal = "Find the best move";

    // 2. Select Target Index based on Mode
    switch (mode) {
      case TrainingMode.START_FROM_MOVE:
        const startMove = options.startMove || 10;
        targetIndex = Math.max(0, (startMove - 1) * 2);
        break;
      case TrainingMode.RANDOM_MOMENT:
        const min = 12; 
        const max = Math.max(min, fullHistory.length - 8);
        targetIndex = Math.floor(Math.random() * (max - min + 1)) + min;
        theme = Theme.ADVANTAGE;
        break;
      case TrainingMode.CRITICAL_POSITION:
        // Try to find a moment with captures or checks
        let bestIdx = Math.floor(fullHistory.length / 2);
        // Scan middle game for tactical complications
        const candidates = [];
        for(let i = 12; i < fullHistory.length - 8; i++) {
            const san = fullHistory[i].san;
            if (san.includes('x') || san.includes('+') || san.includes('#')) {
                candidates.push(i);
            }
        }
        
        if (candidates.length > 0) {
            targetIndex = candidates[Math.floor(Math.random() * candidates.length)];
        } else {
             targetIndex = Math.floor(fullHistory.length / 2);
        }
        theme = Theme.TACTICS;
        break;
      case TrainingMode.ENDGAME_FINISH:
        targetIndex = Math.max(0, fullHistory.length - 20); 
        theme = Theme.ENDGAME;
        goal = "Convert the endgame";
        break;
      default:
        targetIndex = Math.floor(fullHistory.length / 2);
    }

    // Bounds check
    targetIndex = Math.max(0, Math.min(targetIndex, fullHistory.length - 6));
    
    // Rewind Board to Target Index
    // Note: chess.loadPgn puts board at END of game.
    // We undo until we reach targetIndex.
    const movesToUndo = fullHistory.length - targetIndex;
    
    for (let i = 0; i < movesToUndo; i++) {
        chess.undo();
    }
    
    // 4. Verify State
    const startFen = chess.fen();
    
    // Check if the board position is effectively the start position (ignoring move counters)
    const startFenBoard = startFen.split(' ')[0];
    const globalStartBoard = GLOBAL_START_FEN.split(' ')[0];

    // Avoid Start Position (unless specifically requested by Start From Move 1)
    if (mode !== TrainingMode.START_FROM_MOVE && startFenBoard === globalStartBoard) {
        console.log("Skipping drill generated at start position.");
        continue;
    }

    // Safety Check: Verify FEN is valid for constructor
    try {
        const check = new Chess(startFen);
    } catch (e) {
        console.warn("Generated FEN is invalid for constructor:", startFen);
        continue;
    }

    const solutionMoves = fullHistory.slice(targetIndex, targetIndex + 6); // 6 plies lookahead
    if (solutionMoves.length === 0) continue;

    const solutionSan = solutionMoves.map(m => m.san);
    
    console.log(`[Analysis] Generated Drill ${game.id} at Move ${Math.floor(targetIndex/2)}. Solution: ${solutionSan[0]}`);

    return {
      id: `drill-${mode}-${game.id}-${Date.now()}`,
      sourceGameId: game.id,
      fen: startFen,
      theme,
      goal,
      solutionSan,
      playedMoveSan: fullHistory[targetIndex]?.san,
      difficulty: 3,
      explanation: "Generated from famous game analysis."
    };
  }
  
  throw new Error("Failed to generate a valid drill. Please try again or check your game settings.");
};

export const generateDrillsFromGames = async (games: ChessGame[]): Promise<Drill[]> => {
    return [];
};
