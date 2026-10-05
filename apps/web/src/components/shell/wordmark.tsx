/** Text wordmark from the brand board: dotless "i" with the square spark. */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`wordmark ${className}`} aria-hidden="true">
      tunew<span className="wordmark-i">ı</span>ck
    </span>
  );
}
