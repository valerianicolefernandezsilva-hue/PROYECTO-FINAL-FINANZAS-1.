/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  TrendingUp, Layers, Award, Sparkles, BookOpen, Clock, 
  HelpCircle, Percent, Settings, ChevronRight, Loader2, Globe, Compass, FileText, Coins 
} from 'lucide-react';
import { computeAllMetrics } from './lib/calc_cache';
import RiskReturnModule from './components/RiskReturnModule';
import PortfolioOptimizationModule from './components/PortfolioOptimizationModule';
import CapmValuationModule from './components/CapmValuationModule';
import ReadmeViewer from './components/ReadmeViewer';
import RiskInductionModule from './components/RiskInductionModule';
import ForecastSimulationModule from './components/ForecastSimulationModule';
import ReportModule from './components/ReportModule';
import ArbitrageDetectorModule from './components/ArbitrageDetectorModule';

// Importar base de datos de origen y tipos
import { ASSETS_DATABASE, BENCHMARK_DATABASE, BENCHMARKS_LIST, DATES, AssetData, BenchmarkData } from './data/refinitiv_data';
import DataImporter from './components/DataImporter';
import NewsSidebar from './components/NewsSidebar';
import AiAdvisor from './components/AiAdvisor';

export default function App() {
  // Pestaña activa: Módulo 0 (induction) por defecto
  const [activeTab, setActiveTab] = useState<'induction' | 'risk-return' | 'importer' | 'optimizer' | 'capm' | 'forecast' | 'report' | 'readme' | 'arbitrage'>('induction');

  // Estados de calibración del Módulo 0 (sincronizados con los módulos de portafolio y CAPM)
  const [riskScore, setRiskScore] = useState<number | null>(null);
  const [riskCoefficient, setRiskCoefficient] = useState<number>(5.0); // Default A = 5.0 (moderado)
  const [portfolioTabSuggestion, setPortfolioTabSuggestion] = useState<'mvp' | 'tangent' | 'custom' | null>(null);
  const [optimalPortfolio, setOptimalPortfolio] = useState<any>(null); // Guardar el portafolio óptimo (PortfolioInstance)
  const [optimizationResults, setOptimizationResults] = useState<any>(null); // Guardar todos los resultados de optimización
  const [forecastResults, setForecastResults] = useState<any>(null); // Guardar resultados del pronóstico


  // Control Maestro Global de Tasa Libre de Riesgo (Risk-free Rate) y Frecuencia
  const [rfAnnual, setRfAnnual] = useState<number>(0.04); // Default 4%
  const [isFetchingRf, setIsFetchingRf] = useState<boolean>(false);
  const [dataFrequency, setDataFrequency] = useState<string>('monthly');

  const periodsPerYear = useMemo(() => {
    switch (dataFrequency) {
      case 'daily': return 252;
      case 'weekly': return 52;
      case 'monthly': return 12;
      case 'bimonthly': return 6;
      case 'quarterly': return 4;
      case '4monthly': return 3;
      case 'semiannual': return 2;
      case 'annual': return 1;
      default: return 12;
    }
  }, [dataFrequency]);

  const fetchRfRate = async () => {
    try {
      setIsFetchingRf(true);
      const res = await fetch('/api/yfinance-quote?ticker=^IRX');
      if (!res.ok) throw new Error('Failed to fetch IRX rate');
      const data = await res.json();
      if (data.regularMarketPrice) {
        // Yield is returned in percentage e.g. 4.5
        setRfAnnual(Number((data.regularMarketPrice / 100).toFixed(4)));
      }
    } catch (e) {
      console.error(e);
      alert('Error obteniendo la tasa libre de riesgo de Yahoo Finance.');
    } finally {
      setIsFetchingRf(false);
    }
  };

  // Estados de Base de Datos Financiera Personalizable
  const [customAssets, setCustomAssets] = useState<AssetData[]>(ASSETS_DATABASE);
  const [customBenchmark, setCustomBenchmark] = useState<BenchmarkData>(BENCHMARK_DATABASE);
  const [customDates, setCustomDates] = useState<string[]>(DATES);

  // Activos seleccionados de la base de datos activa para trabajar en los modelos (especialmente Módulo 4)
  const [selectedAssetTickers, setSelectedAssetTickers] = useState<string[]>(() => {
    return ASSETS_DATABASE.slice(0, 8).map(a => a.ticker);
  });

  // Función para cambiar de tab y hacer scroll arriba
  const handleTabChange = (tab: any) => {
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Computar métricas unificadas dinámicamente según la tasa Rf y la base de datos activa
  const metrics = useMemo(() => {
    return computeAllMetrics(rfAnnual, periodsPerYear, customAssets, customBenchmark);
  }, [rfAnnual, periodsPerYear, customAssets, customBenchmark]);

  // Funciones callback para importación masiva y restauración
  const handleImport = (newDates: string[], newAssets: AssetData[], newBenchmark: BenchmarkData) => {
    setCustomDates(newDates);
    setCustomAssets(newAssets);
    setCustomBenchmark(newBenchmark);
    setSelectedAssetTickers(newAssets.map(a => a.ticker));
    
    // Resetear resultados dependientes de los activos anteriores para evitar crashes
    setOptimalPortfolio(null);
    setOptimizationResults(null);
    setForecastResults(null);
  };

  const handleRestore = () => {
    setCustomDates(DATES);
    setCustomAssets(ASSETS_DATABASE);
    setCustomBenchmark(BENCHMARK_DATABASE);
    setSelectedAssetTickers(ASSETS_DATABASE.slice(0, 8).map(a => a.ticker));
    
    // Resetear resultados dependientes de los activos anteriores para evitar crashes
    setOptimalPortfolio(null);
    setOptimizationResults(null);
    setForecastResults(null);
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex flex-col font-sans selection:bg-blue-600 selection:text-white" id="app-root">
      
      {/* HEADER PRINCIPAL DE LA TERMINAL DE TRABAJO */}
      <header className="bg-slate-900 text-white shadow-md border-b border-slate-800 print:hidden" id="terminal-header">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col md:flex-row justify-between items-center gap-4">
          
          {/* Logo y Branding Académico */}
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2.5 rounded-xl text-white shadow-inner flex items-center justify-center">
              <TrendingUp className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] bg-blue-500/20 text-blue-400 font-bold px-2 py-0.5 rounded-full border border-blue-500/30 uppercase tracking-widest font-mono">
                  Finanzas I (Gestion 2026)
                </span>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-400 font-bold px-2 py-0.5 rounded-full border border-emerald-500/30 uppercase tracking-widest font-mono">
                  UPB La Paz
                </span>
              </div>
              <h1 className="text-xl font-bold tracking-tight text-white mt-1">
                Visualizador de Portafolios & CAPM
              </h1>
            </div>
          </div>

          {/* Panel de Controles Maestros Flotante */}
          <div className="flex flex-wrap items-center gap-4 bg-slate-800 border border-slate-705 p-3 rounded-xl shadow-xs">
            
            {/* Global Tasa Libre de Riesgo (Display only) */}
            <div className="flex items-center gap-3 border-r border-slate-700 pr-4">
              <div className="flex items-center gap-1.5 text-xs text-slate-300 font-medium">
                <Percent className="h-4 w-4 text-blue-400" />
                <span>Tasa Libre Riesgo (<strong className="text-white font-mono">Rf</strong>):</span>
              </div>
              <span className="bg-slate-900 border border-slate-700 px-2 py-1 rounded-md text-emerald-400 font-mono text-xs font-bold shadow-inner">
                {(rfAnnual * 100).toFixed(2)}%
              </span>
            </div>

            {/* Selector de Benchmark Global */}
            <div className="flex items-center gap-2 border-r border-slate-700 pr-4">
              <div className="flex items-center gap-1.5 text-xs text-slate-300 font-medium">
                <Globe className="h-4 w-4 text-cyan-400" />
                <span>Benchmark:</span>
              </div>
              <select 
                value={customBenchmark.ticker}
                onChange={(e) => {
                  const selectedBm = BENCHMARKS_LIST.find(b => b.ticker === e.target.value);
                  if (selectedBm) {
                    setCustomBenchmark(selectedBm);
                  }
                }}
                className="bg-slate-900 border border-slate-700 text-slate-200 outline-none focus:ring-1 focus:ring-blue-500 rounded px-2 py-1 text-xs font-mono font-bold"
              >
                {BENCHMARKS_LIST.map((b) => (
                  <option key={b.ticker} value={b.ticker}>
                    {b.ticker.split(' (')[0]}
                  </option>
                ))}
              </select>
            </div>

            {/* Frecuencia de Datos Global */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs text-slate-300 font-medium">
                <Clock className="h-4 w-4 text-amber-400" />
                <span>Frecuencia Datos:</span>
              </div>
              <select 
                value={dataFrequency}
                onChange={(e) => setDataFrequency(e.target.value)}
                className="bg-slate-900 border border-slate-700 text-slate-200 outline-none focus:ring-1 focus:ring-blue-500 rounded px-2 py-1 text-xs font-mono"
              >
                <option value="daily">Diaria</option>
                <option value="weekly">Semanal</option>
                <option value="monthly">Mensual</option>
                <option value="bimonthly">Bimestral</option>
                <option value="quarterly">Trimestral</option>
                <option value="4monthly">Cuatrimestral</option>
                <option value="semiannual">Semestral</option>
                <option value="annual">Anual</option>
              </select>
            </div>


          </div>

        </div>
      </header>

      {/* BARRA DE NAVEGACIÓN TABULAR */}
      <div className="bg-white border-b border-slate-200/80 sticky top-0 z-40 shadow-xs print:hidden" id="navigation-bar">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-1 min-w-0 w-full">
          <nav className="flex flex-nowrap items-center space-x-1 py-1.5 overflow-x-auto overflow-y-hidden scrollbar-thin whitespace-nowrap w-full" aria-label="Tabs">
            
            {/* Tab 0: Módulo 0 */}
            <button
              onClick={() => setActiveTab('induction')}
              className={`px-4 py-2.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-all shrink-0 ${
                activeTab === 'induction'
                  ? 'bg-indigo-650 bg-indigo-600 text-white shadow-xs'
                  : 'text-indigo-600 hover:text-indigo-950 hover:bg-indigo-50/50'
              }`}
              id="tab-induction"
            >
              <Compass className="h-4 w-4" />
              Módulo 0: Diagnóstico de Riesgo
              {riskScore !== null && (
                <span className="ml-1 px-1.5 py-0.5 text-[9px] bg-slate-900 text-white rounded font-mono font-bold">
                  Recibido
                </span>
              )}
            </button>

            {/* Tab 0.5 */}
            <button
              onClick={() => setActiveTab('importer')}
              className={`px-4 py-2.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-all shrink-0 ${
                activeTab === 'importer'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
              id="tab-importer"
            >
              <Settings className="h-4 w-4 text-blue-500" />
              Módulo 0.5: Carga de Datos
            </button>

            {/* Tab 1 */}
            <button
              onClick={() => setActiveTab('risk-return')}
              className={`px-4 py-2.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-all shrink-0 ${
                activeTab === 'risk-return'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
              id="tab-risk-return"
            >
              <TrendingUp className="h-4 w-4" />
              Módulo 1: Riesgo y Rentabilidad
            </button>

            {/* Tab 2 */}
            <button
              onClick={() => setActiveTab('optimizer')}
              className={`px-4 py-2.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-all shrink-0 ${
                activeTab === 'optimizer'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
              id="tab-optimizer"
            >
              <Layers className="h-4 w-4" />
              Módulo 2: Optimización Markowitz
            </button>

            {/* Tab 3 */}
            <button
              onClick={() => setActiveTab('capm')}
              className={`px-4 py-2.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-all shrink-0 ${
                activeTab === 'capm'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
              id="tab-capm"
            >
              <Award className="h-4 w-4" />
              Módulo 3: Valoración CAPM
            </button>

            {/* Tab 3.5: Arbitraje */}
            <button
              onClick={() => setActiveTab('arbitrage')}
              className={`px-4 py-2.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-all shrink-0 ${
                activeTab === 'arbitrage'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
              id="tab-arbitrage"
            >
              <Coins className="h-4 w-4 text-emerald-500" />
              Módulo 3.5: Detector de Arbitraje APT
            </button>

            {/* Tab 4 */}
            <button
              onClick={() => setActiveTab('forecast')}
              className={`px-4 py-2.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-all shrink-0 ${
                activeTab === 'forecast'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
              id="tab-forecast"
            >
              <Sparkles className="h-4 w-4 text-amber-500" />
              Módulo 4: Pronóstico y Simulación
            </button>

            {/* Tab Reporte */}
            <button
              onClick={() => setActiveTab('report')}
              className={`px-4 py-2.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-all shrink-0 ${
                activeTab === 'report'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
              id="tab-report"
            >
              <FileText className="h-4 w-4 text-emerald-500" />
              Reporte Personalizado
            </button>

            {/* Readme Tab */}
            <button
              onClick={() => setActiveTab('readme')}
              className={`px-4 py-2.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-all shrink-0 ${
                activeTab === 'readme'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
              id="tab-readme"
            >
              <BookOpen className="h-4 w-4 text-blue-500" />
              Código & Manual [README]
            </button>

          </nav>
        </div>
      </div>

      {/* CONTENEDOR DE CONTENIDO PRINCIPAL Y PANEL LATERAL */}
      <div className="flex-1 flex max-w-[90rem] w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 gap-6" id="layout-container">
        
        {/* PANEL LATERAL DE NOTICIAS FINANCIERAS */}
        <aside className="hidden lg:flex w-80 shrink-0 flex-col self-start sticky top-[4.5rem] z-10" style={{ maxHeight: 'calc(100vh - 6rem)' }}>
          <NewsSidebar customAssets={customAssets} customBenchmark={customBenchmark} />
        </aside>

        {/* CONTENEDOR CENTRAL DE MÓDULOS */}
        <main className="flex-1 min-w-0" id="main-content">

          {/* Renderizado Persistente de Módulos */}
        <div className={activeTab === 'induction' ? 'block' : 'hidden'}>
          <RiskInductionModule 
            onProfileCalculated={(score, coeff, tabSuggestion) => {
              setRiskScore(score);
              setRiskCoefficient(coeff);
              setPortfolioTabSuggestion(tabSuggestion);
            }}
            savedScore={riskScore}
            savedCoefficient={riskCoefficient}
            onNavigateToTab={(tab) => {
              handleTabChange(tab);
            }}
          />
        </div>

        <div className={activeTab === 'risk-return' ? 'block' : 'hidden'}>
          <RiskReturnModule 
            metrics={metrics} 
            rfAnnual={rfAnnual} 
            assetsDb={customAssets}
            benchmarkDb={customBenchmark}
            dates={customDates}
            periodsPerYear={periodsPerYear}
          />
        </div>

        {/* Módulo 1.5: Carga de Datos */}
        <div className={activeTab === 'importer' ? 'block animate-slide-down' : 'hidden'}>
          <DataImporter 
            onImport={handleImport} 
            onRestore={handleRestore}
            currentAssetsCount={customAssets.length}
            currentDatesCount={customDates.length}
            rfAnnual={rfAnnual}
            onRfChange={setRfAnnual}
            isFetchingRf={isFetchingRf}
            onFetchRfRate={fetchRfRate}
            globalFrequency={dataFrequency}
          />
        </div>

        <div className={activeTab === 'optimizer' ? 'block' : 'hidden'}>
          <PortfolioOptimizationModule 
            rfAnnual={rfAnnual} 
            assetsDb={customAssets}
            dates={customDates}
            periodsPerYear={periodsPerYear}
            riskCoefficient={riskCoefficient}
            riskScore={riskScore}
            portfolioTabSuggestion={portfolioTabSuggestion}
            onOptimalPortfolioChange={setOptimalPortfolio}
            savedOptimalPortfolio={optimalPortfolio}
            onNavigateToTab={(tab: 'capm') => handleTabChange(tab)}
            selectedAssetTickers={selectedAssetTickers}
            onSelectedAssetTickersChange={setSelectedAssetTickers}
            onOptimizationResultsChange={setOptimizationResults}
          />
        </div>

        <div className={activeTab === 'capm' ? 'block' : 'hidden'}>
          <CapmValuationModule 
            metrics={metrics} 
            rfAnnual={rfAnnual} 
            assetsDb={customAssets}
            benchmarkDb={customBenchmark}
            periodsPerYear={periodsPerYear}
            riskCoefficient={riskCoefficient}
            riskScore={riskScore}
            selectedAssetTickers={selectedAssetTickers}
            onNavigateToTab={(tab: 'arbitrage') => handleTabChange(tab)}
          />
        </div>

        <div className={activeTab === 'arbitrage' ? 'block animate-slide-down' : 'hidden'}>
          <ArbitrageDetectorModule 
            rfAnnual={rfAnnual} 
            assetsDb={customAssets}
            benchmarkDb={customBenchmark}
            periodsPerYear={periodsPerYear}
            selectedAssetTickers={selectedAssetTickers}
            portfolioTabSuggestion={portfolioTabSuggestion}
            riskCoefficient={riskCoefficient}
            optimalPortfolio={optimalPortfolio}
            onNavigateToTab={(tab: 'forecast') => handleTabChange(tab)}
          />
        </div>

        <div className={activeTab === 'forecast' ? 'block' : 'hidden'}>
          <ForecastSimulationModule 
            metrics={metrics} 
            rfAnnual={rfAnnual} 
            assetsDb={customAssets}
            benchmarkDb={customBenchmark}
            periodsPerYear={periodsPerYear}
            riskCoefficient={riskCoefficient}
            riskScore={riskScore}
            selectedAssetTickers={selectedAssetTickers}
            onSelectedAssetTickersChange={setSelectedAssetTickers}
            portfolioTabSuggestion={portfolioTabSuggestion}
            optimalPortfolio={optimalPortfolio}
            savedForecastResults={forecastResults}
            onForecastResultsChange={setForecastResults}
            onNavigateToTab={(tab: 'report') => handleTabChange(tab)}
          />
        </div>

        <div className={activeTab === 'report' ? 'block' : 'hidden'}>
          <ReportModule 
            metrics={metrics}
            rfAnnual={rfAnnual}
            assetsDb={customAssets}
            benchmarkDb={customBenchmark}
            periodsPerYear={periodsPerYear}
            riskScore={riskScore}
            riskCoefficient={riskCoefficient}
            portfolioTabSuggestion={portfolioTabSuggestion}
            selectedAssetTickers={selectedAssetTickers}
            optimalPortfolio={optimalPortfolio}
            optimizationResults={optimizationResults}
            forecastResults={forecastResults}
          />
        </div>

        <div className={activeTab === 'readme' ? 'block' : 'hidden'}>
          <ReadmeViewer />
        </div>

        </main>
      </div>

      {/* FOOTER ACADÉMICO */}
      <footer className="bg-slate-900 text-slate-400 text-xs py-8 border-t border-slate-800" id="terminal-footer">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-center md:text-left space-y-1">
            <p className="text-slate-100 font-semibold font-mono">TRABAJO FINAL INTEGRADO — FINANZAS I</p>
            <p className="text-[11px] text-slate-400">Universidad Privada Boliviana (UPB) · Sede La Paz · Gestión 2026</p>
          </div>
          
          <div className="flex flex-col items-center md:items-end text-[11px] space-y-1">
            <span className="text-slate-300 font-medium">Herramienta 100% Autónoma y Autoejecutable</span>
            <p className="text-slate-500">Desarrollado con datos de Refinitiv Workspace utilizando Vite, React, Recharts y Tailwind CSS.</p>
          </div>
        </div>
      </footer>

      {/* AI ADVISOR WIDGET */}
      <AiAdvisor activeTab={activeTab} />

    </div>
  );
}
