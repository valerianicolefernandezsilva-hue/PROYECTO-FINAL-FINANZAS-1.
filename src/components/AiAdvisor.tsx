import React, { useState, useRef, useEffect } from 'react';
import { Bot, X, Send, Loader2, Sparkles, AlertCircle } from 'lucide-react';
import Markdown from 'react-markdown';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

export default function AiAdvisor({ activeTab }: { activeTab: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: '¡Hola! Soy tu Asesor Financiero IA. Puedo ayudarte a interpretar los datos, explicar conceptos como CAPM o la Frontera Eficiente, y responder dudas sobre las empresas. ¿En qué te puedo ayudar hoy?'
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const getModuleName = (tab: string) => {
    switch (tab) {
      case 'induction': return 'Inducción de Riesgo';
      case 'risk-return': return 'Riesgo y Rentabilidad Histórica';
      case 'importer': return 'Importación de Datos y Predicciones';
      case 'optimizer': return 'Optimización de Portafolios (Markowitz)';
      case 'capm': return 'Modelo CAPM';
      case 'forecast': return 'Simulación de Pronósticos y CMI';
      default: return 'General';
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: inputValue.trim()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: userMessage.text,
          history: messages.slice(1).map(({ role, text }) => ({ role, text })), // exclude the welcome message
          moduleName: getModuleName(activeTab)
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error de conexión');
      }

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: data.text
      };

      setMessages(prev => [...prev, aiMessage]);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'No se pudo generar una respuesta.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-6 right-6 w-14 h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-lg hover:-translate-y-1 transition-all flex items-center justify-center z-50 group focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${isOpen ? 'scale-0' : 'scale-100'}`}
        aria-label="Abrir Asesor IA"
      >
        <Sparkles className="h-6 w-6 group-hover:animate-pulse" />
      </button>

      {/* Chat Window */}
      <div 
        className={`fixed bottom-6 right-6 w-[350px] sm:w-[400px] h-[500px] max-h-[80vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col z-50 transition-all origin-bottom-right duration-300 ease-in-out ${isOpen ? 'scale-100 opacity-100' : 'scale-0 opacity-0 pointer-events-none'}`}
      >
        {/* Header */}
        <div className="bg-slate-900 text-white p-4 rounded-t-2xl flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-500 p-1.5 rounded-lg flex items-center justify-center shadow-inner">
              <Bot className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-sm tracking-wide">Asesor Financiero IA</h3>
              <p className="text-[10px] text-indigo-200">
                Contexto activo: {getModuleName(activeTab)}
              </p>
            </div>
          </div>
          <button 
            onClick={() => setIsOpen(false)}
            className="text-slate-400 hover:text-white transition-colors p-1"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Message Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin bg-slate-50">
          {messages.map((msg) => (
            <div 
              key={msg.id} 
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div 
                className={`max-w-[85%] rounded-2xl p-3 text-sm shadow-xs ${
                  msg.role === 'user' 
                    ? 'bg-indigo-600 text-white rounded-br-sm' 
                    : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm'
                }`}
              >
                {msg.role === 'assistant' ? (
                   <div className="markdown-body prose prose-sm max-w-none prose-p:leading-relaxed prose-pre:bg-slate-800 prose-pre:text-slate-50">
                     <Markdown>{msg.text}</Markdown>
                   </div>
                ) : (
                  msg.text
                )}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-sm p-4 shadow-xs flex items-center gap-2 text-slate-500 text-sm">
                <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
                <span>Analizando datos...</span>
              </div>
            </div>
          )}
          {error && (
            <div className="flex justify-center my-2">
              <div className="bg-red-50 text-red-600 text-xs px-3 py-2 rounded-lg border border-red-100 flex items-center gap-1.5 shadow-xs">
                <AlertCircle className="h-3.5 w-3.5" />
                {error}
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-3 bg-white border-t border-slate-200 rounded-b-2xl shrink-0">
          <form onSubmit={handleSendMessage} className="flex items-end gap-2 relative">
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage(e);
                }
              }}
              placeholder="Hazme una pregunta sobre finanzas..."
              className="flex-1 max-h-32 min-h-[44px] bg-slate-100 border-transparent focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-3 text-sm resize-none outline-none transition-colors"
              rows={1}
            />
            <button
              type="submit"
              disabled={!inputValue.trim() || isLoading}
              className="bg-indigo-600 hover:bg-indigo-700 text-white p-3 rounded-xl shadow-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0 flex items-center justify-center mb-0.5 h-[44px] w-[44px]"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
          <div className="text-center mt-2">
             <span className="text-[9px] text-slate-400 font-medium tracking-wide text-center">IA POTENCIADA POR GEMINI - RESPUESTAS GENERADAS PUEDEN VARIAR</span>
          </div>
        </div>
      </div>
    </>
  );
}
