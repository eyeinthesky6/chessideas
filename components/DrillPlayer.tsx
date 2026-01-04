import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Chess } from 'chess.js';
import { Drill, CoachResponse, DrillOutcome, DrillSchedule, Theme, ChessGame } from '../types';
import Board from './Board';
import { generateCoachResponse } from '../services/geminiService';
import { learningLoop } from '../services/learningLoop';
import { logEvent } from '../services/logger';

interface DrillPlayerProps {
  drill: Drill;
  game?: ChessGame;
  schedule: DrillSchedule | null;
  userSkills: any;
  onComplete: (outcome: DrillOutcome, resultData: any) => void;
  onNext: () => void;
  userId: string;
}

export const DrillPlayer: React.FC<DrillPlayerProps> = ({ drill, game, onComplete, onNext, userId }) => {
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [chessInstance, setChessInstance] = useState<Chess | null>(null);
  const [fen, setFen] = useState<string>('start');
  const [visualState, setVisualState] = useState<'neutral' | 'correct' | 'incorrect'>('neutral');
  const [startTime, setStartTime] = useState(Date.now());
  const [isProcessing, setIsProcessing] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [outcome, setOutcome] = useState<DrillOutcome | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [coachMsg, setCoachMsg] = useState<CoachResponse | null>(null);
  const [hintUsed, setHintUsed] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const initializeGame = useCallback((fenString: string) => {
      try {
          if (!fenString || fenString === 'start' || fenString === 'startpos') {
              return new Chess();
          }
          return new Chess(fenString);
      } catch (e) {
          throw new Error("Invalid FEN");
      }
  }, []);

  useEffect(() => {
    try {
        console.log(`[DrillPlayer] Init. FEN: ${drill.fen}. Solution: ${drill.solutionSan.join(',')}`);
        const newGame = initializeGame(drill.fen);
        setChessInstance(newGame);
        setFen(newGame.fen());
        setStartTime(Date.now());
        setFatalError(null);
        setVisualState('neutral');
        setOutcome(null);
        setFeedback(null);
        setCoachMsg(null);
        setRetryCount(0);
        setIsProcessing(false);
        setHintUsed(false);
    } catch (e) {
        setFatalError("Failed to load drill position.");
    }
  }, [drill, initializeGame]);

  const onPieceDrop = (source: string, target: string) => {
    if (outcome || isProcessing || !chessInstance) return false;

    const tempGame = new Chess(chessInstance.fen());
    let move;
    try {
      move = tempGame.move({ from: source, to: target, promotion: 'q' });
    } catch (e) { return false; }

    if (!move) return false;

    const currentMoveIndex = chessInstance.history().length;
    if (!drill.solutionSan || currentMoveIndex >= drill.solutionSan.length) {
        setFeedback("⚠️ End of drill solution.");
        return false;
    }

    const expectedSan = drill.solutionSan[currentMoveIndex];
    const moveClean = move.san.replace(/[+#]/g, '');
    const expectedClean = expectedSan.replace(/[+#]/g, '');
    const isCorrect = moveClean === expectedClean;

    console.log(`[Move] User: ${move.san} | Expected: ${expectedSan} | Match: ${isCorrect}`);

    if (isCorrect) {
       const nextGame = new Chess(chessInstance.fen());
       nextGame.move({ from: source, to: target, promotion: 'q' });
       setChessInstance(nextGame);
       setFen(nextGame.fen());
       
       if (currentMoveIndex + 1 >= drill.solutionSan.length) {
           handleSuccess(nextGame.fen(), move.san);
       } else {
           setFeedback("✅ Correct! Continue...");
       }
       return true;
    } else {
       handleFailure(move.san);
       return true; 
    }
  };

  const handleSuccess = async (finalFen: string, lastMoveSan: string) => {
    const durationMs = Date.now() - startTime;
    const finalOutcome = learningLoop.evaluateAttempt(true, durationMs, hintUsed ? 1 : retryCount);
    setOutcome(finalOutcome);
    setVisualState('correct');
    setFeedback(learningLoop.getOutcomeFeedback(finalOutcome));
    setIsProcessing(true);
    
    onComplete(finalOutcome, { drillId: drill.id, durationMs, attempts: retryCount + 1 });
    
    try {
      const coachData = await generateCoachResponse(drill, lastMoveSan, true, finalFen);
      setCoachMsg(coachData);
    } catch(e) {}
    setIsProcessing(false);
  };

  const handleFailure = (wrongMoveSan: string) => {
    setVisualState('incorrect');
    setFeedback(`❌ ${wrongMoveSan} is incorrect. Try: ${drill.goal}`);
    setRetryCount(prev => prev + 1);
    timeoutRef.current = setTimeout(() => {
        if (chessInstance) setFen(chessInstance.fen());
        setVisualState('neutral');
        setFeedback(null);
    }, 800);
  };

  const handleSkip = () => { onComplete(DrillOutcome.ABANDONED, { drillId: drill.id }); onNext(); };
  
  if (fatalError) return <div className="p-8 text-center text-red-500">{fatalError} <button onClick={handleSkip} className="block mt-4 text-white bg-slate-800 px-4 py-2 rounded">Skip</button></div>;

  return (
    <div className="flex flex-col h-full bg-slate-950">
      <div className="px-4 py-3 bg-slate-900 border-b border-slate-800 flex justify-between items-center shadow-sm shrink-0">
         <div className="flex flex-col">
             <div className="text-xs text-cyan-400 font-bold uppercase">{drill.theme}</div>
             <div className="text-[10px] text-slate-400">{game ? `${game.white} vs ${game.black}` : 'Training'}</div>
         </div>
         <button onClick={handleSkip} className="text-xs border border-slate-700 px-2 py-1 rounded hover:bg-slate-800">Skip</button>
      </div>

      <div className="flex-1 relative flex flex-col items-center justify-center p-4">
         <div className="w-full max-w-[480px] aspect-square relative z-0">
            <Board 
                fen={fen} 
                onPieceDrop={onPieceDrop}
                visualState={visualState}
                orientation={chessInstance?.turn() === 'b' ? 'black' : 'white'}
                isInteractive={!outcome && !isProcessing}
            />
            {isProcessing && <div className="absolute inset-0 bg-slate-900/50 flex items-center justify-center rounded-lg z-10"><div className="animate-spin h-8 w-8 border-2 border-cyan-400 rounded-full border-t-transparent"></div></div>}
            
            {/* DEBUG OVERLAY */}
            <div className="absolute bottom-1 right-1 text-[8px] text-slate-500 bg-black/50 px-1 rounded pointer-events-none">
                Target: {drill.solutionSan?.[0] || '?'}
            </div>
         </div>
         <div className={`mt-4 px-4 py-2 rounded text-sm text-center min-h-[40px] ${feedback ? 'bg-slate-800 text-white' : 'opacity-0'}`}>{feedback || '...'}</div>
      </div>

      <div className="bg-slate-900 border-t border-slate-800 p-4 shrink-0">
          {coachMsg ? (
              <div className="animate-slide-up">
                   <div className="mb-4 text-sm text-slate-300 bg-slate-800 p-3 rounded border border-slate-700">
                       <strong className={coachMsg.verdict === 'PRAISE' ? 'text-emerald-400' : 'text-amber-400'}>{coachMsg.verdict}:</strong> {coachMsg.explanation}
                   </div>
                   <button onClick={onNext} className="w-full bg-cyan-600 hover:bg-cyan-500 text-white py-3 rounded-lg font-bold">Next</button>
              </div>
          ) : (
              <div className="flex space-x-3">
                  <button onClick={() => { setFeedback(`Solution: ${drill.solutionSan.join(' ')}`); setOutcome(DrillOutcome.FAILURE); }} className="flex-1 bg-slate-800 py-3 rounded-lg text-slate-400">Give Up</button>
                  <button onClick={() => { setHintUsed(true); setFeedback(`Hint: ${drill.solutionSan[chessInstance?.history().length || 0]}`); }} className="flex-1 bg-slate-800 py-3 rounded-lg text-slate-400">Hint</button>
              </div>
          )}
      </div>
    </div>
  );
};
