import csv
import json
import math
import re
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List

import joblib
import numpy as np
from sklearn.linear_model import SGDClassifier
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score

try:
    from backend.summarizer import normalize_input_text, split_sentences, tokenize
except ModuleNotFoundError:
    from summarizer import normalize_input_text, split_sentences, tokenize


csv.field_size_limit(10**8)

ARTIFACT_DIR = Path(__file__).resolve().parent.parent / "model_artifacts"
MODEL_PATH = ARTIFACT_DIR / "supervised_summarizer.joblib"
METRICS_PATH = ARTIFACT_DIR / "supervised_metrics.json"


def _safe_divide(numerator: float, denominator: float) -> float:
    return numerator / denominator if denominator else 0.0


def _slugify_dataset_name(name: str | None) -> str:
    if not name:
        return "default"
    slug = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")
    return slug or "default"


def _artifact_paths(dataset_name: str | None) -> tuple[Path, Path]:
    slug = _slugify_dataset_name(dataset_name)
    if slug == "default":
        return MODEL_PATH, METRICS_PATH
    return (
        ARTIFACT_DIR / f"supervised_summarizer_{slug}.joblib",
        ARTIFACT_DIR / f"supervised_metrics_{slug}.json",
    )


def _resolve_summary_field(row: dict) -> str:
    for field_name in ("abstract", "highlights", "summary"):
        if row.get(field_name):
            return row[field_name]
    return ""


def _sentence_tokens(sentence: str) -> list[str]:
    return tokenize(sentence)


def _article_keywords(article_tokens: list[str], limit: int = 12) -> set[str]:
    return {word for word, _ in Counter(article_tokens).most_common(limit)}


def _sentence_overlap_score(sentence_tokens: list[str], abstract_tokens: set[str]) -> float:
    if not sentence_tokens or not abstract_tokens:
        return 0.0
    sentence_set = set(sentence_tokens)
    intersection = sentence_set & abstract_tokens
    precision = _safe_divide(len(intersection), len(sentence_set))
    recall = _safe_divide(len(intersection), len(abstract_tokens))
    return (2 * precision * recall) / (precision + recall) if (precision + recall) else 0.0


def _build_features(sentence: str, sentence_index: int, sentences: list[str], article_tokens: list[str]) -> list[float]:
    tokens = _sentence_tokens(sentence)
    token_counts = Counter(tokens)
    article_counts = Counter(article_tokens)
    article_keywords = _article_keywords(article_tokens)
    total_sentences = max(len(sentences), 1)
    sentence_length = len(tokens)

    keyword_overlap = _safe_divide(sum(1 for token in set(tokens) if token in article_keywords), len(article_keywords))
    centroid_similarity = 0.0
    if token_counts and article_counts:
        numerator = sum(token_counts[token] * article_counts[token] for token in token_counts)
        norm_sentence = math.sqrt(sum(value * value for value in token_counts.values()))
        norm_article = math.sqrt(sum(value * value for value in article_counts.values()))
        centroid_similarity = _safe_divide(numerator, norm_sentence * norm_article)

    unique_ratio = _safe_divide(len(set(tokens)), sentence_length)
    avg_token_length = _safe_divide(sum(len(token) for token in tokens), sentence_length)
    digit_ratio = _safe_divide(sum(1 for token in tokens if any(char.isdigit() for char in token)), sentence_length)

    return [
        sentence_index,
        _safe_divide(sentence_index, total_sentences - 1 if total_sentences > 1 else 1),
        sentence_length,
        unique_ratio,
        keyword_overlap,
        centroid_similarity,
        avg_token_length,
        digit_ratio,
    ]


