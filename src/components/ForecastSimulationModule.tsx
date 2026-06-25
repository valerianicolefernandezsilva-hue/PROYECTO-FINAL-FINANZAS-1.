/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ReferenceLine, AreaChart, Area, BarChart, Bar
} from 'recharts';
import { 
  TrendingUp, TrendingDown, RefreshCw, Layers, Award, Info, 
  HelpCircle, Sparkles, ShieldAlert, CheckCircle2, Play, Users, 
  Coins, Briefcase, ChevronRight, ListCollapse, Trophy, ArrowRight
} from 'lucide-react';
import { AssetData, BenchmarkData, ASSETS_DATABASE } from '../data/refinitiv_data';
import { calculateReturns, mean, standardDeviation, covariance, MarkowitzOptimizer, PortfolioInstance } from '../lib/finance_math';
import { PerformanceMetrics } from '../types';
import { jStat } from 'jstat';

interface ForecastSimulationModuleProps {
  metrics: PerformanceMetrics[];
  rfAnnual: number;
  assetsDb: AssetData[];
  benchmarkDb: BenchmarkData;
  periodsPerYear?: number;
  riskCoefficient?: number;
  riskScore?: number | null;
  selectedAssetTickers?: string[];
  onSelectedAssetTickersChange?: (tickers: string[]) => void;
  portfolioTabSuggestion?: 'mvp' | 'tangent' | 'custom' | null;
  optimalPortfolio?: PortfolioInstance | null;
  savedForecastResults?: any;
  onForecastResultsChange?: (results: any) => void;
  onNavigateToTab?: (tab: 'report') => void;
}

interface SimulatedPeriod {
  period: string; // e.g. "t+1"
  actualReturn: number;
  marketReturn: number;
  simulatedPortfolioValue: number;
  simulatedBenchmarkValue: number;
  ciLower: number;
  ciUpper: number;
}

interface GameResult {
  id: string;
  timestamp: string;
  capitalInicial: number;
  capitalFinal: number;
  retornoObtenido: number;
  retornoMercado: number;
  alfaGenerado: number;
  modeloUtilizado: string;
  escenario: string;
  ganador: boolean;
}

