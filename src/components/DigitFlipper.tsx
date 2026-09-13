import { cn } from "../utils/cn";

interface DigitFlipperProps {
  value: string | number;
  className?: string;
  digitClassName?: string;
  colonClassName?: string;
}

/**
 * Reference mechanical sliding digit animation from refernece/index.html.
 * Translates digit column vertically: `translateY(-${digit * CELL_H}em)` with smooth spring physics.
 * Each cell is 1.4em tall to prevent clipping. Container height matches.
 * Automatically respects `prefers-reduced-motion`.
 */

/** Height of each digit cell — must match the translateY multiplier below. */
const CELL_H = 1.4;

export function DigitFlipper({
  value,
  className,
  digitClassName,
  colonClassName,
}: DigitFlipperProps) {
  const str = String(value);

  return (
    <span
      className={cn(
        "inline-flex items-center select-none tabular-nums tracking-normal leading-none",
        className
      )}
      style={{ gap: "0.04em" }}
    >
      {str.split("").map((char, index) => {
        const isDigit = !isNaN(Number(char)) && char !== " ";

        if (!isDigit) {
          return (
            <span
              key={`char-${index}`}
              className={cn(
                "inline-block opacity-70 leading-none",
                colonClassName
              )}
              style={{ padding: "0 0.06em", marginBottom: "0.08em" }}
            >
              {char}
            </span>
          );
        }

        const digitNum = Number(char);

        return (
          <span
            key={`col-${index}`}
            className={cn(
              "relative inline-block overflow-hidden leading-none",
              digitClassName
            )}
            style={{
              height: `${CELL_H}em`,
              minWidth: "0.62em",
            }}
          >
            <span
              className="flex flex-col w-full text-center transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] motion-reduce:transition-none will-change-transform"
              style={{
                transform: `translateY(-${digitNum * CELL_H}em)`,
              }}
            >
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <span
                  key={num}
                  className="flex items-center justify-center flex-shrink-0 leading-none"
                  style={{ height: `${CELL_H}em` }}
                >
                  {num}
                </span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}
