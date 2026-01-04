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
    throw new Error("API Key missing");
  }

  const model = "gemini-3-flash-preview";

  // STRICT GUARDRAILS PROMPT
  const context = `
    ROLE: You are a strict Chess Coach (IM/GM level).
    TASK: Analyze the student's move against the drill solution.
    
    CONTEXT DATA:
    - Theme: ${drill.theme}
    - Goal: ${drill.goal}
    - Start FEN: ${drill.fen}
    - Current FEN: ${fen}
    - User Move: ${userMoveSan}
    - Correct Move: ${isCorrect ? "YES" : "NO"}
    - Solution Sequence: ${drill.solutionSan.join(' ')}

    GUARDRAILS:
    1. Be concise.
    2. Reference specific squares.
    3. Explain the TACTICAL reason why the move is good or bad.
    4. Provide a "Rule of Thumb".

    OUTPUT SCHEMA (JSON):
    {
      "observation": "White Knight on f5 is undefended...",
      "explanation": "Capture leads to mate in 3.",
      "ruleOfThumb": "Loose pieces drop off (LPDO).",
      "verdict": "${isCorrect ? 'PRAISE' : 'CORRECTION'}" 
    }
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
    if (!text) throw new Error("Empty response from AI Coach");
    
    return JSON.parse(text) as CoachResponse;
  } catch (error) {
    console.error("Gemini Error:", error);
    // Return null to let UI handle "Coach unavailable"
    throw error;
  }
};
