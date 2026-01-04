import React, { useState, useEffect, useRef } from 'react';
import { Chess } from 'chess.js';
import { Drill, CoachResponse, DrillOutcome, DrillSchedule, ChessGame } from '../types';
import Board from './Board';
import { generateCoachResponse } from '../services/geminiService';
import { learningLoop } from '../services/learningLoop';

interface DrillPlayerProps {
  drill: Drill;
  game?: ChessGame;
  schedule: DrillSchedule | null;
  userSkills: any;
  onComplete: (outcome: DrillOutcome, resultData: any) => void;
  onNext: () => void;
  userId: string;
}

export const DrillPlayer: React.FC<DrillPlayerProps> = ({ drill, game, onComplete, onNext }) => {
  // Use Lazy Initialization for state to ensure we start with the Drill's FEN immediately
  // This prevents the "flash of start position" or stuck start position.
  const [chessInstance, setChessInstance] = useState<Chess | null>(() => {
    try {
        return new Chess(drill.fen);
    } catch (e) {
        console.error("Failed to init chess instance", e);
        return new Chess(); // Fallback to start, though this indicates broken drill
    }
  });
  
  const [fen, setFen] = useState<string>(() => {
      try { return new Chess(drill.fen).fen(); } catch { return 'start'; }
  });

  const [visualState, setVisualState] = useState<'neutral' | 'correct' | 'incorrect'>('neutral');
  const [startTime, setStartTime] = useState(Date.now());
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCoaching, setIsCoaching] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [outcome, setOutcome] = useState<DrillOutcome | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [coachMsg, setCoachMsg] = useState<CoachResponse | null>(null);
  const [coachError, setCoachError] = useState<string | null>(null);
  const [hintUsed, setHintUsed] = useState(false);
  const [fatalError, setFatalError] = useState<string | null>(null);
  
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Update board if drill prop changes completely (e.g. Next Drill)
  useEffect(() => {
    try {
        if (!drill || !drill.fen) throw new Error("Drill data missing");
        
        const newGame = new Chess(drill.fen);
        setChessInstance(newGame);
        setFen(newGame.fen());
        setStartTime(Date.now());
        setFatalError(null);
        setVisualState('neutral');
        setOutcome(null);
        setFeedback(null);
        setCoachMsg(null);
        setCoachError(null);
        setRetryCount(0);
        setIsProcessing(false);
        setIsCoaching(false);
        setHintUsed(false);
    } catch (e) {
        console.error("Board Init Error", e);
        setFatalError(`Error loading position: ${drill.fen}`);
    }
  }, [drill.id]); // Key off ID to avoid unnecessary re-inits

  const triggerCoach = async (finalFen: string, moveSan: string, isCorrect: boolean) => {
      setIsCoaching(true);
      try {
          const response = await generateCoachResponse(drill, moveSan, isCorrect, finalFen);
          setCoachMsg(response);
      } catch (e) {
          setCoachError("AI Coach unavailable (Check API Key)");
      } finally {
          setIsCoaching(false);
      }
  };

  const onPieceDrop = (source: string, target: string) => {
    if (outcome || isProcessing || !chessInstance) return false;

    // Speculate logic: create temp instance to check validity
    const tempGame = new Chess(chessInstance.fen());
    let move;
    
    try {
      move = tempGame.move({ from: source, to: target, promotion: 'q' });
    } catch (e) { 
        return false; 
    }

    if (!move) return false;

    const currentPly = 0; // Relative to the drill start, we are at 0 if we assume single move drill mostly?
    // Actually, we should track ply relative to drill start.
    // However, drill.solutionSan is an array. 
    // If we support multi-move drills, we need to track index.
    
    // For now, let's determine current index by comparing FENs or just maintain a step counter?
    // Simplest is to assume drills are short and use internal history relative to start?
    // But chessInstance history accumulates.
    // Wait, if we loaded from FEN, history is empty in chess.js!
    // So history().length is exactly the number of moves user made.
    const userMadeMovesCount = chessInstance.history().length;
    
    const expectedSan = drill.solutionSan[userMadeMovesCount]; 
    
    if (!expectedSan) {
        setFeedback("End of drill.");
        return false;
    }

    // Clean SAN (remove checks/mates for comparison)
    const moveClean = move.san.replace(/[+#]/g, '');
    const expectedClean = expectedSan.replace(/[+#]/g, '');
    const isCorrect = moveClean === expectedClean;

    if (isCorrect) {
       // Apply move to real state
       const nextGame = new Chess(chessInstance.fen());
       nextGame.move({ from: source, to: target, promotion: 'q' });
       setChessInstance(nextGame);
       setFen(nextGame.fen());
       
       // Check if this was the last move in the solution sequence
       if (userMadeMovesCount + 1 >= drill.solutionSan.length) {
           handleSuccess(nextGame.fen(), move.san);
       } else {
           setFeedback("✅ Correct! Keep going...");
       }
       return true;
    } else {
       handleFailure(move.san);
       return false; // Snap back
    }
  };

  const handleSuccess = (finalFen: string, lastMoveSan: string) => {
    const durationMs = Date.now() - startTime;
    const finalOutcome = learningLoop.evaluateAttempt(true, durationMs, hintUsed ? 1 : retryCount);
    setOutcome(finalOutcome);
    setVisualState('correct');
    setFeedback(learningLoop.getOutcomeFeedback(finalOutcome));
    
    onComplete(finalOutcome, { drillId: drill.id, durationMs, attempts: retryCount + 1 });
    triggerCoach(finalFen, lastMoveSan, true);
  };

  const handleFailure = (wrongMoveSan: string) => {
    setVisualState('incorrect');
    setFeedback(`❌ ${wrongMoveSan} is incorrect.`);
    setRetryCount(prev => prev + 1);
    
    timeoutRef.current = setTimeout(() => {
        setVisualState('neutral');
        setFeedback(null);
    }, 1000);
  };

  const handleGiveUp = () => {
      const solution = drill.solutionSan.join(' ');
      setFeedback(`Solution: ${solution}`);
      setOutcome(DrillOutcome.FAILURE);
      onComplete(DrillOutcome.FAILURE, { drillId: drill.id });
      triggerCoach(fen, "Resigned", false);
  };

  if (fatalError) return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center space-y-4">
          <div className="text-red-500 font-bold text-xl">Drill Load Error</div>
          <p className="text-slate-400 text-sm font-mono bg-slate-900 p-2 rounded">{fatalError}</p>
          <button onClick={onNext} className="bg-slate-800 hover:bg-slate-700 text-white px-6 py-2 rounded-lg">Skip Drill</button>
      </div>
  );

  const turnColor = chessInstance?.turn() === 'w' ? 'White' : 'Black';

  return (
    <div className="flex flex-col h-full bg-slate-950">
      <div className="px-4 py-3 bg-slate-900 border-b border-slate-800 flex justify-between items-center shadow-sm shrink-0">
         <div className="flex flex-col">
             <div className="text-xs text-cyan-400 font-bold uppercase tracking-wider">{drill.theme}</div>
             <div className="text-[10px] text-slate-400 truncate max-w-[200px]">{game ? `${game.white} vs ${game.black}` : 'Drill'}</div>
         </div>
         <div className="text-xs font-mono text-slate-500">{drill.goal}</div>
      </div>

      <div className="flex-1 relative flex flex-col items-center justify-center p-4 min-h-0 overflow-hidden">
         <div className="w-full max-w-[500px] flex flex-col items-center gap-3">
            <div className="w-full aspect-square relative z-0">
               <Board 
                   fen={fen} 
                   onPieceDrop={onPieceDrop}
                   visualState={visualState}
                   orientation={chessInstance?.turn() === 'b' ? 'black' : 'white'}
                   isInteractive={!outcome && !isProcessing}
               />
               
               {/* Coach Loading Overlay */}
               {isCoaching && (
                    <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center rounded-lg z-20 animate-fade-in">
                        <div className="w-12 h-12 mb-4 rounded-full border-4 border-slate-700 border-t-cyan-500 animate-spin"></div>
                        <div className="text-cyan-400 font-bold text-sm">AI Coach Analyzing...</div>
                    </div>
               )}
            </div>
            
            <div className="flex flex-col items-center space-y-2 w-full">
                <div className="text-xs uppercase tracking-widest text-slate-500 font-semibold">{turnColor} to Move</div>
                <div className={`px-4 py-2 rounded-lg text-sm text-center font-medium transition-all w-full ${feedback ? 'bg-slate-800 text-white opacity-100' : 'opacity-0'}`}>
                    {feedback || '...'}
                </div>
            </div>
         </div>
      </div>

      <div className="bg-slate-900 border-t border-slate-800 p-4 shrink-0 min-h-[160px]">
          {coachMsg ? (
              <div className="animate-slide-up space-y-3">
                   <div className="flex items-start gap-3">
                       <div className="mt-1 w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-lg shadow-inner">🤖</div>
                       <div className="flex-1 bg-slate-800 p-3 rounded-tr-xl rounded-br-xl rounded-bl-xl border border-slate-700/50">
                           <div className="text-sm text-slate-300 leading-relaxed mb-2">
                               <strong className={coachMsg.verdict === 'PRAISE' ? 'text-emerald-400' : 'text-amber-400'}>{coachMsg.verdict}</strong>: {coachMsg.explanation}
                           </div>
                           <div className="text-xs font-mono text-cyan-400/80 border-t border-slate-700 pt-2 mt-2">
                               💡 Tip: {coachMsg.ruleOfThumb}
                           </div>
                       </div>
                   </div>
                   <button onClick={onNext} className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white py-3 rounded-xl font-bold shadow-lg transition-all transform active:scale-95">Next Drill →</button>
              </div>
          ) : outcome ? (
              <div className="text-center space-y-3">
                  {coachError && <div className="text-red-400 text-xs">{coachError}</div>}
                   {!isCoaching && <button onClick={onNext} className="w-full bg-slate-700 text-white py-3 rounded-xl font-bold">Continue</button>}
              </div>
          ) : (
              <div className="flex space-x-3">
                  <button onClick={handleGiveUp} className="flex-1 bg-slate-800 hover:bg-slate-700 py-3 rounded-xl text-slate-400 font-medium transition-colors border border-slate-700">Give Up</button>
                  <button onClick={() => { setHintUsed(true); setFeedback(`Hint: Try moving ${drill.solutionSan[0][0] || 'a piece'}...`); }} className="flex-1 bg-slate-800 hover:bg-slate-700 py-3 rounded-xl text-cyan-400 font-medium transition-colors border border-slate-700">Get Hint</button>
              </div>
          )}
      </div>
    </div>
  );
};
