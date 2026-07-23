import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
    AudioLines,
    Copy,
    Download,
    FileUp,
    History,
    Menu,
    Mic,
    Sparkles,
    Trash2,
    WandSparkles,
    X,
} from "lucide-react";
import { jsPDF } from "jspdf";

const SUMMARY_PRESETS = { short: 2, medium: 3, long: 5 };
const MODEL_OPTIONS = {
    extractive: "Extractive AI",
    pegasus: "PEGASUS",
    bart: "BART",
};
const DEFAULT_PLACEHOLDER = "Paste or type your text here...";
const DEFAULT_OUTPUT = "Your summary will appear here with highlighted key sentences and analytics.";
const HISTORY_KEY = "summarizer-history-v2";
const VOICE_SILENCE_TIMEOUT_MS = 1800;

const countWords = (text) => {
    const trimmed = text.trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
};

const splitSentences = (text) => text.split(/(?<=[.!?])\s+/).filter(Boolean);

function App() {
    const [text, setText] = useState("");
    const [draftTranscript, setDraftTranscript] = useState("");
    const [uploadedFile, setUploadedFile] = useState(null);
    const [summaryPreset, setSummaryPreset] = useState("medium");
    const [summaryModel, setSummaryModel] = useState("extractive");
    const [overview, setOverview] = useState("");
    const [summary, setSummary] = useState("");
    const [displayedSummary, setDisplayedSummary] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [analysis, setAnalysis] = useState(null);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [resultsOpen, setResultsOpen] = useState(false);
    const [historyItems, setHistoryItems] = useState([]);
    const [isListening, setIsListening] = useState(false);
    const [copied, setCopied] = useState(false);
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const recognitionRef = useRef(null);
    const baseTranscriptRef = useRef("");
    const recognitionActiveRef = useRef(false);
    const silenceTimeoutRef = useRef(null);

    useEffect(() => {
        const savedHistory = window.localStorage.getItem(HISTORY_KEY);
        if (savedHistory) {
            setHistoryItems(JSON.parse(savedHistory));
        }
    }, []);

    useEffect(() => {
        window.localStorage.setItem(HISTORY_KEY, JSON.stringify(historyItems));
    }, [historyItems]);

    useEffect(() => {
        if (!summary) {
            setDisplayedSummary("");
            return undefined;
        }
        let index = 0;
        const interval = window.setInterval(() => {
            index += 1;
            setDisplayedSummary(summary.slice(0, index));
            if (index >= summary.length) {
                window.clearInterval(interval);
            }
        }, 8);
        return () => window.clearInterval(interval);
    }, [summary]);

    const inputWordCount = useMemo(() => countWords(text), [text]);
    const outputSentences = useMemo(() => splitSentences(displayedSummary), [displayedSummary]);
    const keyTerms = useMemo(() => new Set(analysis?.top_keywords ?? []), [analysis]);
    const confidence = analysis?.content_accuracy_score ?? 0;
    const aiSignal = analysis?.ai_writing_signals?.score ?? 0;

    const handleUpload = (file) => {
        setUploadedFile(file || null);
        setError("");
    };

    const clearSilenceTimeout = () => {
        if (silenceTimeoutRef.current) {
            window.clearTimeout(silenceTimeoutRef.current);
            silenceTimeoutRef.current = null;
        }
    };

    const scheduleVoiceAutoStop = () => {
        clearSilenceTimeout();
        silenceTimeoutRef.current = window.setTimeout(() => {
            if (recognitionActiveRef.current) {
                recognitionActiveRef.current = false;
                recognitionRef.current?.stop();
            }
        }, VOICE_SILENCE_TIMEOUT_MS);
    };

    const handleClear = () => {
        setText("");
        setDraftTranscript("");
        baseTranscriptRef.current = "";
        setUploadedFile(null);
        setIsDragging(false);
        setOverview("");
        setSummary("");
        setDisplayedSummary("");
        setAnalysis(null);
        setError("");
        setCopied(false);
        setResultsOpen(false);
        clearSilenceTimeout();
    };

    const persistHistory = (payload) => {
        const entry = {
            id: Date.now(),
            createdAt: new Date().toLocaleString(),
            inputPreview: payload.sourceText.slice(0, 200),
            overview: payload.overview,
            summary: payload.summary,
            analysis: payload.analysis,
            sourceFile: payload.sourceFile,
            preset: payload.preset,
            model: payload.model,
        };
        setHistoryItems((current) => [entry, ...current].slice(0, 12));
    };

    const startVoiceInput = () => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            setError("Voice input is not supported in this browser.");
            return;
        }
        if (recognitionActiveRef.current) {
            return;
        }
        if (!recognitionRef.current) {
            const recognition = new SpeechRecognition();
            recognition.lang = "en-US";
            recognition.interimResults = true;
            recognition.continuous = true;
            recognition.maxAlternatives = 1;
            recognition.onstart = () => {
                recognitionActiveRef.current = true;
                setIsListening(true);
                setError("");
                scheduleVoiceAutoStop();
            };
            recognition.onresult = (event) => {
                let finalTranscript = "";
                let interimTranscript = "";

                for (let index = event.resultIndex; index < event.results.length; index += 1) {
                    const result = event.results[index];
                    const segment = result[0]?.transcript?.trim() || "";
                    if (!segment) {
                        continue;
                    }
                    if (result.isFinal) {
                        finalTranscript += `${segment} `;
                    } else {
                        interimTranscript += `${segment} `;
                    }
                }

                if (finalTranscript.trim()) {
                    const nextBase = `${baseTranscriptRef.current} ${finalTranscript}`.trim();
                    baseTranscriptRef.current = nextBase;
                    setText(nextBase);
                }

                setDraftTranscript(interimTranscript.trim());
                scheduleVoiceAutoStop();
            };
            recognition.onspeechstart = () => {
                scheduleVoiceAutoStop();
            };
            recognition.onspeechend = () => {
                scheduleVoiceAutoStop();
            };
            recognition.onerror = (event) => {
                const errorMap = {
                    "not-allowed": "Microphone permission was denied. Please allow microphone access and try again.",
                    "service-not-allowed": "Speech recognition service is not allowed in this browser.",
                    network: "A network issue interrupted voice input. Please try again.",
                    "no-speech": "No speech was detected. Try speaking a little closer to the microphone.",
                    "audio-capture": "No microphone was found. Please check your audio input device.",
                    aborted: "Voice input was stopped.",
                };
                setError(errorMap[event.error] || "Voice capture ran into an issue. Please try again.");
                recognitionActiveRef.current = false;
                setIsListening(false);
                setDraftTranscript("");
                clearSilenceTimeout();
            };
            recognition.onend = () => {
                recognitionActiveRef.current = false;
                setIsListening(false);
                setDraftTranscript("");
                clearSilenceTimeout();
            };
            recognitionRef.current = recognition;
        }
        baseTranscriptRef.current = text.trim();
        setDraftTranscript("");
        try {
            recognitionRef.current.start();
        } catch {
            recognitionActiveRef.current = false;
            setIsListening(false);
            setError("Voice input could not start. If the microphone is already active, stop it and try again.");
            clearSilenceTimeout();
        }
    };

    const stopVoiceInput = () => {
        recognitionActiveRef.current = false;
        try {
            recognitionRef.current?.stop();
        } catch {
            recognitionRef.current?.abort?.();
        }
        setIsListening(false);
        setDraftTranscript("");
        clearSilenceTimeout();
    };

    const handleCopy = async () => {
        if (!summary) return;
        await navigator.clipboard.writeText(summary);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
    };

    const handleDownloadPdf = () => {
        if (!summary) return;
        const pdf = new jsPDF({ orientation: "p", unit: "pt", format: "a4" });
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(18);
        pdf.text("AI Summary", 40, 50);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(11);
        pdf.text(pdf.splitTextToSize(summary, 520), 40, 80);
        pdf.save("summary.pdf");
    };

    const loadHistoryItem = (item) => {
        setOverview(item.overview || "");
        setSummary(item.summary);
        setDisplayedSummary(item.summary);
        setAnalysis(item.analysis);
        setSummaryPreset(item.preset);
        setSummaryModel(item.model || "extractive");
        setUploadedFile(null);
        setText(item.inputPreview);
        setHistoryOpen(false);
        setResultsOpen(true);
    };

    const handleSummarize = async () => {
        if (!text.trim() && !uploadedFile) {
            setError("Add some text or upload a file before summarizing.");
            return;
        }
        setLoading(true);
        setError("");
        setCopied(false);
        try {
            const formData = new FormData();
            formData.append("text", text);
            formData.append("summary_length", String(SUMMARY_PRESETS[summaryPreset]));
            formData.append("model_type", summaryModel);
            if (uploadedFile) {
                formData.append("file", uploadedFile);
            }
            const response = await fetch("/summarize", { method: "POST", body: formData });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || "Unable to summarize this content.");
            }
            setOverview(data.overview || "");
            setSummary(data.summary || "");
            setAnalysis(data.analysis || null);
            setResultsOpen(true);
            persistHistory({
                sourceText: uploadedFile ? `${uploadedFile.name} upload` : text,
                overview: data.overview || "",
                summary: data.summary || "",
                analysis: data.analysis || null,
                sourceFile: data.source_file || null,
                preset: summaryPreset,
                model: summaryModel,
            });
        } catch (requestError) {
            setError(requestError.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="relative min-h-screen bg-canvas-soft text-ink">
            <TopNav
                setHistoryOpen={setHistoryOpen}
                mobileNavOpen={mobileNavOpen}
                setMobileNavOpen={setMobileNavOpen}
            />

            <HeroBand onSummarize={handleSummarize} loading={loading} />

            <main className="relative z-10 mx-auto max-w-page px-4 pb-24 pt-8 sm:px-6 lg:px-8">
                <InputPanel
                    draftTranscript={draftTranscript}
                    text={text}
                    setText={setText}
                    inputWordCount={inputWordCount}
                    inputCharacterCount={text.length}
                    uploadedFile={uploadedFile}
                    handleUpload={handleUpload}
                    summaryPreset={summaryPreset}
                    setSummaryPreset={setSummaryPreset}
                    summaryModel={summaryModel}
                    setSummaryModel={setSummaryModel}
                    handleClear={handleClear}
                    loading={loading}
                    isListening={isListening}
                    startVoiceInput={startVoiceInput}
                    stopVoiceInput={stopVoiceInput}
                    isDragging={isDragging}
                    setIsDragging={setIsDragging}
                    handleSummarize={handleSummarize}
                />

                <FeatureGrid />
            </main>

            <Footer />

            <HistoryDrawer
                historyOpen={historyOpen}
                setHistoryOpen={setHistoryOpen}
                historyItems={historyItems}
                loadHistoryItem={loadHistoryItem}
            />

            <ResultsWindow
                resultsOpen={resultsOpen}
                setResultsOpen={setResultsOpen}
                loading={loading}
                analysis={analysis}
                confidence={confidence}
                aiSignal={aiSignal}
                overview={overview}
                displayedSummary={displayedSummary}
                summary={summary}
                outputSentences={outputSentences}
                keyTerms={keyTerms}
                copied={copied}
                handleCopy={handleCopy}
                handleDownloadPdf={handleDownloadPdf}
                uploadedFile={uploadedFile}
            />

            <AnimatePresence>
                {error && (
                    <motion.div
                        initial={{ opacity: 0, y: 18 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 18 }}
                        className="fixed bottom-6 left-6 z-50 max-w-md toast-error"
                    >
                        {error}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

function TopNav({ setHistoryOpen, mobileNavOpen, setMobileNavOpen }) {
    return (
        <nav className="nav-bar">
            <div className="mx-auto flex w-full max-w-page items-center justify-between px-4 sm:px-6 lg:px-8">
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                        <div className="flex h-6 w-6 items-center justify-center rounded-sm bg-ink">
                            <Sparkles size={14} className="text-on-primary" />
                        </div>
                        <span className="text-body-sm font-medium text-ink">Summarize</span>
                    </div>
                    <div className="hidden items-center gap-1 md:flex">
                        <button type="button" className="btn-ghost">
                            Features
                        </button>
                        <button type="button" onClick={() => setHistoryOpen(true)} className="btn-ghost">
                            History
                        </button>
                        <button type="button" className="btn-ghost">
                            Docs
                        </button>
                    </div>
                </div>

                <div className="hidden items-center gap-2 sm:flex">
                    <button type="button" className="btn-outline">
                        Ask AI
                    </button>
                    <button type="button" onClick={() => setHistoryOpen(true)} className="btn-secondary-sm">
                        History
                    </button>
                    <button type="button" onClick={() => setHistoryOpen(true)} className="btn-primary-sm">
                        Open App
                    </button>
                </div>

                <button
                    type="button"
                    onClick={() => setMobileNavOpen(!mobileNavOpen)}
                    className="icon-btn sm:hidden"
                    aria-label="Toggle menu"
                >
                    {mobileNavOpen ? <X size={18} /> : <Menu size={18} />}
                </button>
            </div>

            <AnimatePresence>
                {mobileNavOpen && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="absolute left-0 right-0 top-16 overflow-hidden border-b border-hairline bg-canvas sm:hidden"
                    >
                        <div className="flex flex-col gap-1 px-4 py-4">
                            <button type="button" className="btn-ghost justify-start">
                                Features
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setHistoryOpen(true);
                                    setMobileNavOpen(false);
                                }}
                                className="btn-ghost justify-start"
                            >
                                History
                            </button>
                            <button type="button" className="btn-ghost justify-start">
                                Docs
                            </button>
                            <div className="mt-2 flex gap-2">
                                <button type="button" className="btn-outline flex-1">
                                    Ask AI
                                </button>
                                <button type="button" className="btn-primary-sm flex-1">
                                    Open App
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </nav>
    );
}

function HeroBand({ onSummarize, loading }) {
    return (
        <section className="relative overflow-hidden bg-canvas">
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="mesh-gradient absolute -left-1/4 -top-1/4 h-[600px] w-[800px] animate-mesh-drift" />
                <div className="mesh-gradient absolute -right-1/4 top-0 h-[500px] w-[700px] animate-mesh-drift [animation-delay:3s]" />
            </div>

            <div className="relative z-10 mx-auto max-w-page px-4 py-16 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
                <div className="mx-auto max-w-3xl text-center">
                    <div className="mb-6 flex justify-center">
                        <span className="banner-marketing">
                            <span className="caption-mono mr-2 text-mute">New</span>
                            PEGASUS model now available
                        </span>
                    </div>
                    <h1 className="text-display-xl text-ink sm:text-[48px]">
                        Summarize any text in seconds.
                    </h1>
                    <p className="mx-auto mt-6 max-w-xl text-body-lg text-body">
                        Paste, upload, or speak your content. Get concise summaries with keyword highlights,
                        confidence scores, and AI-writing analysis.
                    </p>
                    <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                        <button type="button" onClick={onSummarize} disabled={loading} className="btn-primary">
                            <Sparkles size={16} />
                            {loading ? "Summarizing..." : "Start Summarizing"}
                        </button>
                        <button type="button" className="btn-secondary">
                            View Documentation
                        </button>
                    </div>
                </div>
            </div>
        </section>
    );
}

function InputPanel(props) {
    const {
        draftTranscript,
        text,
        setText,
        inputWordCount,
        inputCharacterCount,
        uploadedFile,
        handleUpload,
        summaryPreset,
        setSummaryPreset,
        summaryModel,
        setSummaryModel,
        handleClear,
        loading,
        isListening,
        startVoiceInput,
        stopVoiceInput,
        isDragging,
        setIsDragging,
        handleSummarize,
    } = props;

    return (
        <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="card-marketing-lg mb-16"
        >
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                <div>
                    <p className="caption-mono mb-2">Input Engine</p>
                    <h2 className="text-display-md text-ink">Context ingestion.</h2>
                    <p className="mt-2 text-body-sm text-body">
                        Upload a document or paste text to begin summarization.
                    </p>
                </div>
                <div className="flex gap-2">
                    <span className="badge-secondary">{inputWordCount} words</span>
                    <span className="badge-secondary">{inputCharacterCount} chars</span>
                </div>
            </div>

            <motion.div
                onDragOver={(event) => {
                    event.preventDefault();
                    setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(event) => {
                    event.preventDefault();
                    setIsDragging(false);
                    const [file] = event.dataTransfer.files;
                    if (file) handleUpload(file);
                }}
                className={`mb-4 rounded-md border border-dashed p-4 transition ${
                    isDragging
                        ? "border-link bg-link-bg-soft/30"
                        : "border-hairline bg-canvas-soft"
                }`}
            >
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-canvas-soft-2 text-ink">
                            <FileUp size={18} />
                        </div>
                        <div>
                            <p className="text-body-sm font-medium text-ink">Drag, drop, or upload your source</p>
                            <p className="text-xs text-mute">
                                TXT, PDF, DOCX, PPTX, HTML, CSV, JSON, code, logs, and more.
                            </p>
                        </div>
                    </div>
                    <label className="btn-outline cursor-pointer">
                        Choose File
                        <input type="file" className="hidden" onChange={(event) => handleUpload(event.target.files?.[0] ?? null)} />
                    </label>
                </div>
                <p className="mt-3 text-xs text-mute">
                    {uploadedFile ? `Loaded file: ${uploadedFile.name}` : "No file selected. Manual text still works perfectly."}
                </p>
            </motion.div>

            <div className="relative mb-6">
                <textarea
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    placeholder={DEFAULT_PLACEHOLDER}
                    className="form-textarea min-h-[320px]"
                />
                {draftTranscript && (
                    <div className="pointer-events-none absolute bottom-3 left-3 right-3 rounded-sm border border-hairline bg-canvas-soft px-3 py-2 text-body-sm italic text-body">
                        Listening: {draftTranscript}
                    </div>
                )}
            </div>

            <div className="mb-6 flex flex-col gap-4">
                <div>
                    <p className="caption-mono mb-2">Summary Length</p>
                    <div className="flex flex-wrap gap-2">
                        {Object.keys(SUMMARY_PRESETS).map((preset) => (
                            <button
                                key={preset}
                                type="button"
                                onClick={() => setSummaryPreset(preset)}
                                className={summaryPreset === preset ? "tab-ghost-active" : "tab-ghost"}
                            >
                                {preset.charAt(0).toUpperCase() + preset.slice(1)}
                            </button>
                        ))}
                    </div>
                </div>
                <div>
                    <p className="caption-mono mb-2">Model</p>
                    <div className="flex flex-wrap gap-2">
                        {Object.entries(MODEL_OPTIONS).map(([modelKey, label]) => (
                            <button
                                key={modelKey}
                                type="button"
                                onClick={() => setSummaryModel(modelKey)}
                                className={summaryModel === modelKey ? "tab-ghost-active" : "tab-ghost"}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-hairline pt-6">
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={isListening ? stopVoiceInput : startVoiceInput}
                        className={`btn-outline ${isListening ? "border-violet bg-violet-soft text-violet-deep" : ""}`}
                    >
                        <Mic size={14} />
                        {isListening ? "Listening..." : "Voice Input"}
                    </button>
                    <button type="button" onClick={handleClear} className="btn-outline">
                        <Trash2 size={14} />
                        Clear
                    </button>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <span className="text-body-sm text-mute">
                        {loading ? "Preparing summary..." : "Results open in a focused window"}
                    </span>
                    <button type="button" onClick={handleSummarize} disabled={loading} className="btn-primary">
                        <Sparkles size={16} />
                        {loading ? "Summarizing..." : "Summarize"}
                    </button>
                </div>
            </div>
        </motion.section>
    );
}

function FeatureGrid() {
    const features = [
        {
            title: "Extractive AI.",
            body: "TextRank-style sentence ranking picks the most important ideas from your source text.",
            mono: "extractive",
        },
        {
            title: "PEGASUS model.",
            body: "Abstractive summarization for fluent, human-like output on longer documents.",
            mono: "pegasus",
        },
        {
            title: "Rich analytics.",
            body: "Confidence scores, keyword highlights, reading time, and AI-writing signal detection.",
            mono: "analytics",
        },
    ];

    return (
        <section className="mb-16">
            <div className="mb-8 text-center">
                <p className="caption-mono mb-2">Capabilities</p>
                <h2 className="text-display-lg text-ink">A compute model for all workloads.</h2>
                <p className="mx-auto mt-4 max-w-xl text-body-md text-body">
                    Two summarization engines, one interface. Choose the model that fits your content.
                </p>
            </div>
            <div className="grid gap-6 md:grid-cols-3">
                {features.map((feature) => (
                    <div key={feature.mono} className="card-marketing">
                        <p className="caption-mono mb-3 text-mute">{feature.mono}</p>
                        <h3 className="text-display-sm text-ink">{feature.title}</h3>
                        <p className="mt-2 text-body-sm text-body">{feature.body}</p>
                    </div>
                ))}
            </div>
        </section>
    );
}

function ResultsWindow(props) {
    const {
        resultsOpen,
        setResultsOpen,
        loading,
        analysis,
        confidence,
        aiSignal,
        overview,
        displayedSummary,
        summary,
        outputSentences,
        keyTerms,
        copied,
        handleCopy,
        handleDownloadPdf,
        uploadedFile,
    } = props;

    return (
        <AnimatePresence>
            {resultsOpen && (
                <>
                    <motion.button
                        type="button"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setResultsOpen(false)}
                        className="fixed inset-0 z-40 bg-ink/20 backdrop-blur-sm"
                    />
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5">
                        <motion.section
                            initial={{ opacity: 0, scale: 0.96, y: 24 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.96, y: 24 }}
                            transition={{ duration: 0.22, ease: "easeOut" }}
                            className="flex max-h-[92vh] min-h-0 w-[min(1240px,96vw)] flex-col overflow-hidden rounded-lg bg-canvas p-4 shadow-elevation-5 sm:p-6"
                        >
                            <div className="mb-5 flex items-start justify-between gap-4">
                                <div>
                                    <p className="caption-mono mb-2">Interactive Results</p>
                                    <h3 className="text-display-md text-ink">Summary window.</h3>
                                    <p className="mt-1 text-body-sm text-mute">
                                        {uploadedFile?.name || "Manual text input"}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button type="button" onClick={handleCopy} className="icon-btn" aria-label="Copy">
                                        <Copy size={16} />
                                    </button>
                                    <button type="button" onClick={handleDownloadPdf} className="icon-btn" aria-label="Download PDF">
                                        <Download size={16} />
                                    </button>
                                    <button type="button" onClick={() => setResultsOpen(false)} className="icon-btn" aria-label="Close">
                                        <X size={16} />
                                    </button>
                                </div>
                            </div>

                            <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                <MetricCard label="Confidence" value={`${confidence}%`} />
                                <MetricCard label="AI Signal" value={`${aiSignal}%`} />
                                <MetricCard label="Summary Words" value={`${analysis?.summary_word_count ?? 0}`} />
                                <MetricCard label="Reading Time" value={`${analysis?.summary_reading_time_minutes ?? 0} min`} />
                            </div>

                            <div className="grid min-h-0 flex-1 gap-5 overflow-hidden lg:grid-cols-[0.9fr_1.1fr]">
                                <div className="scrollbar-thin flex min-h-0 flex-col gap-4 overflow-y-auto pr-1">
                                    <div className="rounded-md border border-hairline bg-link-bg-soft/40 px-5 py-4">
                                        <p className="caption-mono mb-2 text-link">What it&apos;s about</p>
                                        <p className="text-body-sm leading-6 text-ink">
                                            {overview || "A clear one-line explanation of the text will appear here."}
                                        </p>
                                    </div>

                                    <div className="rounded-md border border-hairline bg-canvas-soft p-5">
                                        <p className="text-display-sm mb-3 text-ink">Summary insights.</p>
                                        <div className="grid gap-3 sm:grid-cols-2">
                                            <InsightCard
                                                icon={<AudioLines size={16} />}
                                                title="Source Stats"
                                                body={
                                                    analysis
                                                        ? `${analysis.input_word_count} words, ${analysis.input_sentence_count} sentences, ${analysis.input_character_count} characters`
                                                        : "No analytics yet."
                                                }
                                            />
                                            <InsightCard
                                                icon={<History size={16} />}
                                                title="Source File"
                                                body={uploadedFile?.name || "Manual text input"}
                                            />
                                            <InsightCard
                                                icon={<WandSparkles size={16} />}
                                                title="AI Writing Risk"
                                                body={analysis?.ai_writing_signals?.details || "Heuristic guidance appears here after processing."}
                                            />
                                            <InsightCard
                                                icon={<Sparkles size={16} />}
                                                title="Top Keywords"
                                                body={analysis?.top_keywords?.join(", ") || "Keywords will surface after summarization."}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="min-h-0 overflow-hidden rounded-md border border-hairline bg-canvas p-4 sm:p-5">
                                    <div className="mb-4 flex items-center justify-between gap-4">
                                        <div className="text-body-sm text-mute">
                                            {analysis ? `${analysis.summary_word_count} words in summary` : "Ready for generation"}
                                        </div>
                                        {copied && <div className="text-xs text-link">Copied to clipboard</div>}
                                    </div>

                                    <div className="scrollbar-thin h-[calc(100%-32px)] min-h-[280px] overflow-y-auto pr-2">
                                        {loading ? (
                                            <div className="flex h-full flex-col items-center justify-center gap-4">
                                                <motion.span
                                                    animate={{ rotate: 360 }}
                                                    transition={{ repeat: Infinity, duration: 2.4, ease: "linear" }}
                                                    className="flex h-12 w-12 items-center justify-center rounded-full bg-ink text-on-primary"
                                                >
                                                    <Sparkles size={20} />
                                                </motion.span>
                                                <p className="text-body-sm text-mute">Generating interactive summary view...</p>
                                            </div>
                                        ) : displayedSummary ? (
                                            <div className="space-y-3">
                                                {outputSentences.map((sentence, index) => {
                                                    const isKeySentence = Array.from(keyTerms).some((term) =>
                                                        sentence.toLowerCase().includes(term.toLowerCase())
                                                    );
                                                    return (
                                                        <motion.p
                                                            key={`${sentence}-${index}-window`}
                                                            initial={{ opacity: 0, x: 8 }}
                                                            animate={{ opacity: 1, x: 0 }}
                                                            transition={{ delay: index * 0.05 }}
                                                            className={isKeySentence ? "sentence-key" : "sentence-default"}
                                                        >
                                                            {sentence}
                                                        </motion.p>
                                                    );
                                                })}
                                                {displayedSummary.length < summary.length && (
                                                    <span className="ml-2 inline-block h-5 w-0.5 animate-blink bg-ink align-middle" />
                                                )}
                                            </div>
                                        ) : (
                                            <p className="text-body-sm leading-6 text-mute">{DEFAULT_OUTPUT}</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </motion.section>
                    </div>
                </>
            )}
        </AnimatePresence>
    );
}

function HistoryDrawer({ historyOpen, setHistoryOpen, historyItems, loadHistoryItem }) {
    return (
        <AnimatePresence>
            {historyOpen && (
                <>
                    <motion.button
                        type="button"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setHistoryOpen(false)}
                        className="fixed inset-0 z-30 bg-ink/15 backdrop-blur-sm"
                    />
                    <motion.aside
                        initial={{ x: -420 }}
                        animate={{ x: 0 }}
                        exit={{ x: -420 }}
                        transition={{ type: "spring", damping: 25, stiffness: 220 }}
                        className="fixed left-0 top-0 z-40 flex h-full w-full max-w-md flex-col border-r border-hairline bg-canvas shadow-elevation-5"
                    >
                        <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
                            <div>
                                <p className="caption-mono mb-1">Recent Runs</p>
                                <h3 className="text-display-sm text-ink">Summary history.</h3>
                            </div>
                            <button type="button" onClick={() => setHistoryOpen(false)} className="icon-btn">
                                <X size={16} />
                            </button>
                        </div>
                        <div className="scrollbar-thin flex flex-1 flex-col gap-1 overflow-y-auto p-3">
                            {historyItems.length === 0 ? (
                                <div className="rounded-lg bg-canvas-soft p-8 text-center">
                                    <p className="text-body-md text-body">
                                        Your recent summaries will appear here for quick recall.
                                    </p>
                                </div>
                            ) : (
                                historyItems.map((item) => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => loadHistoryItem(item)}
                                        className="history-row group w-full"
                                    >
                                        <div className="mb-1 flex items-center justify-between gap-2">
                                            <span className="badge-secondary">{item.preset}</span>
                                            <span className="text-xs text-mute">{item.createdAt}</span>
                                        </div>
                                        <p className="line-clamp-2 text-body-sm text-ink">{item.inputPreview || "Uploaded file summary"}</p>
                                        <p className="mt-1 font-mono text-xs text-mute">{item.sourceFile || "Manual input"}</p>
                                    </button>
                                ))
                            )}
                        </div>
                    </motion.aside>
                </>
            )}
        </AnimatePresence>
    );
}

function Footer() {
    const columns = [
        {
            title: "Product",
            links: ["Summarize", "Analytics", "History", "API"],
        },
        {
            title: "Models",
            links: ["Extractive AI", "PEGASUS", "Benchmarks", "Training"],
        },
        {
            title: "Resources",
            links: ["Documentation", "Guides", "Support", "Changelog"],
        },
        {
            title: "Company",
            links: ["About", "Blog", "Privacy", "Terms"],
        },
    ];

    return (
        <footer className="border-t border-hairline bg-canvas px-4 py-16 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-page">
                <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
                    {columns.map((column) => (
                        <div key={column.title}>
                            <p className="caption-mono mb-4 text-mute">{column.title}</p>
                            <ul className="space-y-2">
                                {column.links.map((link) => (
                                    <li key={link}>
                                        <button type="button" className="text-body-sm text-body transition hover:text-ink">
                                            {link}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
                <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-hairline pt-8">
                    <div className="flex items-center gap-2">
                        <div className="flex h-5 w-5 items-center justify-center rounded-sm bg-ink">
                            <Sparkles size={12} className="text-on-primary" />
                        </div>
                        <span className="text-body-sm text-mute">Text Summarization</span>
                    </div>
                    <p className="text-xs text-mute">© 2026 Text Summarization. All rights reserved.</p>
                </div>
            </div>
        </footer>
    );
}

function MetricCard({ label, value }) {
    return (
        <div className="metric-card">
            <p className="caption-mono mb-2 text-mute">{label}</p>
            <p className="text-display-sm text-ink">{value}</p>
        </div>
    );
}

function InsightCard({ icon, title, body }) {
    return (
        <div className="insight-card">
            <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-md bg-canvas-soft-2 text-ink">
                {icon}
            </div>
            <h4 className="text-body-sm font-medium text-ink">{title}</h4>
            <p className="mt-1 text-xs leading-5 text-body">{body}</p>
        </div>
    );
}

export default App;
