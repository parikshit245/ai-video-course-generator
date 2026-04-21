import { GoogleGenerativeAI } from "@google/generative-ai";
import axios from "axios";

export type AiProvider = "global-ai" | "local-ai";

type GenerateModelConfig = {
  provider?: string;
  model?: string;
  temperature?: number;
  responseFormat?: "json" | "text";
};

type OllamaGenerateResponse = {
  response?: string;
  error?: string;
};

const GEMINI_KEYS = (
  process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || ""
)
  .split(",")
  .map((key) => key.trim())
  .filter(Boolean);

const OLLAMA_BASE_URL =
  process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "mistral:latest";
const OLLAMA_REQUEST_TIMEOUT_MS = Number(
  process.env.OLLAMA_REQUEST_TIMEOUT_MS || 30 * 60 * 1000,
);
const OLLAMA_NUM_CTX = Number(process.env.OLLAMA_NUM_CTX || 4096);
const OLLAMA_NUM_PREDICT = Number(process.env.OLLAMA_NUM_PREDICT || 700);

const GEMINI_RETRY_ATTEMPTS = 3;
const GEMINI_RETRY_DELAY_MS = 1000;

let keyIndex = 0;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const normalizeAiProvider = (value?: string | null): AiProvider =>
  value === "global-ai" ? "global-ai" : "local-ai";

const describeOllamaError = (data: unknown) => {
  if (typeof data === "string") {
    return data.trim();
  }

  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    const error = record.error;
    const response = record.response;

    if (typeof error === "string" && error.trim()) {
      return error.trim();
    }

    if (typeof response === "string" && response.trim()) {
      return response.trim();
    }

    try {
      return JSON.stringify(record).slice(0, 500);
    } catch {
      return "";
    }
  }

  return "";
};

class OllamaTextModel {
  constructor(
    private readonly config: {
      baseUrl: string;
      model: string;
      temperature: number;
      responseFormat: "json" | "text";
    },
  ) {}

  async generateContent(prompt: string) {
    const response = await axios.post<OllamaGenerateResponse>(
      `${this.config.baseUrl}/api/generate`,
      {
        model: this.config.model,
        prompt,
        stream: false,
        ...(this.config.responseFormat === "json" ? { format: "json" } : {}),
        options: {
          temperature: this.config.temperature,
          ...(Number.isFinite(OLLAMA_NUM_CTX) && OLLAMA_NUM_CTX > 0
            ? { num_ctx: OLLAMA_NUM_CTX }
            : {}),
          ...(Number.isFinite(OLLAMA_NUM_PREDICT) && OLLAMA_NUM_PREDICT > 0
            ? { num_predict: OLLAMA_NUM_PREDICT }
            : {}),
        },
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: OLLAMA_REQUEST_TIMEOUT_MS,
        proxy: false,
        validateStatus: () => true,
      },
    );

    if (response.status < 200 || response.status >= 300) {
      const details = describeOllamaError(response.data);
      throw new Error(
        `Ollama request failed with status ${response.status} (${response.statusText})${
          details ? `: ${details}` : ""
        }`,
      );
    }

    const data = response.data;

    if (typeof data.response !== "string" || !data.response.trim()) {
      throw new Error(data.error || "Ollama returned an empty response");
    }

    return {
      response: {
        text: () => data.response as string,
      },
    };
  }
}

class GeminiModelWithRetryAndFallback {
  private geminiModel: ReturnType<typeof createGeminiModel>;
  private fallbackModel: OllamaTextModel;

  constructor(config?: GenerateModelConfig) {
    this.geminiModel = createGeminiModel(config);
    this.fallbackModel = new OllamaTextModel({
      baseUrl: OLLAMA_BASE_URL,
      model: config?.model || OLLAMA_MODEL,
      temperature: config?.temperature ?? 0.3,
      responseFormat: config?.responseFormat || "json",
    });
  }

  async generateContent(prompt: string) {
    for (let attempt = 0; attempt < GEMINI_RETRY_ATTEMPTS; attempt++) {
      try {
        return await this.geminiModel.generateContent(prompt);
      } catch (error) {
        const errorMsg = String(error);
        const isServiceUnavailable =
          errorMsg.includes("503") || errorMsg.includes("Service Unavailable");

        if (!isServiceUnavailable || attempt === GEMINI_RETRY_ATTEMPTS - 1) {
          console.warn(
            `Gemini request failed (attempt ${attempt + 1}/${GEMINI_RETRY_ATTEMPTS}): ${errorMsg}`
          );
          break;
        }

        const delayMs = GEMINI_RETRY_DELAY_MS * Math.pow(2, attempt);
        console.log(`Gemini returned 503. Retrying in ${delayMs}ms...`);
        await sleep(delayMs);
      }
    }

    console.warn(
      "Gemini unavailable. Falling back to local Ollama model."
    );
    return await this.fallbackModel.generateContent(prompt);
  }
}

const createGeminiModel = (config?: GenerateModelConfig) => {
  if (GEMINI_KEYS.length === 0) {
    throw new Error(
      "No Gemini API keys configured. Set GEMINI_API_KEYS or GEMINI_API_KEY in .env",
    );
  }

  const key = GEMINI_KEYS[keyIndex % GEMINI_KEYS.length];
  keyIndex += 1;

  const genAI = new GoogleGenerativeAI(key);

  return genAI.getGenerativeModel({
    model: config?.model || "gemini-2.5-flash",
    generationConfig: {
      ...(config?.responseFormat !== "text"
        ? { responseMimeType: "application/json" }
        : {}),
      temperature: config?.temperature ?? 0.3,
    },
  });
};

export const getGenerationModel = (config?: GenerateModelConfig) => {
  const provider = normalizeAiProvider(config?.provider);

  if (provider === "local-ai" || GEMINI_KEYS.length === 0) {
    if (provider === "global-ai" && GEMINI_KEYS.length === 0) {
      console.warn(
        "Gemini keys are missing. Falling back to local Ollama model.",
      );
    }

    return new OllamaTextModel({
      baseUrl: OLLAMA_BASE_URL,
      model: config?.model || OLLAMA_MODEL,
      temperature: config?.temperature ?? 0.3,
      responseFormat: config?.responseFormat || "json",
    });
  }

  return new GeminiModelWithRetryAndFallback(config);
};