export default function ForecastSimulationModule({
  metrics,
  rfAnnual,
  assetsDb,
  benchmarkDb,
  periodsPerYear = 12,
  selectedAssetTickers = [],
  onSelectedAssetTickersChange,
  portfolioTabSuggestion,
  riskCoefficient = 5,
  optimalPortfolio,
  savedForecastResults,
  onForecastResultsChange,
  onNavigateToTab
}: ForecastSimulationModuleProps) {
  // Filtrar activos disponibles según los seleccionados en Módulo 0.5
  const filteredAssetsDb = useMemo(() => {
    if (selectedAssetTickers && selectedAssetTickers.length > 0) {
      return assetsDb.filter(a => selectedAssetTickers.includes(a.ticker));
    }
    // Si no hay ninguno (como en el estado inicial antes de interaccionar con Módulo 0.5), tomamos los primeros 8 de UPB Refinitiv
    return assetsDb.slice(0, Math.min(8, assetsDb.length));
  }, [assetsDb, selectedAssetTickers]);

  // --- ESTADOS ---
  const [selectedWeights, setSelectedWeights] = useState<{ [ticker: string]: number }>({});
  const [selectedModel, setSelectedModel] = useState<'AR1' | 'MA1' | 'ARMA11' | 'ARCH1' | 'GARCH11'>('ARMA11');
  
  // Estado para el capital del juego
  const [capitalInput, setCapitalInput] = useState<number>(10000);
  const [gameScenario, setGameScenario] = useState<'neutral' | 'bullish' | 'bearish' | 'stochastic'>('stochastic');
  const [simulationHistory, setSimulationHistory] = useState<GameResult[]>([]);
  const [activeSimulation, setActiveSimulation] = useState<{
    periods: SimulatedPeriod[];
    summary: {
      portfolioFinal: number;
      benchmarkFinal: number;
      portfolioGain: number;
      benchmarkGain: number;
      alpha: number;
    }
  } | null>(savedForecastResults || null);

  useEffect(() => {
    if (savedForecastResults && !activeSimulation) {
      setActiveSimulation(savedForecastResults);
    }
  }, [savedForecastResults]);

  useEffect(() => {
    if (onForecastResultsChange && activeSimulation) {
      onForecastResultsChange(activeSimulation);
    }
  }, [activeSimulation]);

  // Inicializar pesos con el portafolio recomendado basado en aversión al riesgo
  useEffect(() => {
    if (filteredAssetsDb && filteredAssetsDb.length > 0) {
      let initialWeights: { [ticker: string]: number } = {};
      
      try {
        const tickers = filteredAssetsDb.map(a => a.ticker);
        const returnsMatrix = filteredAssetsDb.map(a => calculateReturns(a.prices));
        
        if (!returnsMatrix.some(r => r.length < 2)) {
          let recommendedPortfolio = optimalPortfolio;

          if (!recommendedPortfolio) {
            const opt = new MarkowitzOptimizer(tickers, returnsMatrix, periodsPerYear);
            const sim = opt.runMonteCarlo(1000, rfAnnual);
            
            recommendedPortfolio = sim.minVarPortfolio;
            if (portfolioTabSuggestion === 'tangent' || (riskCoefficient && riskCoefficient < 4)) {
              recommendedPortfolio = sim.maxSharpePortfolio;
            }
          }
          
          if (recommendedPortfolio) {
            recommendedPortfolio.weights.forEach((w, idx) => {
              if (filteredAssetsDb[idx]) {
                initialWeights[filteredAssetsDb[idx].ticker] = Math.round(w * 1000) / 10;
              }
            });
          }
        }
      } catch (e) {
        console.error("Error optimizando portafolio inicial", e);
      }

      // Fallback a pesos iguales si falla la optimización
      if (Object.keys(initialWeights).length === 0) {
        const equalWeight = 100 / filteredAssetsDb.length;
        filteredAssetsDb.forEach(a => {
          initialWeights[a.ticker] = Math.round(equalWeight * 10) / 10;
        });
      }
      
      setSelectedWeights(initialWeights);
    }
  }, [filteredAssetsDb, periodsPerYear, rfAnnual, portfolioTabSuggestion, riskCoefficient, optimalPortfolio]);

  // Cargar presets de pesos
  const applyPreset = (type: 'equal' | 'max_sharpe' | 'min_vol') => {
    if (!filteredAssetsDb || filteredAssetsDb.length === 0) return;
    
    if (type === 'equal') {
      const equalWeight = 100 / filteredAssetsDb.length;
      const ws: { [ticker: string]: number } = {};
      filteredAssetsDb.forEach(a => { ws[a.ticker] = Number(equalWeight.toFixed(1)); });
      setSelectedWeights(ws);
    } else if (type === 'max_sharpe') {
      // Intentar mapear pesos aproximados basados en el Sharpe Ratio de cada métrica
      const totalSharpe = metrics.reduce((sum, m) => sum + Math.max(0.1, m.sharpeRatio), 0);
      const ws: { [ticker: string]: number } = {};
      if (totalSharpe > 0) {
        filteredAssetsDb.forEach(a => {
          const m = metrics.find(met => met.ticker === a.ticker);
          const sharpe = m ? Math.max(0.1, m.sharpeRatio) : 0.2;
          ws[a.ticker] = Number(((sharpe / totalSharpe) * 100).toFixed(1));
        });
      } else {
        filteredAssetsDb.forEach(a => { ws[a.ticker] = Number((100 / filteredAssetsDb.length).toFixed(1)); });
      }
      normalizeWeights(ws);
    } else if (type === 'min_vol') {
      // Pesos inversamente proporcionales a la volatilidad histórica
      const invVols = metrics.map(m => m.annualVolatility > 0 ? 1 / m.annualVolatility : 1);
      const totalInvVol = invVols.reduce((sum, val) => sum + val, 0);
      const ws: { [ticker: string]: number } = {};
      filteredAssetsDb.forEach((a, idx) => {
        const m = metrics.find(met => met.ticker === a.ticker);
        const invVol = m && m.annualVolatility > 0 ? 1 / m.annualVolatility : (totalInvVol / filteredAssetsDb.length);
        ws[a.ticker] = Number(((invVol / totalInvVol) * 100).toFixed(1));
      });
      normalizeWeights(ws);
    }
  };

  // Helper simple para sumar pesos de forma segura sin problemas de tipo de Object.values
  const sumWeights = (wMap: { [ticker: string]: number }): number => {
    let sum = 0;
    Object.keys(wMap).forEach(key => {
      sum += wMap[key] || 0;
    });
    return sum;
  };

  // Normalizar pesos de forma que sumen exactamente 100%
  const normalizeWeights = (rawWeights: { [ticker: string]: number } = selectedWeights) => {
    const total = sumWeights(rawWeights);
    if (total === 0) return;
    const ws: { [ticker: string]: number } = {};
    Object.keys(rawWeights).forEach(t => {
      ws[t] = Number((((rawWeights[t] as number) / total) * 100).toFixed(1));
    });
    // Ajustar pequeña diferencia decimal para sumar 100
    const sumAdjusted = sumWeights(ws);
    if (sumAdjusted !== 100 && Object.keys(ws).length > 0) {
      const firstKey = Object.keys(ws)[0];
      ws[firstKey] = Number((ws[firstKey] + (100 - sumAdjusted)).toFixed(1));
    }
    setSelectedWeights(ws);
  };

  const handleWeightChange = (ticker: string, value: number) => {
    setSelectedWeights(prev => ({
      ...prev,
      [ticker]: Math.max(0, Math.min(100, value))
    }));
  };

  // --- MODELADO ECONOMÉTRICO EN TIEMPO REAL ---
  const econometricModel = useMemo(() => {
    if (!filteredAssetsDb || filteredAssetsDb.length === 0 || Object.keys(selectedWeights).length === 0) {
      return null;
    }

    // 1. Sintetizar la serie histórica de retornos del portafolio consolidado
    const assetReturnsMap: { [ticker: string]: number[] } = {};
    filteredAssetsDb.forEach(asset => {
      assetReturnsMap[asset.ticker] = calculateReturns(asset.prices);
    });

    const numPeriods = assetReturnsMap[filteredAssetsDb[0].ticker].length;
    const portfolioReturns: number[] = [];
    const benchmarkReturns = calculateReturns(benchmarkDb.prices);

    // Normalizar pesos decimales
    const totalWeight = sumWeights(selectedWeights) || 100;
    const decimalWeights: { [ticker: string]: number } = {};
    Object.keys(selectedWeights).forEach(t => {
      decimalWeights[t] = (selectedWeights[t] as number) / totalWeight;
    });

    for (let t = 0; t < numPeriods; t++) {
      let ptReturn = 0;
      filteredAssetsDb.forEach(asset => {
        const retSeries = assetReturnsMap[asset.ticker];
        ptReturn += decimalWeights[asset.ticker] * (retSeries[t] || 0);
      });
      portfolioReturns.push(ptReturn);
    }

    // 2. Estimación de parámetros de los modelos
    const n = portfolioReturns.length;
    if (n < 6) return null;

    const mu = mean(portfolioReturns);
    const varY = covariance(portfolioReturns, portfolioReturns);
    const sdY = Math.sqrt(varY);

    // Estructuras de almacenamiento
    let fitted: number[] = [];
    let residuals: number[] = [];
    let sigmaFitted: number[] = [];
    let params: { [key: string]: number } = {};
    let modelName = "";

    // Variable para verificar estabilidad
    let isStable = true;

    if (selectedModel === 'AR1') {
      modelName = "AR(1) Auto-Regresivo de primer orden";
      // y_t = c + phi1 * y_{t-1} + e_t
      // OLS simple de ret_t frente a ret_{t-1}
      let sumY = 0, sumX = 0, sumXY = 0, sumXX = 0;
      const k = n - 1;
      for (let i = 1; i < n; i++) {
        const y = portfolioReturns[i];
        const x = portfolioReturns[i - 1];
        sumY += y;
        sumX += x;
        sumXY += y * x;
        sumXX += x * x;
      }
      const meanY = sumY / k;
      const meanX = sumX / k;
      const covXY = (sumXY / k) - (meanY * meanX);
      const varX = (sumXX / k) - (meanX * meanX);
      
      const phi1 = varX === 0 ? 0.0 : covXY / varX;
      const c = meanY - phi1 * meanX;

      // Estabilidad
      if (Math.abs(phi1) >= 1) isStable = false;

      params = { c, phi1 };

      // Calcular fitted y residuals
      fitted = [mu]; // t=0
      residuals = [portfolioReturns[0] - mu];
      sigmaFitted = [sdY];

      for (let i = 1; i < n; i++) {
        const pred = c + phi1 * portfolioReturns[i - 1];
        fitted.push(pred);
        residuals.push(portfolioReturns[i] - pred);
        sigmaFitted.push(sdY); // Homocedástico inicial
      }

    } else if (selectedModel === 'MA1') {
      modelName = "MA(1) Media Móvil de primer orden";
      // y_t = mu + e_t + theta1 * e_{t-1}
      // Algoritmo iterativo simple para media móvil (5 iteraciones)
      let theta1 = 0.1;
      let curMu = mu;
      let e = Array(n).fill(0);

      for (let iter = 0; iter < 5; iter++) {
        e[0] = portfolioReturns[0] - curMu;
        for (let i = 1; i < n; i++) {
          e[i] = portfolioReturns[i] - curMu - theta1 * e[i - 1];
        }
        // Regresar y_t frente a e_{t-1} para optimizar theta1
        let sumXT = 0, sumYT = 0, sumXYT = 0, sumXXT = 0;
        const k = n - 1;
        for (let i = 1; i < n; i++) {
          const y = portfolioReturns[i] - curMu;
          const x = e[i - 1];
          sumXT += x;
          sumYT += y;
          sumXYT += y * x;
          sumXXT += x * x;
        }
        theta1 = sumXXT === 0 ? 0 : sumXYT / sumXXT;
        // Truncar para asegurar estacionariedad de inversión
        if (theta1 > 0.95) theta1 = 0.95;
        if (theta1 < -0.95) theta1 = -0.95;
      }

      params = { mu: curMu, theta1 };

      // Reconstruir fitted final
      fitted = [curMu];
      residuals = [portfolioReturns[0] - curMu];
      sigmaFitted = [sdY];

      for (let i = 1; i < n; i++) {
        const pred = curMu + theta1 * residuals[i - 1];
        fitted.push(pred);
        residuals.push(portfolioReturns[i] - pred);
        sigmaFitted.push(sdY);
      }

    } else if (selectedModel === 'ARMA11') {
      modelName = "ARMA(1,1) Autorregresivo de Media Móvil Proporcional";
      // y_t = c + phi1 * y_{t-1} + theta1 * e_{t-1} + e_t
      let phi1 = 0.2;
      let theta1 = 0.1;
      let c = mu * (1 - phi1);
      let e = Array(n).fill(0);

      // Algoritmo iterativo conjunto simplificado
      for (let iter = 0; iter < 5; iter++) {
        e[0] = portfolioReturns[0] - mu;
        for (let i = 1; i < n; i++) {
          e[i] = portfolioReturns[i] - c - phi1 * portfolioReturns[i - 1] - theta1 * e[i - 1];
        }
        // OLS frente a y_{t-1} y e_{t-1}
        let sumYY1 = 0, sumYE1 = 0;
        // Estimaciones básicas basadas en covarianza cruzada
        phi1 = covariance(portfolioReturns.slice(1), portfolioReturns.slice(0, -1)) / (varY || 1) * 0.8;
        theta1 = covariance(portfolioReturns.slice(1), e.slice(0, -1)) / (covariance(e, e) || 1) * 0.5;

        // Limitar parámetros
        if (Math.abs(phi1) >= 0.98) phi1 = Math.sign(phi1) * 0.95;
        if (Math.abs(theta1) >= 0.98) theta1 = Math.sign(theta1) * 0.95;
        c = mean(portfolioReturns) * (1 - phi1);
      }

      params = { c, phi1, theta1 };

      fitted = [c + phi1 * mu];
      residuals = [portfolioReturns[0] - fitted[0]];
      sigmaFitted = [sdY];

      for (let i = 1; i < n; i++) {
        const pred = c + phi1 * portfolioReturns[i - 1] + theta1 * residuals[i - 1];
        fitted.push(pred);
        residuals.push(portfolioReturns[i] - pred);
        sigmaFitted.push(sdY);
      }

    } else if (selectedModel === 'ARCH1') {
      modelName = "ARCH(1) Heterocedasticidad Condicional Autorregresiva";
      // y_t = mu + e_t , e_t ~ N(0, sig_t^2)
      // sig_t^2 = alpha0 + alpha1 * e_{t-1}^2
      const e_basic = portfolioReturns.map(y => y - mu);
      
      // Estimar alpha0 y alpha1 mediante regresión de e_t^2 frente a e_{t-1}^2
      let sumY2 = 0, sumX2 = 0, sumXY2 = 0, sumXX2 = 0;
      const k = n - 1;
      for (let i = 1; i < n; i++) {
        const y2 = Math.pow(e_basic[i], 2);
        const x2 = Math.pow(e_basic[i - 1], 2);
        sumY2 += y2;
        sumX2 += x2;
        sumXY2 += y2 * x2;
        sumXX2 += x2 * x2;
      }
      const mY2 = sumY2 / k;
      const mX2 = sumX2 / k;
      const covSq = (sumXY2 / k) - (mY2 * mX2);
      const varSq = (sumXX2 / k) - (mX2 * mX2);

      let alpha1 = varSq === 0 ? 0.15 : covSq / varSq;
      if (alpha1 < 0) alpha1 = 0.05;
      if (alpha1 >= 0.95) alpha1 = 0.85; // Asegurar estacionariedad
      
      let alpha0 = mY2 * (1 - alpha1);
      if (alpha0 <= 0) alpha0 = varY * 0.2;

      params = { mu, alpha0, alpha1 };

      fitted = Array(n).fill(mu);
      residuals = portfolioReturns.map(y => y - mu);
      
      sigmaFitted = [Math.sqrt(alpha0 / (1 - alpha1))];
      for (let i = 1; i < n; i++) {
        const sig2 = alpha0 + alpha1 * Math.pow(residuals[i - 1], 2);
        sigmaFitted.push(Math.sqrt(sig2));
      }

    } else if (selectedModel === 'GARCH11') {
      modelName = "GARCH(1,1) Heterocedasticidad Condicional Autorregresiva Generalizada";
      // y_t = mu + e_t , e_t ~ N(0, sig_t^2)
      // sig_t^2 = alpha0 + alpha1 * e_{t-1}^2 + beta1 * sig_{t-1}^2
      const e_basic = portfolioReturns.map(y => y - mu);
      
      // Calibración aproximada estándar para GARCH de alta frecuencia
      const alpha1 = 0.12;
      const beta1 = 0.82; // Suma es 0.94 < 1 (estable)
      const alpha0 = varY * (1 - alpha1 - beta1);

      params = { mu, alpha0, alpha1, beta1 };

      fitted = Array(n).fill(mu);
      residuals = e_basic;

      sigmaFitted = [sdY];
      for (let i = 1; i < n; i++) {
        const sig2 = alpha0 + alpha1 * Math.pow(residuals[i - 1], 2) + beta1 * Math.pow(sigmaFitted[i - 1], 2);
        sigmaFitted.push(Math.sqrt(sig2));
      }
    }

    // 3. PRUEBAS ESTADÍSTICAS DEL ERROR Y MODELO
    const residualsVar = covariance(residuals, residuals);
    const residualsMean = mean(residuals);

    // --- PRUEBA 1: Homocedasticidad (Test ARCH-LM de Engle) ---
    // Regresar residuals^2 frente a lagged residuals^2
    let lmStat = 0;
    let archPValue = 1;
    if (residuals.length > 5) {
      const sqRes = residuals.map(r => Math.pow(r, 2));
      const k = sqRes.length - 1;
      let meanSq = mean(sqRes);
      let sumSqY = 0, sumSqX = 0, sumSqXY = 0, sumSqXX = 0;
      for (let i = 1; i < sqRes.length; i++) {
        const yValue = sqRes[i];
        const xValue = sqRes[i - 1];
        sumSqY += yValue;
        sumSqX += xValue;
        sumSqXY += yValue * xValue;
        sumSqXX += xValue * xValue;
      }
      const covSqY = (sumSqXY / k) - ((sumSqY/k)*(sumSqX/k));
      const varSqX = (sumSqXX / k) - Math.pow(sumSqX/k, 2);
      const rSqSlope = varSqX === 0 ? 0 : covSqY / varSqX;
      
      // Calcular R^2 de la regresión auxiliar
      let rss = 0, tss = 0;
      const alpha_aux = (sumSqY / k) - rSqSlope * (sumSqX / k);
      for (let i = 1; i < sqRes.length; i++) {
        const prediction = alpha_aux + rSqSlope * sqRes[i - 1];
        rss += Math.pow(sqRes[i] - prediction, 2);
        tss += Math.pow(sqRes[i] - meanSq, 2);
      }
      const auxRSquared = tss === 0 ? 0 : Math.max(0, 1 - (rss / tss));
      lmStat = auxRSquared * k;
      archPValue = 1 - jStat.chisquare.cdf(lmStat, 1);
    }

    // --- PRUEBA 2: Autocorrelación de Ljung-Box (Lag 2) ---
    // Q = n * (n + 2) * sum(rho_k^2 / (n - k))
    let qStat = 0;
    let lbPValue = 1;
    if (residuals.length > 5) {
      let rho1 = 0;
      let rho2 = 0;
      let sumSqRes = residuals.reduce((sum, r) => sum + Math.pow(r - residualsMean, 2), 0);
      if (sumSqRes > 0) {
        let sumLag1 = 0, sumLag2 = 0;
        for (let i = 1; i < n; i++) {
          sumLag1 += (residuals[i] - residualsMean) * (residuals[i - 1] - residualsMean);
        }
        for (let i = 2; i < n; i++) {
          sumLag2 += (residuals[i] - residualsMean) * (residuals[i - 2] - residualsMean);
        }
        rho1 = sumLag1 / sumSqRes;
        rho2 = sumLag2 / sumSqRes;
        
        qStat = n * (n + 2) * (Math.pow(rho1, 2) / (n - 1) + Math.pow(rho2, 2) / (n - 2));
        lbPValue = 1 - jStat.chisquare.cdf(qStat, 2);
      }
    }

    // --- PRUEBA 3: Normalidad de Jarque-Bera (JB) ---
    let jbStat = 0;
    let jbPValue = 1;
    let skewness = 0;
    let kurtosis = 3;
    if (residuals.length > 5) {
      const sumSq = residuals.reduce((s, r) => s + Math.pow(r - residualsMean, 2), 0);
      const varEst = sumSq / n;
      if (varEst > 0) {
        const sumCube = residuals.reduce((s, r) => s + Math.pow(r - residualsMean, 3), 0);
        const sumQuad = residuals.reduce((s, r) => s + Math.pow(r - residualsMean, 4), 0);
        
        skewness = (sumCube / n) / Math.pow(varEst, 1.5);
        kurtosis = (sumQuad / n) / Math.pow(varEst, 2);
        
        jbStat = (n / 6) * (Math.pow(skewness, 2) + Math.pow(kurtosis - 3, 2) / 4);
        jbPValue = 1 - jStat.chisquare.cdf(jbStat, 2);
      }
    }

    // Veredicto de validez general del modelo econométrico
    // Válido si Ljung-Box p-val > 0.05 (sin correlación serial grave en residuos)
    // El test de ARCH-LM muestra si queda heterocedasticidad. En GARCH y ARCH deberíamos modelar bien la varianza condicional.
    const hasAutocorrelation = lbPValue < 0.05;
    const hasArchEffects = archPValue < 0.05;
    const isNormal = jbPValue >= 0.05;

    let modelValidityBadge = "VÁLIDO";
    let modelValidityDesc = "El modelo captura adecuadamente la estructura temporal del portafolio. Residuos en rango estable.";
    let modelWarningSeverity: 'success' | 'warning' | 'error' = 'success';

    if (hasAutocorrelation) {
      modelValidityBadge = "CORRELACIÓN SERIAL";
      modelValidityDesc = "Existe correlación restante en los residuos (Ljung-Box p < 0.05). Proyecciones dinámicas contienen sesgo.";
      modelWarningSeverity = 'warning';
    } else if (hasArchEffects && (selectedModel === 'AR1' || selectedModel === 'MA1' || selectedModel === 'ARMA11')) {
      modelValidityBadge = "VOLATILIDAD INESTABLE";
      modelValidityDesc = "Se detectan efectos ARCH en residuos (Engle LM p < 0.05). Se aconseja cambiar a modelo ARCH/GARCH.";
      modelWarningSeverity = 'warning';
    } else if (!isStable) {
      modelValidityBadge = "INESTABLE (RAÍZ)";
      modelValidityDesc = "Los parámetros estimados están al borde de la no-estacionariedad. Las proyecciones pueden divergir.";
      modelWarningSeverity = 'error';
    }

    // Formatear datos de ajuste histórico para el gráfico de residuos
    const adjustmentTimeline = portfolioReturns.map((actualVal, idx) => ({
      index: idx + 1,
      periodo: `t-${n - 1 - idx}`,
      actual: Number((actualVal * 100).toFixed(2)),
      fitted: Number((fitted[idx] * 100).toFixed(2)),
      residuo: Number((residuals[idx] * 100).toFixed(2)),
      volCondicional: Number((sigmaFitted[idx] * 100).toFixed(2))
    }));

    return {
      portfolioReturns,
      benchmarkReturns,
      n,
      mu,
      sdY,
      fitted,
      residuals,
      sigmaFitted,
      params,
      modelName,
      isStable,
      tests: {
        archLM: lmStat,
        archPValue,
        hasArchEffects,
        ljungBox: qStat,
        lbPValue,
        hasAutocorrelation,
        jarqueBera: jbStat,
        jbPValue,
        skewness,
        kurtosis,
        isNormal
      },
      validation: {
        badge: modelValidityBadge,
        desc: modelValidityDesc,
        severity: modelWarningSeverity
      },
      timeline: adjustmentTimeline
    };

  }, [assetsDb, selectedWeights, selectedModel, benchmarkDb, metrics]);

  // --- FUNCIÓN DE PRONÓSTICO A 3 PERIODOS (GAME TRIGGER) ---
  const handleSimulateFuture = () => {
    if (!econometricModel) return;

    const { params, residuals, portfolioReturns, benchmarkReturns, mu, sigmaFitted, n } = econometricModel;
    const lastPortfolioReturn = portfolioReturns[portfolioReturns.length - 1];
    const lastResidual = residuals[residuals.length - 1];
    const lastSigma = sigmaFitted[sigmaFitted.length - 1];

    let t1_ret = 0;
    let t2_ret = 0;
    let t3_ret = 0;

    let t1_sig = lastSigma;
    let t2_sig = lastSigma;
    let t3_sig = lastSigma;

    // 1. Proyección determinista / condicional según tipo de modelo
    if (selectedModel === 'AR1') {
      const c = params.c || 0;
      const phi1 = params.phi1 || 0;
      t1_ret = c + phi1 * lastPortfolioReturn;
      t2_ret = c + phi1 * t1_ret;
      t3_ret = c + phi1 * t2_ret;
    } else if (selectedModel === 'MA1') {
      const curMu = params.mu || 0;
      const theta1 = params.theta1 || 0;
      t1_ret = curMu + theta1 * lastResidual;
      t2_ret = curMu; // Proyectado a media incondicional
      t3_ret = curMu;
    } else if (selectedModel === 'ARMA11') {
      const c = params.c || 0;
      const phi1 = params.phi1 || 0;
      const theta1 = params.theta1 || 0;
      t1_ret = c + phi1 * lastPortfolioReturn + theta1 * lastResidual;
      t2_ret = c + phi1 * t1_ret; // Residual t+1 es cero
      t3_ret = c + phi1 * t2_ret;
    } else if (selectedModel === 'ARCH1') {
      const alpha0 = params.alpha0 || 0.0001;
      const alpha1 = params.alpha1 || 0.1;
      t1_ret = mu;
      t2_ret = mu;
      t3_ret = mu;

      const t1_var = alpha0 + alpha1 * Math.pow(lastResidual, 2);
      t1_sig = Math.sqrt(t1_var);
      const t2_var = alpha0 + alpha1 * t1_var;
      t2_sig = Math.sqrt(t2_var);
      const t3_var = alpha0 + alpha1 * t2_var;
      t3_sig = Math.sqrt(t3_var);
    } else if (selectedModel === 'GARCH11') {
      const alpha0 = params.alpha0 || 0.0001;
      const alpha1 = params.alpha1 || 0.1;
      const beta1 = params.beta1 || 0.8;
      t1_ret = mu;
      t2_ret = mu;
      t3_ret = mu;

      const t1_var = alpha0 + alpha1 * Math.pow(lastResidual, 2) + beta1 * Math.pow(lastSigma, 2);
      t1_sig = Math.sqrt(t1_var);
      const t2_var = alpha0 + (alpha1 + beta1) * t1_var;
      t2_sig = Math.sqrt(t2_var);
      const t3_var = alpha0 + (alpha1 + beta1) * t2_var;
      t3_sig = Math.sqrt(t3_var);
    }

    // 2. Incorporar escenario de juego y ruido estocástico (Random Walk)
    // Generamos ruidos estocásticos normales
    const randNormal = () => {
      let u = 0, v = 0;
      while(u === 0) u = Math.random(); 
      while(v === 0) v = Math.random();
      return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    };

    // Magnitudes de shock de escenario
    let extraShock = 0; // Por periodo
    let scenarioLabel = "Neutral";
    if (gameScenario === 'bullish') {
      extraShock = 0.035; // +3.5% adicional por periodo
      scenarioLabel = "Shock Alcista (Sólido)";
    } else if (gameScenario === 'bearish') {
      extraShock = -0.045; // -4.5% por periodo (crisis)
      scenarioLabel = "Crisis de Liquidez (Bajista)";
    } else if (gameScenario === 'stochastic') {
      scenarioLabel = "Sendero Estocástico Estándar";
    }

    // Calcular rendimientos finales simulados con ruido e intervención
    const useNoise = gameScenario === 'stochastic' || gameScenario === 'neutral' || gameScenario === 'bullish' || gameScenario === 'bearish';
    
    const noise1 = useNoise ? randNormal() * t1_sig : 0;
    const noise2 = useNoise ? randNormal() * t2_sig : 0;
    const noise3 = useNoise ? randNormal() * t3_sig : 0;

    const t1_final_ret = t1_ret + extraShock + noise1;
    const t2_final_ret = t2_ret + extraShock + noise2;
    const t3_final_ret = t3_ret + extraShock + noise3;

    // Simular también el Benchmark (Mercado) de manera paralela con su volatilidad histórica propia
    const benchMu = mean(benchmarkReturns);
    const benchVol = standardDeviation(benchmarkReturns);
    const benchShock = gameScenario === 'bullish' ? 0.025 : gameScenario === 'bearish' ? -0.04 : 0;
    
    const t1_bench_ret = benchMu + benchShock + (useNoise ? randNormal() * benchVol : 0);
    const t2_bench_ret = benchMu + benchShock + (useNoise ? randNormal() * benchVol : 0);
    const t3_bench_ret = benchMu + benchShock + (useNoise ? randNormal() * benchVol : 0);

    // 3. Evaluar evolución del Capital
    let capPort = capitalInput;
    let capBench = capitalInput;

    const period1ValPort = capPort * (1 + t1_final_ret);
    const period1ValBench = capBench * (1 + t1_bench_ret);

    const period2ValPort = period1ValPort * (1 + t2_final_ret);
    const period2ValBench = period1ValBench * (1 + t2_bench_ret);

    const period3ValPort = period2ValPort * (1 + t3_final_ret);
    const period3ValBench = period2ValBench * (1 + t3_bench_ret);

    const sdPortfolio = econometricModel.sdY;

    // Construir tabla de periodos proyectados
    const projectedRows: SimulatedPeriod[] = [
      {
        period: "t+1",
        actualReturn: Number((t1_final_ret * 100).toFixed(2)),
        marketReturn: Number((t1_bench_ret * 100).toFixed(2)),
        simulatedPortfolioValue: Math.round(period1ValPort),
        simulatedBenchmarkValue: Math.round(period1ValBench),
        ciLower: Number(((t1_ret - 1.96 * t1_sig) * 100).toFixed(2)),
        ciUpper: Number(((t1_ret + 1.96 * t1_sig) * 100).toFixed(2))
      },
      {
        period: "t+2",
        actualReturn: Number((t2_final_ret * 100).toFixed(2)),
        marketReturn: Number((t2_bench_ret * 100).toFixed(2)),
        simulatedPortfolioValue: Math.round(period2ValPort),
        simulatedBenchmarkValue: Math.round(period2ValBench),
        ciLower: Number(((t2_ret - 1.96 * t2_sig) * 100).toFixed(2)),
        ciUpper: Number(((t2_ret + 1.96 * t2_sig) * 100).toFixed(2))
      },
      {
        period: "t+3",
        actualReturn: Number((t3_final_ret * 100).toFixed(2)),
        marketReturn: Number((t3_bench_ret * 100).toFixed(2)),
        simulatedPortfolioValue: Math.round(period3ValPort),
        simulatedBenchmarkValue: Math.round(period3ValBench),
        ciLower: Number(((t3_ret - 1.96 * t3_sig) * 100).toFixed(2)),
        ciUpper: Number(((t3_ret + 1.96 * t3_sig) * 100).toFixed(2))
      }
    ];

    const portGain = ((period3ValPort - capitalInput) / capitalInput) * 100;
    const benchGain = ((period3ValBench - capitalInput) / capitalInput) * 100;
    const alphaGen = portGain - benchGain;

    const summary = {
      portfolioFinal: Math.round(period3ValPort),
      benchmarkFinal: Math.round(period3ValBench),
      portfolioGain: Number(portGain.toFixed(2)),
      benchmarkGain: Number(benchGain.toFixed(2)),
      alpha: Number(alphaGen.toFixed(2))
    };

    setActiveSimulation({
      periods: projectedRows,
      summary
    });

    // Registrar en Historial
    const newLogItem: GameResult = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      capitalInicial: capitalInput,
      capitalFinal: Math.round(period3ValPort),
      retornoObtenido: Number(portGain.toFixed(2)),
      retornoMercado: Number(benchGain.toFixed(2)),
      alfaGenerado: Number(alphaGen.toFixed(2)),
      modeloUtilizado: selectedModel,
      escenario: scenarioLabel,
      ganador: alphaGen > 0
    };

    setSimulationHistory(prev => [newLogItem, ...prev].slice(0, 10)); // Mantener últimos 10 de sesión
  };

  return (
    <div className="space-y-8" id="forecast-simulation-container">
      {/* 1. Header de Explicación y Controles de Pesos */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden" id="tab-forecast-header">
        <div className="absolute right-0 bottom-0 translate-x-12 translate-y-12 opacity-5 pointer-events-none">
          <TrendingUp className="w-96 h-96" />
        </div>
        
        <div className="max-w-3xl space-y-3 relative z-10">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-300 text-[10px] font-bold uppercase tracking-wider border border-indigo-500/20">
            <Sparkles className="w-3.5 h-3.5" /> Módulo 4: Econometría Aplicada y Simulador de Estrategia
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight leading-none bg-linear-to-r from-white via-indigo-100 to-indigo-300 bg-clip-text text-transparent">
            Pronóstico de Portafolio y Validación de Residuos
          </h1>
          <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
            Ejecuta regresiones de series de tiempo para estimar y verificar la validez econométrica del portafolio. Realiza proyecciones estocásticas a un horizonte fijo de 3 periodos y ponte a prueba en el simulador para batir al mercado.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* PANEL IZQUIERDO: CONFIGURADOR DE PORTAFOLIO Y MODELOS */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Tarjeta 0: Selección de Activos */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xs p-6 space-y-4" id="forecast-assets-selector-card">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <h2 className="text-xs font-bold text-slate-800 uppercase tracking-widest flex items-center gap-2">
                <ListCollapse className="h-4 w-4 text-indigo-600" />
                0. Activos en Portafolio
              </h2>
              <span className="text-[10px] bg-indigo-100 text-indigo-800 font-bold px-2 py-0.5 rounded-full font-mono">
                {selectedAssetTickers.length} Activos
              </span>
            </div>
            
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Marca los activos que deseas habilitar para la asignación de pesos y simulaciones de pronóstico de rendimiento.
            </p>

            <div className="max-h-64 overflow-y-auto border border-slate-100 rounded-xl p-2 bg-slate-50/50 scrollbar-thin space-y-1">
              {assetsDb && assetsDb.map((asset) => {
                const isChecked = selectedAssetTickers.includes(asset.ticker);
                return (
                  <label 
                    key={asset.ticker} 
                    className={`flex items-center justify-between p-2 rounded-lg border text-xs cursor-pointer transition-all ${
                      isChecked 
                        ? 'bg-indigo-50/30 border-indigo-200 text-indigo-900 font-medium' 
                        : 'bg-white border-slate-100 text-slate-600 hover:bg-slate-100/50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input 
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          if (onSelectedAssetTickersChange) {
                            if (isChecked) {
                              if (selectedAssetTickers.length > 1) {
                                onSelectedAssetTickersChange(selectedAssetTickers.filter(t => t !== asset.ticker));
                              } else {
                                alert('Debes mantener al menos un activo seleccionado para el portafolio.');
                              }
                            } else {
                              onSelectedAssetTickersChange([...selectedAssetTickers, asset.ticker]);
                            }
                          }
                        }}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer h-4 w-4"
                      />
                      <span className="font-mono font-bold text-indigo-950">{asset.ticker}</span>
                      <span className="text-[10px] text-gray-500 truncate max-w-[130px]">({asset.name.split(' (')[0]})</span>
                    </div>
                    <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded uppercase font-bold tracking-wider font-sans scale-90">
                      {asset.type}
                    </span>
                  </label>
                );
              })}
            </div>

            {/* Acciones Rápidas del Selector */}
            <div className="flex gap-2 justify-between items-center pt-1">
              <button 
                type="button"
                onClick={() => {
                  if (onSelectedAssetTickersChange) {
                    onSelectedAssetTickersChange(assetsDb.map(a => a.ticker));
                  }
                }}
                className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold hover:underline transition-colors"
              >
                Seleccionar Todos
              </button>
              <button 
                type="button"
                onClick={() => {
                  if (onSelectedAssetTickersChange) {
                    if (assetsDb.length === ASSETS_DATABASE.length) {
                      onSelectedAssetTickersChange(assetsDb.slice(0, 8).map(a => a.ticker));
                    } else {
                      onSelectedAssetTickersChange(assetsDb.map(a => a.ticker));
                    }
                  }
                }}
                className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold hover:underline transition-colors"
              >
                Predeterminados UPB
              </button>
            </div>
          </div>
          
          {/* Tarjeta 1: Estructura del Portafolio */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xs p-6" id="forecast-portfolio-panel">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-50">
              <h2 className="text-xs font-bold text-slate-800 uppercase tracking-widest flex items-center gap-2">
                <Layers className="h-4 w-4 text-indigo-500" />
                1. Asignación de Pesos
              </h2>
              <div className="flex gap-1.5">
                <button 
                  onClick={() => applyPreset('equal')}
                  className="bg-slate-50 hover:bg-slate-100 text-[10px] font-bold px-2 py-1 rounded text-slate-600 border border-slate-200"
                >
                  Equitativo
                </button>
                <button 
                  onClick={() => applyPreset('max_sharpe')}
                  className="bg-slate-50 hover:bg-indigo-50 hover:text-indigo-600 text-[10px] font-bold px-2 py-1 rounded text-slate-600 border border-slate-200"
                >
                  Max Sharpe
                </button>
                <button 
                  onClick={() => applyPreset('min_vol')}
                  className="bg-slate-50 hover:bg-emerald-50 hover:text-emerald-600 text-[10px] font-bold px-2 py-1 rounded text-slate-600 border border-slate-200"
                >
                  Min Vol
                </button>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 mb-4 leading-relaxed">
              Define la ponderación de cada activo para construir la serie agregada de retornos que alimentará tu modelo econométrico.
            </p>

            {/* Sliders para cada activo de la BD */}
            <div className="space-y-3.5">
              {filteredAssetsDb && filteredAssetsDb.map(asset => {
                const weightVal = selectedWeights[asset.ticker] ?? 0;
                return (
                  <div key={asset.ticker} className="space-y-1.5">
                    <div className="flex justify-between items-center text-[11px] font-bold">
                      <span className="font-mono text-slate-900">{asset.ticker}</span>
                      <span className="text-slate-500 truncate max-w-[150px] font-medium">{asset.name.split(' ')[0]}</span>
                      <span className="font-mono text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded text-[10px]">
                        {weightVal}%
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <input 
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        value={weightVal}
                        onChange={(e) => handleWeightChange(asset.ticker, Number(e.target.value))}
                        className="w-full accent-indigo-600 cursor-pointer h-1.5 bg-slate-100 rounded-lg appearance-none"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
              <div className="text-[10px] text-slate-500">
                Suma Total: <strong className={Math.abs(sumWeights(selectedWeights) - 100) < 0.5 ? "text-emerald-600" : "text-rose-600"}>
                  {sumWeights(selectedWeights).toFixed(1)}%
                </strong>
              </div>
              <button 
                onClick={() => normalizeWeights()}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] px-3 py-1.5 rounded-lg flex items-center gap-1 shadow-xs"
              >
                <RefreshCw className="h-3 w-3" /> Normalizar a 100%
              </button>
            </div>
          </div>

          {/* Tarjeta 2: Selección de Modelos */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xs p-6" id="forecast-model-selector">
            <h2 className="text-xs font-bold text-slate-800 uppercase tracking-widest flex items-center gap-2 mb-3">
              <Award className="h-4 w-4 text-violet-500" />
              2. Modelo Econométrico
            </h2>
            <p className="text-[11px] text-slate-500 mb-4 leading-relaxed">
              Selecciona el tipo de modelo estadístico para estimar dinámicas de precio y volatilidad de tu portafolio.
            </p>

            <div className="space-y-2">
              {[
                { id: 'AR1', label: 'Autoregresivo AR(1)', desc: 'Pronostica el retorno condicionado utilizando la inercia del periodo anterior.' },
                { id: 'MA1', label: 'Media Móvil MA(1)', desc: 'Ajusta el rendimiento basándose en choques aleatorios pasados (White Noise residuals).' },
                { id: 'ARMA11', label: 'Proporcional ARMA(1,1)', desc: 'Combina efectos de inercia de retornos y persistencia de errores aleatorios.' },
                { id: 'ARCH1', label: 'Modelador ARCH(1)', desc: 'Mantiene la media de Sharpe constante pero modela agrupamientos de volatilidad condicional.' },
                { id: 'GARCH11', label: 'Ajuste Volatilidad GARCH(1,1)', desc: 'Estándar industrial que estima la persistencia de largo plazo en la varianza condicional.' }
              ].map(m => (
                <button
                  key={m.id}
                  onClick={() => setSelectedModel(m.id as any)}
                  className={`w-full text-left p-3 rounded-xl border text-xs transition-all relative ${
                    selectedModel === m.id 
                      ? 'border-indigo-600 bg-indigo-50/20 shadow-xs' 
                      : 'border-slate-100 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex justify-between items-center mb-0.5">
                    <strong className={selectedModel === m.id ? 'text-indigo-900' : 'text-slate-800'}>{m.label}</strong>
                    {selectedModel === m.id && (
                      <span className="h-2 w-2 rounded-full bg-indigo-600 animate-pulse"></span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400 font-medium leading-normal">{m.desc}</p>
                </button>
              ))}
            </div>
          </div>

        </div>

        {/* PANEL DERECHO: DIAGNÓSTICO MATEMÁTICO DE VALIDACIÓN */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Tarjeta 1: Validaciones de Supuestos de Modelación */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xs p-6" id="forecast-math-diagnostics">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-100">
              <h2 className="text-xs font-bold text-slate-800 uppercase tracking-widest flex items-center gap-2">
                <Info className="h-4 w-4 text-emerald-500" />
                Validación de Supuestos del Error
              </h2>

              {econometricModel && (
                <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 text-indigo-950 py-0.5 rounded-full ${
                  econometricModel.validation.severity === 'success' 
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                    : econometricModel.validation.severity === 'warning'
                    ? 'bg-amber-100 text-amber-800 border border-amber-200 animate-pulse'
                    : 'bg-rose-100 text-rose-800 border border-rose-200'
                }`}>
                  {econometricModel.validation.badge}
                </span>
              )}
            </div>

            {econometricModel ? (
              <div className="space-y-4">
                <p className="text-[11px] text-slate-500 leading-relaxed bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  <strong>Fórmula de Regresión Actual:</strong> {econometricModel.modelName}. Se analizaron {econometricModel.n} periodos históricos del portafolio.
                  <span className="block mt-1 font-mono text-[10px] text-indigo-700">
                    Retorno Promedio del Portafolio: <strong className="text-slate-800">{(econometricModel.mu * 100).toFixed(4)}%</strong> · Volatilidad Histórica: <strong className="text-slate-800">{(econometricModel.sdY * 100).toFixed(4)}%</strong>
                  </span>
                </p>

                {/* Grid de Pruebas Econométricas Reales */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  
                  {/* Homocedasticidad ARCH-LM */}
                  <div className="border border-slate-100 rounded-xl p-3 bg-slate-50/20 text-center space-y-1">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block tracking-wider">Homocedasticidad</span>
                    <strong className="text-xs text-slate-700 block">Test ARCH-LM</strong>
                    <div className="font-mono text-[10px] text-indigo-600 bg-indigo-50/50 py-0.5 rounded">
                      p-val: {econometricModel.tests.archPValue.toFixed(4)}
                    </div>
                    <span className={`inline-block text-[8px] px-1.5 py-0.5 rounded font-bold ${
                      econometricModel.tests.hasArchEffects 
                        ? 'bg-rose-100 text-rose-800' 
                        : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      {econometricModel.tests.hasArchEffects ? 'Existe Varianza (Heteroc.)' : 'Varianza Homocedástica'}
                    </span>
                  </div>

                  {/* Autocorrelación Ljung-Box */}
                  <div className="border border-slate-100 rounded-xl p-3 bg-slate-50/20 text-center space-y-1">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block tracking-wider">Inexistencia de Ruido</span>
                    <strong className="text-xs text-slate-700 block">Test Ljung-Box (L2)</strong>
                    <div className="font-mono text-[10px] text-indigo-600 bg-indigo-50/50 py-0.5 rounded">
                      p-val: {econometricModel.tests.lbPValue.toFixed(4)}
                    </div>
                    <span className={`inline-block text-[8px] px-1.5 py-0.5 rounded font-bold ${
                      econometricModel.tests.hasAutocorrelation 
                        ? 'bg-rose-100 text-rose-800' 
                        : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      {econometricModel.tests.hasAutocorrelation ? 'Autocorrelación Residual' : 'Ruido Blanco Puro (OK)'}
                    </span>
                  </div>

                  {/* Normalidad Jarque-Bera */}
                  <div className="border border-slate-100 rounded-xl p-3 bg-slate-50/20 text-center space-y-1">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block tracking-wider">Simetría e Inteligibilidad</span>
                    <strong className="text-xs text-slate-700 block">Test Jarque-Bera (JB)</strong>
                    <div className="font-mono text-[10px] text-indigo-600 bg-indigo-50/50 py-0.5 rounded">
                      p-val: {econometricModel.tests.jbPValue.toFixed(4)}
                    </div>
                    <span className={`inline-block text-[8px] px-1.5 py-0.5 rounded font-bold ${
                      econometricModel.tests.isNormal 
                        ? 'bg-emerald-100 text-emerald-800' 
                        : 'bg-amber-100 text-amber-800'
                    }`}>
                      {econometricModel.tests.isNormal ? 'Errores Normales' : 'Colas Anormales / Pesadas'}
                    </span>
                  </div>

                </div>

                <div className="text-[10px] space-y-1.5 text-slate-500 leading-normal p-3 rounded-lg border border-slate-100 bg-slate-50/50">
                  <span className="font-bold text-slate-800 block">Detalle de Diagnóstico:</span>
                  <p>{econometricModel.validation.desc}</p>
                  <div className="grid grid-cols-2 gap-2 pt-1 uppercase font-mono text-[9px] border-t border-slate-100">
                    <span>Sesgo (Skewness): <strong>{econometricModel.tests.skewness.toFixed(3)}</strong></span>
                    <span>Curtosis (Kurtosis): <strong>{econometricModel.tests.kurtosis.toFixed(3)}</strong></span>
                  </div>
                </div>

                {/* Gráfico de Ajuste y Residuos */}
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest block">Gráfico de Residuos del Modelo</span>
                  <div className="h-44 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={econometricModel.timeline}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="periodo" stroke="#94a3b8" fontSize={9} />
                        <YAxis stroke="#94a3b8" fontSize={9} unit="%" />
                        <Tooltip formatter={(value) => [`${value}%`]} />
                        <Legend wrapperStyle={{ fontSize: '9px' }} />
                        <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
                        <Line type="monotone" name="Retornos Portafolio" dataKey="actual" stroke="#8b5cf6" strokeWidth={1.5} dot={false} />
                        <Line type="monotone" name="Ajuste Proyectado" dataKey="fitted" stroke="#f59e0b" strokeWidth={1} dot={false} />
                        <Line type="monotone" name="Residuo (Error)" dataKey="residuo" stroke="#ec4899" strokeWidth={1} strokeDasharray="3 3" dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

              </div>
            ) : (
              <div className="py-12 text-center text-slate-400">
                Determina pesos primero para activar el cálculo econométrico.
              </div>
            )}
          </div>

        </div>

      </div>

      {/* SECCIÓN 3: JUEGO INTERACTIVO DE SIMULACIÓN (3 PERIODOS MÁXIMO) */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-md p-6 sm:p-8" id="forecast-investment-game">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-slate-100 mb-6">
          <div className="space-y-1">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <Coins className="h-5 w-5 text-indigo-600" />
              Juego del Simulador: ¡Desafío de Rendimiento a 3 Periodos!
            </h2>
            <p className="text-[11px] text-slate-500 max-w-xl">
              Invierte tu capital teórico en tu portafolio estructurado. El simulador aplicará los parámetros calculados y un shock estocástico para proyectar tu ganancia acumulada y determinar si batiste al mercado.
            </p>
          </div>

          <div className="inline-flex items-center gap-2 bg-indigo-50 border border-indigo-100 p-1.5 rounded-2xl shrink-0">
            <span className="text-[10px] font-bold text-indigo-700 uppercase px-2">Escenario:</span>
            <div className="flex gap-1">
              {[
                { id: 'stochastic', label: 'Ruido Normal' },
                { id: 'neutral', label: 'Sin Ruido' },
                { id: 'bullish', label: 'Shock Alcista' },
                { id: 'bearish', label: 'Crisis' }
              ].map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setGameScenario(opt.id as any)}
                  className={`text-[9px] font-bold px-2 py-1 rounded-lg transition-all ${
                    gameScenario === opt.id 
                      ? 'bg-indigo-600 text-white shadow-xs' 
                      : 'hover:bg-slate-100 text-slate-600'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Tarjeta de Controles de Entrada */}
          <div className="lg:col-span-4 space-y-5 bg-slate-50/50 p-5 rounded-2xl border border-slate-100">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 block">
                Monto Teórico a Invertir (USD / Bolivianos)
              </label>
              <div className="relative rounded-xl shadow-xs">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 font-bold text-xs font-mono">
                  $
                </div>
                <input 
                  type="number"
                  value={capitalInput}
                  onChange={(e) => setCapitalInput(Math.max(10, Number(e.target.value)))}
                  className="block w-full pl-8 pr-12 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-800 font-mono text-xs font-bold focus:outline-hidden focus:border-indigo-600 transition-all"
                  placeholder="Por ej. 10000"
                />
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400 text-[10px]">
                  Monto Fijo
                </div>
              </div>
            </div>

            <div className="space-y-3 pt-2 text-[11px] text-slate-600 leading-normal">
              <div className="flex justify-between border-b border-dotted border-slate-200 pb-1.5">
                <span>Modelo de Carga:</span>
                <strong className="text-indigo-900 font-mono">{selectedModel}</strong>
              </div>
              <div className="flex justify-between border-b border-dotted border-slate-200 pb-1.5">
                <span>Activos en Cartera:</span>
                <strong className="text-slate-800 font-mono">{Object.keys(selectedWeights).length} tickers</strong>
              </div>
              <div className="flex justify-between border-b border-dotted border-slate-200 pb-1.5 animate-pulse">
                <span>Rend. Esperado Portafolio (Anual):</span>
                <strong className="text-emerald-600 font-mono">
                  {econometricModel ? `${(econometricModel.mu * periodsPerYear * 100).toFixed(2)}%` : 'N/A'}
                </strong>
              </div>
            </div>

            <button
              onClick={handleSimulateFuture}
              className="w-full bg-indigo-600 hover:bg-slate-900 text-white font-black text-xs py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-lg hover:shadow-indigo-500/10 transition-all transform active:scale-95 text-center uppercase tracking-widest cursor-pointer"
            >
              <Play className="h-4 w-4 fill-white" />
              ¡Simular Periodo de 3 Meses!
            </button>
          </div>

          {/* Panel de Visualización del Pronóstico */}
          <div className="lg:col-span-8 space-y-6">
            
            {activeSimulation ? (
              <div className="space-y-5">
                
                {/* Resultados Rápidos */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  
                  <div className="border border-slate-100 bg-white shadow-xs rounded-xl p-3.5 space-y-1">
                    <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">Tu Capital Final</span>
                    <strong className="font-mono text-base text-slate-800">
                      ${activeSimulation.summary.portfolioFinal.toLocaleString()}
                    </strong>
                    <span className={`text-[10px] font-bold flex items-center gap-0.5 ${
                      activeSimulation.summary.portfolioGain >= 0 ? "text-emerald-600" : "text-rose-600"
                    }`}>
                      {activeSimulation.summary.portfolioGain >= 0 ? "+" : ""}{activeSimulation.summary.portfolioGain}%
                    </span>
                  </div>

                  <div className="border border-slate-100 bg-white shadow-xs rounded-xl p-3.5 space-y-1">
                    <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">Capital Benchmark</span>
                    <strong className="font-mono text-base text-slate-400">
                      ${activeSimulation.summary.benchmarkFinal.toLocaleString()}
                    </strong>
                    <span className={`text-[10px] font-bold ${
                      activeSimulation.summary.benchmarkGain >= 0 ? "text-slate-500" : "text-rose-650 text-rose-500"
                    }`}>
                      {activeSimulation.summary.benchmarkGain >= 0 ? "+" : ""}{activeSimulation.summary.benchmarkGain}%
                    </span>
                  </div>

                  <div className="border border-slate-100 bg-white shadow-xs rounded-xl p-3.5 space-y-1">
                    <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">Exceso de Alfa</span>
                    <strong className={`font-mono text-base block ${
                      activeSimulation.summary.alpha >= 0 ? "text-emerald-700" : "text-rose-700"
                    }`}>
                      {activeSimulation.summary.alpha >= 0 ? "+" : ""}{activeSimulation.summary.alpha}%
                    </strong>
                    <span className="text-[9px] text-slate-400">Rendimiento Extra obtenido</span>
                  </div>

                  <div className="border border-indigo-100 bg-indigo-50/20 shadow-xs rounded-xl p-3.5 flex flex-col justify-center items-center text-center">
                    {activeSimulation.summary.alpha > 0 ? (
                      <>
                        <CheckCircle2 className="h-6 w-6 text-emerald-600 mb-1" />
                        <span className="text-[9px] text-emerald-800 font-bold uppercase tracking-wider">¡ÉXITO DEL JUEGO!</span>
                        <span className="text-[9px] text-emerald-600 font-medium font-sans">Batiste al mercado</span>
                      </>
                    ) : (
                      <>
                        <ShieldAlert className="h-6 w-6 text-amber-600 mb-1" />
                        <span className="text-[9px] text-amber-800 font-bold uppercase tracking-wider">BAJO RENDIMIENTO</span>
                        <span className="text-[9px] text-amber-600 font-medium font-sans">Ajusta tu modelo</span>
                      </>
                    )}
                  </div>

                </div>

                {/* Gráfico y Tabla combinados de simulación */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  
                  {/* Gráfico de Crecimiento del Capital */}
                  <div className="bg-slate-50/30 border border-slate-100 p-4 rounded-xl space-y-2">
                    <strong className="text-[10px] text-slate-600 uppercase tracking-widest block">Proyección del Capital a 3 Meses</strong>
                    <div className="h-44 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={[
                          { period: "Inicio", simulatedPortfolioValue: capitalInput, simulatedBenchmarkValue: capitalInput },
                          ...activeSimulation.periods
                        ]}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                          <XAxis dataKey="period" stroke="#94a3b8" fontSize={9} />
                          <YAxis stroke="#94a3b8" fontSize={9} domain={['auto', 'auto']} />
                          <Tooltip formatter={(value) => [`$${value}`]} />
                          <Line type="monotone" name="Tu Portafolio" dataKey="simulatedPortfolioValue" stroke="#6366f1" strokeWidth={2} />
                          <Line type="monotone" name="Mercado Benchmark" dataKey="simulatedBenchmarkValue" stroke="#cbd5e1" strokeWidth={1.5} strokeDasharray="4 4" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Tabla de Resultados de Proyección a 3 periodos */}
                  <div className="bg-slate-50/20 border border-slate-100 rounded-xl p-4 space-y-3 overflow-x-auto">
                    <strong className="text-[10px] text-slate-600 uppercase tracking-widest block">Detalle de Proyecciones Recurrentes</strong>
                    
                    <table className="w-full text-left font-sans text-[10px] border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500 font-bold">
                          <th className="pb-1.5">Periodo</th>
                          <th className="pb-1.5 text-right">Rend. Sim</th>
                          <th className="pb-1.5 text-right font-medium">Banda de Confianza 95%</th>
                          <th className="pb-1.5 text-right">Val. Portafolio</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {activeSimulation.periods.map(p => (
                          <tr key={p.period} className="hover:bg-slate-50/85">
                            <td className="py-2 text-slate-800 font-bold">{p.period}</td>
                            <td className={`py-2 text-right font-mono font-bold ${p.actualReturn >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                              {p.actualReturn >= 0 ? "+" : ""}{p.actualReturn}%
                            </td>
                            <td className="py-2 text-right text-slate-400 font-mono text-[9px]">
                              [{p.ciLower}% a {p.ciUpper}%]
                            </td>
                            <td className="py-2 text-right text-slate-900 font-mono font-bold">
                              ${p.simulatedPortfolioValue.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <p className="text-[9px] text-slate-400 leading-normal">
                      *La banda de confianza del 95% se deduce de la varianza condicionada obtenida por el estimador del modelo {selectedModel} en base a los datos de calibración local.
                    </p>
                  </div>

                </div>

              </div>
            ) : (
              <div className="bg-slate-50 p-12 text-center rounded-2xl text-slate-400 border border-dashed border-slate-200 flex flex-col justify-center items-center space-y-2">
                <Briefcase className="h-8 w-8 text-slate-300" />
                <span>Simulador listo para jugar. Carga tus pesos y haz click en el botón de la izquierda.</span>
              </div>
            )}

            {/* TABLA DE HISTORIAL DE SESIÓN (ESTILO MARGINAL TROFEOS DEL JOGO) */}
            <div className="bg-slate-50/50 rounded-2xl border border-slate-100 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Trophy className="h-4 w-4 text-amber-500" />
                <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">Historial de Partidas Simétricas</span>
              </div>

              {simulationHistory.length > 0 ? (
                <div className="max-h-32 overflow-y-auto space-y-2 pr-1">
                  {simulationHistory.map(result => (
                    <div 
                      key={result.id} 
                      className={`flex items-center justify-between p-2.5 rounded-lg border text-[10px] bg-white ${
                        result.ganador ? 'border-emerald-100 font-medium' : 'border-slate-150 border-slate-200/50'
                      }`}
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800 font-mono">Sim #{result.id}</span>
                          <span className="text-slate-400 text-[8px]">{result.timestamp}</span>
                        </div>
                        <span className="text-slate-500 text-[9px]">
                          Modelo: {result.modeloUtilizado} · Escenario: {result.escenario}
                        </span>
                      </div>

                      <div className="text-right">
                        <div className={`font-mono font-bold ${result.ganador ? 'text-emerald-700' : 'text-slate-600'}`}>
                          Cap: ${result.capitalFinal.toLocaleString()} ({result.retornoObtenido >= 0 ? '+' : ''}{result.retornoObtenido}%)
                        </div>
                        <div className="text-[9px] text-slate-400">
                          Alfa frente a mercado: <span className={result.alfaGenerado >= 0 ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}>
                            {result.alfaGenerado >= 0 ? '+' : ''}{result.alfaGenerado}%
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[9px] text-slate-400 italic text-center py-4">
                  Aún no se han ejecutado simulación de jugadas en esta sesión.
                </div>
              )}
            </div>

          </div>

        </div>

      </div>

      <div className="mt-8 flex justify-end">
        <button
          onClick={() => {
            if (onNavigateToTab) {
              onNavigateToTab('report');
            }
          }}
          className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition-all shadow-md shadow-indigo-200"
        >
          Guardar y Generar Reporte (Módulo 6: Reporte)
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
        </button>
      </div>

    </div>
  );
}
