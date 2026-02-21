export default function GroupLoading() {
  return (
    <div className="space-y-8 max-w-2xl mx-auto animate-pulse">
      <div className="card flex justify-between items-start">
        <div className="space-y-2">
          <div className="h-4 w-20 bg-gray-100 rounded" />
          <div className="h-7 w-48 bg-gray-200 rounded" />
          <div className="h-4 w-24 bg-gray-100 rounded" />
        </div>
        <div className="h-10 w-28 bg-gray-100 rounded-lg" />
      </div>
      <div className="card space-y-3">
        <div className="h-6 w-32 bg-gray-200 rounded" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 w-full bg-gray-100 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
