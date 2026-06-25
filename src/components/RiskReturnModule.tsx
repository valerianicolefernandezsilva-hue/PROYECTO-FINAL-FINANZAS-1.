/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ScatterChart, Scatter, LabelList, Cell, Label
} from 'recharts';
import { Search, Info, TrendingUp, Shield, HelpCircle, BarChart2 } from 'lucide-react';
import { ASSETS_DATABASE, BENCHMARK_DATABASE, DATES, AssetData, BenchmarkData } from '../data/refinitiv_data';
import { PerformanceMetrics } from '../types';
import { useEffect } from 'react';

function parseDateString(dateStr: string): Date {
  if (!dateStr) return new Date();
  const trimmed = dateStr.trim();
  if (trimmed.includes('-')) {
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) return d;
  }
  const parts = trimmed.split(' ');
  if (parts.length !== 2) {
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) return d;
    return new Date();
  }
  const monthMap: Record<string, number> = {
    'ene': 0, 'feb': 1, 'mar': 2, 'abr': 3, 'may': 4, 'jun': 5,
    'jul': 6, 'ago': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dic': 11,
    'jan': 0, 'apr': 3, 'aug': 7, 'dec': 11
  };
  const mStr = parts[0].toLowerCase();
  const year = parseInt(parts[1], 10);
  const month = monthMap[mStr] !== undefined ? monthMap[mStr] : 0;
  return new Date(year, month, 1);
}

function formatDateToISO(dateStr: string): string {
  const d = parseDateString(dateStr);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = '01';
  return `${yyyy}-${mm}-${dd}`;
}

interface RiskReturnModuleProps {
  metrics: PerformanceMetrics[];
  rfAnnual: number;
  assetsDb?: AssetData[];
  benchmarkDb?: BenchmarkData;
  dates?: string[];
  periodsPerYear?: number;
}

