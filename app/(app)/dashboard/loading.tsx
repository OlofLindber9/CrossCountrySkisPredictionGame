export default function DashboardLoading() {
  return (
    <div className="space-y-8 animate-pulse">
      <div>
        <div className="h-8 w-64 bg-gray-200 rounded mb-2" />
        <div className="h-4 w-48 bg-gray-100 rounded" />
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <div className="card col-span-full lg:col-span-2 space-y-3">
          <div className="h-5 w-32 bg-gray-200 rounded" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 w-full bg-gray-100 rounded-lg" />
          ))}
        </div>
        <div className="card space-y-3">
          <div className="h-5 w-24 bg-gray-200 rounded" />
          {[1, 2].map((i) => (
            <div key={i} className="h-10 w-full bg-gray-100 rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}
