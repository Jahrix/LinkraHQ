import React, { useState, useRef, useEffect } from "react";

export interface SelectOption {
    value: string;
    label: string;
}

interface SelectProps {
    value: string | string[];
    onChange: (value: any) => void;
    options: SelectOption[];
    className?: string;
    placeholder?: string;
    multiple?: boolean;
}

export default function Select({
    value,
    onChange,
    options,
    className = "",
    placeholder = "Select...",
    multiple = false
}: SelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const getDisplayValue = () => {
        if (multiple && Array.isArray(value)) {
            if (value.length === 0) return placeholder;
            if (value.length === 1) return options.find((o) => o.value === value[0])?.label || placeholder;
            return `${value.length} selected`;
        }
        const singleSelected = options.find((o) => o.value === String(value));
        return singleSelected ? singleSelected.label : placeholder;
    };

    const handleSelect = (optionValue: string) => {
        if (multiple && Array.isArray(value)) {
            if (value.includes(optionValue)) {
                onChange(value.filter((v) => v !== optionValue));
            } else {
                onChange([...value, optionValue]);
            }
        } else {
            onChange(optionValue);
            setIsOpen(false);
        }
    };

    return (
        <div className={`relative ${className}`} ref={containerRef}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="input w-full flex items-center justify-between text-left cursor-pointer"
                aria-haspopup="listbox"
                aria-expanded={isOpen}
            >
                <span className="truncate">{getDisplayValue()}</span>
                <svg
                    className={`w-4 h-4 text-muted transition-transform flex-shrink-0 ml-2 ${isOpen ? "rotate-180" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {isOpen && (
                <div className="absolute z-[100] mt-2 w-full glass-panel glass-standard border border-stroke/50 bg-[rgba(15,20,28,0.95)] max-h-60 overflow-y-auto no-scrollbar shadow-2xl origin-top animate-in fade-in slide-in-from-top-1 duration-150 rounded-xl">
                    <ul role="listbox" className="p-1 m-0 list-none">
                        {options.length === 0 && (
                            <li className="px-3 py-2 text-sm text-muted text-center italic">No options</li>
                        )}
                        {options.map((option) => {
                            const isActive = multiple && Array.isArray(value)
                                ? value.includes(option.value)
                                : option.value === String(value);

                            return (
                                <li
                                    key={option.value}
                                    role="option"
                                    aria-selected={isActive}
                                    onClick={() => handleSelect(option.value)}
                                    className={`
                    px-3 py-2 cursor-pointer rounded-lg text-sm transition-colors flex items-center justify-between gap-2
                    ${isActive ? "bg-accent/20 text-accent font-medium" : "text-strong hover:bg-white/5"}
                  `}
                                >
                                    <span className="truncate">{option.label}</span>
                                    {isActive && (
                                        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
        </div>
    );
}
