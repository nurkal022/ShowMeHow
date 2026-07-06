'use client';
export default function PreviewFrame({ html }: { html: string | null }) {
  if (!html) {
    return <div className="preview-empty">Здесь появится симуляция</div>;
  }
  return (
    <iframe
      className="preview-frame"
      sandbox="allow-scripts"
      srcDoc={html}
      title="Симуляция"
    />
  );
}
