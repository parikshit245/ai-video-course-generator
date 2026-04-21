"use client";

import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import {
  Bot,
  Cpu,
  Database,
  FileUp,
  Loader2,
  MessageCircleQuestion,
  Paperclip,
  Send,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { buildAuthUrl } from "@/lib/auth-role";

type Message = {
  role: "assistant" | "user";
  content: string;
};

const initialMessage =
  "Hi! Upload a PDF or ask about a saved topic. I will answer using indexed knowledge and keep the conversation going.";

const deriveTopicNameFromFile = (fileName: string) =>
  fileName
    .replace(/\.pdf$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const getErrorMessage = (error: unknown, fallback: string) => {
  if (axios.isAxiosError(error)) {
    const serverMessage = error.response?.data?.error;
    if (typeof serverMessage === "string" && serverMessage.trim()) {
      return serverMessage;
    }
  }

  return fallback;
};

function HomeChatPanel() {
  const { userId } = useAuth();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [topicName, setTopicName] = useState("");
  const [question, setQuestion] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: initialMessage,
    },
  ]);
  const [needUpload, setNeedUpload] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showUploadPanel, setShowUploadPanel] = useState(true);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [pineconeAvailable, setPineconeAvailable] = useState<boolean | null>(
    null,
  );
  const [namespace, setNamespace] = useState<string | null>(null);
  const [indexMessage, setIndexMessage] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const requireSignIn = () => {
    if (userId) {
      return false;
    }

    router.push(buildAuthUrl("/sign-in", "user"));
    return true;
  };

  const openPanel = () => {
    if (requireSignIn()) {
      return;
    }

    setOpen(true);
  };

  const loadChatHistory = async (convId: string) => {
    try {
      const response = await axios.get("/api/home-chat", {
        params: { conversationId: convId },
      });

      if (Array.isArray(response.data.messages) && response.data.messages.length > 0) {
        setMessages(response.data.messages);
      }
    } catch (error) {
      console.error("Failed to load chat history:", error);
    }
  };

  useEffect(() => {
    if (open && conversationId) {
      void loadChatHistory(conversationId);
    }
  }, [conversationId, open]);

  useEffect(() => {
    if (open) {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [loading, messages, open, uploading]);

  const askQuestion = async () => {
    const topic = topicName.trim();
    const prompt = question.trim();

    if (!topic || !prompt || loading || requireSignIn()) {
      return;
    }

    setQuestion("");
    setMessages((prev) => [...prev, { role: "user", content: prompt }]);
    setLoading(true);
    setIndexMessage(null);

    try {
      const response = await axios.post("/api/home-chat", {
        topicName: topic,
        question: prompt,
        conversationId: conversationId || undefined,
      });

      if (!conversationId && response.data.conversationId) {
        setConversationId(response.data.conversationId);
      }

      setNeedUpload(Boolean(response.data.needUpload));
      setPineconeAvailable(
        typeof response.data.pineconeAvailable === "boolean"
          ? response.data.pineconeAvailable
          : null,
      );
      setNamespace(
        typeof response.data.namespace === "string"
          ? response.data.namespace
          : null,
      );

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: response.data.answer || "No answer." },
      ]);
    } catch (error) {
      console.error("Home chat failed:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: getErrorMessage(
            error,
            "I could not process that question right now. Please try again.",
          ),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const uploadPdf = async () => {
    const topic =
      topicName.trim() ||
      (selectedFile ? deriveTopicNameFromFile(selectedFile.name) : "");

    if (!selectedFile || uploading || requireSignIn()) {
      return;
    }

    setUploading(true);
    setTopicName(topic);
    setIndexMessage(null);

    try {
      const formData = new FormData();
      formData.append("topicName", topic);
      formData.append("file", selectedFile);

      const response = await axios.post("/api/rag-upload-pdf", formData);
      const uploadedTopicName =
        typeof response.data?.topicName === "string"
          ? response.data.topicName
          : topic;

      setTopicName(uploadedTopicName);
      setNeedUpload(false);
      setPineconeAvailable(Boolean(response.data?.indexed));
      setNamespace(
        typeof response.data?.namespace === "string"
          ? response.data.namespace
          : null,
      );
      setIndexMessage(
        response.data?.message || "PDF uploaded and indexed. Ask again.",
      );
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            response.data?.message ||
            "PDF uploaded and indexed. Ask your question now.",
        },
      ]);
      setSelectedFile(null);
      setShowUploadPanel(false);
      setFileInputKey((current) => current + 1);
    } catch (error) {
      console.error("PDF upload failed:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: getErrorMessage(
            error,
            "I could not upload this PDF. Please check the file and try again.",
          ),
        },
      ]);
    } finally {
      setUploading(false);
    }
  };

  const startNewConversation = () => {
    setConversationId(null);
    setTopicName("");
    setQuestion("");
    setMessages([
      {
        role: "assistant",
        content: initialMessage,
      },
    ]);
    setNeedUpload(false);
    setSelectedFile(null);
    setShowUploadPanel(true);
    setFileInputKey((current) => current + 1);
    setNamespace(null);
    setIndexMessage(null);
    setPineconeAvailable(null);
  };

  return (
    <>
      <Button
        className="fixed bottom-6 right-6 z-40 gap-2 rounded-full px-5 py-6"
        onClick={openPanel}
      >
        <MessageCircleQuestion size={18} />
        Topic chat
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="flex h-screen w-full flex-col gap-0 border-border bg-background p-0 sm:max-w-lg"
        >
          <SheetHeader className="shrink-0 border-b border-border bg-white px-5 py-4 pr-12">
            <SheetTitle className="flex items-center gap-2 text-xl text-slate-950">
              <Bot className="text-indigo-500" size={20} />
              Topic chat
            </SheetTitle>
            <SheetDescription className="text-slate-500">
              Ask against saved topic memory, or upload a PDF to create a new RAG
              knowledge space.
            </SheetDescription>
            {conversationId ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={startNewConversation}
                className="mt-2 w-fit text-xs"
              >
                New conversation
              </Button>
            ) : null}
          </SheetHeader>

          <div className="flex min-h-0 flex-1 flex-col">
            <div className="max-h-[42vh] shrink-0 space-y-3 overflow-y-auto border-b border-border bg-white px-4 py-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="topic-name"
                  className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400"
                >
                  Topic memory
                </label>
                <Input
                  id="topic-name"
                  value={topicName}
                  onChange={(event) => {
                    setTopicName(event.target.value);
                    setIndexMessage(null);
                  }}
                  placeholder="Topic name, or let the PDF name fill this"
                />
              </div>

              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full border border-border bg-slate-50 px-3 py-1 text-slate-600">
                  <Cpu className="mr-1 inline-block size-3.5 text-indigo-500" />
                  Tutor model: local Mistral
                </span>
                <span className="rounded-full border border-border bg-slate-50 px-3 py-1 text-slate-600">
                  <Database className="mr-1 inline-block size-3.5 text-cyan-500" />
                  {pineconeAvailable === null
                    ? "Vector memory status pending"
                    : pineconeAvailable
                      ? "Vector memory active"
                      : "Vector memory unavailable"}
                </span>
                {namespace ? (
                  <span
                    className="max-w-full truncate rounded-full border border-border bg-slate-50 px-3 py-1 text-slate-600"
                    title={namespace}
                  >
                    Namespace: {namespace}
                  </span>
                ) : null}
                {needUpload ? (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-amber-700">
                    PDF needed for this topic
                  </span>
                ) : null}
              </div>

              {indexMessage ? (
                <p className="text-sm text-slate-500">{indexMessage}</p>
              ) : null}

              {showUploadPanel || needUpload || selectedFile ? (
                <div
                  className={`space-y-3 rounded-lg border px-4 py-3 ${
                    needUpload
                      ? "border-amber-200 bg-amber-50"
                      : "border-border bg-slate-50"
                  }`}
                >
                  <p
                    className={`text-sm leading-6 ${
                      needUpload ? "text-amber-800" : "text-slate-600"
                    }`}
                  >
                    {needUpload
                      ? "No indexed knowledge exists for this topic yet. Upload a PDF and I will chunk it into Pinecone memory."
                      : "Upload a PDF to create or update this knowledge space."}
                  </p>
                  <input
                    key={fileInputKey}
                    type="file"
                    accept="application/pdf"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      setSelectedFile(file);

                      if (file && !topicName.trim()) {
                        setTopicName(deriveTopicNameFromFile(file.name));
                      }
                    }}
                    className={`block w-full rounded-lg border bg-white px-4 py-2 text-sm text-slate-600 file:mr-4 file:border-0 file:bg-transparent file:text-sm file:font-medium ${
                      needUpload ? "border-amber-200" : "border-border"
                    }`}
                  />
                  {selectedFile ? (
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-600">
                      <span className="flex min-w-0 items-center gap-2">
                        <Paperclip className="size-4 shrink-0 text-indigo-500" />
                        <span className="truncate">{selectedFile.name}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedFile(null);
                          setFileInputKey((current) => current + 1);
                        }}
                        className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                        aria-label="Remove selected PDF"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  ) : null}
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      onClick={() => void uploadPdf()}
                      disabled={uploading || !selectedFile}
                    >
                      {uploading ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <FileUp className="size-4" />
                      )}
                      {uploading ? "Indexing..." : "Upload PDF"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-slate-50 px-3 py-2">
                  <p className="min-w-0 truncate text-sm text-slate-600">
                    Ready. Ask below, or add another PDF.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowUploadPanel(true)}
                  >
                    Add PDF
                  </Button>
                </div>
              )}
            </div>

            <ScrollArea className="min-h-0 flex-1 px-4 py-4">
              <div className="space-y-4 pr-2">
                {messages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    className={`flex ${
                      message.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-[85%] rounded-lg px-4 py-3 text-sm leading-relaxed ${
                        message.role === "user"
                          ? "bg-indigo-600 text-white"
                          : "border border-border bg-white text-slate-700"
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words leading-6">
                        {message.content}
                      </p>
                    </div>
                  </div>
                ))}

                {loading ? (
                  <div className="flex justify-start">
                    <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-4 py-3 text-sm text-slate-600">
                      <Loader2 className="size-4 animate-spin text-indigo-500" />
                      Searching topic memory...
                    </div>
                  </div>
                ) : null}

                <div ref={endRef} />
              </div>
            </ScrollArea>

            <div className="shrink-0 space-y-3 border-t border-border bg-white p-4">
              <Textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder={
                  topicName.trim()
                    ? `Ask about ${topicName.trim()}...`
                    : "Ask anything about the selected topic..."
                }
                className="min-h-20 resize-none"
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void askQuestion();
                  }
                }}
              />
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-slate-500">
                  Enter to send, Shift+Enter for a new line.
                </p>
                <Button
                  className="gap-2"
                  onClick={() => void askQuestion()}
                  disabled={loading || !topicName.trim() || !question.trim()}
                >
                  {loading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send size={16} />
                  )}
                  Ask
                </Button>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

export default HomeChatPanel;
