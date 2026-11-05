const express = require("express");
const { requireAuth } = require("../middleware/auth");
const router = express.Router();

const QUIZ_SCHEMA = {
  type: "OBJECT",
  properties: {
    questions: {
      type: "ARRAY",
      minItems: 5,
      maxItems: 5,
      items: {
        type: "OBJECT",
        properties: {
          question: { type: "STRING" },
          options: { type: "ARRAY", items: { type: "STRING" }, minItems: 4, maxItems: 4 },
          answerIndex: { type: "INTEGER" },
          explanation: { type: "STRING" },
        },
        required: ["question", "options", "answerIndex", "explanation"],
      },
    },
  },
  required: ["questions"],
};

// Keep only well-formed questions: 4 options and a valid answer index
const parseQuestions = (text) => {
  let raw;
  try {
    raw = JSON.parse(text).questions;
  } catch (error) {
    return [];
  }
  if (!Array.isArray(raw)) return [];

  return raw
    .filter(
      (q) =>
        q.question &&
        Array.isArray(q.options) &&
        q.options.length === 4 &&
        Number.isInteger(q.answerIndex) &&
        q.answerIndex >= 0 &&
        q.answerIndex < 4
    )
    .map(({ question, options, answerIndex, explanation }) => ({
      question,
      options,
      answerIndex,
      explanation: explanation || "",
    }));
};

// Generate a 5-question quiz with Gemini
router.post("/generate", requireAuth, async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY is not set" });
  }

  const language = String(req.body.language || "Python").slice(0, 50);
  const level = ["easy", "medium", "hard"].includes(req.body.level) ? req.body.level : "easy";

  const prompt =
    `Generate 5 ${level} level multiple-choice questions about ${language} programming. ` +
    "Each question has exactly 4 options and one correct answer. " +
    "Do not put letters like 'A.' in front of the options. " +
    "Give a one-sentence explanation of the correct answer.";

  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: "application/json", responseSchema: QUIZ_SCHEMA },
  });

  // Comma-separated; the next model is tried when one is busy, retired or too slow
  const models = (process.env.GEMINI_MODELS || "gemini-3.5-flash,gemini-3.5-flash-lite")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  let lastError = "No Gemini model configured";

  for (const model of models) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body,
          signal: AbortSignal.timeout(45000),
        }
      );
      const data = await response.json();

      if (!response.ok) {
        lastError = `${model}: ${data.error?.message || response.status}`;
        // Bad key or bad request won't be fixed by another model
        if ([400, 401, 403].includes(response.status)) break;
        continue;
      }

      // Skip the model's internal "thought" parts
      const parts = data.candidates?.[0]?.content?.parts || [];
      const text = parts.filter((p) => !p.thought).map((p) => p.text || "").join("");

      const questions = parseQuestions(text);
      if (questions.length) {
        return res.json({ questions });
      }
      lastError = `${model}: returned an unreadable quiz`;
    } catch (error) {
      lastError = `${model}: ${error.name}`;
    }
  }

  res.status(502).json({ error: `Gemini API call failed: ${lastError}` });
});

module.exports = router;
