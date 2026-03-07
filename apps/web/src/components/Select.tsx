import React, { useState, useRef, useEffect, useCallback, useLayoutEffect } from "react";
import { createPortal } from "react-dom";

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
    const [focusedIndex, setFocusedIndex] = useState(-1);
    const containerRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLUListElement>(null);
    const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

    // Position the portal dropdown relative to the trigger button
    useLayoutEffect(() => {
        if (!isOpen || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        setDropdownStyle({
            position: "fixed",
            top: rect.bottom + 8,
            left: rect.left,
            width: rect.width,
            zIndex: 9999,
        });
    }, [isOpen]);

    // Close on outside click
    const portalRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!isOpen) return;
        function handlePointerDown(event: MouseEvent) {
            const target = event.target as Node;
            if (containerRef.current?.contains(target)) return;
            if (portalRef.current?.contains(target)) return;
            setIsOpen(false);
            setFocusedIndex(-1);
        }
        document.addEventListener("mousedown", handlePointerDown);
        return () => document.removeEventListener("mousedown", handlePointerDown);
    }, [isOpen]);

    // Scroll focused item into view
    useEffect(() => {
        if (!isOpen || focusedIndex < 0) return;
        const list = listRef.current;
        if (!list) return;
        const item = list.children[focusedIndex] as HTMLElement | undefined;
        item?.scrollIntoView({ block: "nearest" });
    }, [focusedIndex, isOpen]);

    const getDisplayValue = () => {
        if (multiple && Array.isArray(value)) {
            if (value.length === 0) return placeholder;
            if (value.length === 1) return options.find((o) => o.value === value[0])?.label || placeholder;
            return `${value.length} selected`;
        }
        const singleSelected = options.find((o) => o.value === String(value));
        return singleSelected ? singleSelected.label : placeholder;
    };

    const handleSelect = useCallback((optionValue: string) => {
        if (multiple && Array.isArray(value)) {
            if (value.includes(optionValue)) {
                onChange(value.filter((v) => v !== optionValue));
            } else {
                onChange([...value, optionValue]);
            }
        } else {
            onChange(optionValue);
            setIsOpen(false);
            setFocusedIndex(-1);
        }
    }, [multiple, value, onChange]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!isOpen) {
            if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
                e.preventDefault();
                setIsOpen(true);
                setFocusedIndex(0);
            }
            return;
        }

        switch (e.key) {
            case "Escape":
                e.preventDefault();
                setIsOpen(false);
                setFocusedIndex(-1);
                break;
            case "ArrowDown":
                e.preventDefault();
                setFocusedIndex((prev) => Math.min(prev + 1, options.length - 1));
                break;
            case "ArrowUp":
                e.preventDefault();
                setFocusedIndex((prev) => Math.max(prev - 1, 0));
                break;
            case "Enter":
            case " ":
                e.preventDefault();
                if (focusedIndex >= 0 && options[focusedIndex]) {
                    handleSelect(options[focusedIndex].value);
                }
                break;
            case "Tab":
                setIsOpen(false);
                setFocusedIndex(-1);
                break;
        }
    };

    const dropdown = isOpen && createPortal(
        <div
            ref={portalRef}
            style={dropdownStyle}
            className="max-h-60 overflow-y-auto no-scrollbar shadow-2xl origin-top animate-in fade-in slide-in-from-top-1 duration-150 rounded-xl border border-stroke/50 bg-[rgba(15,20,28,0.97)] backdrop-blur-xl"
        >
            <ul
                ref={listRef}
                role="listbox"
                className="p-1 m-0 list-none"
                aria-multiselectable={multiple}
            >
                {options.length === 0 && (
                    <li className="px-3 py-2 text-sm text-muted text-center italic">No options</li>
                )}
                {options.map((option, idx) => {
                    const isActive = multiple && Array.isArray(value)
                        ? value.includes(option.value)
                        : option.value === String(value);
                    const isFocused = idx === focusedIndex;

                    return (
                        <li
                            key={option.value}
                            role="option"
                            aria-selected={isActive}
                            onMouseDown={(e) => {
                                e.preventDefault();
                                handleSelect(option.value);
                            }}
                            onMouseEnter={() => setFocusedIndex(idx)}
                            className={`
                    px-3 py-2 cursor-pointer rounded-lg text-sm transition-colors flex items-center justify-between gap-2
                    ${isActive ? "bg-accent/20 text-accent font-medium" : "text-strong"}
                    ${isFocused && !isActive ? "bg-white/8" : ""}
                    ${!isFocused && !isActive ? "hover:bg-white/5" : ""}
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
        </div>,
        document.body
    );

    return (
        <div className={`relative ${className}`} ref={containerRef}>
            <button
                type="button"
                onClick={() => {
                    setIsOpen((prev) => !prev);
                    if (!isOpen) setFocusedIndex(0);
                }}
                onKeyDown={handleKeyDown}
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
            {dropdown}
        </div>
    );
}
