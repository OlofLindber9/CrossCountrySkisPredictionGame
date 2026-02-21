export default function RacesLoading() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="flex justify-between items-center">
        <div className="h-8 w-24 bg-gray-200 rounded" />
        <div className="h-9 w-32 bg-gray-100 rounded-lg" />
      </div>

      <div>
        <div className="h-6 w-24 bg-gray-200 rounded mb-3" />
        <div className="grid gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card flex items-center justify-between gap-4">
              <div className="flex-1 space-y-2">
                <div className="flex gap-2">
                  <div className="h-5 w-16 bg-gray-200 rounded" />
                  <div className="h-5 w-14 bg-gray-200 rounded" />
                </div>
                <div className="h-5 w-1/2 bg-gray-200 rounded" />
                <div className="h-4 w-1/3 bg-gray-100 rounded" />
              </div>
              <div className="h-4 w-16 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
