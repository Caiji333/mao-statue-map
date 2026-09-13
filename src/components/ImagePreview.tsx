import { Maximize2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  src: string;
  alt: string;
  imageClassName?: string;
}

export function ImagePreview({ src, alt, imageClassName }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  return <>
    <button className="image-preview-trigger" type="button" onClick={() => setOpen(true)} aria-label={`放大查看：${alt}`} title="查看原图">
      <img className={imageClassName} src={src} alt={alt} />
      <span aria-hidden="true"><Maximize2 size={14} /></span>
    </button>
    {open && createPortal(<div className="image-lightbox" role="dialog" aria-modal="true" aria-label={alt} onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
      <button type="button" className="image-lightbox-close" onClick={() => setOpen(false)} aria-label="关闭原图预览" title="关闭"><X size={22} /></button>
      <img src={src} alt={alt} />
    </div>, document.body)}
  </>;
}
