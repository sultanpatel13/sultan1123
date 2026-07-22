import math
import re
from collections import Counter
from typing import List


STOPWORDS = {
    "a",
    "about",
    "above",
    "after",
    "again",
    "against",
    "all",
    "am",
    "an",
    "and",
    "any",
    "are",
    "as",
    "at",
    "be",
    "because",
    "been",
    "before",
    "being",
    "below",
    "between",
    "both",
    "but",
    "by",
    "could",
    "did",
    "do",
    "does",
    "doing",
    "down",
    "during",
    "each",
    "few",
    "for",
    "from",
    "further",
    "had",
    "has",
    "have",
    "having",
    "he",
    "her",
    "here",
    "hers",
    "herself",
    "him",
    "himself",
    "his",
    "how",
    "i",
    "if",
    "in",
    "into",
    "is",
    "it",
    "its",
    "itself",
    "just",
    "me",
    "more",
    "most",
    "my",
    "myself",
    "no",
    "nor",
    "not",
    "now",
    "of",
    "off",
    "on",
    "once",
    "only",
    "or",
    "other",
    "our",
    "ours",
    "ourselves",
    "out",
    "over",
    "own",
    "same",
    "she",
    "should",
    "so",
    "some",
    "such",
    "than",
    "that",
    "the",
    "their",
    "theirs",
    "them",
    "themselves",
    "then",
    "there",
    "these",
    "they",
    "this",
    "those",
    "through",
    "to",
    "too",
    "under",
    "until",
    "up",
    "very",
    "was",
    "we",
    "were",
    "what",
    "when",
    "where",
    "which",
    "while",
    "who",
    "whom",
    "why",
    "with",
    "would",
    "you",
    "your",
    "yours",
    "yourself",
    "yourselves",
    "hey",
    "gemini",
    "please",
    "summarize",
    "summary",
    "quote",
    "text",
    "sentence",
    "sentences",
}


SENTENCE_SPLIT_PATTERN = re.compile(r"(?<=[.!?])\s+")
WORD_PATTERN = re.compile(r"[A-Za-z0-9']+")
SPACE_PATTERN = re.compile(r"\s+")
FILLER_PATTERN = re.compile(r"\b(?:um|uh|erm|hmm|like)\b", re.IGNORECASE)
VOICE_COMMAND_PATTERN = re.compile(
    r"^(?:(?:hey\s+\w+[\s,]*)?(?:please\s+)?(?:summarize|summary)(?:\s+the\s+(?:quote|text|sentence))?[\s,:-]*)+",
    re.IGNORECASE,
)


def split_sentences(text: str) -> List[str]:
    cleaned = " ".join(text.strip().split())
    if not cleaned:
        return []

    sentences = [sentence.strip() for sentence in SENTENCE_SPLIT_PATTERN.split(cleaned) if sentence.strip()]
    return sentences


def tokenize(text: str) -> List[str]:
    return [
        token.lower()
        for token in WORD_PATTERN.findall(text)
        if token and token.lower() not in STOPWORDS
    ]


def normalize_input_text(text: str) -> str:
    cleaned = SPACE_PATTERN.sub(" ", text.strip())
    cleaned = FILLER_PATTERN.sub("", cleaned)
    cleaned = VOICE_COMMAND_PATTERN.sub("", cleaned)
    cleaned = SPACE_PATTERN.sub(" ", cleaned).strip()

    if not cleaned:
        return ""

    words = cleaned.split()
    collapsed: List[str] = []
    index = 0

    while index < len(words):
        removed_repeat = False

        # Collapse repeated consecutive phrases common in speech-to-text retries.
        for phrase_len in range(min(8, (len(words) - index) // 2), 0, -1):
            current_phrase = words[index:index + phrase_len]
            next_phrase = words[index + phrase_len:index + (2 * phrase_len)]
            if current_phrase == next_phrase:
                collapsed.extend(current_phrase)
                index += phrase_len * 2
                while words[index:index + phrase_len] == current_phrase:
                    index += phrase_len
                removed_repeat = True
                break

        if removed_repeat:
            continue

        if collapsed and words[index].lower() == collapsed[-1].lower():
            index += 1
            continue

        collapsed.append(words[index])
        index += 1

    normalized = " ".join(collapsed)
    normalized = re.sub(r"\b(\w+(?:\s+\w+){0,3})\s+\1\b", r"\1", normalized, flags=re.IGNORECASE)
    normalized = SPACE_PATTERN.sub(" ", normalized).strip()
    return normalized


def sentence_similarity(sentence_a: str, sentence_b: str) -> float:
    tokens_a = tokenize(sentence_a)
    tokens_b = tokenize(sentence_b)

    if not tokens_a or not tokens_b:
        return 0.0

    counts_a = Counter(tokens_a)
    counts_b = Counter(tokens_b)

    common_words = set(counts_a) & set(counts_b)
    numerator = sum(counts_a[word] * counts_b[word] for word in common_words)

    norm_a = math.sqrt(sum(value * value for value in counts_a.values()))
    norm_b = math.sqrt(sum(value * value for value in counts_b.values()))

    if norm_a == 0 or norm_b == 0:
        return 0.0

    return numerator / (norm_a * norm_b)


def pagerank(matrix: List[List[float]], damping: float = 0.85, max_iterations: int = 50, tolerance: float = 1e-4) -> List[float]:
    size = len(matrix)
    if size == 0:
        return []

    scores = [1.0 / size] * size

    for _ in range(max_iterations):
        updated_scores = [(1.0 - damping) / size] * size

        for source_index in range(size):
            outbound_weight = sum(matrix[source_index])
            if outbound_weight == 0:
                share = damping * scores[source_index] / size
                for target_index in range(size):
                    updated_scores[target_index] += share
                continue

            for target_index in range(size):
                weight = matrix[source_index][target_index]
                if weight > 0:
                    updated_scores[target_index] += damping * scores[source_index] * (weight / outbound_weight)

        delta = sum(abs(updated_scores[index] - scores[index]) for index in range(size))
        scores = updated_scores
        if delta <= tolerance:
            break

    return scores


def summarize_text(text: str, max_sentences: int = 3) -> str:
    normalized_text = normalize_input_text(text)
    sentences = split_sentences(normalized_text)
    if not sentences:
        return ""

    if len(sentences) <= 2:
        return " ".join(sentences)

    max_sentences = max(1, min(max_sentences, len(sentences)))
    similarity_matrix: List[List[float]] = []

    for source_sentence in sentences:
        row = []
        for target_sentence in sentences:
            if source_sentence == target_sentence:
                row.append(0.0)
            else:
                row.append(sentence_similarity(source_sentence, target_sentence))
        similarity_matrix.append(row)

    ranked_scores = pagerank(similarity_matrix)
    ranked_indices = sorted(
        range(len(sentences)),
        key=lambda index: ranked_scores[index],
        reverse=True,
    )[:max_sentences]

    ordered_indices = sorted(ranked_indices)
    return " ".join(sentences[index] for index in ordered_indices)


def generate_overview(text: str) -> str:
    normalized_text = normalize_input_text(text)
    sentences = split_sentences(normalized_text)
    if not sentences:
        return ""

    top_sentence = summarize_text(normalized_text, max_sentences=1).strip()

    if top_sentence:
        top_sentence = top_sentence[0].upper() + top_sentence[1:]
        return top_sentence

    return sentences[0]
