/**
 * VA-7 Apartment Dashboard — Utility Functions
 */

'use strict';

/** Escape HTML to prevent XSS */
function esc(str) {
  if (str == null) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

/** Validate and return a safe URL, or empty string */
function safeUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    return ['http:', 'https:'].includes(u.protocol) ? u.href : '';
  } catch {
    return '';
  }
}

/** Debounce a function call */
function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/** Trigger a file download from in-memory content */
function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Convert an array of objects to CSV string */
function toCSV(headers, rows) {
  const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [headers, ...rows].map((r) => r.map(escape).join(',')).join('\n');
}

/** Format a number with commas */
function formatNumber(n) {
  return Number(n).toLocaleString();
}

/** Format as compact (e.g. 120.6k) */
function formatCompact(n) {
  return (n / 1000).toFixed(1) + 'k';
}
