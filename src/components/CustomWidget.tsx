"use client";

type Props = {
  html: string;
  title: string;
  onDelete?: () => void;
};

// Renders a Hermes-generated widget inside a locked-down sandboxed iframe.
// sandbox="allow-scripts" WITHOUT allow-same-origin means the iframe runs JS
// but has an opaque origin: no access to parent DOM, cookies, localStorage, or
// same-origin network. This is the security boundary for arbitrary generated HTML.
export default function CustomWidget({ html, title, onDelete }: Props) {
  return (
    <div className="h-full w-full relative bg-zinc-950/30">
      {onDelete && (
        <button
          onClick={onDelete}
          title="Delete widget"
          className="absolute top-1 right-1 z-10 text-[11px] text-zinc-600 hover:text-rose-400 bg-zinc-900/70 rounded px-1.5 py-0.5"
        >
          ✕
        </button>
      )}
      <iframe
        title={title}
        srcDoc={html}
        sandbox="allow-scripts"
        className="w-full h-full border-0 block"
        loading="lazy"
      />
    </div>
  );
}
