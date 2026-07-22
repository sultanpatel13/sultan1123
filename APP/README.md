# Text Summarization Web App

A simple full-stack web application that summarizes long text using an extractive TextRank-style algorithm built with Python and Flask.

## Features

- Large text input area
- File upload support for common text-bearing formats
- Summary generation through `/summarize`
- Adjustable summary length
- Word count, reading-time, compression, and keyword analytics
- Heuristic AI-writing signal check
- Loading indicator and clear button
- Empty-input and invalid-input handling

## Project Structure

```text
APP/
├── backend/
│   ├── __init__.py
│   ├── app.py
│   └── summarizer.py
├── frontend/
│   └── README.md
├── static/
│   ├── script.js
│   └── styles.css
├── templates/
│   └── index.html
├── README.md
└── requirements.txt
```

## Run Locally

```bash
pip install -r requirements.txt
python -m backend.app
```

Then open `http://127.0.0.1:5000`.

## Train The Supervised Model

You can train the classical supervised extractive summarizer on article/abstract CSV pairs:

```bash
python -m backend.train_model --train "C:\path\to\train.csv" --validation "C:\path\to\validation.csv" --test "C:\path\to\test.csv"
```

The training script saves the model to `model_artifacts/supervised_summarizer.joblib` and metrics to `model_artifacts/supervised_metrics.json`.

## API

### `POST /summarize`

Request body:

```json
{
  "text": "Your long paragraph goes here.",
  "summary_length": 3
}
```

Response body:

```json
{
  "summary": "Generated summary text.",
  "source_file": "article.pdf",
  "analysis": {
    "input_word_count": 120,
    "summary_word_count": 42,
    "estimated_reading_time_minutes": 0.6,
    "compression_ratio": 35.0,
    "content_accuracy_score": 83.3,
    "top_keywords": ["summarization", "text", "ranking"],
    "ai_writing_signals": {
      "score": 48,
      "label": "Mixed signals",
      "details": "Heuristic estimate based on sentence uniformity, repetition, transitions, and structure. This is not a definitive AI detector."
    }
  }
}
```

## Upload Notes

The app accepts pasted text and uploaded text-bearing files. Best-supported formats include:

- `TXT`, `MD`, `CSV`, `JSON`, `HTML`, `XML`, `LOG`
- `PDF`
- `DOCX`
- `PPTX`
- Common code and config files

Legacy `.ppt` files are not parsed yet; convert them to `.pptx` first. Binary formats without readable text content are rejected with a clear error message.
