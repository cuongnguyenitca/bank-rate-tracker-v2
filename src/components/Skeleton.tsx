export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 rounded ${className}`} />;
}

export function CardSkeleton() {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm">
      <Skeleton className="h-4 w-24 mb-3" />
      <Skeleton className="h-8 w-32 mb-2" />
      <Skeleton className="h-3 w-20" />
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      <div className="p-4">
        <Skeleton className="h-6 w-48 mb-4" />
      </div>
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50">
            {Array.from({ length: cols }).map((_, i) => (
              <th key={i} className="p-3"><Skeleton className="h-4 w-16 mx-auto" /></th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r} className="border-t">
              {Array.from({ length: cols }).map((_, c) => (
                <td key={c} className="p-3"><Skeleton className="h-4 w-14 mx-auto" /></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
