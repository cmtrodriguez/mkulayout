import React, { useEffect, useState } from "react";
import { BookOpen, ExternalLink, ImageOff, X, ZoomIn } from "lucide-react";
import { GUIDELINE_REMINDERS, GUIDELINE_SECTIONS } from "../lib/indesignGuidelines";
import { ISSUE_TEMPLATE_LINK } from "../lib/canvaTemplates";

interface ZoomedPicture {
  src: string;
  caption: string;
}

/** One step's picture cell: a zoomable thumbnail, or the slot waiting for one. */
function PictureCell({
  src, caption, onZoom
}: { src?: string; caption: string; onZoom: (picture: ZoomedPicture) => void }) {
  if (!src) {
    return (
      <div className="w-full h-14 rounded-lg border border-dashed border-neutral-200 dark:border-neutral-700 flex flex-col items-center justify-center gap-0.5 text-neutral-300 dark:text-neutral-600">
        <ImageOff className="w-3.5 h-3.5" />
        <span className="text-[9px] font-bold uppercase tracking-wide">Picture to be added</span>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onZoom({ src, caption })}
      title="Zoom in on this screenshot"
      className="group relative block w-full h-14 rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden cursor-zoom-in bg-white dark:bg-neutral-800"
    >
      <img src={src} alt={caption} className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-[1.06]" />
      <span className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity">
        <ZoomIn className="w-4 h-4 text-white" />
      </span>
    </button>
  );
}

