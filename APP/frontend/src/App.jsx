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
    MoonStar,
    Sparkles,
    SunMedium,
    Trash2,
    WandSparkles,
    X,
} from "lucide-react";
import { jsPDF } from "jspdf";

const SUMMARY_PRESETS = { short: 2, medium: 3, long: 5 };
const DEFAULT_PLACEHOLDER = "Paste or type your text here...";
const DEFAULT_OUTPUT = "Your summary will appear here with highlighted key sentences and analytics.";
const HISTORY_KEY = "summarizer-history-v2";

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
    const [overview, setOverview] = useState("");
    const [summary, setSummary] = useState("");
    const [displayedSummary, setDisplayedSummary] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [analysis, setAnalysis] = useState(null);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [resultsOpen, setResultsOpen] = useState(false);
    const [historyItems, setHistoryItems] = useState([]);
    const [theme, setTheme] = useState("dark");
    const [isListening, setIsListening] = useState(false);
    const [copied, setCopied] = useState(false);
    const [ripples, setRipples] = useState([]);
    const [isDragging, setIsDragging] = useState(false);
    const recognitionRef = useRef(null);
    const baseTranscriptRef = useRef("");

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
        document.body.classList.toggle("light", theme === "light");
    }, [theme]);

    useEffect(() => {
        window.localStorage.setItem("summarizer-theme", theme);
    }, [theme]);

    useEffect(() => {
        const savedTheme = window.localStorage.getItem("summarizer-theme");
        if (savedTheme === "dark" || savedTheme === "light") {
            setTheme(savedTheme);
        }
    }, []);

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
    const isLight = theme === "light";

    const particles = Array.from({ length: 16 }, (_, index) => ({
        id: index,
        width: 80 + (index % 5) * 18,
        height: 80 + (index % 4) * 16,
        left: `${(index * 7) % 100}%`,
        top: `${(index * 13) % 100}%`,
        delay: `${index * 0.35}s`,
        color:
            index % 3 === 0
                ? "rgba(71, 215, 255, 0.35)"
                : index % 3 === 1
                    ? "rgba(138, 92, 255, 0.28)"
                    : "rgba(21, 245, 186, 0.22)",
    }));

    const addRipple = (event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const ripple = {
            id: Date.now() + Math.random(),
            x: rect.left + rect.width / 2 - size / 2,
            y: rect.top + rect.height / 2 - size / 2,
            size,
        };
        setRipples((current) => [...current, ripple]);
        window.setTimeout(() => {
            setRipples((current) => current.filter((item) => item.id !== ripple.id));
        }, 650);
    };

    const handleUpload = (file) => {
        setUploadedFile(file || null);
        setError("");
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
        };
        setHistoryItems((current) => [entry, ...current].slice(0, 12));
    };

    const startVoiceInput = () => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            setError("Voice input is not supported in this browser.");
            return;
        }
        if (!recognitionRef.current) {
            const recognition = new SpeechRecognition();
            recognition.lang = "en-US";
            recognition.interimResults = true;
            recognition.continuous = true;
            recognition.maxAlternatives = 1;
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
            };
            recognition.onerror = () => {
                setError("Voice capture ran into an issue. Please try again.");
                setIsListening(false);
                setDraftTranscript("");
            };
            recognition.onend = () => {
                setIsListening(false);
                setDraftTranscript("");
            };
            recognitionRef.current = recognition;
        }
        setError("");
        baseTranscriptRef.current = text.trim();
        setDraftTranscript("");
        setIsListening(true);
        recognitionRef.current.start();
    };

    const stopVoiceInput = () => {
        recognitionRef.current?.stop();
        setIsListening(false);
        setDraftTranscript("");
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
            });
        } catch (requestError) {
            setError(requestError.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={`relative min-h-screen overflow-hidden transition-colors duration-500 ${isLight ? "text-slate-900" : "bg-night text-cloud"}`}>
            <div className={`pointer-events-none absolute inset-0 bg-grid-fade bg-[size:52px_52px] ${isLight ? "opacity-[0.04]" : "opacity-[0.08]"}`} />
            {particles.map((particle) => (
                <span
                    key={particle.id}
                    className="particle animate-drift"
                    style={{
                        width: particle.width,
                        height: particle.height,
                        left: particle.left,
                        top: particle.top,
                        background: particle.color,
                        animationDelay: particle.delay,
                    }}
                />
            ))}
            <div className="relative z-10 mx-auto flex min-h-screen max-w-[1600px] flex-col px-4 pb-8 pt-4 sm:px-6 lg:px-8">
                <TopNav theme={theme} setTheme={setTheme} setHistoryOpen={setHistoryOpen} />
                <div className="flex flex-1">
                    <InputPanel
                        draftTranscript={draftTranscript}
                        isLight={isLight}
                        text={text}
                        setText={setText}
                        inputWordCount={inputWordCount}
                        inputCharacterCount={text.length}
                        uploadedFile={uploadedFile}
                        handleUpload={handleUpload}
                        summaryPreset={summaryPreset}
                        setSummaryPreset={setSummaryPreset}
                        handleClear={handleClear}
                        loading={loading}
                        isListening={isListening}
                        startVoiceInput={startVoiceInput}
                        stopVoiceInput={stopVoiceInput}
                        isDragging={isDragging}
                        setIsDragging={setIsDragging}
                    />
                </div>
            </div>
            <FloatingActions
                isLight={isLight}
                addRipple={addRipple}
                handleSummarize={handleSummarize}
                handleCopy={handleCopy}
                handleClear={handleClear}
                ripples={ripples}
            />
            <HistoryDrawer
                isLight={isLight}
                historyOpen={historyOpen}
                setHistoryOpen={setHistoryOpen}
                historyItems={historyItems}
                loadHistoryItem={loadHistoryItem}
            />
            <ResultsWindow
                isLight={isLight}
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
            {error && (
                <motion.div
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`fixed bottom-6 left-6 z-30 max-w-md rounded-[24px] border px-5 py-4 text-sm shadow-glass ${
                        isLight
                            ? "border-rose-400/35 bg-rose-100/90 text-rose-800"
                            : "border-rose-400/25 bg-rose-500/15 text-rose-100"
                    }`}
                >
                    {error}
                </motion.div>
            )}
        </div>
    );
}

