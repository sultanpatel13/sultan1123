from pathlib import Path

from flask import Flask, jsonify, render_template, request

try:
    from backend.analysis import analyze_text
    from backend.bart_model import BART_SUMMARIZER
    from backend.file_utils import extract_text_from_upload
    from backend.pegasus_model import PEGASUS_SUMMARIZER
    from backend.summarizer import generate_overview, normalize_input_text, summarize_text
    from backend.supervised_model import load_supervised_summarizer
except ModuleNotFoundError:
    from analysis import analyze_text
    from bart_model import BART_SUMMARIZER
    from file_utils import extract_text_from_upload
    from pegasus_model import PEGASUS_SUMMARIZER
    from summarizer import generate_overview, normalize_input_text, summarize_text
    from supervised_model import load_supervised_summarizer


BASE_DIR = Path(__file__).resolve().parent.parent
TRAINED_SUMMARIZER = load_supervised_summarizer()

def get_trained_summarizer():
    global TRAINED_SUMMARIZER
    if TRAINED_SUMMARIZER is None:
        TRAINED_SUMMARIZER = load_supervised_summarizer()
    return TRAINED_SUMMARIZER

app = Flask(
    __name__,
    template_folder=str(BASE_DIR / "templates"),
    static_folder=str(BASE_DIR / "static"),
)


@app.get("/")
def index():
    return render_template("index.html")


@app.post("/summarize")
def summarize():
    uploaded_file = request.files.get("file")
    is_form_request = request.content_type and (
        "multipart/form-data" in request.content_type
        or "application/x-www-form-urlencoded" in request.content_type
    )

    if is_form_request:
        text = (request.form.get("text") or "").strip()
        summary_length = request.form.get("summary_length", 3)
        model_type = (request.form.get("model_type") or "extractive").strip().lower()
    else:
        payload = request.get_json(silent=True) or {}
        text = (payload.get("text") or "").strip()
        summary_length = payload.get("summary_length", 3)
        model_type = (payload.get("model_type") or "extractive").strip().lower()

    file_name = None

    if uploaded_file and uploaded_file.filename:
        try:
            extracted_text, file_name = extract_text_from_upload(uploaded_file)
        except ValueError as error:
            return jsonify({"error": str(error)}), 400

        if extracted_text.strip():
            text = extracted_text

    if not text:
        return jsonify({"error": "Please enter text or upload a supported file to summarize."}), 400

    text = normalize_input_text(text)

    try:
        summary_length = int(summary_length)
    except (TypeError, ValueError):
        return jsonify({"error": "Summary length must be a valid number."}), 400

    if summary_length < 1 or summary_length > 10:
        return jsonify({"error": "Summary length must be between 1 and 10 sentences."}), 400

    try:
        if model_type == "pegasus":
            summary = PEGASUS_SUMMARIZER.summarize(text, summary_length=summary_length)
        elif model_type == "bart":
            summary = BART_SUMMARIZER.summarize(text, summary_length=summary_length)
        else:
            trained_summarizer = get_trained_summarizer()
            if trained_summarizer is not None:
                summary = trained_summarizer.summarize(text, max_sentences=summary_length)
            else:
                summary = summarize_text(text, max_sentences=summary_length)
    except RuntimeError as error:
        return jsonify({"error": str(error)}), 400
    except Exception as error:
        if model_type == "pegasus":
            label = "PEGASUS"
        elif model_type == "bart":
            label = "BART"
        else:
            label = "summarization"
        return jsonify({"error": f"{label} failed: {error}"}), 500


    overview = generate_overview(summary or text)
    analysis = analyze_text(text, summary)

    return jsonify(
        {
            "model_type": model_type,
            "overview": overview,
            "summary": summary,
            "source_file": file_name,
            "analysis": analysis,
        }
    )


if __name__ == "__main__":
    app.run(debug=True)
