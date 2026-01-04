import { ChessGame, Drill, Theme, TrainingMode } from '../types';
import { Chess } from 'chess.js';
import { DEMO_PGN } from '../constants';

const cleanPgn = (pgn: string): string => {
  // Simple cleanup, rely on chess.js for heavy lifting
  // Remove likely header debris if prepended
  let clean = pgn.trim();
  // Remove comments { ... }
  clean = clean.replace(/\{[^}]*\}/g, '');
  return clean;
};

export const getDemoGames = (): ChessGame[] => {
  return [
    {
      id: 'demo-game-1',
      white: 'Adolf Anderssen',
      black: 'Jean Dufresne',
      pgn: DEMO_PGN,
      date: '1852.01.01',
      result: '1-0',
      source: 'lichess',
      timeControl: 'classical',
      rated: false
    }
  ];
};

export const getDemoDrills = (): Drill[] => {
  return [
    {
      id: 'demo-tactics-1',
      sourceGameId: 'demo-game-1',
      fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4', 
      theme: Theme.TACTICS,
      goal: 'Find the Mate in 1',
      solutionSan: ['Qxf7#'],
      playedMoveSan: 'Nf6', 
      difficulty: 1,
      explanation: 'The classic Scholar\'s Mate pattern targeting f7.'
    }
  ];
};

export const generateDrillFromMode = (
  games: ChessGame[], 
  mode: TrainingMode, 
  options: { startMove?: number } = {}
): Drill | null => {
  console.log(`[Analysis] Generating drill for Mode: ${mode}, Pool: ${games.length} games`);
  
  if (games.length === 0) return null;

  for (let attempt = 0; attempt < 25; attempt++) {
    const game = games[Math.floor(Math.random() * games.length)];
    const chess = new Chess();
    
    try {
      const cleaned = cleanPgn(game.pgn);
      chess.loadPgn(cleaned);
    } catch (e) {
      console.warn(`[Analysis] Bad PGN for game ${game.id}`);
      continue;
    }
    
    const fullHistory = chess.history({ verbose: true });
    // Filter very short games
    if (fullHistory.length < 10) continue; 

    let targetIndex = 0;
    let theme = Theme.TACTICS;
    let goal = "Find the best move";
    let explanation = "Training from a specific moment.";

    // Select Ply (Half-move index)
    switch (mode) {
      case TrainingMode.START_FROM_MOVE:
        const startMove = options.startMove || 10;
        targetIndex = Math.max(0, (startMove - 1) * 2);
        break;
      case TrainingMode.RANDOM_MOMENT:
        const min = 16; 
        const max = Math.max(min, fullHistory.length - 8);
        if (max <= min) targetIndex = Math.floor(fullHistory.length / 2);
        else targetIndex = Math.floor(Math.random() * (max - min + 1)) + min;
        theme = Theme.ADVANTAGE;
        goal = "Find the continuation";
        break;
      case TrainingMode.CRITICAL_POSITION:
        // Heuristic: Center of the game often has tactics
        targetIndex = Math.floor(fullHistory.length / 2);
        theme = Theme.TACTICS;
        goal = "Find the critical move";
        break;
      case TrainingMode.ENDGAME_FINISH:
        targetIndex = Math.max(0, fullHistory.length - 20); 
        theme = Theme.ENDGAME;
        goal = "Convert the endgame";
        break;
      default:
        targetIndex = Math.floor(fullHistory.length / 2);
        break;
    }

    // Safety Bounds
    targetIndex = Math.max(0, Math.min(targetIndex, fullHistory.length - 2));
    
    // Ensure we don't accidentally start at move 0 unless intended
    if (mode !== TrainingMode.START_FROM_MOVE && targetIndex === 0) {
        targetIndex = 12; 
    }

    // 1. REWIND TO TARGET
    // history.length is total moves. We want to be at state BEFORE move `targetIndex` is played.
    // So we undo until history length equals targetIndex.
    let undoSafety = 0;
    while (chess.history().length > targetIndex && undoSafety < 500) {
        chess.undo();
        undoSafety++;
    }

    const startFen = chess.fen();
    
    // 2. Validate Position
    if (targetIndex > 0 && startFen === 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1') {
         // Should not happen if targetIndex > 0
         console.warn("Rewind logic hit start pos unexpectedly.");
         continue; 
    }

    // 3. Extract Solution
    const lookahead = 6; 
    const solutionMoves = fullHistory.slice(targetIndex, targetIndex + lookahead);
    
    if (solutionMoves.length === 0) continue; 

    const solutionSan = solutionMoves.map(m => m.san);
    const actualMovePlayed = fullHistory[targetIndex] ? fullHistory[targetIndex].san : undefined;
    
    console.log(`[Analysis] Success: ${game.id} @ ${targetIndex}. FEN: ${startFen}`);

    return {
      id: `mode-${mode}-${game.id}-${Date.now()}`,
      sourceGameId: game.id,
      fen: startFen,
      theme,
      goal,
      solutionSan,
      playedMoveSan: actualMovePlayed,
      difficulty: 3,
      explanation
    };
  }
  
  return null;
};

export const generateDrillsFromGames = async (games: ChessGame[]): Promise<Drill[]> => {
  return []; 
};