function TopNav({ theme, setTheme, setHistoryOpen }) {
    const isLight = theme === "light";
    return (
        <motion.nav
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            className={`glass-panel mb-6 flex items-center justify-between rounded-[28px] border px-5 py-4 shadow-glass ${
                isLight ? "border-slate-300/60" : "border-white/10"
            }`}
        >
            <div className="flex items-center gap-4">
                <button
                    type="button"
                    onClick={() => setHistoryOpen(true)}
                    className={`rounded-2xl border p-3 transition hover:scale-105 hover:border-aurora/50 ${
                        isLight
                            ? "border-slate-300/70 bg-white/70 text-slate-700 hover:text-slate-950"
                            : "border-white/10 bg-white/5 text-white/80 hover:text-white"
                    }`}
                >
                    <Menu size={18} />
                </button>
                <div>
                    <p className="font-body text-xs uppercase tracking-[0.4em] text-aurora/80">AI Workspace</p>
                    <h1 className={`font-display text-xl font-semibold sm:text-2xl ${isLight ? "text-slate-900" : ""}`}>AI Text Summarization Web App</h1>
                </div>
            </div>
            <div className="flex items-center gap-3">
                <span className={`hidden rounded-full border px-4 py-2 text-xs sm:inline-flex ${isLight ? "border-aurora/40 bg-white/65 text-cyan-700" : "border-aurora/30 bg-aurora/10 text-aurora"}`}>
                    Futuristic Summaries
                </span>
                <button
                    type="button"
                    onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
                    className={`rounded-2xl border p-3 transition hover:scale-105 hover:border-violet/50 ${
                        isLight
                            ? "border-slate-300/70 bg-white/70 text-slate-700 hover:text-slate-950"
                            : "border-white/10 bg-white/5 text-white/80 hover:text-white"
                    }`}
                >
                    {theme === "dark" ? <SunMedium size={18} /> : <MoonStar size={18} />}
                </button>
            </div>
        </motion.nav>
    );
}

