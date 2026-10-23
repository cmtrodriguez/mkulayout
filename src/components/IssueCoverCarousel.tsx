import React, { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, FileText, Newspaper } from "lucide-react";

// The current issues and their published front covers. Google Drive renders the first
// page of a shared PDF at its thumbnail endpoint, so each cover is a plain image and
// needs no viewer embed; the /view link is what the cover opens. That endpoint refuses
// any request carrying a non-Google Referer, hence referrerPolicy="no-referrer".
const ISSUE_COVERS = [
  {
    label: "1K1-2",
    fileId: "1eHUhpqFtPEj07uCG9Hoc47sweVbzc59y",
    url: "https://drive.google.com/file/d/1eHUhpqFtPEj07uCG9Hoc47sweVbzc59y/view?usp=drive_link",
  },
  {
    label: "1K3-4",
    fileId: "1z8baF1AbGRy9T2wh6my6zfH9ooWO4uO1",
    url: "https://drive.google.com/file/d/1z8baF1AbGRy9T2wh6my6zfH9ooWO4uO1/view?usp=drive_link",
  },
  {
    label: "1K5",
    fileId: "1oDTnQQ2oJmv9OwAOzOmpZVdABh2FUq8v",
    url: "https://drive.google.com/file/d/1oDTnQQ2oJmv9OwAOzOmpZVdABh2FUq8v/view?usp=drive_link",
  },
];

const AUTO_ADVANCE_MS = 4500;
const SWIPE_MIN_PX = 40;

export default function IssueCoverCarousel() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const touchStartX = useRef<number | null>(null);

  const step = (delta: number) =>
    setIndex((current) => (current + delta + ISSUE_COVERS.length) % ISSUE_COVERS.length);

  useEffect(() => {
    if (paused || ISSUE_COVERS.length < 2) return;
    const timer = window.setInterval(() => step(1), AUTO_ADVANCE_MS);
    return () => window.clearInterval(timer);
  }, [paused]);

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-2xl sm:rounded-3xl border border-brand-maroon/20 dark:border-brand-maroon/40 shadow-sm overflow-hidden flex flex-col">
      <div className="bg-gradient-to-r from-brand-maroon to-brand-maroon-dark px-3.5 sm:px-5 py-2.5 sm:py-3.5 flex items-center gap-2.5">
        <div className="p-1.5 sm:p-2 bg-white/15 rounded-lg sm:rounded-xl text-white shrink-0">
          <Newspaper className="w-4 h-4 sm:w-5 sm:h-5" />
        </div>
        <div className="min-w-0">
          <h3 className="font-display font-black text-white text-xs sm:text-base leading-tight truncate">
            Current Issue Front Covers
          </h3>
          <p className="text-[9px] sm:text-[10px] text-brand-maroon-light font-semibold truncate">
            Press a cover to open the issue
          </p>
        </div>
      </div>

      <div
        className="relative p-3.5 sm:p-4 flex-1"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onTouchStart={(e) => {
          touchStartX.current = e.touches[0].clientX;
          setPaused(true);
        }}
        onTouchEnd={() => {
          touchStartX.current = null;
          setPaused(false);
        }}
        onTouchMove={(e) => {
          if (touchStartX.current === null) return;
          const delta = e.touches[0].clientX - touchStartX.current;
          if (Math.abs(delta) < SWIPE_MIN_PX) return;
          step(delta < 0 ? 1 : -1);
          touchStartX.current = e.touches[0].clientX;
        }}
      >
        <div
          className="flex transition-transform duration-500 ease-out"
          style={{ transform: `translateX(-${index * 100}%)` }}
          aria-live="polite"
        >
          {ISSUE_COVERS.map((cover, slide) => (
            <a
              key={cover.fileId}
              href={cover.url}
              target="_blank"
              rel="noopener noreferrer"
              className="relative w-full shrink-0 aspect-[800/945] bg-neutral-100 dark:bg-neutral-800 rounded-xl sm:rounded-2xl overflow-hidden group focus:outline-none focus:ring-2 focus:ring-brand-maroon"
              aria-label={`Open the front cover of issue ${cover.label} in Google Drive`}
              aria-hidden={slide !== index}
              tabIndex={slide === index ? 0 : -1}
              title={`Issue ${cover.label} — opens in a new tab`}
            >
              {failed[cover.fileId] ? (
                <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-center px-4">
                  <FileText className="w-8 h-8 text-brand-maroon/60" />
                  <p className="font-display font-black text-neutral-800 dark:text-neutral-100 text-sm">
                    Issue {cover.label}
                  </p>
                  <p className="text-[10px] text-neutral-500 dark:text-neutral-400 font-semibold">
                    Cover preview unavailable — press to open the issue
                  </p>
                </div>
              ) : (
                <img
                  src={`https://drive.google.com/thumbnail?id=${cover.fileId}&sz=w800`}
                  alt={`Front cover of issue ${cover.label}`}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                  onError={() => setFailed((prev) => ({ ...prev, [cover.fileId]: true }))}
                />
              )}

              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent px-3 py-2.5 flex items-center justify-between gap-2">
                <span className="font-display font-black text-white text-xs sm:text-sm tracking-wide">
                  {cover.label}
                </span>
                <span className="flex items-center gap-1 text-[9px] sm:text-[10px] font-bold text-white/90 uppercase tracking-wider">
                  Open <ExternalLink className="w-3 h-3" />
                </span>
              </div>
            </a>
          ))}
        </div>

        <button
          onClick={() => step(-1)}
          className="absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 p-1.5 bg-white/85 dark:bg-neutral-900/85 border border-neutral-200/70 dark:border-neutral-700 rounded-full text-neutral-700 dark:text-neutral-200 hover:text-brand-maroon hover:border-brand-maroon/40 shadow-sm cursor-pointer transition-all"
          aria-label="Previous issue cover"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          onClick={() => step(1)}
          className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 p-1.5 bg-white/85 dark:bg-neutral-900/85 border border-neutral-200/70 dark:border-neutral-700 rounded-full text-neutral-700 dark:text-neutral-200 hover:text-brand-maroon hover:border-brand-maroon/40 shadow-sm cursor-pointer transition-all"
          aria-label="Next issue cover"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center justify-center gap-1.5 pb-3">
        {ISSUE_COVERS.map((cover, slide) => (
          <button
            key={cover.fileId}
            onClick={() => setIndex(slide)}
            className={`h-1.5 rounded-full transition-all cursor-pointer ${
              slide === index ? "w-5 bg-brand-maroon" : "w-1.5 bg-neutral-300 dark:bg-neutral-600 hover:bg-brand-maroon/50"
            }`}
            aria-label={`Show issue ${cover.label} cover`}
            aria-current={slide === index}
          />
        ))}
      </div>
    </div>
  );
}
