# Trabajo Final Integrador: Herramienta de Visualización Financiera
**Materia:** Finanzas I  
**Institución:** Universidad Privada Boliviana (UPB)  
**Gestión:** 2026 · Sede La Paz  

---

## 📌 1. Descripción General del Proyecto
Esta herramienta interactiva de visualización y análisis financiero ha sido construida para procesar series históricas de **3 años (Junio 2023 - Junio 2026)** para un universo soberano de **30 activos** más un índice de referencia de mercado unificado (**S&P 500**). Integra los tres ejes rectores del curso:

1. **Análisis de Mercado de Capitales (Riesgo y Rentabilidad):** Estimación métrica de rentabilidades esperadas, volatilidades históricas, ratios ajustados Sharpe, Sortino, Calmar, Máximo Drawdown, Value at Risk (VaR 95%) y Conditional Value at Risk (CVaR/Expected Shortfall 95%).
2. **Optimización de Portafolios (Teoría Moderna de Markowitz):** Trazado de Frontera Eficiente mediante simulación estocástica de Monte Carlo ($N \ge 4500$), determinación del Portafolio de Mínima Varianza (MVP) y Portafolio Tangencial (Sharpe Máximo), trazado de la Capital Market Line (CML) y visualización interactiva de matrices de correlación cruzada.
3. **Modelos de Valoración de Activos (CAPM):** Regresiones lineales OLS (Mínimos Cuadrados Ordinarios) individuales vs. S&P 500 para deducir Betas y coeficientes de determinación $R^2$, dibujo de la Security Market Line (SML), cálculo del Alfa de Jensen y veredicto de valuación (Subvalorado vs. Sobrevalorado).

---

## 📁 2. Estructura de Entregables
El directorio cumple estrictamente con el listado de archivos solicitados en la rúbrica:

*   `/codigo/` : Código fuente completo e interactivo desarrollado en **React 19 + TypeScript + Vite + Tailwind CSS v4**.
*   `/datos/refinitiv_data_prices.csv` : Archivo CSV bruto exportado que contiene toda la serie histórica de precios de los 30 activos + Benchmark.
*   `README.md` / `README.txt` : Este manual explicativo paso a paso.
*   `requirements.txt` : Listado de librerías Python equivalentes (pandas, numpy, scipy) por si se audita localmente el motor cuantitativo en un entorno Jupyter.

---

## ⚙️ 3. Instrucciones de Instalación y Ejecución Local
La aplicación utiliza un servidor ultraligero y moderno sobre Node.js, libre de problemas de compilación local:

### Requisitos Previos
*   Tener instalado [Node.js](https://nodejs.org/) (versión LTS recomendada).

### Pasos para iniciar el visualizador interactivo:
1.  **Entrar al directorio del proyecto:**
    ```bash
    cd /codigo
    ```
2.  **Instalar dependencias de desarrollo de forma limpia:**
    ```bash
    npm install
    ```
3.  **Lanzar el visualizador en el navegador (en desarrollo):**
    ```bash
    npm run dev
    ```
4.  **Acceder al navegador web en:**
    ```
    http://localhost:3000
    ```

---

## 📊 4. Universo de Activos Incorporados (Diversificación Explícita)
Para garantizar la máxima calificación de **Excelente (30 o más activos cubriendo múltiples clases de instrumentos e industrias)**, se incorporaron:

*   **Renta Variable (Acciones - 21 activos de 6 sectores industriales):**
    *   *Tecnología:* AAPL, MSFT, NVDA, GOOGL, META.
    *   *Finanzas:* JPM, BAC, GS.
    *   *Salud:* JNJ, LLY, PFE, UNH.
    *   *Consumo:* AMZN, TSLA, WMT, KO, PEP.
    *   *Energía:* XOM, CVX.
    *   *Industrial:* CAT, GE.
*   **Commodities (Materias Primas):** GLD (SPDR Gold Shares - ETF de Oro Físico).
*   **Fondo Inmobiliario (Bienes Raíces):** VNQ (Vanguard Real Estate ETF).
*   **Renta Fija / Bonos Soberanos (4 ETFs de deuda):**
    *   BND (Vanguard Total Bond Market)
    *   TLT (iShares 20+ Year Treasury Bond)
    *   SHY (iShares 1-3 Year Treasury Bond - Corto Plazo)
    *   AGG (iShares Core U.S. Aggregate Bond)
*   **ETFs de Mercado General:** VOO (S&P 500 ETF), QQQ (Nasdaq 100 ETF), EEM (Emerging Markets ETF).
*   **Benchmark Referencial:** S&P 500 Index (ticker unificado `SPX`).

---

## 📐 5. Fórmulas de Cálculo Aplicadas
Todas las métricas se computan en el motor de cálculo `/src/lib/finance_math.ts` bajo el estándar matemático financiero:

*   **Rentabilidad Anualizada:**
    $$R_{\text{anual}} = R_{\text{mensual, media}} \times 12$$
*   **Volatilidad Anualizada (Desviación Estándar Muestral):**
    $$\sigma_{\text{anual}} = \sqrt{\frac{\sum_{t=1}^N (R_t - \overline{R})^2}{N - 1}} \times \sqrt{12}$$
*   **Ratio de Sharpe:**
    $$SR = \frac{R_{\text{anual}} - R_f}{\sigma_{\text{anual}}}$$
*   **Desviación Bajista (Semi-Varianza para Sortino):**
    $$\sigma_{\text{downside}} = \sqrt{\frac{\sum_{t=1}^N \left(\min\left(0, R_t - R_{f, \text{mensual}}\right)\right)^2}{N - 1}} \times \sqrt{12}$$
*   **Alfa de de Jensen (CAPM):**
    $$\alpha_{\text{Jensen}} = R_{\text{activo, anual}} - \left[ R_f + \beta_{\text{activo}} \times \left(R_{\text{benchmark, anual}} - R_f\right) \right]$$
