import { useRef, useState } from 'react';

async function convertHeic(file) {
  const heic2any = (await import('heic2any')).default;
  const blob = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.85 });
  return new File([blob], file.name.replace(/\.heic$/i, '.jpg'), { type: 'image/jpeg' });
}

async function resizeImage(file, maxPx = 2048) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      if (scale === 1) { resolve(file); return; }
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => resolve(new File([blob], file.name, { type: 'image/jpeg' })),
        'image/jpeg', 0.85
      );
    };
    img.src = url;
  });
}

const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50 MB
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
const ACCEPTED = 'image/jpeg,image/png,image/webp,image/heic,video/mp4,video/quicktime';

export default function MediaUpload({ onChange, disabled }) {
  const inputRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [processing, setProcessing] = useState(false);

  const handleFile = async (file) => {
    if (!file) return;
    setError(null);
    setProcessing(true);

    try {
      const isVideo = file.type.startsWith('video/');
      const limit = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;

      if (file.size > limit) {
        setError(`File too large. Max ${isVideo ? '50 MB' : '10 MB'}.`);
        setProcessing(false);
        return;
      }

      let processed = file;
      if (!isVideo) {
        if (file.type === 'image/heic' || file.name.toLowerCase().endsWith('.heic')) {
          processed = await convertHeic(file);
        }
        processed = await resizeImage(processed);
      }

      const previewUrl = URL.createObjectURL(processed);
      setPreview({ url: previewUrl, isVideo });
      onChange(processed);
    } catch {
      setError('Could not process file. Please try another.');
    } finally {
      setProcessing(false);
    }
  };

  const handleRemove = () => {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
    setError(null);
    onChange(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        className="hidden"
        onChange={(e) => handleFile(e.target.files[0])}
        disabled={disabled || processing}
      />

      {!preview ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || processing}
          className="w-full p-3 rounded-xl border border-dashed border-[#00d4ff]/30 text-slate-400 text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
        >
          {processing ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Processing...
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Add Photo / Video (optional)
            </>
          )}
        </button>
      ) : (
        <div className="relative rounded-xl overflow-hidden bg-[#162d4d]">
          {preview.isVideo ? (
            <div className="w-full h-32 flex items-center justify-center bg-[#0a1628]">
              <svg className="w-10 h-10 text-[#00d4ff]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <span className="ml-2 text-sm text-slate-300">Video attached</span>
            </div>
          ) : (
            <img src={preview.url} alt="preview" className="w-full h-32 object-cover" />
          )}
          <button
            type="button"
            onClick={handleRemove}
            className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/70 flex items-center justify-center text-white text-xs font-bold"
          >
            ×
          </button>
        </div>
      )}

      {error && (
        <p className="mt-1 text-[10px] text-red-400">{error}</p>
      )}
    </div>
  );
}
