import React, { useEffect } from 'react';
import { Chessboard } from 'react-chessboard';

interface BoardProps {
  fen: string;
  onPieceDrop: (source: string, target: string) => boolean;
  visualState?: 'neutral' | 'correct' | 'incorrect';
  isInteractive?: boolean;
  orientation?: 'white' | 'black';
}

const Board: React.FC<BoardProps> = ({ 
  fen, 
  onPieceDrop, 
  visualState = 'neutral', 
  isInteractive = true,
  orientation = 'white'
}) => {

  // DIAGNOSTIC LOGGING
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Board] Rendered. Interactive: ${isInteractive}, Visual: ${visualState}, FEN: ${fen.substring(0, 20)}...`);
    }
  }, [fen, isInteractive, visualState]);

  // Wrapper to intercept and log move attempts
  const handlePieceDrop = (source: string, target: string) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Board] Drag ${source} -> ${target}`);
    }
    
    // Pass to parent handler
    const result = onPieceDrop(source, target);
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Board] Move Result: ${result}`);
    }
    return result;
  };
  
  const getBorderColor = () => {
    switch (visualState) {
      case 'correct': return 'border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.5)]';
      case 'incorrect': return 'border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.5)]';
      default: return 'border-slate-700';
    }
  };

  // Safe FEN fallback
  const safePosition = (fen && fen.trim() !== '') ? fen : 'start';

  return (
    <div 
      className={`w-full max-w-[500px] aspect-square shadow-2xl rounded-lg overflow-hidden border-4 transition-all duration-300 relative ${getBorderColor()}`}
      // Force pointer events and prevent touch scrolling
      style={{ touchAction: 'none', pointerEvents: 'auto' }} 
    >
      <Chessboard 
        id="DrillBoard"
        position={safePosition} 
        onPieceDrop={handlePieceDrop}
        boardOrientation={orientation}
        customDarkSquareStyle={{ backgroundColor: '#334155' }}
        customLightSquareStyle={{ backgroundColor: '#94a3b8' }}
        arePiecesDraggable={isInteractive && visualState === 'neutral'}
        animationDuration={200}
      />
      
      {/* Overlay for incorrect state - MUST NOT BLOCK CLICKS when hidden */}
      {visualState === 'incorrect' && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="bg-red-900/90 text-white px-6 py-2 rounded-full font-bold backdrop-blur-sm animate-bounce shadow-lg">
            Incorrect - Try Again
          </div>
        </div>
      )}
    </div>
  );
};

export default Board;