function InputPanel(props) {
    const {
        draftTranscript,
        isLight,
        text,
        setText,
        inputWordCount,
        inputCharacterCount,
        uploadedFile,
        handleUpload,
        summaryPreset,
        setSummaryPreset,
        handleClear,
        loading,
        isListening,
        startVoiceInput,
        stopVoiceInput,
        isDragging,
        setIsDragging,
    } = props;

    return (
        <motion.section
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            className={`glass-panel flex min-h-[72vh] w-full flex-col rounded-[32px] border p-5 shadow-glass ${
                isLight ? "border-slate-300/60" : "border-white/10"
            }`}
        >
            <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
                <div>
                    <p className="font-body text-xs uppercase tracking-[0.35em] text-violet/80">Input Engine</p>
                    <h2 className={`font-display text-2xl font-semibold ${isLight ? "text-slate-900" : ""}`}>Context Ingestion</h2>
                </div>
                <div className={`flex gap-2 text-xs ${isLight ? "text-slate-600" : "text-white/60"}`}>
                    <span className={`rounded-full border px-3 py-2 ${isLight ? "border-slate-300/70 bg-white/70" : "border-white/10 bg-white/5"}`}>{inputWordCount} words</span>
                    <span className={`rounded-full border px-3 py-2 ${isLight ? "border-slate-300/70 bg-white/70" : "border-white/10 bg-white/5"}`}>{inputCharacterCount} chars</span>
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
                className={`mb-4 overflow-hidden rounded-[28px] border border-dashed p-4 transition duration-300 ${
                    isDragging ? "border-pulse bg-pulse/10" : isLight ? "border-cyan-400/35 bg-white/60" : "border-aurora/30 bg-white/[0.04]"
                }`}
            >
                <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="rounded-2xl bg-aurora/15 p-3 text-aurora shadow-neon">
                            <FileUp size={18} />
                        </div>
                        <div>
                            <p className="font-display text-sm font-semibold">Drag, drop, or upload your source</p>
                            <p className={`text-xs ${isLight ? "text-slate-600" : "text-white/55"}`}>TXT, PDF, DOCX, PPTX, HTML, CSV, JSON, code, logs, and more.</p>
                        </div>
                    </div>
                    <label className={`cursor-pointer rounded-full border px-4 py-2 text-sm transition hover:border-aurora/40 hover:bg-aurora/10 ${
                        isLight ? "border-slate-300/70 bg-white/80 text-slate-800" : "border-white/10 bg-white/10"
                    }`}>
                        Choose File
                        <input type="file" className="hidden" onChange={(event) => handleUpload(event.target.files?.[0] ?? null)} />
                    </label>
                </div>
                <p className={`text-xs ${isLight ? "text-slate-600" : "text-white/60"}`}>
                    {uploadedFile ? `Loaded file: ${uploadedFile.name}` : "No file selected. Manual text still works perfectly."}
                </p>
            </motion.div>

            <div className={`relative flex-1 overflow-hidden rounded-[30px] border ${
                isLight ? "border-slate-300/70 bg-white/75" : "border-white/10 bg-slate-950/45"
            }`}>
                <textarea
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    placeholder={DEFAULT_PLACEHOLDER}
                    className={`scrollbar-thin h-full min-h-[420px] w-full resize-none bg-transparent px-5 py-5 font-body text-[15px] leading-7 outline-none ${
                        isLight ? "text-slate-900 placeholder:text-slate-400" : "text-white/90 placeholder:text-white/30"
                    }`}
                />
                <div className={`pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t ${
                    isLight ? "from-white/90 to-transparent" : "from-[#070816] to-transparent"
                }`} />
                {draftTranscript && (
                    <div className={`pointer-events-none absolute bottom-4 left-5 right-5 rounded-2xl border px-4 py-3 text-sm italic ${
                        isLight
                            ? "border-cyan-300/60 bg-cyan-50/90 text-slate-600"
                            : "border-aurora/25 bg-aurora/10 text-white/65"
                    }`}>
                        Listening: {draftTranscript}
                    </div>
                )}
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap gap-2">
                    {Object.keys(SUMMARY_PRESETS).map((preset) => (
                        <button
                            key={preset}
                            type="button"
                            onClick={() => setSummaryPreset(preset)}
                            className={`rounded-full px-4 py-2 text-sm transition ${
                                summaryPreset === preset
                                    ? "bg-gradient-to-r from-aurora to-violet text-slate-950 shadow-neon"
                                    : isLight
                                        ? "border border-slate-300/70 bg-white/80 text-slate-700 hover:border-cyan-400/50 hover:text-slate-950"
                                        : "border border-white/10 bg-white/5 text-white/70 hover:border-aurora/40 hover:text-white"
                            }`}
                        >
                            {preset.charAt(0).toUpperCase() + preset.slice(1)}
                        </button>
                    ))}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <div
                        className={`rounded-2xl border px-4 py-3 text-sm ${
                            isLight
                                ? "border-slate-300/70 bg-white/80 text-slate-700"
                                : "border-white/10 bg-white/5 text-white/75"
                        }`}
                    >
                        {loading ? "Preparing summary..." : "Results open in a centered window"}
                    </div>
                    <button
                        type="button"
                        onClick={isListening ? stopVoiceInput : startVoiceInput}
                        className={`rounded-2xl border px-4 py-3 text-sm transition ${
                            isListening
                                ? "animate-pulseRing border-pulse/60 bg-pulse/15 text-pulse"
                                : isLight
                                    ? "border-slate-300/70 bg-white/80 text-slate-700 hover:border-pulse/40 hover:text-slate-950"
                                    : "border-white/10 bg-white/5 text-white/75 hover:border-pulse/40 hover:text-white"
                        }`}
                    >
                        <span className="flex items-center gap-2">
                            <Mic size={16} />
                            {isListening ? "Listening..." : "Voice Input"}
                        </span>
                    </button>
                    <button
                        type="button"
                        onClick={handleClear}
                        className={`rounded-2xl border px-4 py-3 text-sm transition hover:border-rose-400/40 ${
                            isLight
                                ? "border-slate-300/70 bg-white/80 text-slate-700 hover:text-slate-950"
                                : "border-white/10 bg-white/5 text-white/75 hover:text-white"
                        }`}
                    >
                        <span className="flex items-center gap-2">
                            <Trash2 size={16} />
                            Clear
                        </span>
                    </button>
                </div>
            </div>
        </motion.section>
    );
}

