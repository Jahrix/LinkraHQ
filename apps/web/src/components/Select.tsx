import React, { useState, useRef, useEffect, useCallback, useId, useLayoutEffect } from "react";
import { createPortal } from "react-dom";

export interface SelectOption {
    value: string;
    label: string;
}

interface SelectBaseProps {
    options: SelectOption[];
    className?: string;
    placeholder?: string;
}

interface SelectSingleProps extends SelectBaseProps {
    value: string;
    onChange: (value: string) => void;
    multiple?: false;
}

interface SelectMultipleProps extends SelectBaseProps {
    value: string[];
    onChange: (value: string[]) => void;
    multiple: true;
}

type SelectProps = SelectSingleProps | SelectMultipleProps;

export default function Select({
    value,
    onChange,
    options,
    className = "",
    placeholder = "Select...",
    multiple = false
}: SelectProps) {
    const listboxId = useId();
    const [isOpen, setIsOpen] = useState(false);
    const [focusedIndex, setFocusedIndex] = useState(-1);
    const containerRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLUListElement>(null);
    const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

    const selectedIndex = options.findIndex((option) =>
        multiple && Array.isArray(value)
            ? value.includes(option.value)
            : option.value === String(value)
    );

    const openSelect = useCallback(() => {
        setIsOpen(true);
        setFocusedIndex(selectedIndex >= 0 ? selectedIndex : 0);
    }, [selectedIndex]);

    const closeSelect = useCallback(() => {
        setIsOpen(false);
        setFocusedIndex(-1);
    }, []);

    // Position the portal dropdown relative to the trigger button
    useLayoutEffect(() => {
        if (!isOpen || !containerRef.current) return;

        const updateDropdownStyle = () => {
            if (!containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            const width = Math.min(rect.width, viewportWidth - 16);
            const spaceBelow = viewportHeight - rect.bottom - 12;
            const spaceAbove = rect.top - 12;
            const openAbove = spaceBelow < 240 && spaceAbove > spaceBelow;
            const maxHeight = Math.max(160, Math.min(320, openAbove ? spaceAbove : spaceBelow));
            const left = Math.min(Math.max(8, rect.left), viewportWidth - width - 8);
            setDropdownStyle({
                position: "fixed",
                top: openAbove ? undefined : rect.bottom + 8,
                bottom: openAbove ? viewportHeight - rect.top + 8 : undefined,
                left,
                width,
                maxHeight,
                zIndex: 9999,
            });
        };

        updateDropdownStyle();
        window.addEventListener("resize", updateDropdownStyle);
        window.addEventListener("scroll", updateDropdownStyle, true);

        return () => {
            window.removeEventListener("resize", updateDropdownStyle);
            window.removeEventListener("scroll", updateDropdownStyle, true);
        };
    }, [isOpen]);

    // Close on outside click
    const portalRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!isOpen) return;
        function handlePointerDown(event: PointerEvent) {
            const target = event.target as Node;
            if (containerRef.current?.contains(target)) return;
            if (portalRef.current?.contains(target)) return;
            closeSelect();
        }
        document.addEventListener("pointerdown", handlePointerDown);
        return () => document.removeEventListener("pointerdown", handlePointerDown);
    }, [closeSelect, isOpen]);

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
            const next = value.includes(optionValue)
                ? value.filter((v) => v !== optionValue)
                : [...value, optionValue];
            (onChange as (v: string[]) => void)(next);
        } else {
            (onChange as (v: string) => void)(optionValue);
            closeSelect();
        }
    }, [closeSelect, multiple, value, onChange]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!isOpen) {
            if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
                e.preventDefault();
                openSelect();
            }
            return;
        }

        switch (e.key) {
            case "Escape":
                e.preventDefault();
                closeSelect();
                break;
            case "ArrowDown":
                e.preventDefault();
                setFocusedIndex((prev) => Math.min(prev + 1, options.length - 1));
                break;
            case "ArrowUp":
                e.preventDefault();
                setFocusedIndex((prev) => Math.max(prev - 1, 0));
                break;
            case "Home":
                e.preventDefault();
                setFocusedIndex(0);
                break;
            case "End":
                e.preventDefault();
                setFocusedIndex(Math.max(options.length - 1, 0));
                break;
            case "Enter":
            case " ":
                e.preventDefault();
                if (focusedIndex >= 0 && options[focusedIndex]) {
                    handleSelect(options[focusedIndex].value);
                }
                break;
            case "Tab":
                closeSelect();
                break;
        }
    };

    const dropdown = isOpen && createPortal(
        <div
            ref={portalRef}
            style={dropdownStyle}
            className="overflow-y-auto no-scrollbar shadow-2xl origin-top animate-in fade-in slide-in-from-top-1 duration-150 rounded-xl border border-stroke/50 bg-[rgba(15,20,28,0.97)] backdrop-blur-xl"
        >
            <ul
                ref={listRef}
                id={listboxId}
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
                            id={`${listboxId}-${idx}`}
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
                onClick={() => (isOpen ? closeSelect() : openSelect())}
                onKeyDown={handleKeyDown}
                className="input w-full flex items-center justify-between text-left cursor-pointer"
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                aria-controls={isOpen ? listboxId : undefined}
                aria-activedescendant={isOpen && focusedIndex >= 0 ? `${listboxId}-${focusedIndex}` : undefined}
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
