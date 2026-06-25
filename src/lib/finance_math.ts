import { jStat } from 'jstat';

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Biblioteca matemática y estadística de Finanzas (Markowitz y CAPM)
// Desarrollado con fórmulas financieras estándar anualizadas de forma precisa.

export interface PortfolioInstance {
  weights: number[]; // Pesos de cada activo en el portafolio
  return: number;    // Retorno anualizado
  risk: number;      // Volatilidad (Desviación estándar) anualizada
  sharpe: number;    // Ratio Sharpe
}

/**
 * Calcula los retornos porcentuales mensuales a partir de una serie de precios.
 * Retorno en t: (P_t - P_{t-1}) / P_{t-1}
 */
export function calculateReturns(prices: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const prev = prices[i - 1];
    const curr = prices[i];
    returns.push((curr - prev) / prev);
  }
  return returns;
}

/**
 * Retorna el promedio aritmético de un arreglo de números.
 */
export function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((sum, val) => sum + val, 0) / arr.length;
}

/**
 * Retorna la desviación estándar muestral de un arreglo de números.
 */
export function standardDeviation(arr: number[], isSample = true): number {
  if (arr.length <= 1) return 0;
  const avg = mean(arr);
  const sumSquaredDiffs = arr.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0);
  const denominator = isSample ? arr.length - 1 : arr.length;
  return Math.sqrt(sumSquaredDiffs / denominator);
}

/**
 * Retorna el covarianza muestral de dos series de números de igual longitud.
 */
export function covariance(arr1: number[], arr2: number[]): number {
  if (arr1.length !== arr2.length || arr1.length <= 1) return 0;
  const avg1 = mean(arr1);
  const avg2 = mean(arr2);
  let sumProd = 0;
  for (let i = 0; i < arr1.length; i++) {
    sumProd += (arr1[i] - avg1) * (arr2[i] - avg2);
  }
  return sumProd / (arr1.length - 1);
}

/**
 * Retorna el coeficiente de correlación de Pearson de dos series.
 */
export function correlation(arr1: number[], arr2: number[]): number {
  const sd1 = standardDeviation(arr1);
  const sd2 = standardDeviation(arr2);
  if (sd1 === 0 || sd2 === 0) return 0;
  return covariance(arr1, arr2) / (sd1 * sd2);
}

/**
 * Calcula el Máximo Drawdown (MDD) histórico a partir de una serie de precios.
 */
export function calculateMaxDrawdown(prices: number[]): number {
  if (prices.length === 0) return 0;
  let maxPeak = prices[0];
  let maxDrawdown = 0;
  for (const price of prices) {
    if (price > maxPeak) {
      maxPeak = price;
    }
    const drawdown = (maxPeak - price) / maxPeak;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }
  return maxDrawdown;
}

/**
 * Calcula la desviación estándar de retornos negativos (Downside Risk/Desviación Semivarianza).
 * Se usa para el ratio Sortino. Ajustado al retorno objetivo (tasa libre de riesgo mensual).
 */
export function calculateDownsideDeviation(returns: number[], targetMonthlyReturn: number): number {
  const negativeDiffs = returns.map(r => Math.min(0, r - targetMonthlyReturn));
  const sumSquared = negativeDiffs.reduce((sum, val) => sum + Math.pow(val, 2), 0);
  if (returns.length <= 1) return 0;
  return Math.sqrt(sumSquared / (returns.length - 1));
}

/**
 * Calcula el Valor en Riesgo Histórico (95% VaR mensual).
 * Representa la pérdida que no se superará con el 95% de confianza en un mes.
 */
export function calculateHistoricalVaR95(returns: number[]): number {
  if (returns.length === 0) return 0;
  const sorted = [...returns].sort((a, b) => a - b);
  // Percentil 5
  const index = Math.floor(sorted.length * 0.05);
  return sorted[index] || 0;
}

/**
 * Calcula la Pérdida Esperada / CVaR Histórico (95% mensual).
 * Promedio de retornos por debajo del VaR 95%.
 */
export function calculateExpectedShortfall95(returns: number[], var95: number): number {
  const losses = returns.filter(r => r <= var95);
  if (losses.length === 0) return var95;
  return mean(losses);
}

/**
 * Estima los parámetros de regresión lineal OLS (Mínimos Cuadrados Ordinarios): Y = Alpha + Beta * X + Error
 * En finanzas: Retornos Activo = Alpha_reg + Beta * Retornos Mercado + Error
 */
