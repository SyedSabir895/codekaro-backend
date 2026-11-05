from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import json
import os
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

# Enable CORS only for your frontend origin
CORS(app, resources={r"/generate-quiz": {"origins": "http://localhost:5173"}})

# Gemini settings come from backend/.env (never hardcode the key)
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
# Comma-separated; the next model is tried when one is busy, retired or too slow
GEMINI_MODELS = [m.strip() for m in os.getenv("GEMINI_MODELS", "gemini-3.5-flash,gemini-3.5-flash-lite").split(",") if m.strip()]
# Express (server.js) already uses PORT=5000, so the quiz service runs on its own port
QUIZ_PORT = int(os.getenv("QUIZ_PORT", "5001"))

QUIZ_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "questions": {
            "type": "ARRAY",
            "minItems": 5,
            "maxItems": 5,
            "items": {
                "type": "OBJECT",
                "properties": {
                    "question": {"type": "STRING"},
                    "options": {"type": "ARRAY", "items": {"type": "STRING"}, "minItems": 4, "maxItems": 4},
                    "answerIndex": {"type": "INTEGER"},
                    "explanation": {"type": "STRING"},
                },
                "required": ["question", "options", "answerIndex", "explanation"],
            },
        }
    },
    "required": ["questions"],
}


def parse_questions(text):
    """Keep only well-formed questions: 4 options and a valid answer index."""
    try:
        raw = json.loads(text).get("questions", [])
    except (ValueError, AttributeError):
        return []

    questions = []
    for q in raw:
        options = q.get("options") or []
        answer = q.get("answerIndex")
        if q.get("question") and len(options) == 4 and isinstance(answer, int) and 0 <= answer < 4:
            questions.append({
                "question": q["question"],
                "options": options,
                "answerIndex": answer,
                "explanation": q.get("explanation", ""),
            })
    return questions


@app.route('/')
def home():
    return 'Flask backend is running!'

@app.route('/generate-quiz', methods=['POST'])
def generate_quiz():
    if not GEMINI_API_KEY:
        return jsonify({"error": "GEMINI_API_KEY is not set in backend/.env"}), 500

    data = request.get_json(silent=True) or {}
    language = data.get('language', 'Python')
    level = data.get('level', 'easy')

    prompt = (
        f"Generate 5 {level} level multiple-choice questions about {language} programming. "
        "Each question has exactly 4 options and one correct answer. "
        "Do not put letters like 'A.' in front of the options. "
        "Give a one-sentence explanation of the correct answer."
    )

    headers = {"Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY}
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        # Ask Gemini for JSON in a fixed shape so the frontend can run an interactive quiz
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": QUIZ_SCHEMA,
        },
    }
    last_error = "No Gemini model configured"

    for model in GEMINI_MODELS:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        try:
            response = requests.post(url, json=body, headers=headers, timeout=45)
        except requests.RequestException as e:
            last_error = f"{model}: {e.__class__.__name__}"
            continue

        if response.status_code != 200:
            message = response.json().get("error", {}).get("message", response.text)
            last_error = f"{model}: {message}"
            # Bad key or bad request won't be fixed by another model
            if response.status_code in (400, 401, 403):
                break
            continue

        # Safely extract quiz content (skip the model's internal "thought" parts)
        candidates = response.json().get("candidates", [])
        parts = candidates[0].get("content", {}).get("parts", []) if candidates else []
        text = "".join(p.get("text", "") for p in parts if not p.get("thought")).strip()

        questions = parse_questions(text)
        if not questions:
            last_error = f"{model}: returned an unreadable quiz"
            continue
        return jsonify({"questions": questions})

    return jsonify({"error": f"Gemini API call failed: {last_error}"}), 502


if __name__ == '__main__':
    app.run(port=QUIZ_PORT, debug=True)
