from collections import Counter

try:
    from backend.summarizer import STOPWORDS, split_sentences, tokenize
except ModuleNotFoundError:
    from summarizer import STOPWORDS, split_sentences, tokenize


def _top_keywords(text: str, limit: int = 12) -> list[str]:
    counts = Counter(tokenize(text))
    return [word for word, _ in counts.most_common(limit)]


def _reading_time_minutes(word_count: int) -> float:
    # Average adult silent reading speed.
    return round(word_count / 200, 2) if word_count else 0.0


def _lexical_diversity(words: list[str]) -> float:
    if not words:
        return 0.0
    return round(len(set(words)) / len(words), 2)


def _content_accuracy_score(source_text: str, summary_text: str) -> float:
    source_keywords = set(_top_keywords(source_text))
    summary_keywords = set(_top_keywords(summary_text))
    if not source_keywords:
        return 0.0
    return round((len(source_keywords & summary_keywords) / len(source_keywords)) * 100, 1)


def _ai_writing_signals(text: str) -> dict:
    sentences = split_sentences(text)
    words = text.split()
    cleaned_words = [word.lower().strip(".,!?;:\"'()[]{}") for word in words if word.strip()]

    if not sentences or not cleaned_words:
        return {
            "score": 0,
            "label": "Insufficient text",
            "details": "Add more text for a reliable heuristic estimate.",
        }

    sentence_lengths = [len(sentence.split()) for sentence in sentences if sentence.split()]
    avg_sentence_length = sum(sentence_lengths) / len(sentence_lengths) if sentence_lengths else 0
    repeated_ratio = 1 - (len(set(cleaned_words)) / len(cleaned_words))
    transition_terms = {
        "moreover",
        "furthermore",
        "however",
        "therefore",
        "overall",
        "additionally",
        "consequently",
        "thus",
        "in conclusion",
        "in summary",
    }
    transition_hits = sum(1 for word in cleaned_words if word in transition_terms)
    punctuation_density = sum(1 for char in text if char in ",;:") / max(len(text), 1)

    score = 0
    if 14 <= avg_sentence_length <= 24:
        score += 30
    if repeated_ratio < 0.38:
        score += 20
    if transition_hits >= max(1, len(sentences) // 6):
        score += 20
    if punctuation_density > 0.018:
        score += 10
    if len(sentences) >= 5:
        score += 10
    if len(cleaned_words) >= 150:
        score += 10

    score = min(score, 100)

    if score >= 70:
        label = "Higher AI-like pattern"
    elif score >= 40:
        label = "Mixed signals"
    else:
        label = "More human-like variation"

    details = (
        "Heuristic estimate based on sentence uniformity, repetition, transitions, and structure. "
        "This is not a definitive AI detector."
    )

    return {
        "score": score,
        "label": label,
        "details": details,
    }


def analyze_text(source_text: str, summary_text: str) -> dict:
    source_words = source_text.split()
    summary_words = summary_text.split() if summary_text else []
    source_sentences = split_sentences(source_text)
    summary_sentences = split_sentences(summary_text) if summary_text else []
    source_keywords = _top_keywords(source_text)

    return {
        "input_word_count": len(source_words),
        "summary_word_count": len(summary_words),
        "input_character_count": len(source_text),
        "summary_character_count": len(summary_text),
        "input_sentence_count": len(source_sentences),
        "summary_sentence_count": len(summary_sentences),
        "estimated_reading_time_minutes": _reading_time_minutes(len(source_words)),
        "summary_reading_time_minutes": _reading_time_minutes(len(summary_words)),
        "compression_ratio": round((len(summary_words) / len(source_words)) * 100, 1) if source_words else 0.0,
        "lexical_diversity": _lexical_diversity(
            [word.lower() for word in source_words if word.lower() not in STOPWORDS]
        ),
        "content_accuracy_score": _content_accuracy_score(source_text, summary_text),
        "top_keywords": source_keywords,
        "ai_writing_signals": _ai_writing_signals(source_text),
    }