function OutputPanel(props) {
    const {
        isLight,
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
        setResultsOpen,
    } = props;

    return (
        <motion.section
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            className={`glass-panel flex min-h-[72vh] flex-col rounded-[32px] border p-5 shadow-glass ${
                isLight ? "border-slate-300/60" : "border-white/10"
            }`}
        >
            <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                    <p className="font-body text-xs uppercase tracking-[0.35em] text-pulse/80">Output Matrix</p>
                    <h2 className={`font-display text-2xl font-semibold ${isLight ? "text-slate-900" : ""}`}>Summary Intelligence</h2>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => setResultsOpen(true)} className={`rounded-2xl border p-3 transition hover:scale-105 hover:border-pulse/40 ${isLight ? "border-slate-300/70 bg-white/80 text-slate-700 hover:text-slate-950" : "border-white/10 bg-white/5 text-white/75 hover:text-white"}`}><Sparkles size={18} /></button>
                    <button type="button" onClick={handleCopy} className={`rounded-2xl border p-3 transition hover:scale-105 hover:border-aurora/40 ${isLight ? "border-slate-300/70 bg-white/80 text-slate-700 hover:text-slate-950" : "border-white/10 bg-white/5 text-white/75 hover:text-white"}`}><Copy size={18} /></button>
                    <button type="button" onClick={handleDownloadPdf} className={`rounded-2xl border p-3 transition hover:scale-105 hover:border-violet/40 ${isLight ? "border-slate-300/70 bg-white/80 text-slate-700 hover:text-slate-950" : "border-white/10 bg-white/5 text-white/75 hover:text-white"}`}><Download size={18} /></button>
                </div>
            </div>

            <div className="mb-5 grid gap-3 sm:grid-cols-3">
                <MetricCard label="Confidence" value={`${confidence}%`} tone="from-aurora/30 to-violet/20" />
                <MetricCard label="AI Signal" value={`${aiSignal}%`} tone="from-violet/30 to-pulse/20" />
                <MetricCard label="Reading Time" value={`${analysis?.summary_reading_time_minutes ?? 0} min`} tone="from-pulse/30 to-aurora/20" />
            </div>

            <div className={`mb-5 rounded-[26px] border px-5 py-4 ${
                isLight ? "border-cyan-300/55 bg-cyan-50/80" : "border-aurora/30 bg-aurora/10"
            }`}>
                <p className="mb-2 text-xs uppercase tracking-[0.28em] text-aurora">What It's About</p>
                <p className={`text-sm leading-7 ${isLight ? "text-slate-700" : "text-white/80"}`}>
                    {overview || "A clear one-line explanation of the text will appear here."}
                </p>
            </div>

            <button
                type="button"
                onClick={() => setResultsOpen(true)}
                className={`mb-5 rounded-[24px] border px-5 py-4 text-left transition hover:scale-[1.01] ${
                    isLight
                        ? "border-slate-300/70 bg-white/75 text-slate-700 hover:border-cyan-400/45"
                        : "border-white/10 bg-white/[0.04] text-white/72 hover:border-aurora/35"
                }`}
            >
                <div className="mb-2 flex items-center gap-3">
                    <div className="rounded-2xl bg-gradient-to-r from-aurora to-violet p-2 text-slate-950 shadow-neon">
                        <Sparkles size={16} />
                    </div>
                    <span className="font-display text-base font-semibold">Open Interactive Results Window</span>
                </div>
                <p className={`text-sm ${isLight ? "text-slate-600" : "text-white/55"}`}>
                    Expand the summary into a focused view with the overview, full result, metrics, copy, and download actions.
                </p>
            </button>

            <div className={`relative flex-1 overflow-hidden rounded-[30px] border p-5 ${
                isLight ? "border-slate-300/70 bg-white/75" : "border-white/10 bg-slate-950/45"
            }`}>
                <AnimatePresence mode="wait">
                    {loading ? (
                        <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex h-full flex-col items-center justify-center gap-6">
                            <div className="relative flex items-center justify-center">
                                <span className="absolute h-28 w-28 rounded-full border border-aurora/25" />
                                <span className="absolute h-20 w-20 rounded-full border border-violet/35" />
                                <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2.4, ease: "linear" }} className="rounded-full bg-gradient-to-r from-aurora via-violet to-pulse p-4 shadow-neon">
                                    <Sparkles size={26} />
                                </motion.span>
                            </div>
                            <div className="text-center">
                                <p className={`font-display text-lg ${isLight ? "text-slate-900" : ""}`}>AI is thinking...</p>
                                <p className={`text-sm ${isLight ? "text-slate-600" : "text-white/55"}`}>Ranking ideas, condensing context, and refining output.</p>
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div key="summary" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="scrollbar-thin h-full overflow-y-auto pr-2">
                            <div className="mb-4 flex items-center justify-between gap-4">
                                <div className={`text-sm ${isLight ? "text-slate-600" : "text-white/55"}`}>{analysis ? `${analysis.summary_word_count} words in summary` : "Ready for generation"}</div>
                                {copied && <div className="text-xs text-pulse">Copied to clipboard</div>}
                            </div>

                            {displayedSummary ? (
                                <div className="space-y-4">
                                    {outputSentences.map((sentence, index) => {
                                        const isKeySentence = Array.from(keyTerms).some((term) => sentence.toLowerCase().includes(term.toLowerCase()));
                                        return (
                                            <motion.p
                                                key={`${sentence}-${index}`}
                                                initial={{ opacity: 0, x: 8 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: index * 0.05 }}
                                                className={`rounded-2xl border px-4 py-4 text-wrap-pretty text-[15px] leading-7 ${
                                                    isKeySentence
                                                        ? isLight
                                                            ? "border-cyan-400/50 bg-cyan-50 text-slate-900 shadow-[0_10px_30px_rgba(56,189,248,0.18)]"
                                                            : "border-aurora/35 bg-aurora/10 shadow-neon"
                                                        : isLight
                                                            ? "border-slate-300/70 bg-white/70 text-slate-800"
                                                            : "border-white/8 bg-white/[0.03]"
                                                }`}
                                            >
                                                {sentence}
                                            </motion.p>
                                        );
                                    })}
                                    {displayedSummary.length < summary.length && <span className="ml-2 inline-block h-5 w-[2px] animate-blink bg-aurora align-middle" />}
                                </div>
                            ) : (
                                <p className={`text-[15px] leading-7 ${isLight ? "text-slate-500" : "text-white/38"}`}>{DEFAULT_OUTPUT}</p>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <InsightCard isLight={isLight} icon={<AudioLines size={18} />} title="Source Stats" body={analysis ? `${analysis.input_word_count} words, ${analysis.input_sentence_count} sentences, ${analysis.input_character_count} characters` : "Upload a document or paste content to see live analytics."} />
                <InsightCard isLight={isLight} icon={<WandSparkles size={18} />} title="AI Writing Risk Estimate" body={analysis?.ai_writing_signals?.details || "Heuristic-based guidance appears here after processing."} />
                <InsightCard isLight={isLight} icon={<History size={18} />} title="Source File" body={uploadedFile?.name || "Manual text input"} />
                <InsightCard isLight={isLight} icon={<Sparkles size={18} />} title="Top Keywords" body={analysis?.top_keywords?.join(", ") || "Keywords will surface after summarization."} />
            </div>
        </motion.section>
    );
}

function ResultsWindow(props) {
    const {
        isLight,
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
                        className={`fixed inset-0 z-40 backdrop-blur-md ${isLight ? "bg-slate-200/55" : "bg-slate-950/72"}`}
                    />
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5">
                        <motion.section
                            initial={{ opacity: 0, scale: 0.96, y: 24 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.96, y: 24 }}
                            transition={{ duration: 0.22, ease: "easeOut" }}
                            className={`glass-panel flex max-h-[92vh] min-h-0 w-[min(1240px,96vw)] flex-col overflow-hidden rounded-[34px] border p-4 shadow-glass sm:p-6 ${
                                isLight ? "border-slate-300/70" : "border-white/10"
                            }`}
                        >
                        <div className="mb-5 flex items-start justify-between gap-4">
                            <div>
                                <p className="font-body text-xs uppercase tracking-[0.35em] text-aurora/80">Interactive Results</p>
                                <h3 className={`font-display text-2xl font-semibold ${isLight ? "text-slate-900" : ""}`}>Summary Window</h3>
                                <p className={`mt-2 text-sm ${isLight ? "text-slate-600" : "text-white/55"}`}>
                                    {uploadedFile?.name || "Manual text input"}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button type="button" onClick={handleCopy} className={`rounded-2xl border p-3 transition hover:scale-105 ${isLight ? "border-slate-300/70 bg-white/80 text-slate-700" : "border-white/10 bg-white/5 text-white/75"}`}><Copy size={18} /></button>
                                <button type="button" onClick={handleDownloadPdf} className={`rounded-2xl border p-3 transition hover:scale-105 ${isLight ? "border-slate-300/70 bg-white/80 text-slate-700" : "border-white/10 bg-white/5 text-white/75"}`}><Download size={18} /></button>
                                <button type="button" onClick={() => setResultsOpen(false)} className={`rounded-2xl border p-3 transition hover:scale-105 ${isLight ? "border-slate-300/70 bg-white/80 text-slate-700" : "border-white/10 bg-white/5 text-white/75"}`}><X size={18} /></button>
                            </div>
                        </div>

                        <div className="mb-5 grid gap-3 md:grid-cols-4">
                            <MetricCard label="Confidence" value={`${confidence}%`} tone="from-aurora/30 to-violet/20" />
                            <MetricCard label="AI Signal" value={`${aiSignal}%`} tone="from-violet/30 to-pulse/20" />
                            <MetricCard label="Summary Words" value={`${analysis?.summary_word_count ?? 0}`} tone="from-pulse/30 to-aurora/20" />
                            <MetricCard label="Reading Time" value={`${analysis?.summary_reading_time_minutes ?? 0} min`} tone="from-aurora/25 to-pulse/20" />
                        </div>

                        <div className="grid min-h-0 flex-1 gap-5 overflow-hidden lg:grid-cols-[0.9fr_1.1fr]">
                            <div className="scrollbar-thin flex min-h-0 flex-col gap-4 overflow-y-auto pr-1">
                                <div className={`rounded-[26px] border px-5 py-4 ${isLight ? "border-cyan-300/55 bg-cyan-50/80" : "border-aurora/30 bg-aurora/10"}`}>
                                    <p className="mb-2 text-xs uppercase tracking-[0.28em] text-aurora">What It's About</p>
                                    <p className={`text-sm leading-7 ${isLight ? "text-slate-700" : "text-white/80"}`}>
                                        {overview || "A clear one-line explanation of the text will appear here."}
                                    </p>
                                </div>

                                <div className={`rounded-[26px] border p-5 ${isLight ? "border-slate-300/70 bg-white/75" : "border-white/10 bg-white/[0.04]"}`}>
                                    <p className={`mb-3 font-display text-lg font-semibold ${isLight ? "text-slate-900" : ""}`}>Summary Insights</p>
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <InsightCard isLight={isLight} icon={<AudioLines size={18} />} title="Source Stats" body={analysis ? `${analysis.input_word_count} words, ${analysis.input_sentence_count} sentences, ${analysis.input_character_count} characters` : "No analytics yet."} />
                                        <InsightCard isLight={isLight} icon={<History size={18} />} title="Source File" body={uploadedFile?.name || "Manual text input"} />
                                        <InsightCard isLight={isLight} icon={<WandSparkles size={18} />} title="AI Writing Risk Estimate" body={analysis?.ai_writing_signals?.details || "Heuristic-based guidance appears here after processing."} />
                                        <InsightCard isLight={isLight} icon={<Sparkles size={18} />} title="Top Keywords" body={analysis?.top_keywords?.join(", ") || "Keywords will surface after summarization."} />
                                    </div>
                                </div>
                            </div>

                            <div className={`min-h-0 overflow-hidden rounded-[30px] border p-4 sm:p-5 ${isLight ? "border-slate-300/70 bg-white/78" : "border-white/10 bg-slate-950/45"}`}>
                                <div className="mb-4 flex items-center justify-between gap-4">
                                    <div className={`text-sm ${isLight ? "text-slate-600" : "text-white/55"}`}>
                                        {analysis ? `${analysis.summary_word_count} words in summary` : "Ready for generation"}
                                    </div>
                                    {copied && <div className="text-xs text-pulse">Copied to clipboard</div>}
                                </div>

                                <div className="scrollbar-thin h-[calc(100%-32px)] min-h-0 overflow-y-auto pr-2">
                                    {loading ? (
                                        <div className="flex h-full flex-col items-center justify-center gap-6">
                                            <motion.span
                                                animate={{ rotate: 360 }}
                                                transition={{ repeat: Infinity, duration: 2.4, ease: "linear" }}
                                                className="rounded-full bg-gradient-to-r from-aurora via-violet to-pulse p-4 shadow-neon"
                                            >
                                                <Sparkles size={26} />
                                            </motion.span>
                                            <p className={`text-sm ${isLight ? "text-slate-600" : "text-white/55"}`}>Generating interactive summary view...</p>
                                        </div>
                                    ) : displayedSummary ? (
                                        <div className="space-y-4">
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
                                                        className={`rounded-2xl border px-4 py-4 text-[15px] leading-7 ${
                                                            isKeySentence
                                                                ? isLight
                                                                    ? "border-cyan-400/50 bg-cyan-50 text-slate-900 shadow-[0_10px_30px_rgba(56,189,248,0.18)]"
                                                                    : "border-aurora/35 bg-aurora/10 shadow-neon"
                                                                : isLight
                                                                    ? "border-slate-300/70 bg-white/70 text-slate-800"
                                                                    : "border-white/8 bg-white/[0.03]"
                                                        }`}
                                                    >
                                                        {sentence}
                                                    </motion.p>
                                                );
                                            })}
                                            {displayedSummary.length < summary.length && (
                                                <span className="ml-2 inline-block h-5 w-[2px] animate-blink bg-aurora align-middle" />
                                            )}
                                        </div>
                                    ) : (
                                        <p className={`text-[15px] leading-7 ${isLight ? "text-slate-500" : "text-white/38"}`}>
                                            Your summary will open here in a focused interactive window.
                                        </p>
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

function FloatingActions({ isLight, addRipple, handleSummarize, handleCopy, handleClear, ripples }) {
    return (
        <div className="fixed bottom-6 right-6 z-20 flex flex-col gap-3">
            <FloatingActionButton label="Summarize" onClick={handleSummarize} onPointerDown={addRipple} variant="primary">
                <Sparkles size={18} />
            </FloatingActionButton>
            <FloatingActionButton isLight={isLight} label="Copy" onClick={handleCopy} onPointerDown={addRipple}>
                <Copy size={18} />
            </FloatingActionButton>
            <FloatingActionButton isLight={isLight} label="Clear" onClick={handleClear} onPointerDown={addRipple}>
                <X size={18} />
            </FloatingActionButton>

            {ripples.map((ripple) => (
                <span
                    key={ripple.id}
                    className="pointer-events-none fixed rounded-full bg-aurora/25"
                    style={{
                        left: ripple.x,
                        top: ripple.y,
                        width: ripple.size,
                        height: ripple.size,
                        transform: "scale(0)",
                        animation: "ripple 650ms ease-out forwards",
                    }}
                />
            ))}
        </div>
    );
}

function HistoryDrawer({ isLight, historyOpen, setHistoryOpen, historyItems, loadHistoryItem }) {
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
                        className={`fixed inset-0 z-30 backdrop-blur-sm ${isLight ? "bg-slate-200/45" : "bg-slate-950/55"}`}
                    />
                    <motion.aside
                        initial={{ x: -420 }}
                        animate={{ x: 0 }}
                        exit={{ x: -420 }}
                        transition={{ type: "spring", damping: 25, stiffness: 220 }}
                        className={`glass-panel fixed left-0 top-0 z-40 h-full w-full max-w-md border-r p-5 shadow-glass ${
                            isLight ? "border-slate-300/60" : "border-white/10"
                        }`}
                    >
                        <div className="mb-5 flex items-center justify-between">
                            <div>
                                <p className="font-body text-xs uppercase tracking-[0.35em] text-aurora/80">Recent Runs</p>
                                <h3 className="font-display text-xl font-semibold">Summary History</h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setHistoryOpen(false)}
                                className={`rounded-2xl border p-3 ${isLight ? "border-slate-300/70 bg-white/80 text-slate-700" : "border-white/10 bg-white/5 text-white/75"}`}
                            >
                                <X size={16} />
                            </button>
                        </div>
                        <div className="scrollbar-thin flex h-[calc(100%-84px)] flex-col gap-3 overflow-y-auto pr-1">
                            {historyItems.length === 0 ? (
                                <div className={`rounded-[24px] border p-4 text-sm ${isLight ? "border-slate-300/70 bg-white/70 text-slate-600" : "border-white/10 bg-white/[0.03] text-white/55"}`}>
                                    Your recent summaries will appear here for quick recall.
                                </div>
                            ) : (
                                historyItems.map((item) => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => loadHistoryItem(item)}
                                        className={`rounded-[24px] border p-4 text-left transition hover:border-aurora/35 ${
                                            isLight
                                                ? "border-slate-300/70 bg-white/72 hover:bg-cyan-50"
                                                : "border-white/10 bg-white/[0.04] hover:bg-aurora/10"
                                        }`}
                                    >
                                        <div className="mb-2 flex items-center justify-between gap-3">
                                            <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em] ${
                                                isLight ? "border-slate-300/70 bg-white/85 text-slate-600" : "border-white/10 bg-white/10 text-white/60"
                                            }`}>
                                                {item.preset}
                                            </span>
                                            <span className={`text-xs ${isLight ? "text-slate-500" : "text-white/45"}`}>{item.createdAt}</span>
                                        </div>
                                        <p className={`line-clamp-3 text-sm ${isLight ? "text-slate-700" : "text-white/72"}`}>{item.inputPreview || "Uploaded file summary"}</p>
                                        <p className="mt-3 text-xs text-pulse">{item.sourceFile || "Manual input"}</p>
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

function MetricCard({ label, value, tone }) {
    return (
        <motion.div whileHover={{ y: -4, scale: 1.01 }} className={`rounded-[24px] border border-white/10 bg-gradient-to-br ${tone} px-4 py-4`}>
            <p className="mb-2 text-xs uppercase tracking-[0.28em] text-white/55">{label}</p>
            <h3 className="font-display text-2xl font-semibold">{value}</h3>
        </motion.div>
    );
}

function InsightCard({ isLight, icon, title, body }) {
    return (
        <motion.div whileHover={{ y: -4 }} className={`rounded-[26px] border p-4 ${isLight ? "border-slate-300/70 bg-white/72" : "border-white/10 bg-white/[0.04]"}`}>
            <div className={`mb-3 flex h-11 w-11 items-center justify-center rounded-2xl text-aurora ${isLight ? "bg-cyan-50" : "bg-white/10"}`}>{icon}</div>
            <h4 className={`font-display text-base font-semibold ${isLight ? "text-slate-900" : ""}`}>{title}</h4>
            <p className={`mt-2 text-sm leading-6 ${isLight ? "text-slate-600" : "text-white/58"}`}>{body}</p>
        </motion.div>
    );
}

function FloatingActionButton({ isLight, children, label, onClick, onPointerDown, variant = "secondary" }) {
    return (
        <motion.button
            whileHover={{ scale: 1.06, y: -2 }}
            whileTap={{ scale: 0.96 }}
            type="button"
            onClick={onClick}
            onPointerDown={onPointerDown}
            className={`relative overflow-hidden rounded-full border px-5 py-4 text-sm font-medium shadow-glass transition ${
                variant === "primary"
                    ? "border-aurora/40 bg-gradient-to-r from-aurora to-violet text-slate-950 shadow-neon"
                    : isLight
                        ? "border-slate-300/80 bg-white/88 text-slate-800 backdrop-blur-xl"
                        : "border-white/10 bg-white/10 text-white/85 backdrop-blur-xl"
            }`}
        >
            <span className="relative z-10 flex items-center gap-2">
                {children}
                {label}
            </span>
        </motion.button>
    );
}

export default App;
