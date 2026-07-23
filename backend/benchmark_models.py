import argparse
import csv
import json
import time
from collections import Counter
from pathlib import Path

try:
    from backend.bart_model import BART_SUMMARIZER
    from backend.pegasus_model import PEGASUS_SUMMARIZER
    from backend.summarizer import normalize_input_text
    from backend.supervised_model import load_supervised_summarizer
except ModuleNotFoundError:
    from bart_model import BART_SUMMARIZER
    from pegasus_model import PEGASUS_SUMMARIZER
    from summarizer import normalize_input_text
    from supervised_model import load_supervised_summarizer


csv.field_size_limit(10**8)


def _resolve_summary_field(row: dict) -> str:
    for field_name in ("abstract", "highlights", "summary"):
        value = (row.get(field_name) or "").strip()
        if value:
            return value
    return ""


def _tokenize_for_rouge(text: str) -> list[str]:
    return [token for token in normalize_input_text(text).lower().split() if token]


def _ngrams(tokens: list[str], n: int) -> Counter:
    if len(tokens) < n:
        return Counter()
    return Counter(tuple(tokens[index:index + n]) for index in range(len(tokens) - n + 1))


def _safe_divide(numerator: float, denominator: float) -> float:
    return numerator / denominator if denominator else 0.0


def rouge_n_f1(candidate: str, reference: str, n: int) -> float:
    candidate_tokens = _tokenize_for_rouge(candidate)
    reference_tokens = _tokenize_for_rouge(reference)
    candidate_ngrams = _ngrams(candidate_tokens, n)
    reference_ngrams = _ngrams(reference_tokens, n)

    if not candidate_ngrams or not reference_ngrams:
        return 0.0

    overlap = sum((candidate_ngrams & reference_ngrams).values())
    precision = _safe_divide(overlap, sum(candidate_ngrams.values()))
    recall = _safe_divide(overlap, sum(reference_ngrams.values()))
    return _safe_divide(2 * precision * recall, precision + recall)


def _lcs_length(sequence_a: list[str], sequence_b: list[str]) -> int:
    if not sequence_a or not sequence_b:
        return 0

    previous = [0] * (len(sequence_b) + 1)
    for token_a in sequence_a:
        current = [0]
        for index_b, token_b in enumerate(sequence_b, start=1):
            if token_a == token_b:
                current.append(previous[index_b - 1] + 1)
            else:
                current.append(max(previous[index_b], current[-1]))
        previous = current
    return previous[-1]


def rouge_l_f1(candidate: str, reference: str) -> float:
    candidate_tokens = _tokenize_for_rouge(candidate)
    reference_tokens = _tokenize_for_rouge(reference)
    if not candidate_tokens or not reference_tokens:
        return 0.0

    lcs = _lcs_length(candidate_tokens, reference_tokens)
    precision = _safe_divide(lcs, len(candidate_tokens))
    recall = _safe_divide(lcs, len(reference_tokens))
    return _safe_divide(2 * precision * recall, precision + recall)


def iter_rows(csv_path: str, limit: int) -> list[tuple[str, str]]:
    rows: list[tuple[str, str]] = []
    with open(csv_path, "r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            article = normalize_input_text((row.get("article") or "").strip())
            summary = normalize_input_text(_resolve_summary_field(row))
            if not article or not summary:
                continue
            rows.append((article, summary))
            if len(rows) >= limit:
                break
    return rows


def benchmark_model(name: str, rows: list[tuple[str, str]], summarize_fn) -> dict:
    predictions: list[str] = []
    runtimes: list[float] = []

    for article, _reference in rows:
        started_at = time.perf_counter()
        prediction = summarize_fn(article)
        runtimes.append(time.perf_counter() - started_at)
        predictions.append(prediction)

    rouge_1 = 0.0
    rouge_2 = 0.0
    rouge_l = 0.0

    for prediction, (_article, reference) in zip(predictions, rows):
        rouge_1 += rouge_n_f1(prediction, reference, 1)
        rouge_2 += rouge_n_f1(prediction, reference, 2)
        rouge_l += rouge_l_f1(prediction, reference)

    total = max(len(rows), 1)
    return {
        "model": name,
        "samples": len(rows),
        "avg_runtime_seconds": round(sum(runtimes) / total, 4),
        "total_runtime_seconds": round(sum(runtimes), 4),
        "rouge_1_f1": round(rouge_1 / total, 4),
        "rouge_2_f1": round(rouge_2 / total, 4),
        "rouge_l_f1": round(rouge_l / total, 4),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Benchmark extractive vs PEGASUS summarizers.")
    parser.add_argument("--test", required=True, help="Path to the test CSV file.")
    parser.add_argument("--samples", type=int, default=25, help="Number of rows to benchmark.")
    parser.add_argument("--summary-length", type=int, default=3, help="Target summary length setting.")
    parser.add_argument("--dataset-name", default="cnn_dailymail", help="Dataset-specific artifact suffix.")
    args = parser.parse_args()

    rows = iter_rows(args.test, args.samples)
    if not rows:
        raise SystemExit("No valid rows were found in the dataset.")

    trained_summarizer = load_supervised_summarizer(args.dataset_name) or load_supervised_summarizer()
    if trained_summarizer is None:
        raise SystemExit("No trained supervised summarizer artifact was found.")

    results = [
        benchmark_model(
            "supervised_extractive",
            rows,
            lambda article: trained_summarizer.summarize(article, max_sentences=args.summary_length),
        ),
        benchmark_model(
            "pegasus",
            rows,
            lambda article: PEGASUS_SUMMARIZER.summarize(article, summary_length=args.summary_length),
        ),
        benchmark_model(
            "bart",
            rows,
            lambda article: BART_SUMMARIZER.summarize(article, summary_length=args.summary_length),
        ),
    ]

    print(json.dumps({"dataset": Path(args.test).name, "samples": len(rows), "results": results}, indent=2))


if __name__ == "__main__":
    main()
