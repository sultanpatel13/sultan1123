const inputText = document.getElementById("inputText");
const fileInput = document.getElementById("fileInput");
const fileMeta = document.getElementById("fileMeta");
const summarizeButton = document.getElementById("summarizeButton");
const clearButton = document.getElementById("clearButton");
const summaryOutput = document.getElementById("summaryOutput");
const loadingIndicator = document.getElementById("loadingIndicator");
const errorMessage = document.getElementById("errorMessage");
const inputWordCount = document.getElementById("inputWordCount");
const summaryWordCount = document.getElementById("summaryWordCount");
const summaryLength = document.getElementById("summaryLength");
const summaryLengthValue = document.getElementById("summaryLengthValue");
const readingTimeMetric = document.getElementById("readingTimeMetric");
const compressionMetric = document.getElementById("compressionMetric");
const accuracyMetric = document.getElementById("accuracyMetric");
const aiScoreMetric = document.getElementById("aiScoreMetric");
const aiLabel = document.getElementById("aiLabel");
const aiDetails = document.getElementById("aiDetails");
const keywordsOutput = document.getElementById("keywordsOutput");
const sourceFileOutput = document.getElementById("sourceFileOutput");

const defaultSummaryText = "Your summary will appear here after processing the text.";

function resetMetrics() {
    summaryWordCount.textContent = "0 words";
    readingTimeMetric.textContent = "0 min";
    compressionMetric.textContent = "0%";
    accuracyMetric.textContent = "0%";
    aiScoreMetric.textContent = "0%";
    aiLabel.textContent = "Not analyzed yet";
    aiDetails.textContent = "This app uses a heuristic estimate, not a definitive AI detector.";
    keywordsOutput.textContent = "No keywords yet";
    sourceFileOutput.textContent = fileInput.files[0] ? fileInput.files[0].name : "Manual text input";
}

function updateInputWordCount() {
    const words = inputText.value.trim() ? inputText.value.trim().split(/\s+/).length : 0;
    inputWordCount.textContent = `${words} words`;
}

function setLoadingState(isLoading) {
    summarizeButton.disabled = isLoading;
    loadingIndicator.classList.toggle("hidden", !isLoading);
}

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.remove("hidden");
}

function clearError() {
    errorMessage.textContent = "";
    errorMessage.classList.add("hidden");
}

function updateSummaryLengthLabel() {
    const sentenceCount = Number(summaryLength.value);
    const label = sentenceCount === 1 ? "1 sentence" : `${sentenceCount} sentences`;
    summaryLengthValue.textContent = label;
}

function updateFileMeta() {
    if (fileInput.files.length > 0) {
        const file = fileInput.files[0];
        fileMeta.textContent = `${file.name} selected. The uploaded file will be used as the primary summarization source.`;
        sourceFileOutput.textContent = file.name;
    } else {
        fileMeta.textContent = "Supports text-based files including TXT, PDF, DOCX, HTML, CSV, JSON, logs, and code files.";
        sourceFileOutput.textContent = "Manual text input";
    }
}

function renderAnalysis(analysis) {
    summaryWordCount.textContent = `${analysis.summary_word_count} words`;
    readingTimeMetric.textContent = `${analysis.estimated_reading_time_minutes} min`;
    compressionMetric.textContent = `${analysis.compression_ratio}%`;
    accuracyMetric.textContent = `${analysis.content_accuracy_score}%`;
    aiScoreMetric.textContent = `${analysis.ai_writing_signals.score}%`;
    aiLabel.textContent = analysis.ai_writing_signals.label;
    aiDetails.textContent = analysis.ai_writing_signals.details;
    keywordsOutput.textContent = analysis.top_keywords.length > 0 ? analysis.top_keywords.join(", ") : "No keywords extracted";
}

inputText.addEventListener("input", updateInputWordCount);
summaryLength.addEventListener("input", updateSummaryLengthLabel);
fileInput.addEventListener("change", updateFileMeta);

clearButton.addEventListener("click", () => {
    inputText.value = "";
    fileInput.value = "";
    summaryOutput.textContent = defaultSummaryText;
    clearError();
    updateInputWordCount();
    updateFileMeta();
    resetMetrics();
});

summarizeButton.addEventListener("click", async () => {
    const text = inputText.value.trim();
    const file = fileInput.files[0];

    clearError();

    if (!text && !file) {
        showError("Please enter some text or upload a file before requesting a summary.");
        summaryOutput.textContent = defaultSummaryText;
        resetMetrics();
        return;
    }

    setLoadingState(true);
    summaryOutput.textContent = "Generating summary...";
    resetMetrics();

    try {
        const formData = new FormData();
        formData.append("text", text);
        formData.append("summary_length", Number(summaryLength.value));
        if (file) {
            formData.append("file", file);
        }

        const response = await fetch("/summarize", {
            method: "POST",
            body: formData,
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Unable to generate summary.");
        }

        summaryOutput.textContent = data.summary || "No summary could be generated for the provided text.";
        renderAnalysis(data.analysis);
        sourceFileOutput.textContent = data.source_file || (file ? file.name : "Manual text input");
    } catch (error) {
        summaryOutput.textContent = defaultSummaryText;
        resetMetrics();
        showError(error.message || "Something went wrong while summarizing the text.");
    } finally {
        setLoadingState(false);
    }
});

updateInputWordCount();
updateSummaryLengthLabel();
updateFileMeta();
resetMetrics();
