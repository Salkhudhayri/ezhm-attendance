// Shop wordmark, served from client/public so it needs no bundler import.
// Sized by height with width left to the image's own aspect ratio, so the wide
// lockup is never squashed. It sits at the start of each header, so it lands
// top-left in English and top-right in Arabic.
export default function Logo({ className = 'h-10' }) {
  return <img src="/logo.png" alt="Ezhm" className={`${className} w-auto shrink-0 object-contain`} />;
}
