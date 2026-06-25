import React, { useState, useEffect } from 'react';
import { Search, Loader2, ExternalLink, Newspaper, TrendingUp, Presentation, Globe } from 'lucide-react';
import { AssetData, BenchmarkData } from '../data/refinitiv_data';

interface NewsItem {
  uuid: string;
  title: string;
  publisher: string;
  link: string;
  providerPublishTime: number;
  type: string;
}

export default function NewsSidebar({ customAssets, customBenchmark }: { customAssets: AssetData[], customBenchmark: BenchmarkData }) {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState('');

  const fetchNews = async (query: string) => {
    if (!query) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/yfinance-news?q=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error('Error buscando noticias');
      const data = await res.json();
      setNews(data);
    } catch (e: any) {
      console.error(e);
      setError('Problema de conexión al buscar noticias.');
    } finally {
      setLoading(false);
    }
  };

  // Inicializar buscando noticias del benchmark por defecto
  useEffect(() => {
    if (customBenchmark) {
      // Buscar el nombre del benchmark o su ticker (limpiando " (^XXX)")
      const benchmarkName = customBenchmark.name || customBenchmark.ticker.split(' (')[0];
      setSearchQuery(benchmarkName);
      fetchNews(benchmarkName);
    } else if (customAssets && customAssets.length > 0) {
      const topTickers = customAssets.slice(0, 3).map(a => a.ticker.split('.')[0]).join(' ');
      setSearchQuery(topTickers);
      fetchNews(topTickers);
    }
  }, [customBenchmark, customAssets]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchNews(searchQuery);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden flex flex-col h-full w-full">
      {/* Cabecera del Panel */}
      <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 text-slate-800">
          <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-1.5 rounded-lg text-white shadow-sm">
            <Newspaper className="h-4 w-4" />
          </div>
          <h2 className="font-bold text-[13px] uppercase tracking-wide">Noticias de Mercado</h2>
        </div>
      </div>

      {/* Buscador de Noticias Generales */}
      <div className="p-4 border-b border-slate-100 shrink-0 bg-slate-50/50">
        <form onSubmit={handleSearch} className="relative flex items-center">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-slate-400" />
          </div>
          <input
            type="text"
            className="block w-full pl-9 pr-20 py-2.5 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white outline-none transition-all shadow-sm placeholder:text-slate-400"
            placeholder="Buscar empresa o mercado..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <div className="absolute inset-y-0 right-1 flex items-center">
             <button type="submit" className="bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-bold px-2.5 py-1.5 rounded-md transition-colors">
               BUSCAR
             </button>
          </div>
        </form>
        <div className="text-[10px] text-slate-500 mt-3 flex items-center justify-between">
          <span className="flex items-center gap-1"><TrendingUp className="h-3 w-3 text-blue-500" /> Tendencias en vivo</span>
          <span className="flex items-center gap-1"><Globe className="h-3 w-3 text-emerald-500" /> Mercados Globales</span>
        </div>
      </div>

      {/* Lista de Noticias (Scrollable) */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-40 text-slate-400 space-y-3">
            <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
            <span className="text-xs">Rastreando terminal de noticias...</span>
          </div>
        ) : error ? (
          <div className="text-center p-4 bg-red-50 text-red-600 rounded-lg text-xs">
            {error}
          </div>
        ) : news.length === 0 ? (
          <div className="text-center p-4 text-slate-500 text-xs flex flex-col items-center gap-2">
            <Presentation className="h-6 w-6 text-slate-300" />
            No se encontraron noticias recientes.
          </div>
        ) : (
          news.map((item, index) => (
            <a 
              key={item.uuid || index} 
              href={item.link} 
              target="_blank" 
              rel="noopener noreferrer"
              className="block group"
            >
              <div className="border border-slate-100 bg-white p-3.5 rounded-xl hover:shadow-md hover:border-blue-200 transition-all duration-300 transform hover:-translate-y-0.5">
                <div className="flex justify-between items-center gap-2 mb-2">
                  <span className="text-[10px] font-bold text-blue-600 tracking-wider uppercase bg-blue-50/50 border border-blue-100/50 px-2 py-1 rounded-md">
                    {item.publisher}
                  </span>
                  <span className="text-[10px] text-slate-400 shrink-0 font-mono">
                    {new Date(
                      typeof item.providerPublishTime === 'string' || item.providerPublishTime > 1e11
                        ? item.providerPublishTime
                        : item.providerPublishTime * 1000
                    ).toLocaleDateString()}
                  </span>
                </div>
                <h3 className="text-[13px] font-semibold text-slate-800 leading-relaxed group-hover:text-blue-700 transition-colors line-clamp-3">
                  {item.title}
                </h3>
                <div className="mt-3 flex items-center text-[10px] text-blue-500 font-bold tracking-wide opacity-0 group-hover:opacity-100 transition-opacity">
                  LEER ARTÍCULO <ExternalLink className="h-3 w-3 ml-1" />
                </div>
              </div>
            </a>
          ))
        )}
      </div>
    </div>
  );
}
