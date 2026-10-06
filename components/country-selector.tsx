"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";

type CountryOption = {
  code: string;
  name: string;
  flag: string;
  enabled: boolean;
};

const COUNTRIES: CountryOption[] = [
  { code: "IN", name: "India", flag: "🇮🇳", enabled: true },
  { code: "US", name: "United States", flag: "🇺🇸", enabled: false },
  { code: "CA", name: "Canada", flag: "🇨🇦", enabled: false },
  { code: "GB", name: "United Kingdom", flag: "🇬🇧", enabled: false },
  { code: "AU", name: "Australia", flag: "🇦🇺", enabled: false },
  { code: "SG", name: "Singapore", flag: "🇸🇬", enabled: false },
  { code: "AE", name: "United Arab Emirates", flag: "🇦🇪", enabled: false }
];

export default function CountrySelector({
  className = "",
  menuClassName = ""
}: {
  className?: string;
  menuClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [selectedCode, setSelectedCode] = useState("IN");
  const [activeCode, setActiveCode] = useState("IN");
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const optionRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const listboxId = useId();

  const selected = COUNTRIES.find((country) => country.code === selectedCode) ?? COUNTRIES[0];

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      const root = triggerRef.current?.parentElement;
      if (root && !root.contains(target)) setOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    optionRefs.current[activeCode]?.focus();
  }, [activeCode, open]);

  function enabledCountries() {
    return COUNTRIES.filter((country) => country.enabled);
  }

  function moveActive(direction: 1 | -1) {
    const enabled = enabledCountries();
    const currentIndex = enabled.findIndex((country) => country.code === activeCode);
    const nextIndex =
      currentIndex < 0
        ? 0
        : (currentIndex + direction + enabled.length) % enabled.length;
    setActiveCode(enabled[nextIndex]?.code ?? selectedCode);
  }

  function handleTriggerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActiveCode(selectedCode);
      setOpen(true);
    }
  }

  function selectCountry(country: CountryOption) {
    if (!country.enabled) return;
    setSelectedCode(country.code);
    setActiveCode(country.code);
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <div className={"relative " + className}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={"Country. Selected " + selected.name}
        onClick={() => {
          setActiveCode(selectedCode);
          setOpen((current) => !current);
        }}
        onKeyDown={handleTriggerKeyDown}
        className="inline-flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:w-auto"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <span aria-hidden="true" className="text-base leading-none">
            {selected.flag}
          </span>
          <span className="truncate">{selected.name}</span>
        </span>
        <ChevronDown
          className={"size-4 shrink-0 text-slate-500 transition " + (open ? "rotate-180" : "")}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div
          className={
            "absolute right-0 top-[calc(100%+0.5rem)] z-[70] w-[min(18rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-[0_18px_50px_rgba(15,23,42,0.16)] " +
            menuClassName
          }
        >
          <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
            Choose country
          </div>
          <div id={listboxId} role="listbox" aria-label="Country options" className="grid gap-1">
            {COUNTRIES.map((country) => (
              <button
                key={country.code}
                ref={(node) => {
                  optionRefs.current[country.code] = node;
                }}
                type="button"
                role="option"
                aria-selected={selectedCode === country.code}
                disabled={!country.enabled}
                tabIndex={country.enabled ? 0 : -1}
                onClick={() => selectCountry(country)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    moveActive(1);
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    moveActive(-1);
                  } else if (event.key === "Home") {
                    event.preventDefault();
                    setActiveCode(enabledCountries()[0]?.code ?? selectedCode);
                  } else if (event.key === "End") {
                    event.preventDefault();
                    const enabled = enabledCountries();
                    setActiveCode(enabled.at(-1)?.code ?? selectedCode);
                  } else if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    selectCountry(country);
                  }
                }}
                className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-800 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span aria-hidden="true" className="text-base leading-none">
                  {country.flag}
                </span>
                <span className="min-w-0 flex-1 truncate">{country.name}</span>
                {country.enabled ? (
                  selectedCode === country.code ? (
                    <Check className="size-4 shrink-0 text-blue-600" aria-hidden="true" />
                  ) : null
                ) : (
                  <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                    Coming soon
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