export default function InDesignGuidelines() {
  const [zoomed, setZoomed] = useState<ZoomedPicture | null>(null);

  useEffect(() => {
    if (!zoomed) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setZoomed(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [zoomed]);

  const jumpTo = (id: string) => {
    document.getElementById(`guideline-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <section className="bg-white dark:bg-neutral-900 border border-neutral-200/70 dark:border-neutral-800 rounded-xl sm:rounded-2xl shadow-sm overflow-hidden text-left">
      {/* Header */}
      <div className="px-4 sm:px-6 py-4 bg-gradient-to-r from-neutral-50 to-neutral-100/50 dark:from-neutral-800 dark:to-neutral-800/60 border-b border-neutral-150 dark:border-neutral-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="p-1.5 bg-brand-maroon/10 rounded-xl text-brand-maroon shrink-0">
            <BookOpen className="w-4.5 h-4.5" />
          </div>
          <div className="min-w-0">
            <h2 className="font-sans font-black text-sm sm:text-base text-stone-900 dark:text-neutral-100 tracking-tight">
              MKule InDesign Guidelines
            </h2>
            <p className="text-[10px] sm:text-[11px] text-stone-500 dark:text-neutral-400 font-medium">
              Adobe InDesign step-by-step guide for every assigned issue page, from the template to the final upload.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {GUIDELINE_SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => jumpTo(section.id)}
              title={section.title}
              className="px-2 sm:px-2.5 py-1.5 rounded-lg text-[10px] sm:text-[11px] font-bold cursor-pointer border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:border-brand-maroon/40 transition-all"
            >
              {section.title.split(".")[0]}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 sm:px-6 py-4 space-y-6">
        {GUIDELINE_SECTIONS.map((section) => {
          // Steps are numbered across the whole section, so a lettered part
          // carries the count on from the part before it.
          let stepNumber = 0;
          return (
            <div key={section.id} id={`guideline-${section.id}`} className="scroll-mt-20">
              <h3 className="font-sans font-black text-xs sm:text-sm text-stone-900 dark:text-neutral-100 uppercase tracking-tight">
                {section.title}
              </h3>
              {section.intro && (
                <p className="mt-1 text-[11px] sm:text-xs text-neutral-600 dark:text-neutral-300 font-medium">{section.intro}</p>
              )}

              <div className="mt-2 overflow-x-auto">
                <table className="w-full table-fixed border-collapse text-left">
                  <thead>
                    <tr className="bg-neutral-50 dark:bg-neutral-800/60 border-y border-neutral-150 dark:border-neutral-800">
                      <th scope="col" className="px-2 sm:px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 w-8 sm:w-10 align-middle">
                        No.
                      </th>
                      <th scope="col" className="px-2 sm:px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 align-middle">
                        Guidelines and Instructions
                      </th>
                      <th scope="col" className="px-2 sm:px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-brand-maroon dark:text-brand-maroon-light border-l border-neutral-150 dark:border-neutral-800 w-[84px] sm:w-[132px] align-middle">
                        Picture
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {section.parts.map((part, partIndex) => (
                      <React.Fragment key={part.heading || `part-${partIndex}`}>
                        {part.heading && (
                          <tr>
                            <th colSpan={3} scope="colgroup" className="px-3 py-1.5 bg-brand-maroon/5 dark:bg-brand-maroon/10 text-left text-[10px] sm:text-[11px] font-black text-brand-maroon dark:text-brand-maroon-light uppercase tracking-wide border-y border-brand-maroon/10">
                              {part.heading}
                            </th>
                          </tr>
                        )}
                        {part.steps.map((step) => {
                          stepNumber += 1;
                          return (
                            <tr key={stepNumber} className="border-b border-neutral-100 dark:border-neutral-800 align-top">
                              <th scope="row" className="px-2 sm:px-3 py-2.5 text-[11px] font-black text-neutral-400 dark:text-neutral-500 tabular-nums">
                                {stepNumber}
                              </th>
                              <td className="px-2 sm:px-3 py-2.5 text-[11px] sm:text-xs leading-relaxed text-neutral-700 dark:text-neutral-200">
                                {step.text}
                              </td>
                              <td className="px-2 sm:px-3 py-2.5 border-l border-neutral-100 dark:border-neutral-800">
                                <PictureCell
                                  src={step.image}
                                  caption={`${section.title} — step ${stepNumber}`}
                                  onZoom={setZoomed}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}

        {/* The standing reminders every staffer is held to */}
        <div id="guideline-reminders" className="scroll-mt-20">
          <h3 className="font-sans font-black text-xs sm:text-sm text-stone-900 dark:text-neutral-100 uppercase tracking-tight">
            Additional reminders for all staffers
          </h3>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full table-fixed border-collapse text-left">
              <thead>
                <tr className="bg-neutral-50 dark:bg-neutral-800/60 border-y border-neutral-150 dark:border-neutral-800">
                  <th scope="col" className="px-2 sm:px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-brand-maroon dark:text-brand-maroon-light w-[38%] align-middle">
                    Reminder
                  </th>
                  <th scope="col" className="px-2 sm:px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 align-middle">
                    Instruction
                  </th>
                </tr>
              </thead>
              <tbody>
                {GUIDELINE_REMINDERS.map((reminder) => (
                  <tr key={reminder.label} className="border-b border-neutral-100 dark:border-neutral-800 align-top">
                    <th scope="row" className="px-2 sm:px-3 py-2.5 text-[11px] sm:text-xs font-black text-neutral-800 dark:text-neutral-100">
                      {reminder.label}
                    </th>
                    <td className="px-2 sm:px-3 py-2.5 text-[11px] sm:text-xs leading-relaxed text-neutral-700 dark:text-neutral-200">
                      {reminder.instruction}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 sm:px-6 py-3 bg-neutral-50/70 dark:bg-neutral-800/40 border-t border-neutral-150 dark:border-neutral-700 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] sm:text-[11px] text-neutral-500 dark:text-neutral-400 font-medium">
          Screenshots for each step are added over time. Click a picture to view it full screen.
        </p>
        <a
          href={ISSUE_TEMPLATE_LINK}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-bold text-brand-maroon dark:text-brand-maroon-light hover:underline cursor-pointer"
        >
          MKule Issue Template in Drive <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {zoomed && (
        <div
          onClick={() => setZoomed(null)}
          className="fixed inset-0 z-[60] bg-black/92 flex flex-col items-center justify-center p-3 sm:p-6"
        >
          <div className="flex items-start justify-between w-full max-w-4xl gap-3">
            <span className="font-sans font-black text-white text-sm sm:text-base">{zoomed.caption}</span>
            <button
              type="button"
              onClick={() => setZoomed(null)}
              className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <img
            src={zoomed.src}
            alt={zoomed.caption}
            className="mt-3 max-h-[82vh] max-w-full w-auto object-contain rounded-xl bg-white"
          />
        </div>
      )}
    </section>
  );
}
