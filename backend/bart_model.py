from dataclasses import dataclass

try:
    import torch
    from transformers import BartForConditionalGeneration, BartTokenizer
except Exception:
    torch = None
    BartForConditionalGeneration = None
    BartTokenizer = None

try:
    from backend.summarizer import normalize_input_text
except ModuleNotFoundError:
    from summarizer import normalize_input_text


DEFAULT_BART_MODEL = "facebook/bart-large-cnn"


@dataclass
class BartSummarizer:
    model_name: str = DEFAULT_BART_MODEL

    def __post_init__(self):
        self._tokenizer = None
        self._model = None

    def _load(self):
        if BartTokenizer is None or BartForConditionalGeneration is None:
            raise RuntimeError(
                "BART dependencies are not installed. Install transformers and torch to use this model."
            )

        if self._tokenizer is None or self._model is None:
            self._tokenizer = BartTokenizer.from_pretrained(self.model_name)
            self._model = BartForConditionalGeneration.from_pretrained(self.model_name)
            self._model.eval()

    def summarize(self, text: str, summary_length: int = 3) -> str:
        normalized = normalize_input_text(text)
        if not normalized:
            return ""

        self._load()

        min_length = max(24, summary_length * 18)
        max_length = min(220, max(60, summary_length * 45))

        inputs = self._tokenizer(
            normalized,
            truncation=True,
            padding="longest",
            max_length=1024,
            return_tensors="pt",
        )

        if torch is not None and torch.cuda.is_available():
            self._model = self._model.to("cuda")
            inputs = {key: value.to("cuda") for key, value in inputs.items()}

        summary_ids = self._model.generate(
            **inputs,
            num_beams=4,
            min_length=min_length,
            max_length=max_length,
            length_penalty=2.0,
            early_stopping=True,
            no_repeat_ngram_size=3,
        )
        decoded = self._tokenizer.decode(summary_ids[0], skip_special_tokens=True)
        return decoded.strip()


BART_SUMMARIZER = BartSummarizer()