export default function RaceLoading() {
  return (
    <div className="space-y-8 max-w-2xl mx-auto animate-pulse">
      {/* Race header skeleton */}
      <div className="card">
        <div className="flex gap-2 mb-3">
          <div className="h-5 w-16 bg-gray-200 rounded" />
          <div className="h-5 w-14 bg-gray-200 rounded" />
          <div className="h-5 w-20 bg-gray-200 rounded" />
        </div>
        <div className="h-7 w-2/3 bg-gray-200 rounded mb-2" />
        <div className="h-4 w-1/3 bg-gray-100 rounded" />
      </div>

      {/* Prediction form skeleton */}
      <div className="card space-y-4">
        <div className="h-6 w-40 bg-gray-200 rounded" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i}>
              <div className="h-4 w-24 bg-gray-100 rounded mb-1" />
              <div className="h-10 w-full bg-gray-100 rounded-lg" />
            </div>
          ))}
        </div>
        <div className="h-10 w-full bg-gray-200 rounded-lg" />
      </div>
    </div>
  );
}
