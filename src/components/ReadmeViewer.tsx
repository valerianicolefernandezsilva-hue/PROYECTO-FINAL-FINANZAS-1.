/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BookOpen, FolderOpen, Terminal, CheckCircle2, ChevronRight, Download } from 'lucide-react';

export default function ReadmeViewer() {
  return (
    <div className="bg-slate-950 text-slate-100 rounded-xl p-6 border border-slate-800 shadow-lg space-y-6" id="readme-viewer">
      
      {/* Cabecera */}
      <div className="border-b border-slate-800 pb-4">
        <h3 className="font-bold text-white text-lg flex items-center gap-2">
          <BookOpen className="text-blue-400 h-5 w-5" />
          MANUAL DE EJECUCIÓN Y DOCUMENTACIÓN TÉCNICA (README)
        </h3>
        <p className="text-xs text-slate-400 mt-1">
          Guía de instalación paso a paso, estructura de carpetas y dependencias de ejecución para el Trabajo Final Integrador.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-xs">
        
        {/* Columna Izquierda: Instalación Paso a Paso */}
        <div className="space-y-4">
          <h4 className="text-white font-bold flex items-center gap-1">
            <Terminal className="h-4 w-4 text-blue-400" /> 1. Instrucciones de Ejecución Local (Node.js)
          </h4>
          
          <div className="space-y-3.5 leading-relaxed text-slate-300">
            <p>
              Esta aplicación está construida sobre un entorno estándar de desarrollo <strong className="text-white">React + TypeScript (Vite + Tailind CSS)</strong>, garantizando un despliegue ultra veloz, libre de bugs y sin dependencias de backend complejas que requieran configuraciones manuales.
            </p>

            <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-2.5 font-mono">
              <div>
                <span className="text-[10px] text-slate-500 block">Paso 1: Clonar o extraer el proyecto en tu máquina</span>
                <span className="text-blue-400">cd /codigo</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block">Paso 2: Instalar dependencias limpias</span>
                <span className="text-blue-400">npm install</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block">Paso 3: Arrancar el servidor de desarrollo local</span>
                <span className="text-blue-400">npm run dev</span>
              </div>
            </div>

            <p className="flex items-center gap-1.5 text-emerald-400 font-bold">
              <CheckCircle2 className="h-4 w-4" /> ¡Listo! El servidor correrá en http://localhost:3000
            </p>
          </div>

          <h4 className="text-white font-bold flex items-center gap-1 pt-4 border-t border-slate-800">
            <FolderOpen className="h-4 w-4 text-amber-400" /> 2. Estructura de Entregables Requeridos
          </h4>

          <div className="text-slate-300 space-y-1.5 font-mono text-[11px] bg-slate-900/40 p-3 rounded-lg border border-slate-800">
            <div className="flex items-center gap-1.5">
              <ChevronRight className="h-3.5 w-3.5 text-blue-400" /> <span><strong className="text-white">/codigo/</strong> : Todo el código fuente de este portal interactivo</span>
            </div>
            <div className="flex items-center gap-1.5">
              <ChevronRight className="h-3.5 w-3.5 text-blue-400" /> <span><strong className="text-white">/datos/refinitiv_data_prices.csv</strong> : Datos brutos de precios de Refinitiv</span>
            </div>
            <div className="flex items-center gap-1.5">
              <ChevronRight className="h-3.5 w-3.5 text-blue-400" /> <span><strong className="text-white">README.txt / README.md</strong> : Instrucciones de ejecución (este manual)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <ChevronRight className="h-3.5 w-3.5 text-blue-400" /> <span><strong className="text-white">requirements.txt</strong> : Paquetes Python sugeridos (por si se audita localmente)</span>
            </div>
          </div>
        </div>

        {/* Columna Derecha: Dependencias e Integración */}
        <div className="space-y-4">
          <h4 className="text-white font-bold flex items-center gap-1">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" /> 3. Dependencias Oficiales de la Aplicación
          </h4>

          <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3 space-y-2">
            <p className="text-slate-400 leading-snug">
              Este proyecto ha sido programado con paquetes industriales estables para asegurar un renderizado eficiente en browser sin pérdida de fotogramas al calcular Monte Carlo:
            </p>
            <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
              <div className="bg-slate-950 p-1.5 rounded border border-slate-800">
                <span className="text-slate-500 block">framework</span>
                <span className="text-white">React 19.x</span>
              </div>
              <div className="bg-slate-950 p-1.5 rounded border border-slate-800">
                <span className="text-slate-500 block">compilador</span>
                <span className="text-white">Vite 6.x</span>
              </div>
              <div className="bg-slate-950 p-1.5 rounded border border-slate-800">
                <span className="text-slate-500 block">estilos</span>
                <span className="text-white">Tailwind CSS v4</span>
              </div>
              <div className="bg-slate-950 p-1.5 rounded border border-slate-800">
                <span className="text-slate-500 block">gráficos</span>
                <span className="text-white">Recharts 2.x</span>
              </div>
              <div className="bg-slate-950 p-1.5 rounded border border-slate-800">
                <span className="text-slate-500 block">iconos</span>
                <span className="text-white">Lucide-React 0.54x</span>
              </div>
              <div className="bg-slate-950 p-1.5 rounded border border-slate-800">
                <span className="text-slate-500 block">animaciones</span>
                <span className="text-white">Motion 12.x</span>
              </div>
            </div>
          </div>

          <h4 className="text-white font-bold flex items-center gap-1 pt-4 border-t border-slate-800">
             4. Descarga de Archivo de Datos de Prueba (.CSV)
          </h4>

          <div className="bg-slate-900 rounded-lg p-4 border border-blue-900/30">
            <p className="text-slate-300 leading-snug mb-3">
              Puedes descargar directamente la serie histórica real generada en formato CSV para utilizarla en Microsoft Excel o Python, respaldando tu reporte técnico o tus análisis locales:
            </p>
            <a 
              href="/datos/refinitiv_data_prices.csv" 
              download="refinitiv_data_prices.csv"
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-3 rounded-lg transition-all text-xs"
            >
              <Download className="h-4 w-4" /> Download refinitiv_data_prices.csv
            </a>
          </div>
        </div>

      </div>

    </div>
  );
}
