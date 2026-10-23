"use client";

import { useRef } from "react";

const sized = (url: string, width: number) => `${url}${url.includes("?") ? "&" : "?"}width=${width}`;

/** Product thumbnail that opens a Quick Look–style enlarged preview on click. Closes on Esc, click, or Space. */
export function ImagePreview({ url, alt = "", thumbWidth, className }: { url: string; alt?: string; thumbWidth: number; className: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = () => dialog.current?.close();
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          dialog.current?.showModal();
        }}
        title="Preview image"
        aria-label={alt ? `Preview image of ${alt}` : "Preview image"}
        className="shrink-0 cursor-zoom-in rounded-md transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-violet-600"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={sized(url, thumbWidth)} alt="" className={className} />
      </button>
      <dialog
        ref={dialog}
        onClick={close}
        onKeyDown={(e) => {
          if (e.key === " ") {
            e.preventDefault();
            close();
          }
        }}
        aria-label={alt || "Image preview"}
        className="m-auto cursor-zoom-out overflow-visible bg-transparent p-0 backdrop:bg-slate-900/60 backdrop:backdrop-blur-sm open:animate-[quicklook_150ms_ease-out]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={sized(url, 1200)}
          alt={alt}
          className="max-h-[85vh] max-w-[90vw] rounded-xl bg-white object-contain shadow-2xl ring-1 ring-black/10"
        />
        {alt && <p className="mt-2 max-w-[90vw] truncate text-center text-sm font-medium text-white drop-shadow">{alt}</p>}
      </dialog>
    </>
  );
}
