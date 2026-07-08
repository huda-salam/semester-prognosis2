import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, ChevronDown, Check, X } from 'lucide-react';

interface SkpdAutocompleteProps {
  options: { kode: string; uraian: string }[];
  selectedValue: string;
  onChange: (kode: string) => void;
  disabled?: boolean;
}

export const SkpdAutocomplete: React.FC<SkpdAutocompleteProps> = ({
  options,
  selectedValue,
  onChange,
  disabled = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedOption = useMemo(() => {
    return options.find(opt => opt.kode === selectedValue);
  }, [options, selectedValue]);

  // Reset query on selected option change or close
  useEffect(() => {
    if (selectedOption) {
      setSearchQuery('');
    }
  }, [selectedOption]);

  // Filter options based on search query
  const filteredOptions = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return options;
    return options.filter(opt => 
      opt.uraian.toLowerCase().includes(q) || 
      opt.kode.toLowerCase().includes(q)
    );
  }, [options, searchQuery]);

  // Reset active keyboard focus index on filter changes
  useEffect(() => {
    setActiveIndex(-1);
  }, [searchQuery]);

  // Click away listener
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (kode: string) => {
    onChange(kode);
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      } else {
        setActiveIndex(prev => (prev + 1) % filteredOptions.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (isOpen) {
        setActiveIndex(prev => (prev - 1 + filteredOptions.length) % filteredOptions.length);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (isOpen && activeIndex >= 0 && activeIndex < filteredOptions.length) {
        handleSelect(filteredOptions[activeIndex].kode);
      } else if (!isOpen) {
        setIsOpen(true);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  // Scroll active element into view
  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const activeEl = listRef.current.children[activeIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [activeIndex]);

  if (disabled) {
    return (
      <div className="flex items-center space-x-2 bg-gray-50 border border-gray-150 rounded-xl px-3.5 py-2 max-w-[320px] select-none">
        <span className="text-[10px] font-mono font-bold text-gray-400 truncate max-w-[80px]">
          {selectedOption?.kode || selectedValue}
        </span>
        <span className="text-xs font-semibold text-gray-500 truncate max-w-[180px]">
          {selectedOption?.uraian || selectedValue}
        </span>
      </div>
    );
  }

  return (
    <div id="skpd-autocomplete-container" ref={containerRef} className="relative max-w-[320px] w-full text-left font-sans z-50">
      {/* Target Trigger Box */}
      <button
        id="skpd-autocomplete-trigger"
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          setTimeout(() => inputRef.current?.focus(), 100);
        }}
        onKeyDown={handleKeyDown}
        className="w-full flex items-center justify-between bg-white border border-gray-200 hover:border-gray-300 active:border-gray-400 rounded-xl px-3.5 py-2 shadow-sm transition-all text-xs cursor-pointer focus:outline-none focus:ring-1 focus:ring-emerald-500"
      >
        <span className="flex items-center space-x-2 truncate">
          <span className="text-[9px] font-mono font-bold text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-200/50 flex-shrink-0">
            {selectedOption ? selectedOption.kode.split('.').pop() || selectedOption.kode : 'CODE'}
          </span>
          <span className="font-semibold text-gray-800 truncate">
            {selectedOption ? selectedOption.uraian : 'Pilih SKPD / Instansi'}
          </span>
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-400 ml-2 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Popover list */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 mt-1.5 w-[360px] md:w-[400px] bg-white border border-gray-150 rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[350px]"
          >
            {/* Search Input Box */}
            <div className="p-2 border-b border-gray-100 flex items-center bg-gray-50/50 space-x-2 sticky top-0">
              <Search className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              <input
                id="skpd-autocomplete-search-input"
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Cari nama atau kode SKPD..."
                className="w-full text-xs font-semibold text-gray-800 bg-transparent border-none outline-none focus:ring-0 p-1"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="p-1 text-gray-400 hover:text-gray-600 rounded"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* List Option Container */}
            <div
              id="skpd-autocomplete-options-list"
              ref={listRef}
              className="overflow-y-auto max-h-[290px] divide-y divide-gray-50/60"
            >
              {filteredOptions.length === 0 ? (
                <div className="py-8 px-4 text-center text-xs text-gray-400 font-medium">
                  SKPD tidak ditemukan.
                </div>
              ) : (
                filteredOptions.map((opt, idx) => {
                  const isSelected = opt.kode === selectedValue;
                  const isHighlighted = idx === activeIndex;

                  return (
                    <button
                      key={opt.kode}
                      type="button"
                      onClick={() => handleSelect(opt.kode)}
                      className={`w-full text-left px-3.5 py-2.5 text-xs transition-colors flex items-start space-x-2 cursor-pointer ${
                        isSelected 
                          ? 'bg-emerald-50 text-emerald-800' 
                          : isHighlighted 
                            ? 'bg-gray-100 text-gray-900' 
                            : 'hover:bg-gray-50 text-gray-700'
                      }`}
                    >
                      {/* Check indicator */}
                      <div className="flex-shrink-0 mt-0.5">
                        {isSelected ? (
                          <div className="bg-emerald-500 rounded-full p-0.5 text-white">
                            <Check className="w-2.5 h-2.5 stroke-[3px]" />
                          </div>
                        ) : (
                          <div className="w-3.5 h-3.5 rounded border border-gray-200" />
                        )}
                      </div>

                      {/* Code and Description */}
                      <div className="flex-1 min-w-0">
                        <span className="block text-[9px] font-mono font-bold text-gray-400 mb-0.5 tracking-wider uppercase">
                          {opt.kode}
                        </span>
                        <span className={`block truncate font-semibold leading-normal ${isSelected ? 'text-emerald-950' : 'text-gray-800'}`}>
                          {opt.uraian}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer indicator count */}
            <div className="bg-gray-50 p-2 text-center text-[9px] text-gray-400 font-bold border-t border-gray-100 uppercase tracking-widest flex items-center justify-between px-3">
              <span>Navigasi: ↑↓ Enter</span>
              <span>Terpilih: {filteredOptions.length} instansi</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
