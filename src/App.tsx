/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Search, 
  RefreshCw, 
  AlertCircle, 
  Activity,
  Filter,
  BarChart3,
  Clock,
  Zap,
  Copy,
  Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getFutureSymbols, getKlines, calculateHeikinAshi, detectImpulse } from './services/binanceService';
import { ImpulseResult, HistoryEntry } from './types';
import { cn } from './lib/utils';

export default function App() {
  const [symbols, setSymbols] = useState<string[]>([]);
  const [results, setResults] = useState<ImpulseResult[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [activeTab, setActiveTab] = useState<'CURRENT' | 'HISTORY'>('CURRENT');
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'BULLISH' | 'BEARISH'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'NEW' | 'COMPLETE'>('ALL');
  const [copiedSymbol, setCopiedSymbol] = useState<string | null>(null);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSymbol(text);
    setTimeout(() => setCopiedSymbol(null), 2000);
  };

  const hasInitialScanned = useRef(false);

  const scanSymbols = useCallback(async (targetSymbols: string[]) => {
    if (targetSymbols.length === 0) return;
    
    setScanning(true);
    setProgress(0);
    const newResults: ImpulseResult[] = [];
    
    // Batch processing to avoid rate limits
    const batchSize = 10;
    for (let i = 0; i < targetSymbols.length; i += batchSize) {
      const batch = targetSymbols.slice(i, i + batchSize);
      const promises = batch.map(async (symbol) => {
        const klines = await getKlines(symbol, '5m', 100);
        if (klines.length > 0) {
          const haCandles = calculateHeikinAshi(klines);
          const impulse = detectImpulse(symbol, haCandles);
          if (impulse) {
            return impulse;
          }
        }
        return null;
      });

      const batchResults = await Promise.all(promises);
      batchResults.forEach(res => {
        if (res) newResults.push(res);
      });

      setProgress(Math.round(((i + batch.length) / targetSymbols.length) * 100));
      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    const finalResults = newResults
      .filter(r => r.confidence >= 0.5)
      .map(r => ({ ...r, detectedAt: Date.now() }))
      .sort((a, b) => b.confidence - a.confidence);

    setResults(finalResults);
    
    if (finalResults.length > 0) {
      setHistory(prev => {
        const newEntry: HistoryEntry = {
          timestamp: Date.now(),
          results: finalResults
        };
        // Keep last 50 scan entries
        return [newEntry, ...prev].slice(0, 50);
      });
    }
    
    setScanning(false);
  }, []);

  const fetchSymbols = useCallback(async () => {
    try {
      const syms = await getFutureSymbols();
      setSymbols(syms);
      setLoading(false);
      // Auto-trigger scan only once after fetching symbols
      if (syms.length > 0 && !hasInitialScanned.current) {
        hasInitialScanned.current = true;
        scanSymbols(syms);
      }
    } catch (err) {
      setError('Failed to fetch symbols');
      setLoading(false);
    }
  }, [scanSymbols]);

  useEffect(() => {
    fetchSymbols();
  }, [fetchSymbols]);

  // Auto-scan every 15 minutes
  useEffect(() => {
    if (symbols.length === 0) return;
    
    const interval = setInterval(() => {
      console.log('Auto-scanning symbols (15 min interval)...');
      scanSymbols(symbols);
    }, 15 * 60 * 1000); // 15 minutes
    
    return () => clearInterval(interval);
  }, [symbols, scanSymbols]);

  const filteredResults = results.filter(r => {
    const typeMatch = filter === 'ALL' || r.type === filter;
    const statusMatch = statusFilter === 'ALL' || r.status === statusFilter;
    return typeMatch && statusMatch;
  });

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-gray-100 font-sans selection:bg-yellow-500/30">
      {/* Header */}
      <header className="border-b border-white/5 bg-black/40 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 md:gap-3">
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-yellow-500 flex items-center justify-center shadow-lg shadow-yellow-500/20">
              <Zap className="text-black fill-black" size={20} />
            </div>
            <div>
              <h1 className="text-base md:text-xl font-bold tracking-tight">Impulse Scanner</h1>
              <p className="text-[8px] md:text-[10px] text-gray-500 uppercase tracking-widest font-semibold">Binance Futures • 5M</p>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-4">
            <button 
              onClick={() => scanSymbols(symbols)}
              disabled={scanning || loading}
              className={cn(
                "flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-1.5 md:py-2 rounded-lg text-xs md:text-sm font-medium transition-all",
                scanning 
                  ? "bg-white/5 text-gray-500 cursor-not-allowed" 
                  : "bg-yellow-500 text-black hover:bg-yellow-400 active:scale-95"
              )}
            >
              {scanning ? (
                <RefreshCw className="animate-spin" size={14} />
              ) : (
                <Search size={14} />
              )}
              <span className="hidden sm:inline">{scanning ? `Scanning ${progress}%` : 'Start Scan'}</span>
              <span className="sm:hidden">{scanning ? `${progress}%` : 'Scan'}</span>
            </button>
          </div>
        </div>
        
        {/* Scanning Progress Bar */}
        <AnimatePresence>
          {scanning && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 2 }}
              exit={{ opacity: 0, height: 0 }}
              className="w-full bg-white/5"
            >
              <motion.div 
                className="h-full bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.5)]"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.3 }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <Activity className="text-blue-400" size={20} />
              </div>
              <span className="text-xs font-medium text-gray-500">Total Symbols</span>
            </div>
            <div className="text-3xl font-bold">{symbols.length}</div>
            <div className="mt-2 text-xs text-gray-500">Binance USDT-M Futures</div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-green-500/10 rounded-lg">
                <TrendingUp className="text-green-400" size={20} />
              </div>
              <span className="text-xs font-medium text-gray-500">Bullish Patterns</span>
            </div>
            <div className="text-3xl font-bold text-green-400">
              {results.filter(r => r.type === 'BULLISH').length}
            </div>
            <div className="mt-2 text-xs text-gray-500">Impulse & Zigzag</div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-red-500/10 rounded-lg">
                <TrendingDown className="text-red-400" size={20} />
              </div>
              <span className="text-xs font-medium text-gray-500">Bearish Patterns</span>
            </div>
            <div className="text-3xl font-bold text-red-400">
              {results.filter(r => r.type === 'BEARISH').length}
            </div>
            <div className="mt-2 text-xs text-gray-500">Impulse & Zigzag</div>
          </div>
        </div>

        {/* Filters & Tabs */}
        <div className="flex flex-col gap-6 mb-6">
          <div className="flex items-center gap-4 p-1 bg-white/5 rounded-2xl border border-white/10 w-fit">
            <button
              onClick={() => setActiveTab('CURRENT')}
              className={cn(
                "px-6 py-2 rounded-xl text-sm font-bold transition-all",
                activeTab === 'CURRENT' 
                  ? "bg-yellow-500 text-black shadow-lg shadow-yellow-500/20" 
                  : "text-gray-500 hover:text-gray-300"
              )}
            >
              Current Signals
            </button>
            <button
              onClick={() => setActiveTab('HISTORY')}
              className={cn(
                "px-6 py-2 rounded-xl text-sm font-bold transition-all",
                activeTab === 'HISTORY' 
                  ? "bg-yellow-500 text-black shadow-lg shadow-yellow-500/20" 
                  : "text-gray-500 hover:text-gray-300"
              )}
            >
              History
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2 p-1 bg-white/5 rounded-xl border border-white/10">
                {(['ALL', 'BULLISH', 'BEARISH'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setFilter(t)}
                    className={cn(
                      "px-4 py-1.5 rounded-lg text-sm font-medium transition-all",
                      filter === t 
                        ? "bg-white/10 text-white shadow-sm" 
                        : "text-gray-500 hover:text-gray-300"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 p-1 bg-white/5 rounded-xl border border-white/10">
                {(['ALL', 'NEW', 'COMPLETE'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={cn(
                      "px-4 py-1.5 rounded-lg text-sm font-medium transition-all",
                      statusFilter === s 
                        ? "bg-white/10 text-white shadow-sm" 
                        : "text-gray-500 hover:text-gray-300"
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Clock size={14} />
              Last Scan: {new Date().toLocaleTimeString()}
            </div>
          </div>
        </div>

        {/* Results List (Mobile) / Table (Desktop) */}
        <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-sm">
          {activeTab === 'CURRENT' ? (
            <>
              {/* Mobile Card View */}
              <div className="md:hidden divide-y divide-white/5">
                <AnimatePresence mode="popLayout">
                  {filteredResults.length > 0 ? (
                    filteredResults.map((res) => (
                      <motion.div
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        key={res.symbol}
                        className="p-4 flex flex-col gap-4"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-yellow-500/10 flex items-center justify-center text-yellow-500 font-bold text-sm">
                              {res.symbol.charAt(0)}
                            </div>
                            <div className="flex flex-col">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-white text-base">{res.symbol}.P</span>
                                <button 
                                  onClick={() => copyToClipboard(`${res.symbol}.P`)}
                                  className="p-2 rounded-md hover:bg-white/10 text-gray-500 hover:text-yellow-500 transition-all active:scale-90"
                                  title="Copy symbol"
                                >
                                  {copiedSymbol === `${res.symbol}.P` ? (
                                    <Check size={16} className="text-green-500" />
                                  ) : (
                                    <Copy size={16} />
                                  )}
                                </button>
                              </div>
                              <span className="text-xs text-gray-500 font-medium uppercase tracking-wider">{res.pattern}</span>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <span className={cn(
                              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                              res.type === 'BULLISH' 
                                ? "bg-green-500/10 text-green-400 border border-green-500/20" 
                                : "bg-red-500/10 text-red-400 border border-red-500/20"
                            )}>
                              {res.type === 'BULLISH' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                              {res.type}
                            </span>
                            <span className={cn(
                              "text-[10px] font-bold px-2 py-0.5 rounded border",
                              res.status === 'COMPLETE' 
                                ? "bg-blue-500/10 text-blue-400 border-blue-500/20" 
                                : "bg-yellow-500/10 text-yellow-500 border-yellow-500/20"
                            )}>
                              {res.status}
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 py-2 border-y border-white/5">
                          <div>
                            <p className="text-[10px] text-gray-500 uppercase font-bold mb-1">Current Price</p>
                            <p className="font-mono text-sm text-gray-300">
                              ${res.lastPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-500 uppercase font-bold mb-1 text-right">Wave Progress</p>
                            <div className="flex items-center justify-end gap-2">
                              <span className="text-sm font-medium text-gray-300">W{res.wave}</span>
                              <div className="flex gap-0.5">
                                {[1, 2, 3, 4, 5].map(w => (
                                  <div 
                                    key={w} 
                                    className={cn(
                                      "w-1.5 h-1.5 rounded-full",
                                      w <= res.wave ? "bg-yellow-500" : "bg-white/10"
                                    )} 
                                  />
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="flex flex-col gap-1">
                            <p className="text-[10px] text-gray-500 uppercase font-bold">Confidence</p>
                            <div className="w-24 bg-white/10 h-1.5 rounded-full overflow-hidden">
                              <div 
                                className="bg-yellow-500 h-full rounded-full" 
                                style={{ width: `${res.confidence * 100}%` }}
                              />
                            </div>
                          </div>
                          <a 
                            href={`https://www.binance.com/en/futures/${res.symbol}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 text-xs font-bold text-yellow-500 hover:bg-white/10 transition-colors border border-white/5"
                          >
                            Trade on Binance <Zap size={14} />
                          </a>
                        </div>
                      </motion.div>
                    ))
                  ) : (
                    <div className="px-6 py-20 text-center">
                      <div className="flex flex-col items-center gap-4 text-gray-500">
                        <div className="p-4 bg-white/5 rounded-full">
                          <BarChart3 size={40} className="text-gray-600" />
                        </div>
                        <div>
                          <p className="text-lg font-medium text-gray-400">No patterns detected</p>
                          <p className="text-sm">Start a scan to find new Elliott Wave patterns</p>
                        </div>
                      </div>
                    </div>
                  )}
                </AnimatePresence>
              </div>

              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/5">
                      <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-gray-400">Symbol</th>
                      <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-gray-400">Pattern</th>
                      <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-gray-400">Status</th>
                      <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-gray-400">Wave</th>
                      <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-gray-400">Price</th>
                      <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-gray-400 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    <AnimatePresence mode="popLayout">
                      {filteredResults.length > 0 ? (
                        filteredResults.map((res) => (
                          <motion.tr 
                            layout
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            key={res.symbol}
                            className="hover:bg-white/[0.02] transition-colors group"
                          >
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-yellow-500/10 flex items-center justify-center text-yellow-500 font-bold text-xs">
                                  {res.symbol.charAt(0)}
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-white">{res.symbol}.P</span>
                                  <button 
                                    onClick={() => copyToClipboard(`${res.symbol}.P`)}
                                    className="p-1.5 rounded-md hover:bg-white/10 text-gray-500 hover:text-yellow-500 transition-all active:scale-90"
                                    title="Copy symbol"
                                  >
                                    {copiedSymbol === `${res.symbol}.P` ? (
                                      <Check size={14} className="text-green-500" />
                                    ) : (
                                      <Copy size={14} />
                                    )}
                                  </button>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex flex-col gap-1">
                                <span className={cn(
                                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider w-fit",
                                  res.type === 'BULLISH' 
                                    ? "bg-green-500/10 text-green-400 border border-green-500/20" 
                                    : "bg-red-500/10 text-red-400 border border-red-500/20"
                                )}>
                                  {res.type === 'BULLISH' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                                  {res.type}
                                </span>
                                <span className="text-[10px] text-gray-500 font-medium ml-1">{res.pattern}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className={cn(
                                "text-[10px] font-bold px-2 py-0.5 rounded border",
                                res.status === 'COMPLETE' 
                                  ? "bg-blue-500/10 text-blue-400 border-blue-500/20" 
                                  : "bg-yellow-500/10 text-yellow-500 border-yellow-500/20"
                              )}>
                                {res.status}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-gray-300">Wave {res.wave}</span>
                                <div className="flex gap-0.5">
                                  {[1, 2, 3, 4, 5].map(w => (
                                    <div 
                                      key={w} 
                                      className={cn(
                                        "w-1.5 h-1.5 rounded-full",
                                        w <= res.wave ? "bg-yellow-500" : "bg-white/10"
                                      )} 
                                    />
                                  ))}
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 font-mono text-sm text-gray-300">
                              ${res.lastPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <a 
                                href={`https://www.binance.com/en/futures/${res.symbol}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 text-xs font-semibold text-yellow-500 hover:text-yellow-400 transition-colors"
                              >
                                Trade <Zap size={12} />
                              </a>
                            </td>
                          </motion.tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="px-6 py-20 text-center">
                            <div className="flex flex-col items-center gap-4 text-gray-500">
                              <div className="p-4 bg-white/5 rounded-full">
                                <BarChart3 size={40} className="text-gray-600" />
                              </div>
                              <div>
                                <p className="text-lg font-medium text-gray-400">No patterns detected</p>
                                <p className="text-sm">Start a scan to find new Elliott Wave patterns</p>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-yellow-500/10 rounded-lg">
                  <Clock className="text-yellow-500" size={20} />
                </div>
                <h2 className="text-xl font-bold">Scan History</h2>
              </div>
              
              <div className="space-y-6">
                {history.length > 0 ? (
                  history.map((entry, idx) => (
                    <div key={entry.timestamp} className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                      <div className="bg-white/5 px-4 py-3 flex items-center justify-between border-b border-white/10">
                        <div className="flex items-center gap-2 text-sm font-bold text-gray-300">
                          <Clock size={14} />
                          {new Date(entry.timestamp).toLocaleString()}
                        </div>
                        <span className="text-xs font-medium text-gray-500">
                          {entry.results.length} Signals Found
                        </span>
                      </div>
                      <div className="p-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                          {entry.results.map(res => (
                            <div key={res.symbol} className="bg-black/40 border border-white/5 rounded-lg p-3 flex items-center justify-between group hover:border-yellow-500/30 transition-colors">
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-sm text-white">{res.symbol}.P</span>
                                  <button 
                                    onClick={() => copyToClipboard(`${res.symbol}.P`)}
                                    className="p-1 rounded-md hover:bg-white/10 text-gray-500 hover:text-yellow-500 transition-all active:scale-90"
                                    title="Copy symbol"
                                  >
                                    {copiedSymbol === `${res.symbol}.P` ? (
                                      <Check size={12} className="text-green-500" />
                                    ) : (
                                      <Copy size={12} />
                                    )}
                                  </button>
                                  <span className={cn(
                                    "text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider",
                                    res.type === 'BULLISH' ? "text-green-400 bg-green-400/10 border border-green-400/20" : "text-red-400 bg-red-400/10 border border-red-400/20"
                                  )}>
                                    {res.type}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 text-[10px] text-gray-500">
                                  <span className="font-medium">Wave {res.wave}</span>
                                  <span className="w-1 h-1 rounded-full bg-gray-700" />
                                  <span className="font-mono">${res.lastPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span>
                                </div>
                              </div>
                              <a 
                                href={`https://www.binance.com/en/futures/${res.symbol}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-2 rounded-lg bg-white/5 text-yellow-500 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/10"
                              >
                                <Zap size={14} />
                              </a>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-20 text-center text-gray-500">
                    <p>No history available yet. History is populated after each automatic or manual scan.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Disclaimer */}
        <div className="mt-8 p-4 bg-yellow-500/5 border border-yellow-500/10 rounded-xl flex gap-3 items-start">
          <AlertCircle className="text-yellow-500 shrink-0" size={20} />
          <p className="text-xs text-yellow-500/80 leading-relaxed">
            <strong>Disclaimer:</strong> This scanner uses automated Elliott Wave detection logic. Trading involves significant risk. Always perform your own analysis before making financial decisions. The detection is based on Heikin Ashi candles which may differ from standard price action.
          </p>
        </div>
      </main>

      {/* Loading Overlay */}
      {loading && (
        <div className="fixed inset-0 bg-black z-[100] flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-yellow-500/20 border-t-yellow-500 rounded-full animate-spin" />
            <p className="text-sm font-medium text-gray-400 animate-pulse">Initializing Scanner...</p>
          </div>
        </div>
      )}
    </div>
  );
}
