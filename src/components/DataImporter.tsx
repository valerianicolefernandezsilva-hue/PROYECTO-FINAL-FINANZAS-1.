/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { UploadCloud, CheckCircle, RefreshCw, FileText, Download, AlertCircle, PlayCircle, Globe, Loader2 } from 'lucide-react';
import { AssetData, BenchmarkData, ASSETS_DATABASE, BENCHMARK_DATABASE, DATES } from '../data/refinitiv_data';

interface DataImporterProps {
  onImport: (dates: string[], assets: AssetData[], benchmark: BenchmarkData) => void;
  onRestore: () => void;
  currentAssetsCount: number;
  currentDatesCount: number;
  rfAnnual: number;
  onRfChange: (val: number) => void;
  isFetchingRf: boolean;
  onFetchRfRate: () => void;
  globalFrequency: string;
}

export default function DataImporter({ 
  onImport, 
  onRestore, 
  currentAssetsCount, 
  currentDatesCount, 
  rfAnnual, 
  onRfChange, 
  isFetchingRf, 
  onFetchRfRate, 
  globalFrequency
}: DataImporterProps) {
  const [activeImportTab, setActiveImportTab] = useState<'csv' | 'yfinance'>('csv');
  const [csvContent, setCsvContent] = useState<string>('');
  
  // YFinance State
  const [yTickersArray, setYTickersArray] = useState<string[]>(['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'GOOGL', 'META', 'BRK-B', 'JNJ', 'V']);
  const [tickerInput, setTickerInput] = useState('');
  const [yBenchmark, setYBenchmark] = useState<string>('SPY');
  
  const COMMON_SUGGESTIONS = [
    { ticker: 'AAPL', type: 'Acción', name: 'Apple Inc.' },
    { ticker: 'MSFT', type: 'Acción', name: 'Microsoft Corp.' },
    { ticker: 'NVDA', type: 'Acción', name: 'NVIDIA Corp.' },
    { ticker: 'TSLA', type: 'Acción', name: 'Tesla Inc.' },
    { ticker: 'AMZN', type: 'Acción', name: 'Amazon.com Inc.' },
    { ticker: 'GOOGL', type: 'Acción', name: 'Alphabet Inc.' },
    { ticker: 'META', type: 'Acción', name: 'Meta Platforms Inc.' },
    { ticker: 'BRK-B', type: 'Acción', name: 'Berkshire Hathaway' },
    { ticker: 'JNJ', type: 'Acción', name: 'Johnson & Johnson' },
    { ticker: 'V', type: 'Acción', name: 'Visa Inc.' },
    { ticker: 'PG', type: 'Acción', name: 'Procter & Gamble' },
    { ticker: 'JPM', type: 'Acción', name: 'JPMorgan Chase' },
    { ticker: 'UNH', type: 'Acción', name: 'UnitedHealth Group' },
    { ticker: 'XOM', type: 'Acción', name: 'Exxon Mobil' },
    { ticker: 'TLT', type: 'Bono', name: 'iShares 20+ Year Treasury' },
    { ticker: 'BND', type: 'Bono', name: 'Vanguard Total Bond Market' },
    { ticker: 'AGG', type: 'Bono', name: 'iShares Core US Aggregate' },
    { ticker: 'GLD', type: 'Commodity', name: 'SPDR Gold Trust' },
    { ticker: 'SLV', type: 'Commodity', name: 'iShares Silver Trust' },
    { ticker: 'SPY', type: 'ETF', name: 'SPDR S&P 500' },
    { ticker: 'QQQ', type: 'ETF', name: 'Invesco QQQ Trust' },
  ];
  
  const [yPeriod1, setYPeriod1] = useState<string>(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 5);
    return d.toISOString().split('T')[0];
  });
  const [yPeriod2, setYPeriod2] = useState<string>(new Date().toISOString().split('T')[0]);
  const [isFetchingYF, setIsFetchingYF] = useState<boolean>(false);

  // Dynamic Suggestion Search
  const [dynamicSuggestions, setDynamicSuggestions] = useState<any[]>([]);
  const [isSearchingTicker, setIsSearchingTicker] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleSearchTicker = async (query: string) => {
    if (!query.trim()) {
      setDynamicSuggestions([]);
      return;
    }
    
    setIsSearchingTicker(true);
    try {
      const res = await fetch(`/api/yfinance-search?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        setDynamicSuggestions(data);
      }
    } catch (error) {
      console.error("Error searching tickers", error);
    } finally {
      setIsSearchingTicker(false);
    }
  };

  const onTickerInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toUpperCase();
    setTickerInput(value);
    
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    
    // Buscar incluso con 1 sola letra para que coincida con el comportamiento de Yahoo Finance
    if (value.trim().length > 0) {
      searchTimeoutRef.current = setTimeout(() => {
        handleSearchTicker(value.trim());
      }, 300); // Reducir debounce a 300ms para mayor rapidez
    } else {
      setDynamicSuggestions([]);
    }
  };

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Generar un string CSV de ejemplo basado en un subconjunto de nuestros datos reales
  const generateSampleCSV = () => {
    const sampleTickers = ['VOO', 'AAPL', 'MSFT', 'GLD', 'TLT'];
    const headers = ['Fecha', 'S_P_500_SPX', ...sampleTickers];
    const rows = [headers.join(',')];

    for (let i = 0; i < DATES.length; i++) {
      const date = DATES[i];
      const bmkPrice = BENCHMARK_DATABASE.prices[i];
      const rowVals = [date, bmkPrice];
      
      sampleTickers.forEach(t => {
        const asset = ASSETS_DATABASE.find(a => a.ticker === t);
        if (asset && asset.prices[i] !== undefined) {
          rowVals.push(asset.prices[i]);
        } else {
          rowVals.push(100);
        }
      });
      rows.push(rowVals.join(','));
    }
    return rows.join('\n');
  };

  const handleDownloadSample = () => {
    const csvString = generateSampleCSV();
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'sample_financial_prices.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleApplySample = () => {
    setCsvContent(generateSampleCSV());
    setErrorMsg(null);
    setSuccessMsg('¡Estructura de datos de plantilla cargada en el editor! Presiona "Aplicar Datos Personalizados" para activar.');
  };

  // Procesar archivo físico subido
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCsvContent(text);
      setErrorMsg(null);
      setSuccessMsg(`Archivo "${file.name}" cargado con éxito. Revisa el contenido abajo y presiona "Aplicar Datos".`);
    };
    reader.onerror = () => {
      setErrorMsg('Error al leer el archivo físico.');
    };
    reader.readAsText(file);
  };

  const handleFetchYFinance = async () => {
    try {
      setIsFetchingYF(true);
      setErrorMsg(null);
      setSuccessMsg(null);

      const parsedTickers = yTickersArray.map(t => t.trim().toUpperCase()).filter(t => t !== '');
      const bmk = yBenchmark.trim().toUpperCase() || 'SPY';
      
      if (parsedTickers.length === 0) {
        throw new Error('Debes ingresar al menos un ticker valido.');
      }

      const allTickers = [bmk, ...parsedTickers];
      // Eliminar duplicados
      const uniqueTickers = Array.from(new Set(allTickers));

      let yfInterval = '1mo';
      let step = 1;

      if (globalFrequency === 'daily' || globalFrequency === 'weekly') {
        yfInterval = globalFrequency === 'daily' ? '1d' : '1wk';
        step = 1;
      } else if (globalFrequency === 'monthly') {
        step = 1;
      } else if (globalFrequency === 'bimonthly') {
        step = 2;
      } else if (globalFrequency === 'quarterly') {
        step = 3;
      } else if (globalFrequency === '4monthly') {
        step = 4;
      } else if (globalFrequency === 'semiannual') {
        step = 6;
      } else if (globalFrequency === 'annual') {
        step = 12;
      }

      const reqBody = {
        tickers: uniqueTickers,
        period1: yPeriod1,
        period2: yPeriod2,
        interval: yfInterval
      };

      const res = await fetch('/api/yfinance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody)
      });

      if (!res.ok) {
        throw new Error('Fallo la llamada al backend proxy de Yahoo Finance.');
      }

      const data = await res.json();
      
      // Process result to extract common dates
      if (!data[bmk] || !data[bmk].quotes || data[bmk].quotes.length === 0) {
        throw new Error(`Data del benchmark ${bmk} no retornó resultados válidos.`);
      }

      const bmkQuotesRaw = data[bmk].quotes;
      const bmkQuotes: any[] = [];
      for (let i = bmkQuotesRaw.length - 1; i >= 0; i -= step) {
        bmkQuotes.push(bmkQuotesRaw[i]);
      }
      bmkQuotes.reverse(); // So it's chronological again

      const parsedDates = bmkQuotes.map((q: any) => {
        const d = new Date(q.date).toISOString();
        return (globalFrequency === 'daily' || globalFrequency === 'weekly') ? d.slice(0, 10) : d.slice(0, 7);
      });
      
      const bmkPrices = bmkQuotes.map((q: any) => q.adjclose ?? q.close);
      
      const benchmarkData: BenchmarkData = {
        ticker: bmk,
        name: data[bmk].longName || data[bmk].shortName || `${bmk} Index`,
        prices: bmkPrices
      };

      const assets: AssetData[] = [];
      for (const ticker of parsedTickers) {
        const resultObj = data[ticker];
        if (!resultObj || !resultObj.quotes || resultObj.quotes.length === 0) {
          console.warn(`No data for ${ticker}, skipping.`);
          continue;
        }
        
        const quotesRaw = resultObj.quotes;

        // Map prices corresponding to benchmark dates
        const prices: number[] = [];
        for (let i = 0; i < parsedDates.length; i++) {
          const targetDateStr = parsedDates[i];
          const matchedQuote = quotesRaw.find((q: any) => {
            const d = new Date(q.date).toISOString();
            const dStr = (globalFrequency === 'daily' || globalFrequency === 'weekly') ? d.slice(0, 10) : d.slice(0, 7);
            return dStr === targetDateStr;
          });
          
          if (matchedQuote) {
            prices.push(matchedQuote.adjclose ?? matchedQuote.close);
          } else {
            // Fill with previous logic or carry over
            prices.push(prices.length > 0 ? prices[prices.length - 1] : 100);
          }
        }

        // Determinar sector y tipo básico
        let tipoAsignado: string = "Acción";
        let sectorAsignado = "Otros";
        
        const commonMatch = COMMON_SUGGESTIONS.find(c => c.ticker === ticker);
        
        if (commonMatch) {
          tipoAsignado = commonMatch.type;
          if (tipoAsignado === 'Bono') sectorAsignado = "Renta Fija";
          else if (tipoAsignado === 'ETF') sectorAsignado = "Renta Variable Diversificada";
          else if (tipoAsignado === 'Commodity' || tipoAsignado === 'Materia Prima' || tipoAsignado === 'Oro') sectorAsignado = "Metales";
          
          if (tipoAsignado === 'Commodity') tipoAsignado = 'Oro'; // Para alinear con los otros módulos
        } else if (resultObj.quoteType) {
          tipoAsignado = resultObj.quoteType === 'EQUITY' ? 'Acción' 
                       : resultObj.quoteType === 'ETF' ? 'ETF' 
                       : resultObj.quoteType === 'MUTUALFUND' ? 'Fondo/Bono' 
                       : resultObj.quoteType === 'CRYPTOCURRENCY' ? 'Cripto'
                       : resultObj.quoteType === 'CURRENCY' ? 'Divisa'
                       : resultObj.quoteType === 'FUTURE' ? 'Futuro'
                       : resultObj.quoteType === 'INDEX' ? 'Índice'
                       : 'Activo';
                       
          if (resultObj.quoteType === 'ETF') sectorAsignado = "Renta Variable Diversificada";
          else if (resultObj.quoteType === 'MUTUALFUND') sectorAsignado = "Renta Fija";
          else if (resultObj.quoteType === 'CRYPTOCURRENCY') sectorAsignado = "Criptomonedas";
        } else {
          // Fallbacks for when quoteType is missing
          const tLower = ticker.toLowerCase();
          const nameLower = (resultObj.shortName || resultObj.longName || '').toLowerCase();
          
          if (tLower.includes('tlt') || tLower.includes('shy') || tLower.includes('bnd') || nameLower.includes('bond') || nameLower.includes('treasury')) { 
            tipoAsignado = "Bono"; 
            sectorAsignado = "Renta Fija"; 
          } else if (tLower.includes('gld') || tLower.includes('slv') || nameLower.includes('gold') || nameLower.includes('silver')) { 
            tipoAsignado = "Materia Prima"; 
            sectorAsignado = "Metales"; 
          } else if (tLower.includes('vnq') || nameLower.includes('reit') || nameLower.includes('real estate')) { 
            tipoAsignado = "Fondo Inmobiliario"; 
            sectorAsignado = "Bienes Raíces"; 
          } else if (tLower.includes('spy') || tLower.includes('voo') || tLower.includes('qqq')) { 
            tipoAsignado = "ETF"; 
            sectorAsignado = "Renta Variable Diversificada"; 
          }
        }

        assets.push({
          ticker,
          name: resultObj.shortName || resultObj.longName || `${ticker} (YFinance)`,
          sector: sectorAsignado,
          type: tipoAsignado,
          marketCap: "N/A",
          volume: "N/A",
          prices
        });
      }

      if (assets.length === 0) {
        throw new Error('No se pudo encontrar datos históricos para ninguno de los activos solicitados.');
      }

      onImport(parsedDates, assets, benchmarkData);
      setSuccessMsg(`Datos de Yahoo Finance cargados: ${assets.length} activos y ${bmk} (Benchmark) sobre ${parsedDates.length} periodos mensuales.`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Ocurrió un error al cargar desde Yahoo Finance.');
    } finally {
      setIsFetchingYF(false);
    }
  };

  // Analítica del CSV para su validación
  const processAndApply = () => {
    if (!csvContent.trim()) {
      setErrorMsg('Por favor escribe, pega o sube un archivo CSV con precios históricos antes de procesar.');
      return;
    }

    try {
      setErrorMsg(null);
      setSuccessMsg(null);
      // ... rest of the parsing ...

      const lines = csvContent.split('\n').map(l => l.trim()).filter(l => l !== '');
      if (lines.length < 2) {
        throw new Error('El archivo CSV debe tener al menos una fila de cabecera y una fila de datos.');
      }

      // Detectar separador (coma, punto y coma o tabulación)
      const firstLine = lines[0];
      let separator = ',';
      if (firstLine.includes(';')) {
        separator = ';';
      } else if (firstLine.includes('\t')) {
        separator = '\t';
      }

      const headers = firstLine.split(separator).map(h => h.trim().replace(/^["']|["']$/g, ''));
      
      // Buscar columna de Fecha
      let dateColIdx = headers.findIndex(h => {
        const term = h.toLowerCase();
        return term.includes('date') || term.includes('fecha') || term.includes('mes') || term.includes('period') || term.includes('tiempo');
      });
      if (dateColIdx === -1) {
        dateColIdx = 0; // Por defecto la primera
      }

      // Buscar columna de S&P 500 (Benchmark)
      let bmkColIdx = headers.findIndex(h => {
        const term = h.toLowerCase();
        return term === 'spx' || term === 'spy' || term === '^gspc' || term.includes('benchmark') || term.includes('s&p') || term.includes('sp500') || term.includes('market');
      });
      if (bmkColIdx === -1) {
        // Fallback: segunda columna si la primera es fecha
        bmkColIdx = headers.findIndex((_, idx) => idx !== dateColIdx);
      }

      const parsedDates: string[] = [];
      const columnPrices: { [colIdx: number]: number[] } = {};
      
      headers.forEach((_, idx) => {
        if (idx !== dateColIdx) {
          columnPrices[idx] = [];
        }
      });

      for (let r = 1; r < lines.length; r++) {
        const cols = lines[r].split(separator).map(c => c.trim().replace(/^["']|["']$/g, ''));
        // Saltar filas corruptas o incompletas
        if (cols.length < headers.length) continue; 

        const dateVal = cols[dateColIdx] || `Mes ${r}`;
        parsedDates.push(dateVal);

        headers.forEach((_, idx) => {
          if (idx !== dateColIdx) {
            let val = parseFloat(cols[idx]);
            if (isNaN(val)) {
              // Reemplazo robusto por valor anterior o inicial
              const arr = columnPrices[idx];
              val = arr.length > 0 ? arr[arr.length - 1] : 100;
            }
            columnPrices[idx].push(val);
          }
        });
      }

      if (parsedDates.length < 2) {
        throw new Error('Se necesitan al menos 2 meses o periodos para calcular variaciones de retornos.');
      }

      const assets: AssetData[] = [];
      let benchmark: BenchmarkData | null = null;

      headers.forEach((h, idx) => {
        if (idx === dateColIdx) return;

        const prices = columnPrices[idx];
        if (idx === bmkColIdx) {
          benchmark = {
            ticker: h,
            name: `${h} Index (Benchmark Personalizado)`,
            prices
          };
        } else {
          // Detectar sector y tipo de instrumento sugeridos por el ticker o columnas
          const isBond = h.toLowerCase().includes('bond') || h.toLowerCase().includes('shy') || h.toLowerCase().includes('tlt') || h.toLowerCase().includes('bnd');
          const isGold = h.toLowerCase().includes('gld') || h.toLowerCase().includes('oro') || h.toLowerCase().includes('gold');
          assets.push({
            ticker: h,
            name: `${h} (Custom)`,
            sector: isBond ? "Renta Fija" : isGold ? "Materias Primas" : "Otros",
            type: isBond ? "Bono" : isGold ? "Materia Prima" : "Acción",
            marketCap: "N/A",
            volume: "N/A",
            prices
          });
        }
      });

      if (!benchmark) {
        if (assets.length > 0) {
          const first = assets.shift()!;
          benchmark = {
            ticker: first.ticker,
            name: `${first.ticker} (Utilizado como Benchmark)`,
            prices: first.prices
          };
        } else {
          throw new Error('No se detectaron columnas de activos válidas.');
        }
      }

      // Notificar aplicación
      onImport(parsedDates, assets, benchmark);
      
      setSuccessMsg(`¡Base de datos cargada con éxito! Se importaron ${assets.length} activos dinámicos y un benchmark (${benchmark.ticker}) sobre ${parsedDates.length} meses históricos de serie continua.`);
      setCsvContent('');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error al compilar el archivo CSV. Asegúrate de que las celdas contengan números decimales separados por comas.');
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-xs border border-gray-100 p-6 space-y-6" id="data-importer-panel">
      
      {/* Explicación de Origen de Datos */}
      <div className="border-b border-gray-100 pb-4 space-y-2">
        <h3 className="font-bold text-gray-900 text-base flex items-center gap-2">
          <UploadCloud className="text-blue-600 h-5 w-5" />
          Origen, Configuración e Importación de Datos
        </h3>
        
        {/* Selector de modo de importación */}
        <div className="flex gap-2 mt-4">
          <button 
            onClick={() => setActiveImportTab('csv')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeImportTab === 'csv' ? 'bg-slate-900 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            Importar desde Archivo CSV
          </button>
          <button 
            onClick={() => setActiveImportTab('yfinance')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${activeImportTab === 'yfinance' ? 'bg-indigo-600 text-white shadow-xs' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'}`}
          >
            <Globe className="h-4 w-4" /> Importar desde Yahoo Finance
          </button>
        </div>

        <div className="text-xs text-gray-600 leading-relaxed space-y-2.5 mt-3">
          <p>
            🚀 <strong>¿De dónde salieron los datos actuales?:</strong> Los datos por defecto pregrabados en la herramienta emulan las exportaciones mensuales reales de <strong>Refinitiv Workspace (LSEG)</strong>.
          </p>
          <p>
            📥 <strong>¿Cómo cargar tus propios datos?:</strong> Puedes usar la herramienta Yahoo Finance en tiempo real para generar portafolios a medida, o subir un formato CSV personalizado para control total sobre precios.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Lado izquierdo: Acciones e Instrucciones */}
        <div className="lg:col-span-1 space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-gray-800 uppercase tracking-widest block">Acciones Rápidas</h4>
            
            {/* Botón Descargar Formato */}
            <button
              onClick={handleDownloadSample}
              className="w-full flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:bg-slate-50 transition-all text-xs text-left"
            >
              <div className="flex gap-2 items-center">
                <FileText className="h-5 w-5 text-indigo-500" />
                <div>
                  <span className="font-semibold block text-slate-900">Descargar Plantilla CSV</span>
                  <span className="text-[10px] text-gray-400">Excelente para ver la estructura</span>
                </div>
              </div>
              <Download className="h-4 w-4 text-gray-400" />
            </button>

            {/* Botón Cargar Datos de Ejemplo en Editor */}
            <button
              onClick={handleApplySample}
              className="w-full flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:bg-slate-50 transition-all text-xs text-left"
            >
              <div className="flex gap-2 items-center">
                <PlayCircle className="h-5 w-5 text-emerald-500" />
                <div>
                  <span className="font-semibold block text-slate-900">Usar Plantilla de Ejemplo</span>
                  <span className="text-[10px] text-gray-400">Prellena el editor con un subconjunto</span>
                </div>
              </div>
              <CheckCircle className="h-4 w-4 text-gray-300" />
            </button>

            {/* Botón Restaurar Base de Datos Refinitiv */}
            <button
              onClick={onRestore}
              className="w-full flex items-center justify-between p-3 rounded-lg border border-blue-100 bg-blue-50/50 hover:bg-blue-50 transition-all text-xs text-left"
            >
              <div className="flex gap-2 items-center">
                <RefreshCw className="h-5 w-5 text-blue-600 animate-spin-hover" />
                <div>
                  <span className="font-semibold block text-blue-800">Restaurar Base UPB Refinitiv</span>
                  <span className="text-[10px] text-blue-600/70">Vuelve a los 30 activos del Trabajo</span>
                </div>
              </div>
            </button>
          </div>

          {/* Estadísticas de la Base cargada actualmente */}
          <div className="bg-slate-50 p-4 border border-slate-100 rounded-lg space-y-1.5 text-xs text-slate-600">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Estado de la Base de Activos Activa</span>
            <div className="flex justify-between font-mono py-1 border-b border-slate-200/50">
              <span>Activos Cargados:</span>
              <strong className="text-slate-900">{currentAssetsCount}</strong>
            </div>
            <div className="flex justify-between font-mono py-1">
              <span>Periodos Históricos (fechas):</span>
              <strong className="text-slate-900">{currentDatesCount} meses</strong>
            </div>
          </div>
        </div>

        {/* Lado derecho: Campo de texto Editor CSV o Formulario Yahoo Finance */}
        <div className="lg:col-span-2 space-y-3.5">
          
          <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm mb-4">
            <div className="flex flex-col">
              <span className="text-[11px] uppercase font-bold tracking-widest text-emerald-400">Tasa Libre de Riesgo Global</span>
              <span className="text-[10px] text-slate-400">Usada referencialmente en todos los modelos (e.g. 13-Week T-Bill)</span>
            </div>
            <div className="flex items-center gap-2">
              <input 
                type="number" 
                min="0" 
                max="50" 
                step="0.1"
                value={Number((rfAnnual * 100).toFixed(2))}
                onChange={(e) => onRfChange(parseFloat(e.target.value) / 100)}
                className="w-16 h-8 bg-slate-800 border border-slate-600 rounded-lg text-center font-mono text-xs text-emerald-300 focus:outline-none focus:border-blue-500"
              />
              <span className="text-xs font-mono text-slate-400 mr-2">%</span>
              
              <button
                onClick={onFetchRfRate}
                disabled={isFetchingRf}
                className="flex items-center gap-1.5 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 px-3 py-2 rounded-lg text-[10px] font-bold uppercase transition-colors"
                title="Obtener Tasa Actual de 13-Week T-Bill de Yahoo Finance"
              >
                {isFetchingRf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />}
                Importar T-Bill Yield
              </button>
            </div>
          </div>

          {activeImportTab === 'csv' ? (
            <>
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-gray-800 uppercase tracking-widest block">Editor de Datos Planos (CSV)</span>
                <div className="flex gap-2 items-center">
                  
                  {/* Botón Subir Archivo Físico */}
                  <input
                    type="file"
                    accept=".csv, .txt"
                    onChange={handleFileUpload}
                    ref={fileInputRef}
                    className="hidden"
                    id="physical-file-input"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <UploadCloud className="h-3.5 w-3.5" /> Subir archivo .CSV
                  </button>
                </div>
              </div>

              <textarea
                value={csvContent}
                onChange={(e) => setCsvContent(e.target.value)}
                placeholder="Pega las líneas de tu archivo CSV aquí, o arrastra/sube un archivo. formato sugerido:
Fecha,SPX,AAPL,MSFT,NVDA,GLD
Jun 2023,4400,179.58,335.02,38.95,160.01
Jul 2023,4500,196.45,335.92,41.62,162.33
..."
                className="w-full h-[180px] bg-slate-900 text-slate-200 p-4 rounded-xl font-mono text-xs focus:ring-1 focus:ring-blue-500 focus:outline-hidden"
                id="csv-text-editor"
              />

              {/* Botón de envío principal */}
              <button
                onClick={processAndApply}
                className="w-full bg-slate-950 hover:bg-slate-900 border border-slate-800 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition-all shadow-sm flex items-center justify-center gap-2"
                id="apply-import-btn"
              >
                <CheckCircle className="h-4 w-4" /> Aplicar Datos CSV
              </button>
            </>
          ) : (
            <>
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-indigo-800 uppercase tracking-widest block">Consultar Live Yahoo Finance</span>
              </div>
              
              <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2 space-y-2 relative">
                    <label className="block text-[11px] font-bold text-indigo-800 mb-1">Tickers de Activos a Importar</label>
                    
                    {/* Buscador */}
                    <div className="relative">
                      <input 
                        type="text" 
                        value={tickerInput}
                        onChange={onTickerInputChange}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (tickerInput && !yTickersArray.includes(tickerInput)) {
                              setYTickersArray([...yTickersArray, tickerInput]);
                              setTickerInput('');
                              setDynamicSuggestions([]);
                            }
                          }
                        }}
                        className="w-full p-2.5 rounded-lg border border-indigo-200 text-xs font-mono focus:ring-2 focus:ring-indigo-400 focus:outline-none bg-white placeholder:font-sans placeholder:text-slate-400 transition-shadow"
                        placeholder="Buscar por símbolo (ej. AAPL) o nombre de empresa..."
                      />
                      {tickerInput.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-2 max-h-48 overflow-y-auto bg-white border border-indigo-200 rounded-lg shadow-lg z-20 scrollbar-thin">
                          {isSearchingTicker ? (
                             <div className="px-3 py-3 flex items-center justify-center gap-2 text-xs text-slate-500 italic">
                               <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
                               Buscando en Yahoo Finance...
                             </div>
                          ) : (
                            <>
                              {/* Sugerencias Locales Combinadas con Dinámicas */}
                              {(() => {
                                // Preferir startsWith para evitar ruido de coincidencias intermedias en las locales
                                const localMatches = COMMON_SUGGESTIONS.filter(item => 
                                  item.ticker.startsWith(tickerInput) || 
                                  item.name.toUpperCase().startsWith(tickerInput) || 
                                  item.name.toUpperCase().includes(` ${tickerInput}`)
                                ).map(item => ({
                                  ...item,
                                  type: item.type === 'Commodity' ? 'Oro' : item.type
                                }));
                                
                                const dynamicMatches = dynamicSuggestions.map(d => {
                                  const commonMatch = COMMON_SUGGESTIONS.find(c => c.ticker === d.symbol);
                                  return {
                                    ticker: d.symbol,
                                    name: d.shortname || d.longname || d.symbol,
                                    type: commonMatch ? (commonMatch.type === 'Commodity' ? 'Oro' : commonMatch.type)
                                        : d.quoteType === 'EQUITY' ? 'Acción' 
                                        : d.quoteType === 'ETF' ? 'ETF' 
                                        : d.quoteType === 'MUTUALFUND' ? 'Fondo/Bono' 
                                        : d.quoteType === 'CRYPTOCURRENCY' ? 'Cripto'
                                        : d.quoteType === 'CURRENCY' ? 'Divisa'
                                        : d.quoteType === 'FUTURE' ? 'Futuro'
                                        : d.quoteType === 'INDEX' ? 'Índice'
                                        : 'Activo',
                                    exchange: d.exchDisp || d.exchange || ''
                                  };
                                }).filter(d => !localMatches.some(l => l.ticker === d.ticker));
                                
                                // Limitar resultados para no sobrecargar el submenú
                                const allMatches = [...localMatches, ...dynamicMatches]
                                  .filter(item => item?.ticker && !yTickersArray.includes(item.ticker))
                                  .slice(0, 20);

                                if (allMatches.length === 0) {
                                  return (
                                    <div className="px-3 py-3 text-xs text-slate-500 italic text-center">
                                      Pulsa Enter para añadir "{tickerInput}" manualmente
                                    </div>
                                  )
                                }

                                return allMatches.map((item, idx) => (
                                  <div 
                                    key={item.ticker || idx}
                                    className="px-3 py-2 text-xs flex justify-between items-center cursor-pointer hover:bg-indigo-50 border-b border-slate-50 last:border-0 transition-colors"
                                    onClick={() => {
                                      if (item.ticker) {
                                        setYTickersArray([...yTickersArray, item.ticker]);
                                      }
                                      setTickerInput('');
                                      setDynamicSuggestions([]);
                                    }}
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono font-bold text-slate-800 w-14">{item.ticker}</span>
                                      <div className="flex flex-col">
                                        <span className="text-slate-600 font-medium truncate max-w-[160px] sm:max-w-[220px]">{item.name}</span>
                                        {'exchange' in item && item.exchange && <span className="text-[9px] text-slate-400 font-mono tracking-wide">{item.exchange as string}</span>}
                                      </div>
                                    </div>
                                    <span className={`px-2 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider shrink-0 ${
                                      item.type === 'Acción' ? 'bg-indigo-100 text-indigo-700' :
                                      item.type === 'Bono' ? 'bg-amber-100 text-amber-700' :
                                      item.type === 'ETF' ? 'bg-emerald-100 text-emerald-700' :
                                      (item.type === 'Oro' || item.type === 'Commodity' || item.type === 'Materia Prima') ? 'bg-yellow-100 text-yellow-700' :
                                      'bg-slate-100 text-slate-600'
                                    }`}>
                                      {item.type}
                                    </span>
                                  </div>
                                ));
                              })()}
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Contenedor de Activos Seleccionados */}
                    <div className="pt-2">
                      <label className="block text-[11px] font-bold text-indigo-700 mb-2">
                        Activos Seleccionados ({yTickersArray.length})
                      </label>
                      <div className="bg-white p-3.5 rounded-xl border border-indigo-100 min-h-[60px] shadow-inner">
                        <div className="flex flex-wrap gap-2">
                          {yTickersArray.length === 0 ? (
                            <span className="text-xs text-slate-400 italic">No hay activos seleccionados...</span>
                          ) : (
                            yTickersArray.map((t, idx) => {
                              const suggestion = COMMON_SUGGESTIONS.find(s => s.ticker === t);
                              const typeLabel = suggestion ? suggestion.type : 'Activo';
                              return (
                                <span key={`${t}-${idx}`} className="bg-indigo-600 text-white font-bold px-2 py-1.5 rounded-md text-[11px] flex items-center gap-1.5 shadow-sm transition-transform hover:scale-105">
                                  <span className="font-mono tracking-wide">{t}</span>
                                  <span className="text-[9px] bg-indigo-500/80 px-1.5 py-0.5 rounded opacity-90">{typeLabel}</span>
                                  <button type="button" onClick={() => setYTickersArray(yTickersArray.filter(x => x !== t))} className="hover:text-red-300 transition-colors ml-0.5 text-base leading-none">&times;</button>
                                </span>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-indigo-800 mb-1">Ticker del Benchmark</label>
                    <select
                      value={yBenchmark}
                      onChange={(e) => setYBenchmark(e.target.value)}
                      className="w-full p-2.5 rounded-lg border border-indigo-200 text-xs font-mono focus:ring-2 focus:ring-indigo-400 outline-none bg-white"
                    >
                      <option value="SPY">SPY (S&P 500 ETF)</option>
                      <option value="^GSPC">^GSPC (S&P 500 Index)</option>
                      <option value="QQQ">QQQ (Nasdaq 100 ETF)</option>
                      <option value="^IXIC">^IXIC (Nasdaq Composite)</option>
                      <option value="DIA">DIA (Dow Jones ETF)</option>
                      <option value="IWM">IWM (Russell 2000 ETF)</option>
                      <option value="^RUT">^RUT (Russell 2000 Index)</option>
                      <option value="VT">VT (Vanguard Total World ETF)</option>
                    </select>
                  </div>
                  <div className="md:col-span-2 grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-bold text-indigo-800 mb-1">Desde</label>
                      <input 
                        type="date" 
                        value={yPeriod1}
                        onChange={(e) => setYPeriod1(e.target.value)}
                        className="w-full p-2 rounded-lg border border-indigo-200 text-xs font-mono focus:ring-2 focus:ring-indigo-400 outline-hidden"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-indigo-800 mb-1">Hasta</label>
                      <input 
                        type="date" 
                        max={new Date().toISOString().split('T')[0]}
                        value={yPeriod2}
                        onChange={(e) => setYPeriod2(e.target.value)}
                        className="w-full p-2 rounded-lg border border-indigo-200 text-xs font-mono focus:ring-2 focus:ring-indigo-400 outline-hidden"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={handleFetchYFinance}
                disabled={isFetchingYF}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed text-white font-bold py-2.5 px-4 rounded-xl text-xs transition-all shadow-sm flex items-center justify-center gap-2"
              >
                {isFetchingYF ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Obteniendo Datos (Puede tomar unos segundos)...</>
                ) : (
                  <><Globe className="h-4 w-4" /> Importar desde Yahoo Finance</>
                )}
              </button>
            </>
          )}

          {/* Mensajes de feedback compartidos */}
          {errorMsg && (
            <div className="bg-red-50 text-red-800 p-3 rounded-lg border border-red-100 flex items-start gap-2 text-xs leading-relaxed" id="import-error-banner">
              <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="bg-emerald-50 text-emerald-800 p-3 rounded-lg border border-emerald-100 flex items-start gap-2 text-xs leading-relaxed" id="import-success-banner">
              <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
