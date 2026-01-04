import { GoogleGenAI } from "@google/genai";
import { Drill, CoachResponse } from '../types';

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

export const generateCoachResponse = async (
  drill: Drill,
  userMoveSan: string,
  isCorrect: boolean,
  fen: string
): Promise<CoachResponse> => {
  if (!apiKey) {
    return {
      observation: "Demo Mode: API Key missing.",
      explanation: "Without an API key, I cannot analyze this specific position.",
      ruleOfThumb: "Always connect your API key for live coaching.",
      verdict: isCorrect ? 'PRAISE' : 'CORRECTION'
    };
  }

  const model = "gemini-3-flash-preview";

  // STRICT GUARDRAILS PROMPT
  const context = `
    ROLE: You are a strict Chess Engine Proxy (Stockfish 16 level).
    TASK: Analyze the student's move against the drill solution.
    
    CONTEXT DATA:
    - Theme: ${drill.theme}
    - Goal: ${drill.goal}
    - Start FEN: ${drill.fen}
    - Current FEN: ${fen}
    - User Move: ${userMoveSan}
    - Correct Move: ${isCorrect ? "YES" : "NO"}
    - Solution Sequence: ${drill.solutionSan.join(' ')}

    GUARDRAILS (STRICT COMPLIANCE REQUIRED):
    1. DO NOT be conversational. Be analytical and terse.
    2. REFERENCE specific squares/pieces in your "observation".
    3. EXPLANATION must be tactical/concrete, not abstract. Max 3 bullet points.
    4. RULE OF THUMB must be a single memorable principle (Max 10 words).
    5. VERDICT must accurately reflect the outcome quality.

    OUTPUT SCHEMA (JSON):
    {
      "observation": "White Knight on f5 dominates the dark squares...",
      "explanation": "• The move allows Rxf7...\n• Black cannot recapture due to...",
      "ruleOfThumb": "Knights on the rim are dim.",
      "verdict": "${isCorrect ? 'PRAISE' : 'CORRECTION'}" 
    }
    
    Use "HINT" as verdict only if the move was a near-miss or alternate candidate.
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: context,
      config: { 
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            observation: { type: "STRING" },
            explanation: { type: "STRING" },
            ruleOfThumb: { type: "STRING" },
            verdict: { type: "STRING", enum: ["PRAISE", "CORRECTION", "HINT"] }
          },
          required: ["observation", "explanation", "ruleOfThumb", "verdict"]
        }
      }
    });
    
    const text = response.text;
    if (!text) throw new Error("No response");
    
    return JSON.parse(text) as CoachResponse;
  } catch (error) {
    console.error("Gemini Error:", error);
    return {
      observation: "Engine Disconnected",
      explanation: "Analysis unavailable.",
      ruleOfThumb: "Check connection.",
      verdict: "HINT"
    };
  }
};

export const analyzeGameForDrills = async (pgn: string): Promise<string> => {
  if (!apiKey) return "";

  const model = "gemini-3-flash-preview";
  // Enforce stricter analysis JSON
  const prompt = `
    Analyze this chess PGN. Identify 1 CRITICAL tactical error or missed opportunity (Blunder/Miss).
    Return JSON format: { "fen": "...", "theme": "TACTICS", "goal": "Find the winning sequence", "solutionSan": ["move1", "move2"], "difficulty": 3, "explanation": "..." }
    PGN: ${pgn}
  `;

  try {
     const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: { responseMimeType: "application/json" }
    });
    return response.text || "";
  } catch (e) {
    console.error(e);
    return "";
  }
};