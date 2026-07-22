from dataclasses import dataclass

try:
    import torch
    from transformers import PegasusForConditionalGeneration, PegasusTokenizer
except Exception:
    torch = None
    PegasusForConditionalGeneration = None
    PegasusTokenizer = None

try:
    from backend.summarizer import normalize_input_text
except ModuleNotFoundError:
    from summarizer import normalize_input_text


DEFAULT_PEGASUS_MODEL = "google/pegasus-cnn_dailymail"


@dataclass
class PegasusSummarizer:
    model_name: str = DEFAULT_PEGASUS_MODEL

    def __post_init__(self):
        self._tokenizer = None
        self._model = None

    def _load(self):
        if PegasusTokenizer is None or PegasusForConditionalGeneration is None:
            raise RuntimeError(
                "PEGASUS dependencies are not installed. Install transformers, sentencepiece, and torch to use this model."
            )

        if self._tokenizer is None or self._model is None:
            self._tokenizer = PegasusTokenizer.from_pretrained(self.model_name)
            self._model = PegasusForConditionalGeneration.from_pretrained(self.model_name)
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
            length_penalty=0.9,
            early_stopping=True,
            no_repeat_ngram_size=3,
        )
        decoded = self._tokenizer.decode(summary_ids[0], skip_special_tokens=True)
        return decoded.strip()


PEGASUS_SUMMARIZER = PegasusSummarizer()