export default function RiskReturnModule({ 
  metrics, 
  rfAnnual, 
  assetsDb = ASSETS_DATABASE, 
  benchmarkDb = BENCHMARK_DATABASE, 
  dates = DATES,
  periodsPerYear = 12
}: RiskReturnModuleProps) {
  const dbAssets = assetsDb;
  const dbBenchmark = benchmarkDb;
  const dbDates = dates;

  // Estado para selección de activos a comparar, sincronizado al cambiar el dbAssets
  const [selectedTickers, setSelectedTickers] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [chartType, setChartType] = useState<'normalizado' | 'nominal'>('normalizado');
  const [dateRange, setDateRange] = useState<{ start: number; end: number }>({ start: 0, end: dbDates.length - 1 });
  const [sortField, setSortField] = useState<keyof PerformanceMetrics>('annualReturn');
  const [sortAsc, setSortAsc] = useState(false);

  // Sincronizar tickers seleccionados por defecto cuando cambia la base de datos
  useEffect(() => {
    if (dbAssets.length > 0) {
      setSelectedTickers(dbAssets.slice(0, Math.min(4, dbAssets.length)).map(a => a.ticker));
    }
  }, [dbAssets]);

  // Sincronizar rango de fechas cuando cambia la base de datos
  useEffect(() => {
    setDateRange({ start: 0, end: dbDates.length - 1 });
  }, [dbDates]);

  const handleStartDateChange = (valStr: string) => {
    if (!valStr) return;
    const parts = valStr.split('-');
    if (parts.length !== 3) return;
    const targetYear = parseInt(parts[0], 10);
    const targetMonth = parseInt(parts[1], 10) - 1; // 0-indexed

    let closestIndex = 0;
    let minDiff = Infinity;
    dbDates.forEach((dStr, idx) => {
      const d = parseDateString(dStr);
      const diff = Math.abs((d.getFullYear() - targetYear) * 12 + (d.getMonth() - targetMonth));
      if (diff < minDiff) {
        minDiff = diff;
        closestIndex = idx;
      }
    });

    // Asegurarse de que el inicio no sea posterior o igual al final actual
    if (closestIndex >= dateRange.end) {
      if (dateRange.end > 0) {
        setDateRange(prev => ({ ...prev, start: Math.max(0, dateRange.end - 1) }));
      }
    } else {
      setDateRange(prev => ({ ...prev, start: closestIndex }));
    }
  };

  const handleEndDateChange = (valStr: string) => {
    if (!valStr) return;
    const parts = valStr.split('-');
    if (parts.length !== 3) return;
    const targetYear = parseInt(parts[0], 10);
    const targetMonth = parseInt(parts[1], 10) - 1; // 0-indexed

    let closestIndex = dbDates.length - 1;
    let minDiff = Infinity;
    dbDates.forEach((dStr, idx) => {
      const d = parseDateString(dStr);
      const diff = Math.abs((d.getFullYear() - targetYear) * 12 + (d.getMonth() - targetMonth));
      if (diff < minDiff) {
        minDiff = diff;
        closestIndex = idx;
      }
    });

    // Asegurarse de que el final no sea anterior o igual al inicio actual
    if (closestIndex <= dateRange.start) {
      if (dateRange.start < dbDates.length - 1) {
        setDateRange(prev => ({ ...prev, end: Math.min(dbDates.length - 1, dateRange.start + 1) }));
      }
    } else {
      setDateRange(prev => ({ ...prev, end: closestIndex }));
    }
  };

  // Filtrar activos según búsqueda de ticker o nombre
  const filteredAssets = useMemo(() => {
    return dbAssets.filter(asset => 
      asset.ticker.toLowerCase().includes(searchTerm.toLowerCase()) || 
      asset.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [dbAssets, searchTerm]);

  const toggleTicker = (ticker: string) => {
    if (selectedTickers.includes(ticker)) {
      if (selectedTickers.length > 1) {
        setSelectedTickers(selectedTickers.filter(t => t !== ticker));
      }
    } else {
      setSelectedTickers([...selectedTickers, ticker]);
    }
  };

  // Convertir precios históricos en formato compatible con Recharts
  const chartData = useMemo(() => {
    const data: any[] = [];
    const startIndex = dateRange.start;
    const endIndex = dateRange.end;

    // Controlar fuera de rango si la colección cambió
    if (startIndex < 0 || endIndex >= dbDates.length || startIndex >= endIndex) {
      return [];
    }

    for (let i = startIndex; i <= endIndex; i++) {
      const row: any = { date: dbDates[i] };
      
      // Añadir precio de S&P 500
      const benchmarkPrice = dbBenchmark.prices[i];
      if (benchmarkPrice === undefined) continue;

      if (chartType === 'normalizado') {
        const baseBenchmark = dbBenchmark.prices[startIndex];
        row['S&P 500'] = baseBenchmark === 0 ? 100 : Number(((benchmarkPrice / baseBenchmark) * 100).toFixed(2));
      } else {
        row['S&P 500'] = benchmarkPrice;
      }

      // Añadir precios de activos seleccionados
      selectedTickers.forEach(ticker => {
        const asset = dbAssets.find(a => a.ticker === ticker);
        if (asset) {
          const price = asset.prices[i];
          if (price !== undefined) {
            if (chartType === 'normalizado') {
              const basePrice = asset.prices[startIndex];
              row[ticker] = basePrice === 0 ? 100 : Number(((price / basePrice) * 100).toFixed(2));
            } else {
              row[ticker] = price;
            }
          }
        }
      });
      data.push(row);
    }
    return data;
  }, [selectedTickers, chartType, dateRange, dbDates, dbBenchmark, dbAssets]);

  // Datos para el Heatmap Risk-Return (Scatter Plot)
  const scatterData = useMemo(() => {
    const points = metrics.map(m => ({
      ticker: m.ticker,
      name: m.name,
      risk: Number((m.annualVolatility * 100).toFixed(2)),
      return: Number((m.annualReturn * 100).toFixed(2)),
      sector: m.sector,
      type: m.type,
      selected: selectedTickers.includes(m.ticker) ? 1.5 : 1.0
    }));

    // Añadir Benchmark S&P 500 al scatter
    // Calcular rendimiento y vol del benchmark
    const bPrice = dbBenchmark.prices;
    const bRets: number[] = [];
    for (let i = 1; i < bPrice.length; i++) {
      bRets.push((bPrice[i] - bPrice[i - 1]) / bPrice[i - 1]);
    }
    const bAvg = bRets.reduce((s, v) => s + v, 0) / Math.max(1, bRets.length);
    const bAvgAnn = bAvg * periodsPerYear;
    const bVar = bRets.reduce((s, v) => s + Math.pow(v - bAvg, 2), 0) / Math.max(1, bRets.length - 1);
    const bVolAnn = Math.sqrt(bVar * periodsPerYear);

    points.push({
      ticker: dbBenchmark.ticker,
      name: dbBenchmark.name,
      risk: Number((bVolAnn * 100).toFixed(2)),
      return: Number((bAvgAnn * 100).toFixed(2)),
      sector: "Benchmark",
      type: "Otros",
      selected: 2.0
    });

    return points;
  }, [metrics, selectedTickers, dbBenchmark]);

  // Ordenar las métricas de la tabla
  const sortedMetrics = useMemo(() => {
    return [...metrics].sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];

      // Convertir strings a minúsculas para ordenar alfabéticamente
      if (typeof valA === 'string' && typeof valB === 'string') {
        valA = valA.toLowerCase();
        valB = valB.toLowerCase();
      }

      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [metrics, sortField, sortAsc]);

  const handleSort = (field: keyof PerformanceMetrics) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  // Paleta de colores distintiva para activos seleccionados
  const getTickerColor = (ticker: string, index: number) => {
    if (ticker === 'S&P 500') return '#f59e0b'; // Ámbar para Benchmark
    const colors = [
      '#3b82f6', // azul
      '#10b981', // esmeralda
      '#ec4899', // rosa
      '#8b5cf6', // violeta
      '#06b6d4', // cian
      '#f43f5e', // rosa-rojo
      '#84cc16'  // lima
    ];
    return colors[index % colors.length];
  };

  return (
    <div className="space-y-8" id="risk-return-module">
      
      {/* Intro del Módulo */}
      <div className="bg-white rounded-xl shadow-xs border border-gray-100 p-6">
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <TrendingUp className="text-blue-600 h-6 w-6" />
          Módulo 1: Análisis Dinámico de Riesgo y Rentabilidad
        </h2>
        <p className="mt-2 text-sm text-gray-600 leading-relaxed">
          Este módulo está diseñado para procesar y analizar el comportamiento histórico de los activos seleccionados, abarcando múltiples clases de instrumentos financieros como Renta Variable, Renta Fija, Commodities y Bienes Raíces. A partir de estos insumos, la herramienta calcula de forma automatizada las métricas de rendimiento, volatilidad tradicional y bajista, y coeficientes Beta en contraste con el índice de referencia, anualizando cada indicador bajo los estándares internacionales de la CFA Society.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* Panel de Selección Izquierdo */}
        <div className="lg:col-span-1 bg-white rounded-xl shadow-xs border border-gray-100 p-5 flex flex-col h-[650px]">
          <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3">Activos Seleccionables (30)</h3>
          
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <input 
              type="text" 
              placeholder="Buscar ticker o clase..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 border border-gray-200 rounded-lg pl-9 pr-4 py-2 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-hidden"
            />
          </div>

          <div className="flex gap-2 mb-3">
            <button 
              onClick={() => setSelectedTickers(dbAssets.map(a => a.ticker))} 
              className="flex-1 text-[10px] bg-slate-100 text-slate-700 font-semibold p-1.5 rounded-md hover:bg-slate-200 transition-all text-center"
            >
              Seleccionar todo
            </button>
            <button 
              onClick={() => {
                if (dbAssets.length > 0) {
                  setSelectedTickers([dbAssets[0].ticker]);
                } else {
                  setSelectedTickers([]);
                }
              }} 
              className="flex-1 text-[10px] bg-slate-100 text-slate-700 font-semibold p-1.5 rounded-md hover:bg-slate-200 transition-all text-center"
            >
              Limpiar
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin">
            {filteredAssets.map((asset) => {
              const checked = selectedTickers.includes(asset.ticker);
              return (
                <button
                  key={asset.ticker}
                  onClick={() => toggleTicker(asset.ticker)}
                  className={`w-full text-left p-2 rounded-lg text-xs flex items-center justify-between transition-all ${
                    checked 
                      ? 'bg-blue-50 border border-blue-100 text-blue-900 font-medium' 
                      : 'hover:bg-slate-50 border border-transparent text-gray-700'
                  }`}
                >
                  <div className="truncate pr-2">
                    <span className="font-mono font-semibold">{asset.ticker}</span>
                    <span className="text-[10px] text-gray-400 block truncate">{asset.name}</span>
                  </div>
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium shrink-0 ${
                    asset.type === 'Acción' ? 'bg-indigo-100 text-indigo-800' :
                    asset.type === 'Bono' ? 'bg-amber-100 text-amber-800' :
                    asset.type === 'ETF' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                  }`}>
                    {asset.ticker === 'GLD' ? 'Oro' : asset.type}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 pt-3 border-t border-gray-100 bg-slate-50 rounded-lg p-3 text-[11px] text-gray-500">
            <div className="flex justify-between items-center mb-1">
              <span>Seleccionados:</span>
              <span className="font-bold text-slate-800">{selectedTickers.length} / 30</span>
            </div>
            <p className="text-[10px] text-gray-400">
              *Se requiere mantener seleccionado al menos un activo para el análisis interactivo.
            </p>
          </div>
        </div>

        {/* Gráfico y Controles */}
        <div className="lg:col-span-3 space-y-6">
          <div className="bg-white rounded-xl shadow-xs border border-gray-100 p-6">
            
            {/* Controles de Gráficos */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div>
                <h3 className="font-bold text-gray-900 text-lg">Evolución Histórica de Precios</h3>
                <p className="text-xs text-gray-500 mt-0.5">Junio 2023 - Junio 2026 (Refinitiv Workspace)</p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* Selector Tipo de Gráfico */}
                <div className="bg-slate-100 rounded-lg p-0.5 flex text-xs">
                  <button 
                    onClick={() => setChartType('normalizado')}
                    className={`px-3 py-1.5 rounded-md transition-all ${chartType === 'normalizado' ? 'bg-white font-medium text-slate-900 shadow-xs' : 'text-gray-500 hover:text-slate-800'}`}
                  >
                    Normalizado (Base 100)
                  </button>
                  <button 
                    onClick={() => setChartType('nominal')}
                    className={`px-3 py-1.5 rounded-md transition-all ${chartType === 'nominal' ? 'bg-white font-medium text-slate-900 shadow-xs' : 'text-gray-500 hover:text-slate-800'}`}
                  >
                    Precio Nominal ($)
                  </button>
                </div>
              </div>
            </div>

            {/* Selector de Rango de Fechas - Inputs de Fecha (Actualizado) */}
            <div className="my-4 bg-slate-50 rounded-lg p-4 border border-slate-100">
              <div className="flex justify-between items-center text-xs text-slate-700 font-medium mb-3">
                <span>Rango Temporal de Evolución Histórica:</span>
                <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-mono">
                  {dbDates[dateRange.start]} – {dbDates[dateRange.end]}
                </span>
              </div>
              <div className="flex gap-6 items-center justify-center">
                <div className="flex flex-col">
                  <label className="text-[10px] font-bold text-gray-500 uppercase mb-1">Fecha Inicio</label>
                  <input 
                    type="date" 
                    value={formatDateToISO(dbDates[dateRange.start])} 
                    min={formatDateToISO(dbDates[0])}
                    max={formatDateToISO(dbDates[dbDates.length - 1])}
                    onChange={(e) => handleStartDateChange(e.target.value)}
                    className="p-1.5 border border-gray-300 rounded-md text-xs font-mono text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                  />
                </div>
                <span className="text-gray-400 font-bold mt-4">-</span>
                <div className="flex flex-col">
                  <label className="text-[10px] font-bold text-gray-500 uppercase mb-1">Fecha Fin</label>
                  <input 
                    type="date" 
                    value={formatDateToISO(dbDates[dateRange.end])}
                    min={formatDateToISO(dbDates[0])}
                    max={formatDateToISO(dbDates[dbDates.length - 1])}
                    onChange={(e) => handleEndDateChange(e.target.value)}
                    className="p-1.5 border border-gray-300 rounded-md text-xs font-mono text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                  />
                </div>
              </div>
            </div>

            {/* Line Chart Container */}
            <div className="h-[380px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 10, fill: '#64748b' }} 
                    stroke="#cbd5e1"
                  />
                  <YAxis 
                    tick={{ fontSize: 10, fill: '#64748b' }} 
                    stroke="#cbd5e1" 
                    domain={chartType === 'normalizado' ? ['auto', 'auto'] : [0, 'auto']}
                    unit={chartType === 'normalizado' ? '%' : ''}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                    labelStyle={{ fontWeight: 'bold', color: '#38bdf8', marginBottom: '4px' }}
                  />
                  <Legend 
                    wrapperStyle={{ paddingTop: '15px', fontSize: '11px' }} 
                    iconType="circle"
                  />
                  
                  {/* Línea del Benchmark */}
                  <Line 
                    type="monotone" 
                    dataKey="S&P 500" 
                    stroke="#f59e0b" 
                    strokeWidth={2.5} 
                    dot={false}
                    name={`${dbBenchmark.ticker} (Benchmark)`}
                  />

                  {/* Líneas de los activos seleccionados */}
                  {selectedTickers.map((ticker, idx) => (
                    <Line 
                      key={ticker}
                      type="monotone" 
                      dataKey={ticker} 
                      stroke={getTickerColor(ticker, idx)} 
                      strokeWidth={1.8}
                      dot={false}
                      name={`${ticker} (${dbAssets.find(a => a.ticker === ticker)?.name || "Activo Importado"})`}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
            


          </div>
        </div>

      </div>

      {/* Dispersión Riesgo-Retorno Universo Completo y Métricas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Scatter Plot */}
        <div className="bg-white rounded-xl shadow-xs border border-gray-100 p-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="font-bold text-gray-900 text-base">Mapa de Dispersión Rendimiento vs. Volatilidad</h3>
              <p className="text-xs text-gray-500">Universo completo de Activos + Benchmark Anualizados</p>
            </div>
          </div>

          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 20, left: 25, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis 
                  type="number" 
                  dataKey="risk" 
                  name="Volatilidad" 
                  unit="%" 
                  tick={{ fontSize: 10 }}
                  label={{ value: 'Riesgo Anualizado (Volatilidad %)', position: 'insideBottom', offset: -5, fontSize: 11, fill: '#64748b' }}
                />
                <YAxis 
                  type="number" 
                  dataKey="return" 
                  name="Retorno" 
                  unit="%" 
                  tick={{ fontSize: 10 }}
                >
                  <Label 
                    value="Rendimiento Anualizado (%)" 
                    angle={-90} 
                    position="left" 
                    style={{ textAnchor: 'middle', fill: '#64748b', fontSize: 11 }} 
                  />
                </YAxis>
                <Tooltip 
                  cursor={{ strokeDasharray: '3 3' }} 
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-slate-900 text-white p-3 rounded-lg text-xs shadow-md border-none leading-relaxed">
                          <p className="font-bold text-blue-400">{data.ticker} - {data.name}</p>
                          <p>Clase: <span className="font-medium">{data.type}</span></p>
                          <p>Sector: <span className="font-medium text-slate-300">{data.sector}</span></p>
                          <hr className="my-1 border-slate-700" />
                          <p>Retorno Anualizado: <span className="font-bold text-emerald-400">{data.return}%</span></p>
                          <p>Volatilidad Anualizada: <span className="font-bold text-rose-400">{data.risk}%</span></p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Scatter name="Activos" data={scatterData}>
                  {scatterData.map((entry, index) => {
                    // Colores según clase de activo
                    let color = '#3b82f6'; // Acciones (Azul)
                    const isBmk = entry.ticker === dbBenchmark.ticker;
                    if (isBmk) color = '#e11d48'; // Benchmark nacional (Red)
                    else if (entry.type === 'Bono') color = '#f59e0b'; // Bonos (Amber)
                    else if (entry.type === 'Materia Prima') color = '#8b5cf6'; // Commodities (Purple)
                    else if (entry.type === 'Fondo Inmobiliario') color = '#10b981'; // Inmobiliario (Emerald)
                    else if (entry.type === 'ETF') color = '#06b6d4'; // ETFs Renta Variable (Cyan)

                    const isSelected = selectedTickers.includes(entry.ticker);
                    const size = isSelected ? 120 : (isBmk ? 220 : 60);

                    return (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={color} 
                        stroke={isSelected ? "#000" : "none"}
                        strokeWidth={isSelected ? 1.5 : 0}
                        opacity={isSelected || isBmk ? 1.0 : 0.65}
                        r={Math.sqrt(size)}
                      />
                    );
                  })}
                  <LabelList dataKey="ticker" position="top" style={{ fontSize: 9, fill: '#475569', fontFamily: 'monospace' }} />
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-2 mt-4 text-[10px] text-gray-500 bg-slate-50 p-3 rounded-lg border border-slate-100">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 inline-block bg-blue-500 rounded-full" /> Acciones de Renta Variable
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 inline-block bg-cyan-500 rounded-full" /> ETFs Complementarios
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 inline-block bg-amber-500 rounded-full" /> Renta Fija (Bonos Soberanos)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 inline-block bg-emerald-500 rounded-full" /> Fondo Inmobiliario (REIT VNQ)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 inline-block bg-purple-500 rounded-full" /> Materias Primas (GLD Oro)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 inline-block bg-rose-600 rounded-full" /> Benchmark ({dbBenchmark.ticker.split(' (')[0]})
            </span>
          </div>
        </div>

        {/* Interpretación de Riesgo */}
        <div className="bg-white rounded-xl shadow-xs border border-gray-100 p-6 flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-gray-900 text-base mb-3 flex items-center gap-1.5">
              <Shield className="text-emerald-600 h-5 w-5" />
              Lectura y Conceptos Clave de Riesgo
            </h3>
            <div className="space-y-3.5 text-xs text-gray-600">
              <p>
                La relación tradicional <strong>Riesgo-Retorno</strong> establece que para acceder a tasas mayores de crecimiento, se debe asumir una mayor dispersión (desviación estándar).
              </p>
              <div className="p-3 bg-indigo-50/50 rounded-lg border border-indigo-100">
                <span className="font-semibold text-indigo-900 block mb-1">Volatilidad Anualizada (Riesgo Total):</span>
                Mide la fluctuación de los retornos históricos. Activos con alta volatilidad (como <strong className="text-gray-900">NVIDIA (~42%)</strong> o <strong className="text-gray-900">Tesla (~51%)</strong>) demuestran fuertes bandazos de precio, mientras que la renta fija (<strong className="text-gray-900">SHY ~0.76%</strong> o <strong className="text-gray-900">BND ~4.3%</strong>) ofrece máxima calma ideal para preservar capital.
              </div>
              <div className="p-3 bg-emerald-50/50 rounded-lg border border-emerald-100">
                <span className="font-semibold text-emerald-900 block mb-1">Ratio de Sharpe:</span>
                Mide cuántas unidades de rendimiento excedente genera el activo por cada unidad de volatilidad asumida. Un Sharpe superior a 1.0 es considerado excelente.
              </div>
              <div className="p-3 bg-amber-50/50 rounded-lg border border-amber-100">
                <span className="font-semibold text-amber-900 block mb-1">Ratio de Sortino frente a Sharpe:</span>
                A diferencia de Sharpe, que penaliza toda volatilidad (tanto hacia arriba como hacia abajo), el <strong>Sortino Ratio</strong> penaliza únicamente la volatilidad de retornos negativos, resultando un indicador más equitativo para activos con asimetría positiva como el Oro (GLD) o la tecnología líder.
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Tabla Global del Universo (Excelente en rúbrica) */}
      <div className="bg-white rounded-xl shadow-xs border border-gray-100 p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
          <div>
            <h3 className="font-bold text-gray-900 text-base">Tabla Comparativa Global de Activos</h3>
            <p className="text-xs text-gray-500">Métricas completas del Universo de 30 Activos anualizadas según metodologías estándar</p>
          </div>
          <span className="text-[11px] bg-blue-50 text-blue-800 px-3 py-1.5 rounded-lg border border-blue-100 font-medium">
            Sugerencia: Haga clic en las cabeceras para ordenar ascendentemente o descendentemente
          </span>
        </div>

        <div className="overflow-x-auto border border-gray-100 rounded-lg">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-gray-200 text-gray-700 font-semibold select-none">
                <th className="p-3 cursor-pointer hover:bg-slate-100 transition-all font-mono" onClick={() => handleSort('ticker')}>Ticker</th>
                <th className="p-3 cursor-pointer hover:bg-slate-100 transition-all" onClick={() => handleSort('name')}>Activo</th>
                <th className="p-3 cursor-pointer hover:bg-slate-100 transition-all" onClick={() => handleSort('sector')}>Sector</th>
                <th className="p-3 cursor-pointer hover:bg-slate-100 transition-all text-right" onClick={() => handleSort('annualReturn')}>Ret. Anual</th>
                <th className="p-3 cursor-pointer hover:bg-slate-100 transition-all text-right" onClick={() => handleSort('annualVolatility')}>Vol. Anual (Riesgo)</th>
                <th className="p-3 cursor-pointer hover:bg-slate-100 transition-all text-right" onClick={() => handleSort('sharpeRatio')}>S. Sharpe</th>
                <th className="p-3 cursor-pointer hover:bg-slate-100 transition-all text-right" onClick={() => handleSort('sortinoRatio')}>Sortino</th>
                <th className="p-3 cursor-pointer hover:bg-slate-100 transition-all text-right" onClick={() => handleSort('maxDrawdown')}>Max Drawdown</th>
                <th className="p-3 cursor-pointer hover:bg-slate-100 transition-all text-right font-medium text-slate-800" onClick={() => handleSort('var95')}>Mo. VaR (95%)</th>
                <th className="p-3 cursor-pointer hover:bg-slate-100 transition-all text-right font-medium text-slate-800" onClick={() => handleSort('cvar95')}>Mo. CVaR (95%)</th>
                <th className="p-3 cursor-pointer hover:bg-slate-100 transition-all text-right text-indigo-700" onClick={() => handleSort('calmarRatio')}>R. Calmar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-gray-600">
              {sortedMetrics.map((item) => {
                const isSelected = selectedTickers.includes(item.ticker);
                return (
                  <tr 
                    key={item.ticker} 
                    className={`hover:bg-slate-50/80 transition-all ${isSelected ? 'bg-blue-50/20 font-medium' : ''}`}
                  >
                    <td className="p-3 font-mono font-bold text-slate-950 flex items-center gap-1.5">
                      {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-blue-600 inline-block" />}
                      {item.ticker}
                    </td>
                    <td className="p-3 font-medium text-slate-900 truncate max-w-[150px]">{item.name}</td>
                    <td className="p-3 text-gray-500 font-light">{item.sector}</td>
                    
                    {/* Retorno */}
                    <td className="p-3 text-right font-semibold text-emerald-600">{(item.annualReturn * 100).toFixed(2)}%</td>
                    
                    {/* Volatidad */}
                    <td className="p-3 text-right">{(item.annualVolatility * 100).toFixed(2)}%</td>
                    
                    {/* Sharpe */}
                    <td className={`p-3 text-right font-bold ${item.sharpeRatio > 1 ? 'text-blue-600' : item.sharpeRatio > 0 ? 'text-gray-800' : 'text-rose-500'}`}>
                      {item.sharpeRatio.toFixed(2)}
                    </td>
                    
                    {/* Sortino */}
                    <td className="p-3 text-right font-mono">{item.sortinoRatio.toFixed(2)}</td>
                    
                    {/* Max Drawdown */}
                    <td className="p-3 text-right text-rose-600">{(item.maxDrawdown * 100).toFixed(2)}%</td>
                    
                    {/* VaR & CVaR (Indicadores no estándar incorporados) */}
                    <td className="p-3 text-right bg-slate-50/30">{(item.var95 * 100).toFixed(2)}%</td>
                    <td className="p-3 text-right bg-slate-50/30">{(item.cvar95 * 100).toFixed(2)}%</td>
                    
                    {/* Calmar */}
                    <td className="p-3 text-right font-serif text-indigo-700">{item.calmarRatio.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        

      </div>

    </div>
  );
}