def _label_sentences(sentences: list[str], abstract: str) -> list[int]:
    abstract_tokens = set(tokenize(abstract))
    sentence_scores = []
    for sentence in sentences:
        tokens = _sentence_tokens(sentence)
        sentence_scores.append(_sentence_overlap_score(tokens, abstract_tokens))

    if not sentence_scores:
        return []

    ranked_indices = sorted(range(len(sentences)), key=lambda index: sentence_scores[index], reverse=True)
    positive_count = max(1, min(3, len(sentences) // 3 or 1))
    threshold = 0.08
    labels = [0] * len(sentences)

    for index in ranked_indices[:positive_count]:
        if sentence_scores[index] > 0:
            labels[index] = 1

    for index, score in enumerate(sentence_scores):
        if score >= threshold:
            labels[index] = 1

    return labels


def _iter_examples(csv_path: str, max_records: int | None = None) -> Iterable[tuple[list[float], int]]:
    with open(csv_path, "r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row_index, row in enumerate(reader):
            if max_records is not None and row_index >= max_records:
                break

            article = normalize_input_text(row.get("article", ""))
            abstract = normalize_input_text(_resolve_summary_field(row))
            if not article or not abstract:
                continue

            sentences = split_sentences(article)
            if len(sentences) < 2:
                continue

            article_tokens = tokenize(article)
            labels = _label_sentences(sentences, abstract)

            for sentence_index, sentence in enumerate(sentences):
                features = _build_features(sentence, sentence_index, sentences, article_tokens)
                yield features, labels[sentence_index]


@dataclass
class SupervisedSummarizer:
    classifier: SGDClassifier
    threshold: float = 0.5

    def summarize(self, text: str, max_sentences: int = 3) -> str:
        normalized = normalize_input_text(text)
        sentences = split_sentences(normalized)
        if not sentences:
            return ""
        if len(sentences) <= 2:
            return " ".join(sentences)

        article_tokens = tokenize(normalized)
        features = np.array(
            [_build_features(sentence, index, sentences, article_tokens) for index, sentence in enumerate(sentences)],
            dtype=float,
        )
        probabilities = self.classifier.predict_proba(features)[:, 1]
        ranked_indices = sorted(range(len(sentences)), key=lambda index: probabilities[index], reverse=True)[:max_sentences]

        confident_indices = [index for index in ranked_indices if probabilities[index] >= self.threshold]
        selected = confident_indices or ranked_indices[:max(1, min(max_sentences, len(sentences)))]
        ordered = sorted(selected)
        return " ".join(sentences[index] for index in ordered)


def train_supervised_summarizer(
    train_csv: str,
    validation_csv: str | None = None,
    test_csv: str | None = None,
    max_train_records: int = 20000,
    max_validation_records: int = 3000,
    max_test_records: int = 3000,
    dataset_name: str | None = None,
) -> dict:
    classifier = SGDClassifier(loss="log_loss", alpha=1e-4, max_iter=1, learning_rate="optimal", tol=None)
    classes = np.array([0, 1], dtype=int)
    batch_features: list[list[float]] = []
    batch_labels: list[int] = []
    seen_examples = 0

    for features, label in _iter_examples(train_csv, max_records=max_train_records):
        batch_features.append(features)
        batch_labels.append(label)
        if len(batch_features) >= 2048:
            classifier.partial_fit(np.array(batch_features, dtype=float), np.array(batch_labels, dtype=int), classes=classes)
            seen_examples += len(batch_features)
            batch_features.clear()
            batch_labels.clear()

    if batch_features:
        classifier.partial_fit(np.array(batch_features, dtype=float), np.array(batch_labels, dtype=int), classes=classes)
        seen_examples += len(batch_features)

    summarizer = SupervisedSummarizer(classifier=classifier)
    metrics = {
        "train_examples": seen_examples,
        "train_records_used": max_train_records,
    }

    if validation_csv:
        metrics["validation"] = evaluate_supervised_summarizer(summarizer, validation_csv, max_records=max_validation_records)
    if test_csv:
        metrics["test"] = evaluate_supervised_summarizer(summarizer, test_csv, max_records=max_test_records)

    model_path, metrics_path = _artifact_paths(dataset_name)
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump({"classifier": classifier, "threshold": summarizer.threshold}, model_path)
    metrics_path.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    metrics["artifact_model_path"] = str(model_path)
    metrics["artifact_metrics_path"] = str(metrics_path)
    return metrics


def evaluate_supervised_summarizer(model: SupervisedSummarizer, csv_path: str, max_records: int = 3000) -> dict:
    y_true: list[int] = []
    y_pred: list[int] = []

    for features, label in _iter_examples(csv_path, max_records=max_records):
        probability = model.classifier.predict_proba(np.array([features], dtype=float))[0, 1]
        prediction = 1 if probability >= model.threshold else 0
        y_true.append(label)
        y_pred.append(prediction)

    if not y_true:
        return {"records_used": 0}

    return {
        "records_used": max_records,
        "examples_scored": len(y_true),
        "accuracy": round(accuracy_score(y_true, y_pred), 4),
        "precision": round(precision_score(y_true, y_pred, zero_division=0), 4),
        "recall": round(recall_score(y_true, y_pred, zero_division=0), 4),
        "f1": round(f1_score(y_true, y_pred, zero_division=0), 4),
    }


def load_supervised_summarizer(dataset_name: str | None = None) -> SupervisedSummarizer | None:
    model_path, _metrics_path = _artifact_paths(dataset_name)
    if not model_path.exists():
        return None

    artifact = joblib.load(model_path)
    return SupervisedSummarizer(
        classifier=artifact["classifier"],
        threshold=artifact.get("threshold", 0.5),
    )
