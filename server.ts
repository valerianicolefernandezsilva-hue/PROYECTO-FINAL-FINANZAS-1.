import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import yfImport from 'yahoo-finance2';
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

// Load environment variables from .env
dotenv.config();

// Handle CJS/ESM interop for default export
const YFClass = (yfImport as any).default || yfImport;
const yahooFinance = new YFClass();

// Lazy-initialize Gemini client
let ai: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!ai) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured. Please add it via Settings.");
    }
    ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return ai;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Add JSON body parser
  app.use(express.json());

  // AI Advisor Chat endpoint
  app.post("/api/chat", async (req, res) => {
    try {
      const client = getGeminiClient();
      const { prompt, history, moduleName } = req.body;

      if (!prompt) {
        return res.status(400).json({ error: "No prompt provided." });
      }

      let systemInstruction = "Eres un asistente financiero y asesor de inversiones experto. Tu tarea es ayudar a los usuarios que utilizan la plataforma de análisis de carteras y valoración de activos. Responde de forma concisa, profesional e instructiva, usando lenguaje claro para estudiantes y profesionales de finanzas.";
      if (moduleName) {
        systemInstruction += ` Actualmente el usuario está viendo el módulo: ${moduleName}. Proporciona contexto relevante a este módulo si es necesario.`;
      }

      const rawContents: any[] = [];
      if (history && Array.isArray(history)) {
        history.forEach((h: any) => {
          rawContents.push({
            role: h.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: h.text }]
          });
        });
      }
      rawContents.push({
        role: 'user',
        parts: [{ text: prompt }]
      });

      const contents: any[] = [];
      rawContents.forEach(item => {
        // Gemini API requires the first message to be from 'user'.
        // If the first message is from 'model', we prepend a dummy user message or drop it.
        if (contents.length === 0 && item.role === 'model') {
          contents.push({ role: 'user', parts: [{ text: 'Hola' }] });
        }
        
        if (contents.length > 0 && contents[contents.length - 1].role === item.role) {
          contents[contents.length - 1].parts[0].text += '\n\n' + item.parts[0].text;
        } else {
          contents.push(item);
        }
      });

      const response = await client.models.generateContent({
        model: "gemini-2.5-flash",
        contents: contents,
        config: {
          systemInstruction,
          temperature: 0.7,
        }
      });

      res.json({ text: response.text });
    } catch (error: any) {
      console.error('Chat API Error:', error);
      res.status(500).json({ error: error.message || 'Fallo al procesar la solicitud con Gemini.' });
    }
  });

  // API handler for fetching Yahoo Finance data
  app.post("/api/yfinance", async (req, res) => {
    try {
      const { tickers, period1, period2, interval = '1mo' } = req.body;
      
      if (!tickers || !Array.isArray(tickers) || tickers.length === 0) {
        return res.status(400).json({ error: "No tickers provided." });
      }

      const results: any = {};
      for (const ticker of tickers) {
        try {
          const chartResult = await yahooFinance.chart(ticker, {
            period1: new Date(period1).getTime() / 1000, 
            period2: new Date(period2).getTime() / 1000,
            interval: interval as any,
          });
          
          let quoteResult = null;
          try {
            quoteResult = await yahooFinance.quote(ticker);
          } catch (e) {
            console.error(`Failed to fetch quote for ${ticker}`);
          }
          
          results[ticker] = {
            quotes: chartResult.quotes,
            quoteType: quoteResult?.quoteType,
            shortName: quoteResult?.shortName,
            longName: quoteResult?.longName
          };
        } catch (error) {
          console.error(`Failed to fetch for ${ticker}:`, error);
          results[ticker] = null;
        }
      }

      // We might also want to fetch SPY for benchmark if not requested
      res.json(results);
    } catch (error) {
      console.error('Yahoo Finance API Error:', error);
      res.status(500).json({ error: 'Failed to fetch data' });
    }
  });

  // API handler for fetching a single Yahoo Finance quote
  app.get("/api/yfinance-quote", async (req, res) => {
    try {
      const { ticker } = req.query;
      
      if (!ticker || typeof ticker !== 'string') {
        return res.status(400).json({ error: "No ticker provided." });
      }

      const quote = await yahooFinance.quote(ticker);
      res.json(quote);
    } catch (error) {
      console.error('Yahoo Finance API Error (Quote):', error);
      res.status(500).json({ error: 'Failed to fetch quote data' });
    }
  });

  // API handler for fetching financial news via Yahoo Finance
  app.get("/api/yfinance-news", async (req, res) => {
    try {
      const { q } = req.query;
      
      if (!q || typeof q !== 'string') {
        return res.status(400).json({ error: "No query provided." });
      }

      // Yahoo Finance search can return news for a given query/ticker
      const result = await yahooFinance.search(q, { newsCount: 8 });
      res.json(result.news || []);
    } catch (error) {
      console.error('Yahoo Finance API Error (News):', error);
      res.status(500).json({ error: 'Failed to fetch news' });
    }
  });

  // API handler for searching tickers via Yahoo Finance
  app.get("/api/yfinance-search", async (req, res) => {
    try {
      const { q } = req.query;
      
      if (!q || typeof q !== 'string') {
        return res.status(400).json({ error: "No query provided." });
      }

      // Perform the search and extract quotes (which represent ticker suggestions)
      const result = await yahooFinance.search(q, { quotesCount: 10, newsCount: 0 });
      res.json(result.quotes || []);
    } catch (error) {
      console.error('Yahoo Finance API Error (Search):', error);
      res.status(500).json({ error: 'Failed to search tickers' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