export function estimateOLS(assetReturns: number[], marketReturns: number[], periodsPerYear: number = 12): {
  beta: number;
  alphaMonthly: number;
  alphaAnnualized: number;
  rSquared: number;
  tStatBeta: number;
  pValBeta: number;
  tStatAlpha: number;
  pValAlpha: number;
} {
  const n = assetReturns.length;
  if (n < 3) {
    return { beta: 1, alphaMonthly: 0, alphaAnnualized: 0, rSquared: 0, tStatBeta: 0, pValBeta: 1, tStatAlpha: 0, pValAlpha: 1 };
  }

  const cov = covariance(assetReturns, marketReturns);
  const marketVar = covariance(marketReturns, marketReturns);
  
  const beta = marketVar === 0 ? 1.0 : cov / marketVar;
  
  const avgAsset = mean(assetReturns);
  const avgMarket = mean(marketReturns);
  
  // Alpha periódico
  const alphaMonthly = avgAsset - beta * avgMarket;
  // Alpha anualizado
  const alphaAnnualized = alphaMonthly * periodsPerYear;

  // Residuals & Standard Errors
  let sse = 0; // Sum of Squared Errors
  let ssx = 0; // Sum of Squares of X (Market)
  for (let i = 0; i < n; i++) {
    const predictedReturn = alphaMonthly + beta * marketReturns[i];
    const residual = assetReturns[i] - predictedReturn;
    sse += Math.pow(residual, 2);
    ssx += Math.pow(marketReturns[i] - avgMarket, 2);
  }

  const df = n - 2;
  const mse = sse / df; // Mean Squared Error
  const se_y_given_x = Math.sqrt(mse); // Standard Error of Regression

  const seBeta = ssx === 0 ? 0 : se_y_given_x / Math.sqrt(ssx);
  const seAlpha = ssx === 0 ? 0 : se_y_given_x * Math.sqrt((1 / n) + (Math.pow(avgMarket, 2) / ssx));

  // t-statistics (H0: beta = 0, H0: alphaMonthly = 0)
  const tStatBeta = seBeta === 0 ? 0 : beta / seBeta;
  const tStatAlpha = seAlpha === 0 ? 0 : alphaMonthly / seAlpha;

  // p-values using jStat (two-tailed test)
  const pValBeta = seBeta === 0 ? 1 : 2 * (1 - jStat.studentt.cdf(Math.abs(tStatBeta), df));
  const pValAlpha = seAlpha === 0 ? 1 : 2 * (1 - jStat.studentt.cdf(Math.abs(tStatAlpha), df));

  // R^2 es el cuadrado del coeficiente de correlación
  const corr = correlation(assetReturns, marketReturns);
  const rSquared = Math.pow(corr, 2);

  return {
    beta,
    alphaMonthly,
    alphaAnnualized,
    rSquared,
    tStatBeta,
    pValBeta,
    tStatAlpha,
    pValAlpha
  };
}

/**
 * Clase para realizar Análisis de Markowitz y trazado de la Frontera Eficiente.
 */
export class MarkowitzOptimizer {
  tickers: string[];
  expectedReturns: number[]; // Rendimiento esperado anualizado de los activos seleccionados
  returnsMatrix: number[][]; // [índice activo][índice retorno mensual]
  covMatrix: number[][];     // Matriz de covarianza de retornos mensuales
  periodsPerYear: number;

