import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { hexToHsv, hsvToHex } from "../lib/color";
import { cn } from "../utils/cn";

interface AccentColorPickerProps {
  color: string;
  onChange: (hex: string) => void;
}

const PRESET_SWATCHES = [
  "#cba6f7", // Soft Lavender (from screenshot)
  "#89b4fa", // Soft Sky Blue
  "#fab387", // Warm Peach
  "#a6e3a1", // Mint Pastel
  "#f38ba8", // Soft Rose
  "#b4befe", // Periwinkle Lilac
  "#33d6ff", // Electric Cyan (Abyss)
  "#ffb43a", // Amber Glow (Ember)
];

export const AccentColorPicker: React.FC<AccentColorPickerProps> = ({ color, onChange }) => {
  const [open, setOpen] = useState(false);
  const cleanHex = useMemo(() => (color.startsWith("#") ? color.toLowerCase() : `#${color.toLowerCase()}`), [color]);

  // Internal HSV state
  const [hsv, setHsv] = useState(() => hexToHsv(cleanHex));
  const [hexInput, setHexInput] = useState(() => cleanHex.replace("#", "").toUpperCase());

  // Sync internal state when color prop changes externally (e.g. from preset theme buttons)
  useEffect(() => {
    const nextHsv = hexToHsv(cleanHex);
    setHsv(nextHsv);
    setHexInput(cleanHex.replace("#", "").toUpperCase());
  }, [cleanHex]);

  const satValRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const isDraggingSatVal = useRef(false);
  const isDraggingHue = useRef(false);

  // Pure hue color for 2D background: hsl(h, 100%, 50%)
  const pureHueColor = `hsl(${hsv.h}, 100%, 50%)`;

  const emitColor = useCallback(
    (h: number, s: number, v: number) => {
      const newHex = hsvToHex(h, s, v);
      setHexInput(newHex.replace("#", "").toUpperCase());
      onChange(newHex);
    },
    [onChange]
  );

  // 2D Saturation / Value drag handler
  const handleSatValMove = useCallback(
    (e: MouseEvent | TouchEvent) => {
      if (!satValRef.current) return;
      const rect = satValRef.current.getBoundingClientRect();
      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

      const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
      const y = Math.max(0, Math.min(rect.height, clientY - rect.top));

      const s = Math.max(0, Math.min(1, x / rect.width));
      const v = Math.max(0, Math.min(1, 1 - y / rect.height));

      setHsv((prev) => {
        const next = { ...prev, s, v };
        emitColor(next.h, s, v);
        return next;
      });
    },
    [emitColor]
  );

  // 1D Hue slider drag handler
  const handleHueMove = useCallback(
    (e: MouseEvent | TouchEvent) => {
      if (!hueRef.current) return;
      const rect = hueRef.current.getBoundingClientRect();
      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;

      const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
      const h = Math.round(Math.max(0, Math.min(360, (x / rect.width) * 360)));

      setHsv((prev) => {
        const next = { ...prev, h };
        emitColor(h, next.s, next.v);
        return next;
      });
    },
    [emitColor]
  );

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (isDraggingSatVal.current) handleSatValMove(e);
      if (isDraggingHue.current) handleHueMove(e);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (isDraggingSatVal.current) handleSatValMove(e);
      if (isDraggingHue.current) handleHueMove(e);
    };
    const onUp = () => {
      isDraggingSatVal.current = false;
      isDraggingHue.current = false;
    };

    window.addEventListener("mousemove", onMouseMove, { passive: true });
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onUp);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onUp);
    };
  }, [handleSatValMove, handleHueMove]);

  const handleHexInputChange = (val: string) => {
    const cleaned = val.replace(/[^0-9A-Fa-f]/g, "").slice(0, 6);
    setHexInput(cleaned);
    if (cleaned.length === 6) {
      const fullHex = `#${cleaned}`;
      const nextHsv = hexToHsv(fullHex);
      setHsv(nextHsv);
      onChange(fullHex);
    }
  };

  return (
    <div className="mb-4">
      {/* Trigger Bar (Swatches + Hex + Chevron) */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-xl border border-white/12 bg-white/5 px-3 py-2.5 transition-colors hover:border-white/20 hover:bg-white/8"
        aria-expanded={open}
        aria-label="Toggle accent color picker"
      >
        <div className="flex items-center gap-2.5">
          <span
            className="h-5 w-5 rounded-md shadow-sm border border-black/20"
            style={{ background: cleanHex }}
          />
          <span className="font-tmono text-[12.5px] font-semibold tracking-wide text-white">
            {cleanHex}
          </span>
        </div>
        <span
          className={cn(
            "text-[var(--dim)] transition-transform duration-200 text-xs",
            open ? "rotate-180" : ""
          )}
        >
          ▲
        </span>
      </button>

      {/* Popover / Collapsible Panel */}
      {open && (
        <div className="mt-2.5 overflow-hidden rounded-2xl border border-white/12 bg-black/60 p-3.5 shadow-2xl backdrop-blur-md transition-all">
          {/* 2D Saturation / Value Box */}
          <div
            ref={satValRef}
            onMouseDown={(e) => {
              isDraggingSatVal.current = true;
              handleSatValMove(e.nativeEvent);
            }}
            onTouchStart={(e) => {
              isDraggingSatVal.current = true;
              handleSatValMove(e.nativeEvent);
            }}
            className="relative h-44 w-full cursor-crosshair select-none rounded-xl overflow-hidden"
            style={{
              backgroundColor: pureHueColor,
              backgroundImage: `linear-gradient(to right, #fff, transparent), linear-gradient(to top, #000, transparent)`,
            }}
          >
            {/* Draggable indicator ring */}
            <div
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 h-5 w-5 rounded-full border-2 border-white shadow-[0_0_4px_rgba(0,0,0,0.8)]"
              style={{
                left: `${Math.round(hsv.s * 100)}%`,
                top: `${Math.round((1 - hsv.v) * 100)}%`,
                backgroundColor: cleanHex,
              }}
            />
          </div>

          {/* 1D Rainbow Hue Slider */}
          <div className="mt-3 relative flex items-center">
            <div
              ref={hueRef}
              onMouseDown={(e) => {
                isDraggingHue.current = true;
                handleHueMove(e.nativeEvent);
              }}
              onTouchStart={(e) => {
                isDraggingHue.current = true;
                handleHueMove(e.nativeEvent);
              }}
              className="h-4 w-full cursor-pointer rounded-full"
              style={{
                background: `linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)`,
              }}
            >
              {/* Hue thumb ring */}
              <div
                className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 top-1/2 h-5 w-5 rounded-full border-2 border-white shadow-[0_0_5px_rgba(0,0,0,0.9)]"
                style={{
                  left: `${Math.max(0, Math.min(100, (hsv.h / 360) * 100))}%`,
                  backgroundColor: `hsl(${hsv.h}, 100%, 50%)`,
                }}
              />
            </div>
          </div>

          {/* Hex Input Row */}
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-white/12 bg-white/4 px-3 py-2">
            <span className="font-tmono text-xs font-bold text-[var(--dim)] select-none">#</span>
            <input
              type="text"
              value={hexInput}
              onChange={(e) => handleHexInputChange(e.target.value)}
              maxLength={6}
              placeholder="CBA6F7"
              className="w-full bg-transparent font-tmono text-xs font-semibold uppercase tracking-wider text-white outline-none placeholder:text-white/20"
            />
            <span
              className="h-3.5 w-3.5 shrink-0 rounded-full border border-white/20"
              style={{ background: cleanHex }}
            />
          </div>

          {/* Quick Swatches Row */}
          <div className="mt-3 grid grid-cols-4 sm:grid-cols-8 gap-1.5 pt-1 border-t border-white/8">
            {PRESET_SWATCHES.map((swatch) => {
              const active = cleanHex === swatch.toLowerCase();
              return (
                <button
                  key={swatch}
                  onClick={() => {
                    const nextHsv = hexToHsv(swatch);
                    setHsv(nextHsv);
                    setHexInput(swatch.replace("#", "").toUpperCase());
                    onChange(swatch);
                  }}
                  title={swatch}
                  className={cn(
                    "relative aspect-square rounded-lg border transition-transform hover:scale-110",
                    active
                      ? "border-white scale-105 shadow-[0_0_8px_rgba(255,255,255,0.6)]"
                      : "border-black/30 hover:border-white/50"
                  )}
                  style={{ background: swatch }}
                >
                  {active && (
                    <span className="absolute inset-0 m-auto h-1.5 w-1.5 rounded-full bg-white shadow-sm" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
