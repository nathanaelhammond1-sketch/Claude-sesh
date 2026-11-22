/**
 * Save a file to the device. On iPhone the share sheet ("Save to Files", AirDrop, Mail)
 * is the most reliable path, especially from a Home Screen app; elsewhere a download.
 */
export async function saveFile(content: string, filename: string, type: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const blob = new Blob([content], { type });
  try {
    const file = new File([blob], filename, { type });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.share && nav.canShare?.({ files: [file] }) && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
      await nav.share({ files: [file], title: filename });
      return 'shared';
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
    // fall through to download
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return 'downloaded';
}

export function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => reject(r.error ?? new Error('Could not read the file.'));
    r.readAsText(file);
  });
}