  constructor(tickers: string[], returnsMatrix: number[][], periodsPerYear: number = 12) {
    this.tickers = tickers;
    this.returnsMatrix = returnsMatrix;
    this.periodsPerYear = periodsPerYear;
    
    // Anualizar los rendimientos esperados (promedio * periodsPerYear)
    this.expectedReturns = returnsMatrix.map(retSeries => mean(retSeries) * periodsPerYear);
    
    // Calcular matriz de covarianza
    const size = tickers.length;
    this.covMatrix = Array(size).fill(0).map(() => Array(size).fill(0));
    
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        this.covMatrix[i][j] = covariance(returnsMatrix[i], returnsMatrix[j]);
      }
    }
  }

  /**
   * Calcula el retorno, riesgo y Sharpe anualizado para un vector de pesos dado.
   */
  evaluatePortfolio(weights: number[], rfAnnual: number): { return: number; risk: number; sharpe: number } {
    let pReturn = 0;
    const size = this.tickers.length;
    
    // Retorno del portafolio: w^T * R_annual
    for (let i = 0; i < size; i++) {
      pReturn += weights[i] * this.expectedReturns[i];
    }
    
    // Varianza del portafolio: w^T * Cov * w
    let pVar = 0;
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        pVar += weights[i] * weights[j] * this.covMatrix[i][j];
      }
    }
    
    // Volatilidad anualizada: sd * sqrt(periodsPerYear) => sd_annualized = sqrt(pVar * periodsPerYear)
    const pRisk = Math.sqrt(pVar * this.periodsPerYear);
    const sharpe = pRisk === 0 ? 0 : (pReturn - rfAnnual) / pRisk;

    return {
      return: pReturn,
      risk: pRisk,
      sharpe: sharpe
    };
  }

  /**
   * Ejecuta una simulación Monte Carlo para generar miles de combinaciones de portafolios válidos.
   */
  runMonteCarlo(simulationsCount = 6000, rfAnnual: number): {
    portfolios: PortfolioInstance[];
    minVarPortfolio: PortfolioInstance;
    maxSharpePortfolio: PortfolioInstance;
    efficientFrontierPoints: { risk: number; return: number }[];
  } {
    const size = this.tickers.length;
    const portfolios: PortfolioInstance[] = [];
    
    let minVarIdx = 0;
    let maxSharpeIdx = 0;
    
    let minRisk = Infinity;
    let maxSharpe = -Infinity;

    // 1. Generar portafolios aleatorios
    for (let s = 0; s < simulationsCount; s++) {
      // Vector de pesos aleatorios
      const randomWeights = Array(size).fill(0).map(() => Math.random());
      const sum = randomWeights.reduce((a, b) => a + b, 0);
      const normalizedWeights = randomWeights.map(w => w / sum); // Suma = 1.0

      const stats = this.evaluatePortfolio(normalizedWeights, rfAnnual);
      const pInstance: PortfolioInstance = {
        weights: normalizedWeights,
        return: stats.return,
        risk: stats.risk,
        sharpe: stats.sharpe
      };
      
      portfolios.push(pInstance);
      
      // Buscar el de Mínima Varianza (mínimo riesgo)
      if (stats.risk < minRisk) {
        minRisk = stats.risk;
        minVarIdx = s;
      }
      
      // Buscar el de Máximo Sharpe (tangencial)
      if (stats.sharpe > maxSharpe) {
        maxSharpe = stats.sharpe;
        maxSharpeIdx = s;
      }
    }

    // Agregar algunos portafolios extremos de activo único por si acaso
    for (let i = 0; i < size; i++) {
      const singleAssetWeights = Array(size).fill(0);
      singleAssetWeights[i] = 1.0;
      const stats = this.evaluatePortfolio(singleAssetWeights, rfAnnual);
      const pInstance: PortfolioInstance = {
        weights: singleAssetWeights,
        return: stats.return,
        risk: stats.risk,
        sharpe: stats.sharpe
      };
      portfolios.push(pInstance);
      
      if (stats.risk < minRisk) {
        minRisk = stats.risk;
        minVarIdx = portfolios.length - 1;
      }
      if (stats.sharpe > maxSharpe) {
        maxSharpe = stats.sharpe;
        maxSharpeIdx = portfolios.length - 1;
      }
    }

    const minVarPortfolio = portfolios[minVarIdx];
    const maxSharpePortfolio = portfolios[maxSharpeIdx];

    // 2. Extraer los puntos que forman el límite superior de la Frontera Eficiente.
    // Para ello dividimos los retornos en intervalos y seleccionamos el portafolio que ofrece menor riesgo por cada intervalo.
    // Solo consideramos portafolios con retornos >= retorno de Mínima Varianza.
    const eligiblePortfolios = portfolios.filter(p => p.return >= minVarPortfolio.return);
    const minReturn = minVarPortfolio.return;
    const maxReturn = Math.max(...portfolios.map(p => p.return));
    
    const stepsCount = 20;
    const intervalSize = (maxReturn - minReturn) / stepsCount;
    const bins: { [key: number]: PortfolioInstance[] } = {};
    
    // Inicializar contenedores para cada bin de retorno
    for (let i = 0; i < stepsCount; i++) {
       bins[i] = [];
    }

    eligiblePortfolios.forEach(p => {
      const diff = p.return - minReturn;
      let binIdx = Math.floor(diff / intervalSize);
      if (binIdx >= stepsCount) binIdx = stepsCount - 1;
      if (binIdx < 0) binIdx = 0;
      bins[binIdx].push(p);
    });

    const efficientFrontierPoints: { r: number; val: PortfolioInstance }[] = [];
    
    for (let i = 0; i < stepsCount; i++) {
      const list = bins[i];
      if (list.length > 0) {
        // Encontrar el portafolio con el menor riesgo para este rango de retorno
        const lowestRiskPortfolio = list.reduce((best, curr) => curr.risk < best.risk ? curr : best, list[0]);
        efficientFrontierPoints.push({ r: lowestRiskPortfolio.return, val: lowestRiskPortfolio });
      }
    }

    // Ordenar por riesgo de menor a mayor para trazar la curva
    efficientFrontierPoints.sort((a, b) => a.val.risk - b.val.risk);
    const finalFrontier = efficientFrontierPoints.map(item => ({
      risk: item.val.risk,
      return: item.val.return
    }));

    // Asegurar que comience en el portafolio de mínima varianza y termine en el punto de retorno máximo
    if (finalFrontier.length > 0 && finalFrontier[0].risk > minVarPortfolio.risk) {
      finalFrontier.unshift({ risk: minVarPortfolio.risk, return: minVarPortfolio.return });
    }

    return {
      portfolios,
      minVarPortfolio,
      maxSharpePortfolio,
      efficientFrontierPoints: finalFrontier
    };
  }
}
